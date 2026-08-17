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
var config = require("./config");
var security = require("./security");
var express = require('express')
  , app = express();
var MongoClient = require('mongodb').MongoClient;
var ObjectID = function(input) { if(!/^[0-9a-fA-F]{24}$/.test(input)) { return; } return new (require('mongodb').ObjectId)(input); }
var fs = require('fs');
var passport = require("passport");
var socketOwnerCanAct = require("./auth").socketOwnerCanAct;
var initLobbyListeners = require("./lobby").initLobbyListeners;
var Unit = require("./static/shared/unit.js").Unit;
var unitLib = require("./static/shared/unit.js").unitLib;
var socketList = [];
var collections = {};

/** cookie name shared by express-session and the socket.io session lookup */
var SESSION_COOKIE_NAME = "lotf.sid";

/** how many game channels one socket may subscribe to (memory-exhaustion guard) */
var MAX_GAMES_PER_SOCKET = 8;

/*
   A game action arriving from a client can fail in ways we did not foresee. A
   rejected promise on one of those paths is logged rather than left to terminate
   the process, which would take every game in progress down with it (OWASP A05).
   Socket listeners and express routes catch their own errors; anything that still
   reaches `uncaughtException` leaves the process in an unknown state, so that one
   is fatal on purpose.
*/
process.on("unhandledRejection", function(err) {
    console.error("unhandled rejection:", err);
});

app.disable('x-powered-by');
if(config.trustProxy) { app.set('trust proxy', config.trustProxy); }

app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');
require("hbs").registerPartials(__dirname + '/views/partials');

app.use(security.securityHeaders);

// serve-static v2 (Express 5) no longer exposes a `mime` registry, so custom
// content types are applied per-response instead
app.use(express.static(__dirname + '/static', {
    dotfiles: 'ignore',
    setHeaders: function(res, filePath) {
        if(/\.appcache$/.test(filePath)) { res.setHeader('Content-Type', 'text/cache-manifest'); }
        else if(/\.hbs$/.test(filePath)) { res.setHeader('Content-Type', 'text/html'); }
    }
}));
app.use(require("cookie-parser")());
// `extended: false` keeps `a[$ne]=b` style bodies from arriving as objects, which
// is what turns a form field into a Mongo query operator (OWASP A03)
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.json({ limit: '16kb' }));

