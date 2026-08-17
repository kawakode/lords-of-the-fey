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
var canvas = document.getElementById("c");
canvas.width = 900;
canvas.height = 600;
var world;
var socket;
var qStringMatch = location.hash.match(/game=([^&]*)/);
if(qStringMatch == null) {
    window.location.href = "/";
}
var qTokenMatch = location.hash.match(/token=([^&]*)/);
var qTokenMatch = qTokenMatch && qTokenMatch[1];
var gameInfo = {
    gameId: qStringMatch[1],
    anonToken: qTokenMatch
};
var factionList = [];
var factionDict = {};

/**************************/
window.addEventListener("hashchange", function() { window.location.reload(); })

window.addEventListener("load", function() {

    menuControl.init();

    var toMapDict = mapUtils.toMapDict;
    var Terrain = mapUtils.Terrain;

    socket = io();

    socket.on("no game", function() { alert("Game not found"); });

    socket.emit("anon auth", gameInfo);

            socket.on("anon auth done", function() {

            socket.emit("join game", gameInfo.gameId);

            socket.emit("alldata", gameInfo);
            socket.on("initdata", function(data) {
                gameInfo.players = data.players;
                gameInfo.player = data.player || { username:"Observer", gold:0 };

                $("#top-username").text(gameInfo.player.username);

                gameInfo.alliances = data.alliances;
                gameInfo.activeTeam = data.activeTeam;
                if(!data.over && gameInfo.activeTeam == gameInfo.player.team) { ui.hasTurn = true; $("#end-turn-button").prop("disabled", false); }

                gameInfo.timeOfDay = data.timeOfDay;

                $("#top-gold-text").text(gameInfo.player.gold);
                ui.updateTurnStatus();

                gameInfo.villages = data.villages;
                ui.updateVillageStats();

                $("#end-turn-button").on("click", function() {
                    ui.hasTurn = false;
                    socket.emit("endTurn", gameInfo);
                    world.mapContainer.removeChild(ui.pathShape);
                    ui.hideMoveRange();
                    world.stage.update();
                    ui.pathSource = null;
                    $("#end-turn-button").prop("disabled", true);
                });

                $("#load-text").text("Loading factions...");

                // The faction list and the map are both data-driven. The factions
                // decide which of the ~160 unit types this game can field and the map
                // decides which of Wesnoth's ~290 terrain tiles it uses; loading every
                // image of both would mean megabytes nobody is going to see.
                var mapText;

                loadFactionData(function() {
                    $("#load-text").text("Loading units...");
                    unitLib.init(startTerrainLoad,
                                 function(e) { $("#load-progress").attr("value", e.progress*100); },
                                 unitTypesInPlay());
                });

                /** fetch the faction index, then every faction file, then the map */
                function loadFactionData(done) {
                    $.getJSON("/data/factions/index.json", function(factionIndex) {
                        factionList = factionIndex.factions.map(function(f) { return f.id; });

                        var requests = factionList.map(function(name) {
                            return $.getJSON("/data/factions/" + name + ".json", function(faction) {
                                factionDict[name] = faction;
                            });
                        });
                        requests.push($.get("/data/maps/" + data.map, function(text) { mapText = text; }, "text"));

                        $.when.apply($, requests).done(done);
                    });
                }

                /** every unit type the sides in this game can put on the board */
                function unitTypesInPlay() {
                    var types = {};

                    (data.players || []).forEach(function(player) {
                        var faction = factionDict[player.faction];
                        if(!faction) { return; }
                        (faction.recruitList || []).forEach(function(t) { types[t] = true; });
                        (faction.commanderList || []).forEach(function(t) { types[t] = true; });
                    });

                    // units already on the board may predate the current faction lists
                    (data.units || []).forEach(function(unit) {
                        if(unit.type) { types[unit.type] = true; }
                    });

                    return Object.keys(types);
                }

                function startTerrainLoad() {
                    $("#load-text").text("Loading terrain...");

                    var queue = new createjs.LoadQueue();
                    queue.on("complete", handleComplete, this);
                    queue.on("progress", function(e) { $("#load-progress").attr("value", e.progress*100); });

                    // collect the tile images this particular map actually uses
                    var usedImages = {};
                    var mapDict = toMapDict(mapText);
                    for(var coords in mapDict) {
                        var tileTerrain = mapDict[coords].terrain;
                        if(tileTerrain.img) { usedImages[tileTerrain.img] = true; }
                        if(tileTerrain.overlayImg) { usedImages[tileTerrain.overlayImg] = true; }
                    }
                    queue.loadManifest(
                        Object.keys(usedImages).map(function(src){ return { id:"terrain"+src, src:src }; })
                    );

                    queue.loadManifest(
                        Object.keys(Terrain.transitions).reduce(function(arr,k){
                            var imgBase = Terrain.transitions[k].imgBase;
                            return arr.concat(Terrain.transitions[k].dirs.map(function(d){ return {id:"transition"+k+"-"+d, src:imgBase+"-"+d+".png" }; }));
                        }, [])
                    );

                    function handleComplete() {
                        $("#loading-overlay").hide();

                        for(var k in Terrain.bases) {
                            Terrain.bases[k].imgObj = queue.getResult("terrain"+Terrain.bases[k].img);
                        }
                        for(k in Terrain.overlays) {
                            Terrain.overlays[k].imgObj = queue.getResult("terrain"+Terrain.overlays[k].img);
                        }
                        for(k in Terrain.transitions) {
                            Terrain.transitions[k].imgObjs = {};
                            for(var i=0; i<Terrain.transitions[k].dirs.length; ++i) {
                                var d = Terrain.transitions[k].dirs[i];
                                Terrain.transitions[k].imgObjs[d] = queue.getResult("transition"+k+"-"+d);
                            }
                        }

                        if(gameInfo.player.faction && factionDict[gameInfo.player.faction]) {
                            gameInfo.player.recruitList = factionDict[gameInfo.player.faction].recruitList;
                        }

                        world = new World("c");
                        // re-parse now that the tile images are loaded, so each space
                        // gets a real image object rather than an empty placeholder
                        world.initGrid(toMapDict(mapText));
                        world.stage.canvas.addEventListener("contextmenu", function(e) { e.preventDefault(); });
                        window.addEventListener("resize", function() { world.resizeCanvasToWindow(); });
                        scroll.addScroll();

                        for(var i=0; i<data.units.length; i++) {
                            var unitData = data.units[i];
                            var unitObj = new Unit(unitData);
                            world.addUnit(unitObj, world.getSpaceByCoords(unitData.x,unitData.y));
                        }

                        ui.updateOwnedUnitsCount();

                        for(var unit in world.units) {
                            world.units[unit].drawGem();
                        }

                        for(var i in data.villages) {
                            world.getSpaceByCoords(i).setVillageFlag(data.villages[i]);
                        }

                        if(gameInfo.player.advancingUnit) {
                            var thisUnit = world.getUnitAt(gameInfo.player.advancingUnit);
                            ui.showAdvancementPromptFor(thisUnit, function(choiceNum) {
                                socket.emit("levelup", { gameId: gameInfo.gameId, choiceNum: choiceNum, anonToken: gameInfo.anonToken });
                            });
                        }

                        // the game may already have been decided before we joined
                        if(data.over) { announceVictory(data.winner); }
                    }
                }
            });

            socket.on("leveledup", function(data) {
                actionQueue.addAction(function() {
                    var thisUnit = world.getUnitAt(data);
                    var newUnit = thisUnit.levelUp(data.choiceNum);

                    world.removeUnit(thisUnit);
                    world.addUnit(newUnit, world.getSpaceByCoords(data));
                    delete gameInfo.player.advancingUnit;
                    
                    // trigger another level-up or prompt
                    newUnit.update({ xp: newUnit.xp });

                    ui.finishAnimation();
                });
            });

            socket.on("newTurn", function(data) {
                actionQueue.addAction(function() {
                    gameInfo.activeTeam = data.activeTeam;
                    if(gameInfo.activeTeam == gameInfo.player.team) { ui.hasTurn = true; $("#end-turn-button").prop("disabled", false); }

                    gameInfo.timeOfDay = data.timeOfDay;
                    ui.updateTurnStatus();

                    for(var i in data.updates) {
                        var update = data.updates[i];
                        world.getUnitAt(i).update(update);
                    }

                    for(var unit in world.units) {
                        world.units[unit].drawGem();
                        world.units[unit].hasAttacked = false;
                    }

                    world.stage.update();

                    if(ui.hasTurn) {
                        for(var c in world.units) {
                            u = world.units[c];
                            if(u.isCommander && u.team == gameInfo.player.team) {
                                var cornerX = u.shape.x - world.stage.canvas.width / 2;
                                var cornerY = u.shape.y - world.stage.canvas.height / 2;
                                scroll.scrollTo(-cornerX, -cornerY);
                            }
                        }
                    }

                    ui.finishAnimation();
                });
            });

            socket.on("created", function(unitData) {
                actionQueue.addAction(function() {
                    if(unitData.type) {
                        var unitObj = new Unit(unitData);
                        world.addUnit(unitObj, world.getSpaceByCoords(unitData.x,unitData.y));
                    }
                    ui.finishAnimation();
                });
            });

            socket.on("moved", function(data) {
                actionQueue.addAction(function() {
                    ui.animateUnitMove(data);
                });
            });

            socket.on("playerUpdate", function(data) {
                actionQueue.addAction(function() {
                    ui.updatePlayer(data);
                });
            });

            socket.on("victory", function(data) {
                actionQueue.addAction(function() {
                    if(data.victory) { announceVictory(data.alliance); }
                });
            });

    });
});

