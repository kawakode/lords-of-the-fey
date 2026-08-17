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
   @module factions

   Server-side registry of playable factions. The list lives in
   `/static/data/factions/index.json` so that the client, the lobby and the
   game-creation code all agree on which factions exist; each entry points at
   a `<id>.json` file in the same directory.
*/

var fs = require("fs");
var path = require("path");

var FACTION_DIR = path.join(__dirname, "static", "data", "factions");

var index = JSON.parse(fs.readFileSync(path.join(FACTION_DIR, "index.json"), "utf8"));

/** @type {Array.<{id:string, name:string}>} playable factions, in display order */
var list = index.factions;

/** @type {Object.<string, Object>} faction data keyed by faction id */
var byId = {};

list.forEach(function(entry) {
    byId[entry.id] = JSON.parse(fs.readFileSync(path.join(FACTION_DIR, entry.id + ".json"), "utf8"));
    byId[entry.id].id = entry.id;
});

exports.list = list;
exports.byId = byId;

/** Faction ids, e.g. `["elves", "orcs"]` */
exports.ids = list.map(function(entry) { return entry.id; });

/** Display names as shown in the lobby, e.g. `["Elves", "Orcs"]` */
exports.names = list.map(function(entry) { return entry.name; });

/**
   Resolve a faction id or display name (in any case) to a faction id.
   @return {string|null} the faction id, or null if there is no such faction
*/
exports.resolveId = function(nameOrId) {
    if(!nameOrId) { return null; }
    var needle = String(nameOrId).toLowerCase();
    for(var i=0; i<list.length; ++i) {
        if(list[i].id.toLowerCase() == needle || list[i].name.toLowerCase() == needle) { return list[i].id; }
    }
    return null;
};

/** Pick a faction id at random (used for "random" faction slots) */
exports.randomId = function() {
    return list[Math.floor(Math.random() * list.length)].id;
};
