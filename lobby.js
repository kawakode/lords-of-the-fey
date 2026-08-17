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
var roomIndex = 1;

var rooms = {};
var players = [];

var factions = require("./factions");
var security = require("./security");
var listMaps = require("./loadUtils").listMaps;

/** ceilings that keep lobby state from growing without bound */
var MAX_ROOMS = 100;
var MAX_ROOM_NAME_LENGTH = 40;
var MAX_CHAT_LENGTH = 500;

/* per-socket budgets for lobby chatter and room churn (OWASP A04: insecure design) */
var lobbyLimiter = new security.RateLimiter({ windowMs: 10000, max: 40 });
var chatLimiter = new security.RateLimiter({ windowMs: 10000, max: 10 });
var createLimiter = new security.RateLimiter({ windowMs: 60000, max: 5 });

/** A room by id, or null. Ids only ever come from clients, so they are validated. */
function getRoom(rawId) {
    var id = security.asInt(rawId, 1, Number.MAX_SAFE_INTEGER);
    if(id == null) { return null; }
    return Object.prototype.hasOwnProperty.call(rooms, id) ? rooms[id] : null;
}

/**
   A slot index inside a room, or null.

   Without this check a client could pass "length" or "constructor" as a slot and
   reach `Array.prototype` members instead of a player (prototype access, and a
   crash on the resulting object).
*/
function getSlotIndex(room, rawSlot) {
    if(!room) { return null; }
    return security.asInt(rawSlot, 0, room.players.length - 1);
}

