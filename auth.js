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
    FacebookStrategy = require('passport-facebook').Strategy,
    TwitterStrategy = require('passport-twitter').Strategy,
    GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

/**
Decide whether the owner of the given socket can act in the given game

@param socket - Socket.io socket
@param game - game object
@param {Boolean} allowAdvancement - the operation being attempted is a unit level-up (without this, when a level-up choice is pending, the action will fail)

@returns {Boolean}
*/
exports.socketOwnerCanAct = function(socket, game, allowAdvancement) {
    var user = socket.request.user;
    if(!user) { return false; }

    // nobody acts in a game that has already been won
    if(game.over) { return false; }

    var player = game.players.filter(function(p) { return p.username == user.username })[0];    
    if(!player) { return false; }

    // if the player must resolve a branching level-up
    // and this is not an attempt to resolve that
    if(player.advancingUnit && !allowAdvancement) { return false; }

    return player.team == game.activeTeam;
}

/** Activate passport for the app and mongo instance */
exports.initAuth = function(app, collections) {

    var passport = require("passport");
    var passwordHash = require("password-hash");
    var LocalStrategy = require("passport-local").Strategy;

    passport.use(new LocalStrategy(async function(username, password, done){
        try {
            var user = await collections.users.findOne({ username : username });
            if(!user){
                return done(null, false, { message: 'Incorrect username.' });
            }
            if (passwordHash.verify(password, user.hash)) return done(null, user);
            done(null, false, { message: 'Incorrect password.' });
        } catch(err) { done(err); }
    }));

    function renderLogin(req, res) {
        if(req.user && req.user.username) { res.redirect("/"); return; }
        var error = ({
            "fail":"Incorrect username or password."
        })[req.query.error];
        res.render("login.hbs", { config: config, error: error });
    }

    function renderSignup(req, res) {
        if(req.user && req.user.username) { res.redirect("/"); return; }
        var error = ({
            "mismatch":"Password fields did not match.",
            "taken": "The username you entered is already taken."
        })[req.query.error];
        res.render("signup.hbs", { config: config, error: error });
    }

    app.get('/login.html', renderLogin);
    app.get('/login', renderLogin);
    app.get('/signup.html', renderSignup);
    app.get('/signup', renderSignup);

    app.post('/login',
             passport.authenticate('local', { failureRedirect: '/login.html?error=fail' }),
             function(req, res) {
                 res.redirect('/');
             });

    app.get('/logout', function(req, res, next){
        req.logout(function(err) {
            if(err) { return next(err); }
            res.redirect('/');
        });
    });

    app.post('/changeusername', async function(req, res, next) {
        var newName = req.body.newname;
        if(newName.replace(/\s/g, "") == "") {
            res.redirect('/changeusername.html?error=invalid');
            return;
        }

        if(!(req.user && req.user.username)) {
            res.redirect("/login.html");
            return;
        }

        try {
            var userWithName = await collections.users.findOne({ username: newName });
            if(userWithName) {
                res.redirect('/changeusername.html?error=taken');
                return;
            }

            var userRecord = await collections.users.findOne({ username: req.user.username });
            userRecord.username = newName;
            delete userRecord.unchangedName;
            await collections.users.replaceOne({ _id: userRecord._id }, userRecord);
            req.login(userRecord, function(err) {
                if(err) { return next(err); }
                res.redirect('/');
            });
        } catch(err) { next(err); }
    });

    app.get('/changeusername.html', function(req, res) {
        if(req.user && req.user.username) {
            res.render("changeusername.hbs", { username: req.user.username });
        } else {
            res.redirect("/login.html")
        }
    });

    app.post('/signup', async function(req, res, next) {
        var username = req.body.username;
        var password = req.body.password;
        var passConfirm = req.body.passconfirm;

        try {
            var user = await collections.users.findOne({ username: username });
            if (user) {
                res.redirect("/signup.html?error=taken");
                return;
            }
            if(password != passConfirm) {
                res.redirect("/signup.html?error=mismatch");
                return;
            }

            var hashedPassword = passwordHash.generate(password);
            await collections.users.insertOne({ username: username, hash: hashedPassword });
            passport.authenticate('local')(req, res, function () {
                res.redirect('/');
            });
        } catch(err) { next(err); }
    });

    app.get("/onoauthlogin", function(req, res) {
        if(req.user && req.user.unchangedName) {
            res.redirect("/changeusername.html");
        } else {
            res.redirect("/");
        }
    });

    /* Facebook auth */
    if(config.facebook && config.facebook.enabled) {
        passport.use(new FacebookStrategy({
            clientID: config.facebook.app_id,
            clientSecret: config.facebook.app_secret,
            callbackURL: config.origin + "/auth/facebook/callback"
        },
        async function(accessToken, refreshToken, profile, done) {
            try {
                var user = await collections.users.findOne({ fbProfileId : profile.id });
                if(!user) {
                    user = { fbProfileId: profile.id, username: "facebook-"+profile.id, unchangedName:true };
                    await collections.users.insertOne(user);
                }
                done(null, user);
            } catch(err) { done(err); }
        }));

        app.get('/login/facebook', passport.authenticate('facebook'));
        app.get('/auth/facebook/callback',
                passport.authenticate('facebook', { successRedirect: '/onoauthlogin',
                                                    failureRedirect: '/login' }));
    }

    /* Twitter auth */
    if(config.twitter && config.twitter.enabled) {
        passport.use(new TwitterStrategy({
            consumerKey: config.twitter.consumer_key,
            consumerSecret: config.twitter.consumer_secret,
            callbackURL: config.origin + "/auth/twitter/callback"
        },
        async function(token, tokenSecret, profile, done) {
            try {
                var user = await collections.users.findOne({ twProfileId : profile.id });
                if(!user) {
                    user = { twProfileId: profile.id, username: "twitter-"+profile.id, unchangedName:true };
                    await collections.users.insertOne(user);
                }
                done(null, user);
            } catch(err) { done(err); }
        }));

        app.get('/login/twitter', passport.authenticate('twitter'));
        app.get('/auth/twitter/callback',
                passport.authenticate('twitter', { successRedirect: '/onoauthlogin',
                                                    failureRedirect: '/login' }));
    }

    /* Google auth */
    if(config.google && config.google.enabled) {
        passport.use(new GoogleStrategy({
            clientID: config.google.clientID,
            clientSecret: config.google.clientSecret,
            callbackURL: config.origin + "/auth/google/callback"
          },
          async function(accessToken, refreshToken, profile, done) {
            try {
                var user = await collections.users.findOne({ googProfileId : profile.id });
                if(!user) {
                    user = { googProfileId: profile.id, username: "google-"+profile.id, unchangedName:true };
                    await collections.users.insertOne(user);
                }
                done(null, user);
            } catch(err) { done(err); }
          }));

        app.get('/auth/google',
          passport.authenticate('google', { scope: 'https://www.googleapis.com/auth/plus.login' }));

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
            done(null, await collections.users.findOne({username: username}));
        } catch(err) { done(err); }
    });
}
