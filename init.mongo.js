//    Copyright 2014 Andrew P. Sillers
//
//    This file is part of Lords of the Fey.
//
//    Lords of the Fey is free software: you can redistribute it and/or modify
//    it under the terms of the GNU Affero General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    Lords of the Fey is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU Affero General Public License for more details.
//
//    You should have received a copy of the GNU Affero General Public License
//    along with Lords of the Fey.  If not, see <http://www.gnu.org/licenses/>.

// run this script inside mongodb:
//  mongosh < init.mongo.js
// (or paste in mongosh)
//
// This script only prepares indexes. It used to seed two accounts ("hello" and
// "goodbye") whose password was the literal string "world"; because
// docker-compose runs this file on first start, every deployment shipped with
// known credentials (OWASP A07: identification and authentication failures).
// Create accounts through /signup instead.

// Switch to lotf database
use('lotf');

// usernames are the identity passport serializes, so they must be unique
db.users.createIndex({ username: 1 }, { unique: true });

// the collections the server queries by these fields
db.units.createIndex({ gameId: 1 });
db.games.createIndex({ "players.username": 1 });
