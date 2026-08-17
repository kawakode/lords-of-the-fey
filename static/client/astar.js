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
   Multi-turn path costs are packed into a single number so that A* can compare
   them directly: the thousands place counts whole turns spent, the remainder
   counts move points spent within that turn. A path that takes fewer turns
   always beats one that takes more, and ties break on move points used.
*/
var TURN_COST = 1000;

/** how many turns ahead a movement plan may reach */
var MAX_PLANNED_TURNS = 8;

function turnOfCost(cost) { return Math.floor(cost / TURN_COST); }
function moveSpentInTurn(cost) { return cost % TURN_COST; }

/**
A* implementation with built-in move rules. Paths may run past the unit's
remaining move points: the extra spaces become a plan for later turns, and each
path node carries the `turn` (0 for the current turn) on which it is reached.

*/
function aStar(world, unit, start, goal, prevPath, game) {
    var attackTarget = world.getUnitAt(goal);

    // if the unit has already attacked, another unit cannot be a valid destination
    if(attackTarget && unit.hasAttacked) {
        return false;
    }

    if(prevPath && prevPath.length) {
        var prevDestNode = prevPath[prevPath.length-1];
        var prevDest = prevDestNode.space;

        // if the previous path was a move adjacent to an enemy, and now the path is *on* that abjecent enemy, do not recompute the path
        // this allows the player to pcik the offense location, instead of relying on the normal A* path to the enemy
        if(!world.getUnitAt(prevDest) && // if the previous path did not end on an occupied space (i.e., was not an attack)
           attackTarget &&                   // if the goal space is occupied...
           attackTarget.getAlliance(game) != unit.getAlliance(game) && // ...by an opponent
           world.getNeighbors(goal).indexOf(prevDest) != -1 // and the occupied goal space is adjacent to the end of the previous path
          ) {
            var newPath = prevPath.slice();
            // return the previous path with the enemy target appended; attacking
            // costs no move points, so the target is reached on the same turn
            newPath.push({ space: goal, g_score: prevDestNode.g_score, turn: prevDestNode.turn });
            return newPath;
        }
    }

    var g_score = {}, f_score = {};
    var current;
    var closedset = {};    // The set of nodes already evaluated.
    var openset = {}; openset[start] = start;    // The set of tentative nodes to be evaluated, initially containing the start node
    var came_from = {};    // The map of navigated nodes.
 
    g_score[start] = 0;    // Cost from start along best known path.
    // Estimated total cost from start to goal through y.
    f_score[start] = g_score[start] + heuristic_cost_estimate(start, goal);
 
    while(Object.keys(openset).length) {
        current = null;
        for(var k in openset) {
            if(!current || f_score[k] < f_score[current]) {
                var current = k;
            }
        }
        current = world.getSpaceByCoords(current);
        
        if(current == goal) {
            return reconstruct_path(came_from, goal);
        }
        
        delete openset[current];
        closedset[current] = current;
        
        var neighbors = world.getNeighbors(current);
        neighbors = neighbors.filter(not_blocked_by_enemy).filter(not_blocked_by_friend).filter(function(n) {
            var currentOccupant = world.getUnitAt(current);
            var neighborOccupant = world.getUnitAt(n);
            // if this prospective neighbor is the goal and it occupied (i.e. this is an attack)
            // AND the *current* space is occupied, you may not complete an attack path to the goal from this current space
            // because the attacker would not have an empty final space to attack from
            if(n == goal && neighborOccupant && currentOccupant && currentOccupant != unit) return false;
            return true;
        });
        for(var i=0; i < neighbors.length; ++i) {
            var neighbor = neighbors[i];

            if(neighbor in closedset) { continue; }
            var tentative_g_score = cost_after_moving_here(g_score[current], neighbor);

            // unreachable terrain, or further ahead than we are willing to plan
            if(tentative_g_score == null) { continue; }

            if(!(neighbor in openset) || tentative_g_score < g_score[neighbor]) {
                came_from[neighbor] = current;
                g_score[neighbor] = tentative_g_score;
                f_score[neighbor] = g_score[neighbor] + heuristic_cost_estimate(neighbor, goal);
                if(!(neighbor in openset)) {
                    openset[neighbor] = neighbor;
                }
            }
        }
    }
    
    return false;
    
    function reconstruct_path(came_from, current_node) {
        if(current_node in came_from) {
            p = reconstruct_path(came_from, came_from[current_node]);
            p.push({ space: current_node, g_score: g_score[current_node], turn: turnOfCost(g_score[current_node]) });
            return p;
        } else {
            return [{ space: current_node, g_score: g_score[current_node], turn: turnOfCost(g_score[current_node]) }];
        }
    }

    // TODO: some kind of A* estimate
    function heuristic_cost_estimate(start, goal) {
        //return Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
        return 0;
    }

    /** move points available on the given turn (the current turn is partly spent) */
    function move_budget_for_turn(turn) {
        return turn == 0 ? unit.moveLeft : unit.move;
    }

    /**
       Packed cost of standing on `space` after moving there from a space whose
       packed cost is `cost_so_far`. Returns null if the space cannot be entered,
       or if reaching it would take more turns than we plan for.
    */
    function cost_after_moving_here(cost_so_far, space) {
        var occupant = world.getUnitAt(space);
        var is_enemy_present = occupant && occupant.getAlliance(game) != unit.getAlliance(game);

        // attacking the goal costs no move points, only the chance to move again
        if(space == goal && is_enemy_present) { return cost_so_far; }

        var normal_move_cost = unit.getMoveCostForSpace(space);
        if(!isFinite(normal_move_cost)) { return null; }

        var turn = turnOfCost(cost_so_far);
        var spent = moveSpentInTurn(cost_so_far);

        // not enough move points left this turn: wait here and continue next turn
        if(spent + normal_move_cost > move_budget_for_turn(turn)) {
            turn += 1;
            spent = 0;
            if(turn > MAX_PLANNED_TURNS) { return null; }
            // terrain nobody could enter even on a fresh turn
            if(normal_move_cost > move_budget_for_turn(turn)) { return null; }
        }

        spent += normal_move_cost;

        // an enemy's zone of control ends the unit's movement for that turn
        var is_enemy_adjacent = world.getNeighbors(space).some(function(n) {
            var n_occupant = world.getUnitAt(n);
            return n_occupant && n_occupant.getAlliance(game) != unit.getAlliance(game);
        });
        if(is_enemy_adjacent) { spent = move_budget_for_turn(turn); }

        return turn * TURN_COST + spent;
    }

    // is this space free of enemies?
    function not_blocked_by_enemy(space) {
        var occupant = world.getUnitAt(space);
        if(occupant && occupant.getAlliance(game) != unit.getAlliance(game) && space != goal) { return false; }
        return true;
    }

    // is this space non-final or free of friendly units?
    function not_blocked_by_friend(space) {
        var occupant = world.getUnitAt(space);
        if(occupant && occupant.getAlliance(game) == unit.getAlliance(game) && space == goal) { return false; }
        return true;
    }
}


