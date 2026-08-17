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

/** @module executePath */

var socketOwnerCanAct = require("./auth").socketOwnerCanAct;
var loadMap = require("./loadUtils").loadMap;
var Unit = require("./static/shared/unit.js").Unit;
var executeAttack = require("./executeAttack");
var Terrain = require("./static/shared/terrain.js").Terrain;
var executeAttack = require("./executeAttack");
var ObjectID = function(input) { if(input.length!=12 && input.length!=24) { return; } return new (require('mongodb').ObjectId)(input); }
var checkForVictory = require("./endGame").checkForVictory;
var concludeGame = require("./endGame").concludeGame;

module.exports = function(collections, data, socket, socketList) {
        var gameId = ObjectID(data.gameId);
        collections.games.findOne({_id:gameId}).then(function(game) {
            if(!game) { socket.emit("no game"); return; }

            // a finished game accepts no further moves
            if(game.over) { socket.emit("moved", { path:[data.path[0]] }); return; }

            performMove(collections, game, gameId, data.path, data.attackIndex, socketList, { socket: socket });
        });
}

/**
   Walk a unit along a path and tell everyone about it.

   The path may be longer than the unit can walk this turn: whatever is left over
   is stored on the unit as `plannedPath` and resumed by `resumePlannedMoves` when
   its side next moves.

   @param options.socket - socket of the player who ordered the move; absent when
                           the server is resuming a plan on the player's behalf
   @param done - called once the move has been fully resolved
*/
function performMove(collections, game, gameId, path, attackIndex, socketList, options, done) {
        options = options || {};

        var socket = options.socket;
        var user = socket && socket.request.user;
        var finished = false;
        var finish = function() { if(!finished) { finished = true; if(done) { done(); } } };
        var abort = function() {
            if(socket) { socket.emit("moved", { path:[path[0]] }); }
            finish();
        };

            loadMap(game.map, function(err, mapData) {
                collections.units.findOne({ x:path[0].x, y:path[0].y, gameId:gameId }).then(function(unitRecord) {
                    if(!unitRecord) { abort(); return; }

                    // ensure that the logged-in user has the right to move this unit
                    if(socket) {
                        var player = game.players.filter(function(p) { return p.username == user.username })[0];
                        if(!socketOwnerCanAct(socket, game) && player && player.team != unitRecord.team) {
                            abort();
                            return;
                        }
                    }

                    var unit = new Unit(unitRecord);

                    collections.units.find({ gameId: gameId }).toArray().then(function(unitArray) {
                            unitArray = unitArray.map(function(u) { return new Unit(u); });

                            var isInitiallyHidden = unit.hasCondition("hidden");

                            // make the move
                            var moveResult = executePath(path, unit, unitArray, mapData, game);

                            var endPoint = moveResult.path[moveResult.path.length-1];
                            unit.x = endPoint.x;
                            unit.y = endPoint.y;
                            unit.moveLeft -= moveResult.moveCost || 0;

                            // hold on to the part of the path the unit could not walk
                            // this turn, so that its side resumes it next turn
                            if(moveResult.remainingPath) {
                                unit.plannedPath = moveResult.remainingPath;
                                if(attackIndex == null) { delete unit.plannedAttackIndex; }
                                else { unit.plannedAttackIndex = attackIndex; }
                            } else {
                                delete unit.plannedPath;
                                delete unit.plannedAttackIndex;
                            }

                            if(isInitiallyHidden) { moveResult.unit = unit.getStorableObj(); }

                            if(moveResult.hide) {
                                unit.addCondition("hidden");
                            } else {
                                unit.removeCondition("hidden");
                            }

                            if(moveResult.revealedUnits.length) {
                                moveResult.revealedUnits = moveResult.revealedUnits.map(function(u) { u.removeCondition("hidden"); return u.getStorableObj(); });
                            }

                            // if there is a village here and
                            // if the village is not co-team with the unit, capture it
                            if(mapData[endPoint.x+","+endPoint.y].terrain.properties.indexOf("village") != -1 &&
                               game.villages[endPoint.x+","+endPoint.y] != unit.team) {
                                game.villages[endPoint.x+","+endPoint.y] = unit.team;
                                moveResult.capture = true;
                                unit.moveLeft = 0;
                                collections.games.replaceOne({ _id: game._id }, game).then(saveRevealedUnits);
                            } else {
                                saveRevealedUnits();
                            }

                            async function saveRevealedUnits() {
                                for(var i=0; i<moveResult.revealedUnits.length; ++i) {
                                    var revealed = moveResult.revealedUnits[i];
                                    await collections.units.replaceOne({ _id: revealed._id }, revealed);
                                }
                                concludeMove();
                            }

                            function concludeMove() {
                                var victoryResult = {};

                                var emitMove = function(victory) {
                                        var alliedUsernames = game.players.filter(function(p) { return p.alliance == game.players[game.activeTeam-1].alliance; }).map(function(p) { return p.username; });
                                        var alliedPlayerSocketData = socketList.filter(function(o) {
                                            return o.username && o.gameId.equals(gameId) &&
                                            alliedUsernames.indexOf(o.username) != -1;
                                        });

                                        alliedPlayerSocketData.forEach(function(s) {
                                            s.socket.emit("moved", moveResult);
                                        });

                                        moveResult.path = moveResult.publicPath || moveResult.path;
                                        var unalliedPlayerSocketData = socketList.filter(function(o){ return alliedPlayerSocketData.indexOf(o)==-1; });
                                        unalliedPlayerSocketData.forEach(function(s) {
                                            s.socket.emit("moved", moveResult);
                                        });

                                        if(victoryResult.victory) {
                                            socketList.filter(function(o) { return o.gameId.equals(gameId) }).forEach(function(s) { s.socket.emit("victory", victoryResult); })
                                        }

                                        finish();
                                };

                                // perform the attack
                                if(moveResult.attack && !unit.hasAttacked) {
                                    var targetCoords = path[path.length-1];
                                    collections.units.findOne({ x:targetCoords.x, y:targetCoords.y, gameId:gameId }).then(async function(defenderRecord) {
                                        if(!defenderRecord) {
                                            var own = unit.getStorableObj();
                                            await collections.units.replaceOne({ _id: own._id }, own);
                                            emitMove();
                                            return;
                                        }

                                        var defender = new Unit(defenderRecord);

                                        if(defender.getAlliance(game) == unit.getAlliance(game)) {
                                            var own = unit.getStorableObj();
                                            await collections.units.replaceOne({ _id: own._id }, own);
                                            emitMove();
                                            return;
                                        }

                                        unit.hasAttacked = true;
                                        unit.moveLeft = 0;

                                        // resolve combat
                                        var attackSpace = moveResult.path[moveResult.path.length-1];
                                        if(unit.hasCondition("hidden")) {
                                             unit.removeCondition("hidden");
                                        }
                                        moveResult.combat = executeAttack(unit, attackIndex, attackSpace, defender, unitArray, mapData, game);

                                        await collections.games.replaceOne({ _id: game._id }, game);

                                        // injure/kill units models
                                        var updateUnitDamage = async function(target) {
                                            if(target.hp > 0) {
                                                var obj = target.getStorableObj();
                                                await collections.units.replaceOne({ _id: obj._id }, obj);
                                                return;
                                            }

                                            await collections.units.deleteOne({ _id: target._id });
                                            if(!target.isCommander) { return; }

                                            var commander = await collections.units.findOne({
                                                gameId: target.gameId,
                                                isCommander: true,
                                                team: target.team
                                            });
                                            if(commander) { return; }

                                            victoryResult = await new Promise(function(resolve) {
                                                checkForVictory(game, collections, resolve);
                                            });
                                        };

                                        await updateUnitDamage(unit);
                                        await updateUnitDamage(defender);

                                        // the last alliance still holding a commander wins;
                                        // mark the game finished before telling anyone about it
                                        if(victoryResult.victory) {
                                            await new Promise(function(resolve) {
                                                concludeGame(victoryResult, game, collections, resolve);
                                            });
                                        }

                                        emitMove();
                                    }).catch(reportFailure);
                                } else {
                                    (async function() {
                                        var own = unit.getStorableObj();
                                        await collections.units.replaceOne({ _id: own._id }, own);
                                        emitMove();
                                    })().catch(reportFailure);
                                }
                            }
                        }).catch(reportFailure);
                    }).catch(reportFailure);
            });

        // a failed move must still release any caller waiting on this one
        function reportFailure(err) {
            console.error("move failed:", err);
            abort();
        }
}

