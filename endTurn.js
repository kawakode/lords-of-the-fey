var socketOwnerCanAct = require("./auth").socketOwnerCanAct;
var loadMap = require("./loadUtils").loadMap;
var Unit = require("./static/shared/unit.js").Unit;
var ObjectID = function(input) { if(!/^[0-9a-fA-F]{24}$/.test(input)) { return; } return new (require('mongodb').ObjectId)(input); }
var unitLib = require("./static/shared/unit.js").unitLib;
var Terrain = require("./static/shared/terrain.js").Terrain;
var resumePlannedMoves = require("./executePath").resumePlannedMoves;
var security = require("./security");

module.exports = function(collections, data, socket, socketList) {
    data = data || {};

    var gameIdString = security.asObjectIdString(data.gameId);
    if(!gameIdString) { socket.emit("no game"); return; }
    var gameId = ObjectID(gameIdString);

        return collections.games.findOne({_id:gameId}).then(function(game) {
            if(!game) { socket.emit("no game"); return; }

            if(!socketOwnerCanAct(socket, game)) {
                return;
            }

            var oldActiveTeam = game.activeTeam;
            // bounded so a game whose player list holds nothing but empty slots
            // cannot spin here forever
            var attempts = 0;
            do {
                game.activeTeam %= (game.players.length);
                game.activeTeam++;
            } while(!(game.players[game.activeTeam - 1] || {}).username && ++attempts <= game.players.length);
            if(!(game.players[game.activeTeam - 1] || {}).username) { return; }

            var villageCount = 0;
            for(var coords in game.villages) {
                if(game.villages[coords] == game.activeTeam) {
                    villageCount++;
                }
            }

            // if all players have taken a turn and active player num is now less than previous player num (because it wrapped around)
            if(oldActiveTeam > game.activeTeam) {
                var times = ["morning", "afternoon", "dusk", "first watch", "second watch", "dawn"];
                game.timeOfDay = times[(times.indexOf(game.timeOfDay) + 1) % times.length];
            }

            // find all units owned by the newly active player
            collections.units.find({ gameId: gameId, team: game.activeTeam }).toArray().then(doUpdates);
            function doUpdates(unitList) {
                unitList = unitList.map(function(u) { return new Unit(u); });
                var unitsIndexedBySpace = unitList.reduce(function(result, u) { result[u.x+","+u.y] = u; return result; }, {});

                var costlyUnitCount = 0;
                for(var n in unitList) {
                    var unit = unitList[n];
                    // costly units are non-commander, non-loyal units
                    if(unit.team == game.activeTeam &&
                       !unit.isCommander &&
                       (!unit.attributes || unit.attributes.indexOf("loyal") == -1)
                    ) {
                        costlyUnitCount++;
                    }
                }
                game.players[game.activeTeam - 1].gold += 2 + villageCount*2 - costlyUnitCount;
                //console.log("gold", game.players[game.activeTeam - 1].gold, 2 + villageCount*2 - costlyUnitCount);

                collections.games.replaceOne({ _id: game._id }, game).then(function() {
                    var updates = {};
                    var finishUpdates = function() {
                        (async function saveAllUnits() {
                            for(var i=0; i<unitList.length; ++i) {
                                var obj = unitList[i].getStorableObj();
                                await collections.units.replaceOne({ _id: obj._id }, obj);
                            }
                            sendUpdates();
                        })();

                        function sendUpdates() {
                            var hiddenUpdates = {};
                            var publicUpdates = {};
                            for(var updateCoord in updates) {
                                if(unitsIndexedBySpace[updateCoord].hasCondition("hidden")) { hiddenUpdates[updateCoord] = updates[updateCoord]; }
                            }
                            for(updateCoord in updates) {
                                if(!hiddenUpdates[updateCoord]) { publicUpdates[updateCoord] = updates[updateCoord]; }
                            }

                            socketList.filter(function(o) { return o.gameId.equals(gameId); }).forEach(function(o) {
                                o.socket.emit("newTurn", { activeTeam: game.activeTeam,
                                                    updates: publicUpdates,
                                                    timeOfDay: game.timeOfDay });
                            });

                            var activePlayerSocketData = socketList.filter(function(o) {
                                return o.gameId.equals(gameId) && o.username == game.players[game.activeTeam-1].username;
                            })[0];

                            if(activePlayerSocketData) {
                                activePlayerSocketData.socket.emit("playerUpdate", { gold: game.players[game.activeTeam-1].gold });
                            }

                            var alliedUsernames = game.players.filter(function(p) { return p.alliance == game.players[game.activeTeam-1].alliance; }).map(function(p) { return p.username; });
                            var alliedPlayerSocketData = socketList.filter(function(o) {
                                return o.gameId.equals(gameId) &&
                                       alliedUsernames.indexOf(o.username) != -1;
                            });
                            alliedPlayerSocketData.forEach(function(s) {
                                s.socket.emit("newTurn", { activeTeam: game.activeTeam,
                                                                     updates: hiddenUpdates,
                                                                     timeOfDay: game.timeOfDay });
                            });

                            // units with movement left over from a multi-turn plan
                            // walk on now that their side has move points again
                            resumePlannedMoves(collections, gameId, game, game.activeTeam, socketList);
                        }
                    };
                    
                    loadMap(game.map, function(err, mapData) {
                        if(err || !mapData) { console.error("endTurn: could not load map", game.map, err); return; }

                        unitList.forEach(function updateUnitForNewTurn(unit) {
                            var update = updates[unit.x+","+unit.y] || {};
                            var healedHp = update.healedHp || 0;
                            // heal unmoved units
                            if(unit.moveLeft == unit.move && !unit.hasAttacked) {
                                unit.hp = Math.min(unit.hp+2, unit.maxHp);
                                update.hp = unit.hp;
                            }
                            // TODO: unmoved slowed units don't have full move
                        
                            // countdown and possibly remove slowed
                            if(unit.hasCondition("slowed")) {
                                update.conditionChanges = update.conditionChanges || {};

                                var slowedCondition = unit.getCondition("slowed");
                                slowedCondition.countdown--;
                                if(slowedCondition.countdown <= 0) {
                                    update.conditionChanges.slowed = false;
                                    unit.removeCondition("slowed");
                                } else {
                                    update.conditionChanges.slowed = slowedCondition;
                                }
                            }
        
                            // refill move points
                            if(unit.hasCondition("slowed")) {
                                unit.moveLeft = Math.ceil(unit.move / 2);
                            } else {
                                unit.moveLeft = unit.move;
                            }

                            update.moveLeft = unit.moveLeft;
                            unit.hasAttacked = false;

                            // if on a village and/or has regeneration, heal and/or cure poison
                            // (both at once causes both effects, but healing is capped at 8)
                            function villageHeal() {
                                if(unit.hasCondition("poisoned")) {
                                    unit.removeCondition("poisoned");
                                    update.conditionChanges = update.conditionChanges || {};
                                    update.conditionChanges.poisoned = false;
                                } else {
                                    healedHp = 8;
                                }
                            }
                            var unitSpace = mapData[unit.x+","+unit.y] || { terrain: { properties: [] } };
                            if(unitSpace.terrain.properties.indexOf("village") != -1 ||
                               (unit.attributes || []).indexOf("regenerates") != -1){
                                villageHeal();
                            }

                            // TODO: heal allied off-team units as well (currently we only get same-team units from Mongo)
                            var healingHp = 0;
                            for(var i=0; i<(unit.attributes||[]).length; ++i) {
                                var abilityProps = unitLib.abilityDict[unit.attributes[i]];
                                if(abilityProps && abilityProps.heals) {
                                    healingHp += abilityProps.heals;
                                }
                            }
                            if(healingHp > 0) {
                                var coords = Terrain.getNeighborCoords(unit);
                                for(var i=0; i<coords.length; ++i) {
                                    var coord = coords[i];
                                    var healedUnit = unitsIndexedBySpace[coord.x+","+coord.y];
                                    if(healedUnit) {
                                        var healedUpdate = updates[coord.x+","+coord.y] || {};
                                        healedUpdate.healedHp = healedUpdate.healedHp || 0;
                                        healingHp = Math.min(healingHp, 8 - healedUpdate.healedHp);
                                        healedUnit.hp = Math.min(healedUnit.hp+healingHp, healedUnit.maxHp);
                                        healedUpdate.healedHp += healingHp;
                                        healedUpdate.hp = healedUnit.hp;
                                        updates[coord.x+","+coord.y] = healedUpdate;
                                    }
                                }
                            }

                            if(unit.hasCondition("poisoned")) {
                                unit.hp = Math.max(1, unit.hp-8);
                                update.hp = unit.hp;
                            }

                            if(healedHp != 0) {
                                update.healedHp = Math.max(healedHp, 8);
                                unit.hp = Math.min(unit.hp+healedHp, unit.maxHp);
                                update.hp = unit.hp;
                            }

                            updates[unit.x+","+unit.y] = update;
                        });
                        finishUpdates();
                    });
                });
            };
        });
}
