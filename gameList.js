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
module.exports.initListing = function(app, collections) {
    app.get("/gamelist", async function(req, res) {
        var user = req.user;
        if(!user) { res.redirect("/"); return; }
        var gameArray = await collections.games.find({ players: { $elemMatch: { username: user.username} } }).toArray();
        gameArray.forEach(function(elm) {
            if(elm.over) {
                // a finished game has no active player, only a result
                var you = elm.players.filter(function(p) { return p.username == user.username; })[0];
                elm.isFinished = true;
                elm.youWon = !!you && you.alliance == elm.winner;
                return;
            }

            if(user.username == elm.players[elm.activeTeam-1].username) {
                elm.isYourTurn = true;
            }
        });
        // your turn first, then ongoing games, then finished ones
        gameArray.sort(function(a,b) {
            return (!!a.isFinished - !!b.isFinished) || (!!b.isYourTurn - !!a.isYourTurn);
        });
        res.render("gamelist.hbs", { games: gameArray, username: user.username });
    });
}