/**
   Resume the movement plans of a side whose turn has just begun. Each unit walks
   as far along its stored plan as this turn allows, keeping whatever is left.

   Plans run one unit at a time so that each move sees the board as the previous
   move left it.
*/
module.exports.resumePlannedMoves = function(collections, gameId, game, team, socketList, callback) {
    var done = function() { if(callback) { callback(); } };

    if(game.over) { done(); return; }

    collections.units.find({ gameId: gameId, team: team, plannedPath: { $exists: true } }).toArray().then(async function(records) {
        for(var i=0; i<records.length; ++i) {
            var record = records[i];
            var plan = record.plannedPath;

            // a plan is only good while the unit still stands where it left off
            if(!plan || plan.length < 2 || plan[0].x != record.x || plan[0].y != record.y) {
                await collections.units.updateOne({ _id: record._id }, { $unset: { plannedPath: "", plannedAttackIndex: "" } });
                continue;
            }

            await new Promise(function(resolve) {
                performMove(collections, game, gameId, plan, record.plannedAttackIndex, socketList, {}, resolve);
            });
        }

        done();
    }).catch(function(err) {
        console.error("resumePlannedMoves failed:", err);
        done();
    });
};

var getNeighborCoords = require("./static/shared/terrain.js").Terrain.getNeighborCoords;