module.exports.initLobbyListeners = function(sockets, socket, collections, app) {
    var emptySlot = { empty: true };

    /** the caller's username, or null when the socket is not logged in */
    function currentUsername() {
        return security.socketUsername(socket);
    }

    security.socketHandler(socket, "list maps", { limiter: lobbyLimiter, requireUser: true }, function() {
        listMaps(function(err, mapNames) {
            if(err) { socket.emit("map list", []); return; }
            socket.emit("map list", mapNames);
        });
    });

    security.socketHandler(socket, "join lobby", { limiter: lobbyLimiter, requireUser: true }, function() {
        var username = currentUsername();

        // repeated "join lobby" events used to append the same name forever
        if(players.indexOf(username) == -1) {
            players.push(username);
            sockets.in("lobby").emit("joined lobby", username);
        }

        socket.emit("lobby data", { players: players, rooms: publicRooms(), you: username });
        socket.join("lobby");

        socket.on("disconnect", function() {
            var index = players.indexOf(username);
            if(index != -1) { players.splice(index, 1); }
            sockets.in("lobby").emit("left lobby", username);
        });
    });

    security.socketHandler(socket, "create room", { limiter: createLimiter, requireUser: true }, function(data) {
        var username = currentUsername();
        data = data || {};

        if(Object.keys(rooms).length >= MAX_ROOMS) { return; }

        var name = security.asText(data.name, MAX_ROOM_NAME_LENGTH) || (username + "'s room");

        // the map name becomes part of a file path and is stored on the game, so it
        // is matched against the maps that actually exist rather than trusted
        listMaps(function(err, mapNames) {
            if(err || mapNames.indexOf(data.map) == -1) { return; }
            var mapName = data.map;

            var loadMap = require("./loadUtils").loadMap;
            loadMap(mapName, function(err, mapData) {
                if(err || !mapData) { return; }

                var startPositions = require("./createGame").getStartPositions(mapData);
                if(startPositions.length < 2) { return; }

                var id = roomIndex++;
                rooms[id] = {
                    id: id,
                    name: name,
                    map: mapName,
                    totalSlots: startPositions.length - 1,
                    filledSlots: 0,
                    players: [],
                    owner: username
                };
                for(var i=0; i < rooms[id].totalSlots; i++) { rooms[id].players[i] = emptySlot; }
                sockets.in("lobby").emit("created room", publicRoom(rooms[id]));
                joinRoom({ username: username }, rooms[id]);
            });
        });
    });

    security.socketHandler(socket, "join room", { limiter: lobbyLimiter, requireUser: true }, function(data) {
        var room = getRoom((data || {}).id);
        if(!room) { return; }
        joinRoom({ username: currentUsername() }, room);
    });

    security.socketHandler(socket, "add anon to room", { limiter: lobbyLimiter, requireUser: true }, function(data) {
        var room = getRoom((data || {}).id);
        if(!room || room.owner != currentUsername()) { return; }

        // this token is a bearer credential for the anonymous seat: it has to come
        // from a CSPRNG, not Math.random (OWASP A02)
        var token = security.randomToken(24);
        joinRoom({
            username: "anon" + token.substr(0, 6),
            ready: true,
            anonToken: token
        }, room);
    });

    security.socketHandler(socket, "enter room", { limiter: lobbyLimiter, requireUser: true }, function(rawId) {
        var username = currentUsername();
        var room = getRoom(rawId);
        if(!room) { socket.emit("room data", { you: username, room: undefined }); return; }

        var id = room.id;
        socket.join("room"+id);
        socket.emit("room data", { you: username, room: publicRoom(room) });

        socket.on("disconnect", function() {
            leaveRoom(id, username);

            for(var roomId in rooms) {
                if(rooms[roomId].owner == username) {
                    sockets.in("lobby").emit("room destroyed", roomId);
                    sockets.in("room"+roomId).emit("kicked", roomId);

                    for(var i=0; i<rooms[roomId].players.length; i++) {
                        leaveRoom(roomId, rooms[roomId].players[i].username);
                    }

                    delete rooms[roomId];
                }
            }
        });
    });

    /**
       A room as clients are allowed to see it: anonymous-seat tokens let their
       holder act as that player, so they never go out over the lobby channel.
    */
    function publicRoom(room) {
        if(!room) { return room; }
        return {
            id: room.id,
            name: room.name,
            map: room.map,
            totalSlots: room.totalSlots,
            filledSlots: room.filledSlots,
            owner: room.owner,
            players: room.players.map(publicPlayer)
        };
    }

    function publicPlayer(player) {
        if(!player || player.empty) { return { empty: true }; }
        return {
            username: player.username,
            ready: !!player.ready,
            faction: player.faction,
            alliance: player.alliance,
            isAnon: !!player.anonToken
        };
    }

    function publicRooms() {
        var result = {};
        for(var id in rooms) { result[id] = publicRoom(rooms[id]); }
        return result;
    }

    function joinRoom(user, room) {
        if(!room || !user || !user.username ||
           room.players.some(function(o) { return o.username == user.username; }) ||
           room.filledSlots >= room.totalSlots) {
            return;
        }

        // keep setting freeIndex until we find an empty slot, then stop
        var freeIndex;
        var foundFreeSlot = room.players.some(function(p,idx) { freeIndex = idx; return p.empty; });
        if(!foundFreeSlot) { return; }

        room.players[freeIndex] = { username: user.username, ready: !!user.ready };
        if(user.anonToken) { room.players[freeIndex].anonToken = user.anonToken; }
        else { Object.defineProperty(room.players[freeIndex], "socket", { value: socket }); }
        room.filledSlots++;

        sockets.in("room"+room.id).emit("joined room", { username: user.username, players: room.players.map(publicPlayer) });
        socket.join("room"+room.id);

        sockets.in("lobby").emit("joined room", { username: user.username, room: publicRoom(room) });
    }

    function leaveRoom(id, username) {
        var room = getRoom(id);
        if(!room) { return; }
        if(!username) { return; }
        var player = room.players.filter(function(o) { return o.username == username; })[0];
        if(!player) { return; }

        room.filledSlots--;

        room.players.splice(room.players.indexOf(player), 1, emptySlot);

        if(!player.anonToken && player.socket) { player.socket.leave("room"+id); }

        sockets.in("lobby").emit("left room", { username: username, roomId: room.id });
        sockets.in("room"+id).emit("left room", { username: username, players: room.players.map(publicPlayer), roomId: id });
    };

    security.socketHandler(socket, "ready", { limiter: lobbyLimiter, requireUser: true }, function(data) {
        data = data || {};
        var room = getRoom(data.id);
        if(!room) { return; }
        var username = currentUsername();

        var player = room.players.filter(function(o) { return o.username == username; })[0];
        if(!player) { return; }

        player.ready = !!data.ready;

        sockets.in("room"+room.id).emit("player update", { players: room.players.map(publicPlayer), roomId: room.id });
    });

    security.socketHandler(socket, "launch room", { limiter: lobbyLimiter, requireUser: true }, function(rawRoomId) {
        var room = getRoom(rawRoomId);
        if(!room) { return; }

        // only the owner starts the game, and only once: replaying this event used
        // to create a fresh game (and its units) on every call
        if(room.owner != currentUsername()) { return; }
        if(room.launching) { return; }

        var filledSlots = room.players.filter(function(o) { return !o.empty; });
        if(filledSlots.length < 2) { return; }
        if(!filledSlots.every(function(p) { return p.ready; })) { return; }

        room.launching = true;
        var roomId = room.id;

        require("./createGame").createNewGame(collections, room.players, room.map, function(gameId) {
            if(!gameId) { room.launching = false; return; }

            sockets.in("room"+roomId).emit("launched room", gameId);
            sockets.in("lobby").emit("room destroyed", roomId);
            delete rooms[roomId];
        });
    });

    security.socketHandler(socket, "kick", { limiter: lobbyLimiter, requireUser: true }, function(data) {
        data = data || {};
        var room = getRoom(data.id);
        if(!room) { return; }
        if(room.owner != currentUsername()) { return; }

        var slot = getSlotIndex(room, data.slot);
        if(slot == null) { return; }

        var player = room.players[slot];
        if(!player || player.empty) { return; }
        if(player.username == room.owner) { return; }

        if(!player.anonToken && player.socket) { player.socket.emit("kicked", room.id); }
        leaveRoom(room.id, player.username);
    });

    security.socketHandler(socket, "set faction", { limiter: lobbyLimiter, requireUser: true }, function(data) {
        data = data || {};
        var room = getRoom(data.id);
        if(!room) { return; }
        var username = currentUsername();

        var slot = getSlotIndex(room, data.slot);
        if(slot == null) { return; }

        var faction = security.asString(data.faction, 64);
        if(faction != "Random" && !factions.resolveId(faction)) { return; }

        var player = room.players[slot];
        if(!player || player.empty) { return; }
        if(player.username != username && username != room.owner) { return; }

        player.faction = faction;
        sockets.in("room"+room.id).emit("player update", { players: room.players.map(publicPlayer), roomId: room.id });
    });

    security.socketHandler(socket, "set alliance", { limiter: lobbyLimiter, requireUser: true }, function(data) {
        data = data || {};
        var room = getRoom(data.id);
        if(!room) { return; }
        var username = currentUsername();

        var slot = getSlotIndex(room, data.slot);
        if(slot == null) { return; }

        var alliance = security.asInt(data.alliance, 1, room.totalSlots);
        if(alliance == null) { return; }

        var player = room.players[slot];
        if(!player || player.empty) { return; }
        if(player.username != username && username != room.owner) { return; }

        player.alliance = alliance;
        sockets.in("room"+room.id).emit("player update", { players: room.players.map(publicPlayer), roomId: room.id });
    });

    security.socketHandler(socket, "chat", { limiter: chatLimiter, requireUser: true }, function(data) {
        data = data || {};
        var username = currentUsername();

        var message = security.asText(data.msg, MAX_CHAT_LENGTH);
        if(!message) { return; }

        var room = getRoom(data.id);

        // you may only speak where you actually are
        var target;
        if(room && room.players.some(function(p){ return p.username == username; })) {
            target = sockets.in("room"+room.id);
        } else if(!room && data.id === "lobby" && players.indexOf(username) != -1) {
            target = sockets.in("lobby");
        }
        if(target) { target.emit("chatmsg", { from: username, msg: message }); }
    });
}
