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
var isServer = (typeof window == "undefined");
var nodePath = isServer ? require("path") : null;

if(isServer) {
    var readFile = require("fs").readFile;
    var prefix = "static";
    var DATA_ROOT = nodePath.join(__dirname, "static", "data");
} else {
    var prefix = "";
    var readFile = function(filename, encoding, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", filename);
        xhr.send();
        xhr.onload = function() {
            callback(null, xhr.responseText);
        }
        xhr.onerror = function(e) {
            callback(e, null);
        }
    }
}
var Terrain = require("./static/shared/terrain").Terrain;
var toMapDict = require("./static/shared/terrain").toMapDict;

/**
   Names of data files come from clients (map choice, unit type, faction), so they
   are checked before they are ever pasted into a path: only plain names of the
   expected shape are allowed, with no separators, no `..` and no NUL bytes
   (OWASP A01: path traversal / local file disclosure).
*/
function isSafeName(name) {
    return typeof name == "string" &&
           name.length > 0 && name.length <= 128 &&
           /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) &&
           name.indexOf("..") == -1;
}

exports.isSafeName = isSafeName;

/**
   Build a path under `static/data/<subdir>` for a validated file name.
   @returns {string|null} the path, or null if the name is not acceptable
*/
function dataPath(subdir, name) {
    if(!isSafeName(name)) { return null; }

    var relative = prefix + "/data/" + subdir + "/" + name;
    if(!isServer) { return relative; }

    // belt and braces: the resolved path must still sit inside the data directory
    var resolved = nodePath.resolve(DATA_ROOT, subdir, name);
    if(resolved !== nodePath.join(DATA_ROOT, subdir, name)) { return null; }
    if(resolved.indexOf(nodePath.join(DATA_ROOT, subdir) + nodePath.sep) !== 0) { return null; }

    return relative;
}

exports.dataPath = dataPath;

function rejectName(name, callback) {
    console.warn("loadUtils: refusing unsafe data file name:", JSON.stringify(String(name)).slice(0, 120));
    callback(new Error("invalid data file name"), null);
}

exports.loadMap = function(filename, callback) {
    var target = dataPath("maps", filename);
    if(!target) { rejectName(filename, callback); return; }

    readFile(target, { encoding: "utf8"}, function(err, data) {
        if(err) { callback(err, null); return; }
        var mapDict;
        try { mapDict = toMapDict(data); } catch(e) { callback(e, null); return; }
        callback(null, mapDict);
    });
};

exports.loadUnitType = function(type, callback) {
    var target = dataPath("units", type + ".json");
    if(!target) { rejectName(type, callback); return; }

    readFile(target, { encoding: "utf8"}, function(err, data) {
        if(err) { callback(err, null); return; }
        var dataObj;
        try {
            dataObj = JSON.parse(data);
        } catch(e) {
            console.log("!! ERROR in unit type " + type + ": " + e);
            callback(e, null);
            return;
        }
        callback(null, dataObj);
    });
};

exports.loadFaction = function(factionName, callback) {
    var target = dataPath("factions", factionName + ".json");
    if(!target) { rejectName(factionName, callback); return; }

    readFile(target, { encoding: "utf8"}, function(err, data) {
        if(err) { callback(err, null); return; }
        var dataObj;
        try { dataObj = JSON.parse(data); } catch(e) { callback(e, null); return; }
        callback(null, dataObj);
    });
};

/**
   The maps a client is allowed to pick from. Used both to answer the lobby's
   "list maps" and to check a requested map against a known-good list.
*/
exports.listMaps = function(callback) {
    if(!isServer) { callback(new Error("not available in the browser"), null); return; }

    require("fs").readdir(nodePath.join(DATA_ROOT, "maps"), function(err, names) {
        if(err) { callback(err, null); return; }
        callback(null, (names || []).filter(function(name) {
            return isSafeName(name) && /\.map$/.test(name);
        }));
    });
};