function allAccessibleSpaces(world, start, unit, game) {
    var g_score = {}, f_score = {};
    var current;
    var closedset = {};    // The set of nodes already evaluated.
    var openset = {}; openset[start] = start;    // The set of tentative nodes to be evaluated, initially containing the start node
    var came_from = {};    // The map of navigated nodes.
 
    var accessible_set = {}; accessible_set[start] = start;

    g_score[start] = 0;    // Cost from start along best known path.
    // Estimated total cost from start to goal through y.
    f_score[start] = g_score[start];
 
    while(Object.keys(openset).length) {
        current = null;
        for(var k in openset) {
            if(!current || f_score[k] < f_score[current]) {
                var current = k;
            }
        }
        current = world.getSpaceByCoords(current);
        
        delete openset[current];
        closedset[current] = current;
        
        var neighbors = world.getNeighbors(current);
        neighbors = neighbors.filter(not_blocked_by_enemy).filter(not_blocked_by_friend).filter(function(n) {
            var currentOccupant = world.getUnitAt(current);
            var neighborOccupant = world.getUnitAt(n);
            // if this prospective neighbor is the goal and it occupied (i.e. this is an attack)
            // AND the *current* space is occupied, you may not complete an attack path to the goal from this current space
            // because the attacker would not have an empty final space to attack from
            if(neighborOccupant && currentOccupant && currentOccupant != unit) return false;
            return true;
        });
        for(var i=0; i < neighbors.length; ++i) {
            var neighbor = neighbors[i];

            if(neighbor in closedset) { continue; }

            var occupant = world.getUnitAt(neighbor);
            var is_enemy_present = occupant && occupant.getAlliance(game) != unit.getAlliance(game);
            if(is_enemy_present) { accessible_set[neighbor] = neighbor; }

            var tentative_g_score = g_score[current] + cost_to_move_here(neighbor);
            //neighbor.debugText.text = cost_to_move_here(neighbor);

            if(tentative_g_score > unit.moveLeft) { continue; }
            else { accessible_set[neighbor] = neighbor; }
            //console.log(tentative_g_score, unit.moveLeft)

            if(!(neighbor in openset) || tentative_g_score < g_score[neighbor]) {
                g_score[neighbor] = tentative_g_score;
                f_score[neighbor] = g_score[neighbor];
                if(!(neighbor in openset)) {
                    openset[neighbor] = neighbor;
                }
            }

        }
    }

    return accessible_set;


    function cost_to_move_here(space) {
        var occupant = world.getUnitAt(space);
        var is_enemy_present = occupant && occupant.getAlliance(game) != unit.getAlliance(game);
        var normal_move_cost = unit.getMoveCostForSpace(space);
        if(is_enemy_present) { return unit.moveLeft - g_score[current];; }

        // test if this pace has an enemy adjacent
        var is_enemy_adjacent = world.getNeighbors(space).some(function(n) {
            var n_occupant = world.getUnitAt(n);
            if(n_occupant && n_occupant.getAlliance(game) != unit.getAlliance(game)) {
                return true;
            }
        });

        // if so, moving here either costs all our remaining move
        // OR the normal cost for this terrain (in case that's MORE than all our remaining move)
        // so you can move adjacent to an enemy only if you could move there normally
        if(is_enemy_adjacent) {
            var all_remaining_move = unit.moveLeft - g_score[current];
            return Math.max(all_remaining_move, normal_move_cost);
        } else {
            // just normal move cost
            return normal_move_cost;
        }
    }

    // is this space free of enemies?
    function not_blocked_by_enemy(space) {
        //var occupant = world.getUnitAt(space);
        //if(occupant && occupant.getAlliance(game) != unit.getAlliance(game) && space != goal) { return false; }
        return true;
    }

    // is this space non-final or free of friendly units?
    function not_blocked_by_friend(space) {
        //var occupant = world.getUnitAt(space);
        //if(occupant && occupant.getAlliance(game) == unit.getAlliance(game)) { return false; }
        return true;
    }
}


