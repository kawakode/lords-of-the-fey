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

/** @module auth */

var config = require("./config"),
    security = require("./security"),
    passwords = require("./password");

/*
   The OAuth strategies are loaded only for the providers that are switched on.
   passport-twitter pulls in `xtraverse` -> `xmldom`, which has unfixed advisories
   (GHSA-crh6-fp67-6883 and friends) and no maintained upgrade path; keeping the
   require lazy means a deployment that leaves TWITTER_ENABLED=false never loads
   that XML parser at all (OWASP A06: vulnerable and outdated components).
   Consider dropping the twitter provider entirely.
*/

/** Usernames a local account may not take: these belong to the OAuth providers
    and to the anonymous seats a room owner creates, so allowing them would let
    one account impersonate another player. */
var RESERVED_NAME_PATTERN = /^(anon|facebook-|twitter-|google-)/i;

/** Shape of an acceptable username (also bounds what ends up in a Mongo query) */
var USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,23}$/;

/**
   Validate a requested username.
   @returns {{name:string}|{error:string}}
*/
function checkUsername(rawName) {
    if(typeof rawName != "string") { return { error: "invalid" }; }

    var name = rawName.trim();
    if(!USERNAME_PATTERN.test(name)) { return { error: "invalid" }; }
    if(RESERVED_NAME_PATTERN.test(name)) { return { error: "reserved" }; }

    return { name: name };
}

/**
Decide whether the owner of the given socket can act in the given game

@param socket - Socket.io socket
@param game - game object
@param {Boolean} allowAdvancement - the operation being attempted is a unit level-up (without this, when a level-up choice is pending, the action will fail)

@returns {Boolean}
*/
exports.socketOwnerCanAct = function(socket, game, allowAdvancement) {
    // passport.socketio leaves a `{ logged_in: false }` placeholder on
    // unauthenticated sockets, so an identity means a real username, not just an
    // object being present
    var username = security.socketUsername(socket);
    if(!username) { return false; }
    if(!game || !Array.isArray(game.players)) { return false; }

    // nobody acts in a game that has already been won
    if(game.over) { return false; }

    var player = game.players.filter(function(p) { return p.username == username })[0];
    if(!player) { return false; }

    // if the player must resolve a branching level-up
    // and this is not an attempt to resolve that
    if(player.advancingUnit && !allowAdvancement) { return false; }

    return player.team == game.activeTeam;
}

/** The player record for the identity behind this socket, or null */
exports.socketPlayer = function(socket, game) {
    var username = security.socketUsername(socket);
    if(!username || !game || !Array.isArray(game.players)) { return null; }
    return game.players.filter(function(p) { return p.username == username })[0] || null;
};