var MongoStore = require('connect-mongo').MongoStore;
var sessionMiddleware = require("express-session");
var mongoStore = new MongoStore({
    mongoUrl: config.mongoString,
    ttl: 60 * 60 * 24 * 7,
    touchAfter: 60 * 60,
    autoRemove: 'native'
});
app.use(sessionMiddleware({
    store: mongoStore,
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // only send the cookie over TLS when the site is actually served over TLS
        secure: config.usesHttps,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        path: '/'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

mongoStore.on('connect', function() {
    console.log('Session store connected');
});

mongoStore.on('error', function(err) {
    console.error('Session store error:', err);
});

app.get("/", function(req, res) {
    var user = req.user || {};
    res.render("index", { username: user.username });
});

require("./auth").initAuth(app, collections);
require("./gameList").initListing(app, collections);

// last-resort error handler: never let a stack trace reach the client
app.use(function(err, req, res, next) {
    console.error("request failed:", req.method, req.originalUrl, err);
    if(res.headersSent) { return next(err); }
    res.status(500).type("text/plain").send("Something went wrong.");
});

var server = app.listen(config.port, config.listeningIP);

server.on("error", function(err) {
    console.error("FATAL: could not listen on " + config.listeningIP + ":" + config.port + ":", err.message);
    process.exit(1);
});

var io = require('socket.io')(server, {
    // a client has no reason to send us anything large; cap it so a single
    // message cannot exhaust memory
    maxHttpBufferSize: 64 * 1024,
    // no cross-origin browser client is expected, and WebSocket upgrades are not
    // covered by CORS, so the Origin header is checked explicitly to block
    // cross-site WebSocket hijacking
    cors: { origin: false },
    allowRequest: function(req, callback) {
        if(!security.isSameOriginRequest(req)) {
            console.warn("socket.io: rejected cross-origin handshake from", req.headers.origin);
            callback("origin not allowed", false);
            return;
        }
        // passport.socketio will happily take a session id from the query string,
        // which sidesteps the signed session cookie; only the cookie may identify
        // a socket (OWASP A07: session handling)
        if(/[?&]session_id=/.test(req.url || "")) {
            console.warn("socket.io: rejected handshake carrying a session_id query parameter");
            callback("session_id query parameter not allowed", false);
            return;
        }
        callback(null, true);
    }
});

var mongoUrl = new URL(config.mongoString);
console.log('Connecting to MongoDB at', mongoUrl.hostname + (mongoUrl.port ? ':' + mongoUrl.port : '') + mongoUrl.pathname);
var mongoClient = new MongoClient(config.mongoString);
mongoClient.connect().then(async function() {
    console.log('Connected to MongoDB successfully');
    var mongo = mongoClient.db('lotf');

    collections.games = mongo.collection("games");
    collections.units = mongo.collection("units");
    collections.users = mongo.collection("users");

    // usernames identify sessions, so two accounts must never share one; the
    // application-level check alone loses to a race between two signups
    try {
        await collections.users.createIndex({ username: 1 }, { unique: true });
    } catch(err) {
        console.error('Could not create the unique username index:', err.message);
    }

    unitLib.init(function() {
        io.sockets.on('connection', function (socket) {
            initListeners(socket, collections);
        });
        console.log('Server fully initialized');
    });
}).catch(function(err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});

var passportSocketIo = require("passport.socketio");

function onAuthorizeSuccess(data, accept){
    accept();
}

function onAuthorizeFail(data, message, error, accept){
    // an unauthenticated socket is allowed to connect (observers and
    // anonymous-token players need one) but carries no identity
    console.log('unauthenticated socket.io connection:', message);
    accept();
}

io.use(passportSocketIo.authorize({
    key:         SESSION_COOKIE_NAME,
    cookieParser: require("cookie-parser"),
    secret:      config.sessionSecret, // the session_secret to parse the cookie
    store:       mongoStore,           // we NEED to use a sessionstore. no memorystore please
    success:     onAuthorizeSuccess,   // *optional* callback on success - read more below
    fail:        onAuthorizeFail      // *optional* callback on fail/error - read more below
}));

/*
   Budgets for client-driven events. Game actions are generous enough for normal
   play (a burst of moves while units animate) but stop a client from spinning
   the server with database work.
*/
var actionLimiter = new security.RateLimiter({ windowMs: 10000, max: 60 });
var authLimiter = new security.RateLimiter({ windowMs: 60000, max: 20 });

// initialize all socket.io listeners on a socket
function initListeners(socket, collections) {
    initLobbyListeners(io.sockets, socket, collections);

    security.socketHandler(socket, "anon auth", { limiter: authLimiter }, async function(data) {
        data = data || {};
        var gameIdString = security.asObjectIdString(data.gameId);
        if(!gameIdString) { socket.emit("no game"); return; }

        var game = await collections.games.findOne({ _id: ObjectID(gameIdString) });
        if(!game) { socket.emit("no game"); return; }

        var token = security.asString(data.anonToken, 128);
        if(token) {
            var player = (game.players || []).filter(function(p) {
                // compared in constant time: the token is a bearer credential
                return p.anonToken && security.safeEqual(String(p.anonToken), token);
            })[0];
            if(player && typeof player.username == "string") {
                socket.request.user = { username: player.username, isAnonymousPlayer: true };
            }
        }
        socket.emit("anon auth done");
    });

    // request for all game data
    security.socketHandler(socket, "alldata", { limiter: actionLimiter }, async function(data) {
        data = data || {};
        var gameIdString = security.asObjectIdString(data.gameId);
        if(!gameIdString) { socket.emit("no game"); return; }
        var gameId = ObjectID(gameIdString);

        // an unidentified socket may watch, but is nobody's player
        var username = security.socketUsername(socket);

        var game = await collections.games.findOne({ _id:gameId });
        if(!game) { socket.emit("no game"); return; }

        var player = username && game.players.filter(function(p) { return p.username == username })[0];
        var players = game.players.map(function(p) {
            // the client needs everyone's faction so it can work out which unit
            // images this game will actually use
            var ret = { username: p.username, team: p.team, alliance: p.alliance, faction: p.faction };
            // anonymous-player tokens are credentials: only the player running the
            // local seats (team 1) is given them
            if(player && player.team == 1) { ret.anonToken = p.anonToken; }
            return ret;
        });
        var units = await collections.units.find({ gameId:gameId }).toArray();
        units = units.filter(function(u) { return !u.conditions || u.conditions.indexOf("hidden")==-1 || u.team==(player||{}).team; });
        socket.emit("initdata", {map: game.map, units: units, player: player || null, players: players, activeTeam: game.activeTeam, villages:game.villages, timeOfDay: game.timeOfDay, alliances: game.alliances, over: !!game.over, winner: game.winner });
    });

    // subscribe to a game channel
    security.socketHandler(socket, "join game", { limiter: actionLimiter }, function(rawGameId) {
        var gameIdString = security.asObjectIdString(rawGameId);
        if(!gameIdString) { return; }
        var gameId = ObjectID(gameIdString);

        var ownEntries = socketList.filter(function(o) { return o.socket === socket; });
        // one subscription per game, and only so many games per socket
        if(ownEntries.some(function(o) { return o.gameId.equals(gameId); })) { return; }
        if(ownEntries.length >= MAX_GAMES_PER_SOCKET) { return; }

        socket.join("game"+gameId);

        var username = security.socketUsername(socket);
        if(username) {
            socketList.push({ gameId: gameId, username: username, socket: socket });
        } else {
            socketList.push({ gameId: gameId, socket: socket });
        }
    });

    security.socketHandler(socket, "disconnect", function() {
        // drop every subscription this socket held, not just the first one
        for(var i=socketList.length-1; i>=0; --i) {
            if(socketList[i].socket === socket) { socketList.splice(i, 1); }
        }
    });

    // move a unit
    security.socketHandler(socket, "move", { limiter: actionLimiter, requireUser: true }, function(data) {
        require("./executePath")(collections, data, socket, socketList);
    });


    // create a new unit
    security.socketHandler(socket, "create", { limiter: actionLimiter, requireUser: true }, function(data) {
        require("./createUnit")(collections, data, socket, socketList);
    });

    security.socketHandler(socket, "levelup", { limiter: actionLimiter, requireUser: true }, function(data) {
        require("./levelUp").levelUp(collections, data, socket, socketList);
    });

    security.socketHandler(socket, "endTurn", { limiter: actionLimiter, requireUser: true }, function(data) {
        require("./endTurn")(collections, data, socket, socketList, io);
    });
};