/**
   The game has been won: lock the board and tell the player how it ended.
   Safe to call more than once.
*/
function announceVictory(alliance) {
    if(gameInfo.over) { return; }

    gameInfo.over = true;
    gameInfo.winner = alliance;

    ui.hasTurn = false;
    $("#end-turn-button").prop("disabled", true);

    var message;
    if(alliance == null) {
        message = "Every commander has fallen. The war ends in a draw.";
    } else if("team" in gameInfo.player) {
        message = (gameInfo.player.alliance == alliance) ? "You are victorious!" : "You were defeated!";
    } else {
        message = "Alliance " + alliance + " wins!";
    }

    $("#top-active-team-text").text("game over");
    $("#top-active-color").css("background-color", "rgba(0,0,0,0)");
    $("#top-active-team").attr("data-tip", "This game is over.\n" + message);

    alert(message);
}

var actionQueue = {
    queue: [],
    addAction: function(func) {
        this.queue.push(func);
        if(!ui.moveAnimating) { this.doNext(); }
    },
    doNext: function() {
        if(!ui.moveAnimating) { (this.queue.shift()||function(){})(); }
    }
}

// Check if a new cache is available on page load.
// AppCache has been removed from current browsers, so this only runs where it
// still exists; without the guard it throws on every load.
window.addEventListener('load', function(e) {

  if(!window.applicationCache) { return; }

  window.applicationCache.addEventListener('updateready', function(e) {
    if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
      // Browser downloaded a new app cache.
      if (confirm('A new version of the client is available on page refresh. Reload the page?')) {
        window.location.reload();
      }
    } else {
      // Manifest didn't changed. Nothing new to server.
    }
  }, false);

}, false);
