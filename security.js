/**
    Copyright 2014, 2015 Andrew P. Sillers

    This file is part of Lords of the Fey.

    Lords of the Fey is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Lords of the Fey is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with Lords of the Fey.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
   @module security

   Cross-cutting security helpers: response headers, CSRF tokens, rate limiting,
   request-origin checks and the input validators used by the HTTP routes and the
   socket.io listeners.

   Everything here is deliberately dependency-free (node's `crypto` only) so the
   hardening does not hinge on installing new packages.
*/

var crypto = require("crypto");
var config = require("./config");

/*
   Content-Security-Policy: all scripts are served from this origin as separate
   files, so no inline/eval allowance is needed for scripts. Inline `style="..."`
   attributes are used throughout the views and the game UI, hence the single
   'unsafe-inline' for styles.
*/
var CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
].join("; ");

/** Response headers applied to every request (OWASP A05: misconfiguration) */
exports.securityHeaders = function(req, res, next) {
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");

    // only meaningful (and only safe) when the site is actually served over TLS
    if(config.usesHttps) {
        res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }

    next();
};

/**
   Fixed-window rate limiter (OWASP A07: identification and authentication
   failures). Keyed by whatever the caller passes in: client IP for HTTP routes,
   socket id for socket.io events.

   The key table is bounded so that an attacker rotating keys cannot use the
   limiter itself as a memory-exhaustion vector.
*/
function RateLimiter(options) {
    options = options || {};
    this.windowMs = options.windowMs || 60000;
    this.max = options.max || 30;
    this.maxKeys = options.maxKeys || 20000;
    this.hits = new Map();
}

/** @returns {Boolean} true if the action is allowed, false if the caller is over quota */
RateLimiter.prototype.check = function(key) {
    if(key == null) { key = "unknown"; }
    key = String(key);

    var now = Date.now();
    var entry = this.hits.get(key);

    if(!entry || entry.reset <= now) {
        if(this.hits.size >= this.maxKeys) { this.purge(now); }
        this.hits.set(key, { count: 1, reset: now + this.windowMs });
        return true;
    }

    entry.count++;
    return entry.count <= this.max;
};

/** Forget a key, e.g. after a successful login */
RateLimiter.prototype.reset = function(key) {
    if(key != null) { this.hits.delete(String(key)); }
};

RateLimiter.prototype.purge = function(now) {
    now = now || Date.now();
    for(var entry of this.hits) {
        if(entry[1].reset <= now) { this.hits.delete(entry[0]); }
    }
    // still full of live entries: drop the table rather than grow without bound
    if(this.hits.size >= this.maxKeys) { this.hits.clear(); }
};

exports.RateLimiter = RateLimiter;

/** Express middleware factory around {@link RateLimiter}, keyed on client IP */
exports.rateLimit = function(options) {
    var limiter = new RateLimiter(options);
    var message = (options && options.message) || "Too many requests. Please wait and try again.";
    var middleware = function(req, res, next) {
        if(limiter.check(exports.clientIp(req))) { return next(); }
        res.status(429).type("text/plain").send(message);
    };
    middleware.limiter = limiter;
    return middleware;
};

/** Best-effort client address; only trusts forwarding headers when configured to */
exports.clientIp = function(req) {
    return (req && (req.ip || (req.connection && req.connection.remoteAddress))) || "unknown";
};

/* ------------------------------------------------------------------ */
/* CSRF (OWASP A01: broken access control / cross-site request forgery) */
/* ------------------------------------------------------------------ */

/** Per-session synchronizer token; created on first use */
exports.csrfToken = function(req) {
    if(!req.session) { return ""; }
    if(!req.session.csrfToken) { req.session.csrfToken = crypto.randomBytes(32).toString("hex"); }
    return req.session.csrfToken;
};

/** Constant-time string compare that tolerates unequal lengths */
function safeEqual(a, b) {
    if(typeof a != "string" || typeof b != "string") { return false; }
    var bufA = Buffer.from(a, "utf8");
    var bufB = Buffer.from(b, "utf8");
    if(bufA.length != bufB.length) { return false; }
    return crypto.timingSafeEqual(bufA, bufB);
}

exports.safeEqual = safeEqual;

/** Reject state-changing requests that do not carry the session's CSRF token */
exports.requireCsrf = function(req, res, next) {
    var expected = req.session && req.session.csrfToken;
    var presented = (req.body && req.body._csrf) || req.get("x-csrf-token");

    if(expected && safeEqual(presented, expected)) { return next(); }

    res.status(403).type("text/plain")
       .send("Invalid or missing CSRF token. Reload the page and try again.");
};

/**
   Is this request same-origin?

   Used to reject cross-site WebSocket hijacking: WebSocket upgrades are not
   covered by CORS, so socket.io has to check the Origin header itself. Requests
   with no Origin (non-browser clients) are allowed through; the session cookie
   still decides what they may do.
*/
exports.isSameOriginRequest = function(req) {
    var origin = req.headers && req.headers.origin;
    if(!origin) { return true; }

    var parsed;
    try { parsed = new URL(origin); } catch(e) { return false; }

    var host = req.headers.host;
    if(host && parsed.host === host) { return true; }

    try { return parsed.origin === new URL(config.origin).origin; } catch(e) { return false; }
};