/** Activate passport for the app and mongo instance */
exports.initAuth = function(app, collections) {

    var passport = require("passport");
    var LocalStrategy = require("passport-local").Strategy;

    /* Brute-force and credential-stuffing budgets (OWASP A07) */
    var loginLimit = security.rateLimit({
        windowMs: 15 * 60 * 1000, max: 10,
        message: "Too many login attempts. Please wait a few minutes and try again."
    });
    var signupLimit = security.rateLimit({
        windowMs: 60 * 60 * 1000, max: 5,
        message: "Too many accounts created from this address. Please try again later."
    });
    var renameLimit = security.rateLimit({
        windowMs: 60 * 60 * 1000, max: 10,
        message: "Too many name changes. Please try again later."
    });

    passport.use(new LocalStrategy(async function(username, password, done){
        try {
            // a form can submit arrays or objects; either would reach Mongo as a
            // query operator instead of a value (NoSQL injection, OWASP A03)
            if(typeof username != "string" || typeof password != "string") {
                return done(null, false, { message: 'Incorrect username or password.' });
            }
            if(username.length > 64 || password.length > passwords.MAX_LENGTH) {
                return done(null, false, { message: 'Incorrect username or password.' });
            }

            var user = await collections.users.findOne({ username : username });
            if(!user || typeof user.hash != "string"){
                // spend comparable time on a missing account so response timing
                // does not disclose which usernames exist
                await passwords.dummyVerify(password);
                return done(null, false, { message: 'Incorrect username or password.' });
            }

            var result = await passwords.verify(password, user.hash);
            if(!result.ok) {
                return done(null, false, { message: 'Incorrect username or password.' });
            }

            // the password was stored with the old, cheap sha1 scheme: replace it
            // now that we have the plaintext in hand
            if(result.needsUpgrade) {
                try {
                    var upgraded = await passwords.hash(password);
                    await collections.users.updateOne({ _id: user._id }, { $set: { hash: upgraded } });
                    user.hash = upgraded;
                } catch(err) {
                    console.error("could not upgrade password hash for", user._id, err);
                }
            }

            done(null, user);
        } catch(err) { done(err); }
    }));

    function renderLogin(req, res) {
        if(req.user && req.user.username) { res.redirect("/"); return; }
        var error = ({
            "fail":"Incorrect username or password."
        })[req.query.error];
        res.render("login.hbs", { config: config, error: error, csrfToken: security.csrfToken(req) });
    }

    function renderSignup(req, res) {
        if(req.user && req.user.username) { res.redirect("/"); return; }
        var error = ({
            "mismatch":"Password fields did not match.",
            "taken": "The username you entered is already taken.",
            "invalid": "Usernames must be 3-24 characters: letters, digits, spaces, dots, hyphens or underscores.",
            "reserved": "That username is reserved. Please choose another.",
            "weak": "Passwords must be at least " + passwords.MIN_LENGTH + " characters long.",
            "toolong": "That password is too long."
        })[req.query.error];
        res.render("signup.hbs", { config: config, error: error, csrfToken: security.csrfToken(req) });
    }

    app.get('/login.html', renderLogin);
    app.get('/login', renderLogin);
    app.get('/signup.html', renderSignup);
    app.get('/signup', renderSignup);

    /**
       Give the caller a brand-new session before recording the login, so a
       session id planted by an attacker cannot become an authenticated one
       (session fixation, OWASP A07).
    */
    function loginWithFreshSession(req, user, done) {
        req.session.regenerate(function(err) {
            if(err) { return done(err); }
            req.login(user, function(err) {
                if(err) { return done(err); }
                req.session.save(done);
            });
        });
    }

    app.post('/login', loginLimit, security.requireCsrf, function(req, res, next) {
        passport.authenticate('local', function(err, user) {
            if(err) { return next(err); }
            if(!user) { return res.redirect('/login.html?error=fail'); }

            loginWithFreshSession(req, user, function(err) {
                if(err) { return next(err); }
                loginLimit.limiter.reset(security.clientIp(req));
                res.redirect('/');
            });
        })(req, res, next);
    });

    app.get('/logout', function(req, res, next){
        req.logout(function(err) {
            if(err) { return next(err); }
            // drop the session entirely rather than keeping a logged-out shell
            req.session.destroy(function(err) {
                if(err) { return next(err); }
                res.clearCookie("lotf.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: config.usesHttps });
                res.redirect('/');
            });
        });
    });

    app.post('/changeusername', renameLimit, security.requireCsrf, async function(req, res, next) {
        // authenticate first: an anonymous caller has no name to change
        if(!(req.user && typeof req.user.username == "string")) {
            res.redirect("/login.html");
            return;
        }

        var checked = checkUsername(req.body.newname);
        if(checked.error) {
            res.redirect('/changeusername.html?error=' + checked.error);
            return;
        }
        var newName = checked.name;

        if(newName === req.user.username) { res.redirect('/'); return; }

        try {
            var userWithName = await collections.users.findOne({ username: newName });
            if(userWithName) {
                res.redirect('/changeusername.html?error=taken');
                return;
            }

            var userRecord = await collections.users.findOne({ username: req.user.username });
            if(!userRecord) { res.redirect("/login.html"); return; }

            // update only the fields we mean to: writing the whole document back
            // would let any stray property from elsewhere ride along
            await collections.users.updateOne(
                { _id: userRecord._id },
                { $set: { username: newName }, $unset: { unchangedName: "" } }
            );

            userRecord.username = newName;
            delete userRecord.unchangedName;

            req.login(userRecord, function(err) {
                if(err) { return next(err); }
                res.redirect('/');
            });
        } catch(err) {
            // the unique index is the real arbiter of name collisions
            if(err && err.code === 11000) {
                res.redirect('/changeusername.html?error=taken');
                return;
            }
            next(err);
        }
    });

    app.get('/changeusername.html', function(req, res) {
        if(req.user && req.user.username) {
            var error = ({
                "taken": "The username you entered is already taken.",
                "invalid": "Usernames must be 3-24 characters: letters, digits, spaces, dots, hyphens or underscores.",
                "reserved": "That username is reserved. Please choose another."
            })[req.query.error];
            res.render("changeusername.hbs", {
                username: req.user.username,
                error: error,
                csrfToken: security.csrfToken(req)
            });
        } else {
            res.redirect("/login.html")
        }
    });

    app.post('/signup', signupLimit, security.requireCsrf, async function(req, res, next) {
        var password = req.body.password;
        var passConfirm = req.body.passconfirm;

        var checked = checkUsername(req.body.username);
        if(checked.error) {
            res.redirect("/signup.html?error=" + checked.error);
            return;
        }
        var username = checked.name;

        if(typeof password != "string" || typeof passConfirm != "string") {
            res.redirect("/signup.html?error=invalid");
            return;
        }
        if(password !== passConfirm) {
            res.redirect("/signup.html?error=mismatch");
            return;
        }
        if(password.length < passwords.MIN_LENGTH) {
            res.redirect("/signup.html?error=weak");
            return;
        }
        if(password.length > passwords.MAX_LENGTH) {
            res.redirect("/signup.html?error=toolong");
            return;
        }

        try {
            var user = await collections.users.findOne({ username: username });
            if (user) {
                res.redirect("/signup.html?error=taken");
                return;
            }

            var hashedPassword = await passwords.hash(password);
            var record = { username: username, hash: hashedPassword, createdAt: new Date() };
            await collections.users.insertOne(record);

            loginWithFreshSession(req, record, function(err) {
                if(err) { return next(err); }
                res.redirect('/');
            });
        } catch(err) {
            // two signups raced for the same name; the unique index caught it
            if(err && err.code === 11000) {
                res.redirect("/signup.html?error=taken");
                return;
            }
            next(err);
        }
    });

    app.get("/onoauthlogin", function(req, res) {
        if(req.user && req.user.unchangedName) {
            res.redirect("/changeusername.html");
        } else {
            res.redirect("/");
        }
    });

    /**
       Find or create the local account behind an OAuth profile.
       @param field - the profile-id field for this provider
    */
    function findOrCreateOAuthUser(field, prefix, profile, done) {
        (async function() {
            if(!profile || typeof profile.id != "string" || !/^[\w.-]{1,64}$/.test(profile.id)) {
                return done(null, false);
            }

            var query = {};
            query[field] = profile.id;

            var user = await collections.users.findOne(query);
            if(!user) {
                user = { username: prefix + "-" + profile.id, unchangedName: true, createdAt: new Date() };
                user[field] = profile.id;
                await collections.users.insertOne(user);
            }
            done(null, user);
        })().catch(done);
    }

    /* Facebook auth */
    if(config.facebook && config.facebook.enabled) {
        var FacebookStrategy = require('passport-facebook').Strategy;
        passport.use(new FacebookStrategy({
            clientID: config.facebook.app_id,
            clientSecret: config.facebook.app_secret,
            callbackURL: config.origin + "/auth/facebook/callback",
            // bind the round trip to this session (OAuth CSRF protection)
            state: true
        },
        function(accessToken, refreshToken, profile, done) {
            findOrCreateOAuthUser("fbProfileId", "facebook", profile, done);
        }));

        app.get('/login/facebook', passport.authenticate('facebook'));
        app.get('/auth/facebook/callback',
                passport.authenticate('facebook', { successRedirect: '/onoauthlogin',
                                                    failureRedirect: '/login' }));
    }

    /* Twitter auth */
    if(config.twitter && config.twitter.enabled) {
        console.warn("WARNING: the twitter provider depends on xmldom, which has " +
                     "unfixed security advisories. Prefer another provider.");
        var TwitterStrategy = require('passport-twitter').Strategy;
        passport.use(new TwitterStrategy({
            consumerKey: config.twitter.consumer_key,
            consumerSecret: config.twitter.consumer_secret,
            callbackURL: config.origin + "/auth/twitter/callback"
        },
        function(token, tokenSecret, profile, done) {
            findOrCreateOAuthUser("twProfileId", "twitter", profile, done);
        }));

        app.get('/login/twitter', passport.authenticate('twitter'));
        app.get('/auth/twitter/callback',
                passport.authenticate('twitter', { successRedirect: '/onoauthlogin',
                                                    failureRedirect: '/login' }));
    }

    /* Google auth */
    if(config.google && config.google.enabled) {
        var GoogleStrategy = require('passport-google-oauth20').Strategy;
        passport.use(new GoogleStrategy({
            clientID: config.google.clientID,
            clientSecret: config.google.clientSecret,
            callbackURL: config.origin + "/auth/google/callback",
            state: true
          },
          function(accessToken, refreshToken, profile, done) {
            findOrCreateOAuthUser("googProfileId", "google", profile, done);
          }));

        app.get('/auth/google',
          passport.authenticate('google', { scope: ['profile'] }));

        app.get('/auth/google/callback',
          passport.authenticate('google', { failureRedirect: '/login' }),
          function(req, res) {
            // Successful authentication, redirect
            res.redirect('/onoauthlogin');
          });
    }

    passport.serializeUser(function(user, done) {
        done(null, user.username);
    });

    passport.deserializeUser(async function(username, done) {
        try {
            if(typeof username != "string" || username.length > 64) { return done(null, false); }
            // the password hash has no business travelling with the request or
            // the socket, so it never leaves the database
            done(null, await collections.users.findOne({ username: username }, { projection: { hash: 0 } }));
        } catch(err) { done(err); }
    });
}
