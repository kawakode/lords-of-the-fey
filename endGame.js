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
exports.checkForVictory = async function checkForVictory(game, collections, callback) {
    var result = { victory: false };
    var teamsWithCommanders = {};
    var commanderList = await collections.units.find({ gameId: game._id, isCommander: true }).toArray();

    commanderList.forEach(function(commander) {
        teamsWithCommanders[commander.team] = true;
    });

    var winningAlliance = null;
    var survivingTeamList = Object.getOwnPropertyNames(teamsWithCommanders);

    // every commander died in the same combat: nobody can win, so the game is a draw
    if(survivingTeamList.length == 0) {
        callback({ victory: true, draw: true, alliance: null });
        return;
    }

    for(var i=0; i < survivingTeamList.length; ++i) {
        var team = survivingTeamList[i];
        var thisAlliance = game.players[team-1].alliance;
        if(winningAlliance == null) { winningAlliance = thisAlliance }
        if(thisAlliance != winningAlliance) {
            winningAlliance = null;
            break;
        }
    }

    if(winningAlliance !== null) {
        result.victory = true;
        result.alliance = winningAlliance;
    }

    callback(result);
}

exports.concludeGame = async function(result, game, collections, callback) {
    game.over = true;
    game.winner = result.alliance;
    await collections.games.replaceOne({ _id: game._id }, game);
    await collections.units.updateMany({ gameId: game._id }, { $unset: { gameId: "" } });
    if(callback) { callback(); }
}