/* ---------------------------------- */
/* input validation                   */
/* ---------------------------------- */

/**
   Is this a real string?

   Query strings and JSON bodies can hold objects and arrays; letting one reach a
   Mongo query turns `{ username: x }` into an operator document (NoSQL
   injection, OWASP A03), so every value that ends up in a query is checked here.
*/
exports.isString = function(value) {
    return typeof value == "string";
};

/** A string of sane length, or null */
exports.asString = function(value, maxLength) {
    if(typeof value != "string") { return null; }
    if(maxLength != null && value.length > maxLength) { return null; }
    return value;
};

/** Trim and cap a user-supplied text field; non-strings become null */
exports.asText = function(value, maxLength) {
    if(typeof value != "string") { return null; }
    var trimmed = value.trim();
    if(!trimmed.length) { return null; }
    return trimmed.slice(0, maxLength || 200);
};

/** An integer within [min, max], or null. Accepts numeric strings from forms. */
exports.asInt = function(value, min, max) {
    if(typeof value == "string" && /^-?\d{1,9}$/.test(value)) { value = Number(value); }
    if(typeof value != "number" || !Number.isInteger(value)) { return null; }
    if(min != null && value < min) { return null; }
    if(max != null && value > max) { return null; }
    return value;
};

/** 24-hex-character Mongo id, or null (never build an ObjectId from anything else) */
exports.asObjectIdString = function(value) {
    if(typeof value != "string" || !/^[0-9a-fA-F]{24}$/.test(value)) { return null; }
    return value;
};

/**
   A file name that cannot escape its directory (OWASP A01: path traversal).
   Only plain names of the expected shape are accepted: no separators, no `..`,
   no leading dot, no NUL bytes.
*/
exports.asDataFileName = function(value, extension) {
    if(typeof value != "string" || value.length > 128) { return null; }
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) { return null; }
    if(value.indexOf("..") != -1) { return null; }
    if(extension && value.slice(-extension.length) != extension) { return null; }
    return value;
};

/** A board space: `{ x, y }` with integer coordinates in a plausible range */
exports.asCoords = function(value) {
    if(!value || typeof value != "object" || Array.isArray(value)) { return null; }
    var x = exports.asInt(value.x, -1, 1000);
    var y = exports.asInt(value.y, -1, 1000);
    if(x == null || y == null) { return null; }
    return { x: x, y: y };
};

/**
   A movement path: a non-empty array of coordinate pairs, capped in length so a
   client cannot make the server walk an arbitrarily long path (CPU exhaustion).
*/
exports.asPath = function(value, maxLength) {
    if(!Array.isArray(value)) { return null; }
    if(!value.length || value.length > (maxLength || 512)) { return null; }

    var path = [];
    for(var i=0; i<value.length; ++i) {
        var space = exports.asCoords(value[i]);
        if(!space) { return null; }
        path.push(space);
    }
    return path;
};

/* ---------------------------------- */
/* socket.io plumbing                 */
/* ---------------------------------- */

/**
   Register a socket.io listener that cannot take the process down.

   Every listener here runs on data supplied by a remote client. An exception (or
   a rejected promise) thrown out of a listener would otherwise become an uncaught
   exception / unhandled rejection and kill the whole server, so one malformed
   payload would be a denial of service for every game in progress.

   @param socket - socket.io socket
   @param {String} eventName
   @param {Object} [options] - `limiter`: a {@link RateLimiter}; `requireUser`:
     ignore the event unless the socket has an identity
   @param handler - the listener; may be async
*/
exports.socketHandler = function(socket, eventName, options, handler) {
    if(typeof options == "function") { handler = options; options = {}; }
    options = options || {};

    socket.on(eventName, function() {
        var args = arguments;

        if(options.limiter && !options.limiter.check(socket.id + ":" + eventName)) {
            console.warn("socket rate limit hit:", eventName, socket.id);
            return;
        }

        if(options.requireUser && !exports.socketUsername(socket)) { return; }

        try {
            var result = handler.apply(null, args);
            if(result && typeof result.catch == "function") {
                result.catch(function(err) { console.error("socket handler failed:", eventName, err); });
            }
        } catch(err) {
            console.error("socket handler failed:", eventName, err);
        }
    });
};

/**
   The username attached to a socket, or null for an unidentified observer.
   Guards against a session document with a non-string username.
*/
exports.socketUsername = function(socket) {
    var user = socket && socket.request && socket.request.user;
    if(!user || typeof user.username != "string" || !user.username.length) { return null; }
    return user.username;
};

/** Random token safe to use as a shared secret (anonymous-player tokens) */
exports.randomToken = function(byteLength) {
    return crypto.randomBytes(byteLength || 24).toString("hex");
};
