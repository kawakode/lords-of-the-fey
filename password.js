/**
    Copyright 2014 Andrew P. Sillers

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
   @module password

   Password storage (OWASP A02: cryptographic failures).

   New passwords are hashed with scrypt at the OWASP Password Storage Cheat Sheet
   memory-constrained settings (N=2^16, r=8, p=2). Accounts created before this
   change carry `password-hash` sha1-HMAC digests, which are far too cheap; those
   still verify, and any account that logs in successfully is transparently
   re-hashed with scrypt.

   Stored format: `scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>`
*/

var crypto = require("crypto");
var legacyPasswordHash = require("password-hash");

var SCRYPT = {
    N: 65536,
    r: 8,
    p: 2,
    keyLength: 64,
    saltLength: 16,
    // scrypt needs roughly 128 * N * r bytes; node's default cap is far below that
    maxmem: 192 * 1024 * 1024
};

/** Longest password we will hash, so a huge body cannot become a CPU attack */
exports.MAX_LENGTH = 200;

/** Shortest password we accept (OWASP ASVS 2.1.1: 12 characters) */
exports.MIN_LENGTH = 12;

function scrypt(password, salt, params) {
    return new Promise(function(resolve, reject) {
        crypto.scrypt(password, salt, params.keyLength, {
            N: params.N, r: params.r, p: params.p, maxmem: SCRYPT.maxmem
        }, function(err, key) {
            if(err) { reject(err); return; }
            resolve(key);
        });
    });
}

/**
   Hash a password for storage.
   @returns {Promise<string>} the encoded hash
*/
exports.hash = async function(password) {
    if(typeof password != "string") { throw new Error("password must be a string"); }
    if(password.length > exports.MAX_LENGTH) { throw new Error("password too long"); }

    var salt = crypto.randomBytes(SCRYPT.saltLength);
    var key = await scrypt(password, salt, SCRYPT);

    return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("hex"), key.toString("hex")].join("$");
};

/**
   Check a password against a stored hash.

   @returns {Promise<{ok:Boolean, needsUpgrade:Boolean}>} `needsUpgrade` marks a
     correct password whose stored hash uses the old, weak scheme
*/
exports.verify = async function(password, storedHash) {
    var failure = { ok: false, needsUpgrade: false };

    if(typeof password != "string" || !password.length) { return failure; }
    if(typeof storedHash != "string" || !storedHash.length) { return failure; }
    if(password.length > exports.MAX_LENGTH) { return failure; }

    if(storedHash.indexOf("scrypt$") === 0) {
        var parts = storedHash.split("$");
        if(parts.length != 6) { return failure; }

        var params = {
            N: parseInt(parts[1], 10),
            r: parseInt(parts[2], 10),
            p: parseInt(parts[3], 10),
            keyLength: parts[5].length / 2
        };
        if(!params.N || !params.r || !params.p || !params.keyLength) { return failure; }

        var salt, storedKey;
        try {
            salt = Buffer.from(parts[4], "hex");
            storedKey = Buffer.from(parts[5], "hex");
        } catch(e) { return failure; }
        if(!salt.length || !storedKey.length) { return failure; }

        var key;
        try { key = await scrypt(password, salt, params); } catch(e) { return failure; }

        if(key.length != storedKey.length) { return failure; }

        return { ok: crypto.timingSafeEqual(key, storedKey), needsUpgrade: false };
    }

    // legacy sha1-HMAC hashes from the `password-hash` package
    var ok = false;
    try { ok = legacyPasswordHash.verify(password, storedHash); } catch(e) { ok = false; }
    return { ok: ok, needsUpgrade: ok };
};

/**
   Spend the same work as a real verification for a username that does not exist,
   so response timing does not reveal which accounts are real (user enumeration).
*/
exports.dummyVerify = async function(password) {
    if(typeof password != "string" || !password.length || password.length > exports.MAX_LENGTH) { return; }
    try { await scrypt(password, crypto.randomBytes(SCRYPT.saltLength), SCRYPT); } catch(e) { /* ignore */ }
};
