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
var castlePathExists = require("./static/shared/castlePathExists").castlePathExists;
var Unit = require("./static/shared/unit.js").Unit;
var ObjectID = function(input) { if(!/^[0-9a-fA-F]{24}$/.test(input)) { return; } return new (require('mongodb').ObjectId)(input); }
var loadMap = require("./loadUtils").loadMap;
var socketOwnerCanAct = require("./auth").socketOwnerCanAct;
var socketPlayer = require("./auth").socketPlayer;
var security = require("./security");

/**
    @param {Object} data - object of unit properties (x, y, type)
    @mapData {Object}
*/
module.exports = function(collections, data, socket, socketList) {
        data = data || {};

        // everything below goes into a Mongo query or a map lookup, so it has to be
        // the shape we expect before it is used (OWASP A03: injection)
        var gameIdString = security.asObjectIdString(data.gameId);
        if(!gameIdString) { socket.emit("created", {}); return; }
        var gameId = ObjectID(gameIdString);

        var target = security.asCoords(data);
        var type = security.asString(data.type, 64);
        if(!target || !type) { socket.emit("created", {}); return; }

        var request = { gameId: gameIdString, x: target.x, y: target.y, type: type };

        collections.games.findOne({_id:gameId}).then(function(game) {
            if(!game) { socket.emit("no game"); return; }

            if(!socketOwnerCanAct(socket, game)) { socket.emit("created", {}); return; }
            var player = socketPlayer(socket, game);
            if(!player) { socket.emit("created", {}); return; }

            loadMap(game.map, function(err, mapData) {
                if(err || !mapData) { socket.emit("created", {}); return; }

                createUnit(request, mapData, collections, game, player, function(createResult) {
                    socketList.filter(function(o){ return o.gameId.equals(gameId); }).forEach(function(o) { o.socket.emit("created", createResult); })
                    socket.emit("playerUpdate", { gold: player.gold });
                });
            });
        }).catch(function(err) {
            console.error("create unit failed:", err);
            socket.emit("created", {});
        });
}

function createUnit(data, mapData, collections, game, player, callback) {
    var gameId = ObjectID(data.gameId);
    var loadFaction = require("./loadUtils").loadFaction;

    loadFaction(player.faction, function(err, faction) {
        recruit(err, faction).catch(function(err) {
            console.error("recruit failed:", err);
            callback({});
        });
    });

    async function recruit(err, faction) {
        if(err || !faction || !Array.isArray(faction.recruitList)) { callback({}); return; }
        if(faction.recruitList.indexOf(data.type) == -1) { callback({}); return; }

        // the target space must exist on this map before anything reads its terrain
        var targetSpace = mapData[data.x+","+data.y];
        if(!targetSpace || !targetSpace.terrain) { callback({}); return; }

        var occupant = await collections.units.findOne({ gameId: gameId, x: data.x, y: data.y });
        // if the space is populated, abort
        if(occupant) {
            callback({});
            return;
        }

        var commanders = await collections.units.find({ gameId: gameId, team: player.team, isCommander: true }).toArray();
        var createValid = false;

        for(var i=0; i < commanders.length; ++i) {
            var commander = commanders[i];
            var commanderSpace = mapData[commander.x+","+commander.y];
            if(!commanderSpace || !commanderSpace.terrain) { continue; }

            if(commanderSpace.terrain.properties.indexOf("keep") != -1 && // check that the commander is on a keep
               targetSpace.terrain.properties.indexOf("castle") != -1 && // check target is a castle
               castlePathExists(commander, data, mapData) // find a castle-only path from commander to target
              ) { createValid = true; }
        }

        if(!createValid) { callback({}); return; }

        var sanatizedData = {
            x: data.x,
            y: data.y,
            team: player.team,
            type: data.type,
            gameId: gameId
        };

        var unit = new Unit(sanatizedData, true);
        if(!unit || typeof unit.cost != "number") { callback({}); return; }

        var storable = unit.getStorableObj();

        if(player.gold < unit.cost) { callback({}); return; }

        player.gold -= unit.cost;

        await collections.games.replaceOne({ _id: game._id }, game);
        await collections.units.insertOne(storable);
        callback(storable);
    }
};