/** Given two spaces, descide if they are neighbors */
function areNeighbors(space1, space2) {
    var neighbors = getNeighborCoords(space1);
    for(var i=0; i<neighbors.length; ++i) {
        if(space2.x == neighbors[i].x && space2.y == neighbors[i].y) { return true; }
    }
    return false;
}

/**
Attempt to move a unit through a given path and report result

@param path - array of (x,y) spaces
@param {Unit} unit - Unit attempting to move
@param {Array.<Unit>} unitArray - array of Units in the current game
@param {Object} mapData - object with "x,y" keys and tile values (see toMapDict in terrain.js)
@param game - game object

@return {{path:Array, moveCost:number}|boolean} object with actual path taken and move points spent, or false (on failed move)
*/

function executePath(path, unit, unitArray, mapData, game) {
    var actualPath = [path[0]];
    var standingClear = true;
    var totalMoveCost = 0;
    var revealedUnits = [];
    var planInterrupted = false;

    for(var i=1; i<path.length; ++i) {
        var coords = path[i];
        var isLastSpace = (i == path.length-1);

        if(!areNeighbors(path[i], path[i-1])) { return { path:[path[0]], revealedUnits:[] }; }

        var occupant = unitArray.filter(function(u) { return u.x == coords.x && u.y == coords.y; })[0];
        if(occupant) {
            if(occupant.getAlliance(game) != unit.getAlliance(game)) {
                if(isLastSpace && standingClear) {
                    // attack if the unit is not hidden (we couldn't have planned to attack a hidden unit)
                    return concludePathing(!occupant.hasCondition("hidden"));
                }
                return { path:[path[0]], revealedUnits:[] };
            } else {
                // invalid move; ending space must be clear
                if(isLastSpace) return { path:[path[0]], revealedUnits: [] };
            }

            standingClear = false;
        } else {
            standingClear = true;
        }

        // out of move points: the rest of the path becomes a plan for later turns
        if(totalMoveCost == unit.moveLeft) {
            return concludePathing(false, path.slice(i-1));
        }

        var stepCost = unit.getMoveCostForSpace(mapData[coords.x+","+coords.y]);

        // this step does not fit in what is left of the turn, so stop short of it
        if(totalMoveCost + stepCost > unit.moveLeft) {
            return concludePathing(false, path.slice(i-1));
        }

        totalMoveCost += stepCost;

        actualPath.push(path[i]);

        // if any enemy is adjacent to this space, end the path now
        var adjacentEnemies = getAdjacentEnemies(coords);
        if(adjacentEnemies.length > 0) {
            totalMoveCost = unit.moveLeft;
            var hiddenEnemies = adjacentEnemies.filter(function(e) { return e.hasCondition("hidden"); });
            revealedUnits = revealedUnits.concat(hiddenEnemies);

            // running into an enemy invalidates the rest of the plan: the player
            // should decide what to do about it rather than march on blindly
            planInterrupted = true;
        }
    }

    return concludePathing();

    function concludePathing(isAttack, remainingPath) {
        if(unit.attributes && unit.attributes.indexOf("ambush") != -1) {
            var prevSpaceHidden = null;
            var publicPath = actualPath.map(function(s,i) {
                var result;
                // if you started visible on forest, you're visible
                if(!unit.hasCondition("hidden") && i==0) { return s; }
                // if you ended adjacent to enemies on forset, you're visible
                if(adjacentEnemies.length>0 && i==actualPath.length-1) { return s; }

                if(mapData[s.x+","+s.y].terrain.properties.indexOf("forest")!=-1) {
                    return { x: s.x, y: s.y, hidden: true };
                }
                return s;
            }).map(function (s,i,array) {
                var prev = array[i-1],
                    next = array[i+1];
                // if unit is hidden on this tile, and will be hidden on the
                //  surrounding tiles, do not publish the x/y coords
                // (if the other tiles are non-hidden, we need them to animate transition)
                if(s.hidden &&
                   (!prev || (prev && prev.hidden)) &&
                   (!next || (next && next.hidden))) {
                    return { hidden: true };
                }
                return s;
            });
        } else {
            publicPath = actualPath;
        }

        if(planInterrupted) { remainingPath = null; }

        return {
                 path: actualPath,
                 publicPath: publicPath,
                 moveCost: totalMoveCost,
                 revealedUnits: revealedUnits,
                 hide: publicPath[publicPath.length-1].hidden,
                 attack: isAttack,
                 // spaces the unit could not reach this turn, starting at the space
                 // it stopped on (only present when at least one space remains)
                 remainingPath: (remainingPath && remainingPath.length > 1) ? remainingPath : null
               };
    }

    function getAdjacentEnemies(coords) {
        var neighborSpaces = getNeighborCoords(coords);
        var adjacentEnemies = unitArray.filter(function(u) {
            for(var i=0; i<neighborSpaces.length; ++i) {
                if(u.x == neighborSpaces[i].x && u.y == neighborSpaces[i].y && u.getAlliance(game) != unit.getAlliance(game)) { return true; }
            }
            return false;
        });
        return adjacentEnemies;
    }
}
