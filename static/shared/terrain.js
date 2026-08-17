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

/** @module terrain */

/**
  A dictionary-object of entries with "x,y" keys and Tile values
  @typedef MapData
  @type {Object.<string, Tile>}
*/

/**
  The map data of a single space
  @typedef Tile
  @prop {number} x
  @prop {number} y
  @prop {number} start - Optional property that indicates the number of the team that starts here 
  @prop {TerrainData} terrain
*/

/**
  Terrain data for a space. Represents a union of a "base" terrain type (like a desert or dirt) and optionally an "overlay" terrain (like a forest or mountain). The base and overlay have their properties ("forest", "flat", "snow", etc.) listed collectively.
  @typedef TerrainData
  @prop {Array.<string>} properties - Array of terrain type strings ("flat", "forest", etc.)
  @prop {string} img - image path for the base terrain
  @prop {HTMLImageElement} imgObj - loaded image object for the base terrain
  @prop {string} overlayImg - image path for the overlay terrain
  @prop {HTMLImageElement} overlayImgObj - loaded image object for the overlay terrain
  @prop {string} color - minimap color
*/

/**
   @typedef TerrainType
   @prop {string} symbol - String representation of this type in a map file (Gg, Rd, etc.)
   @prop {string} img - path to image representing this terrain type, rooted in the Web root
   @prop {string} name - human-readable name of this terrain type ("dry grass", "cobbles", etc.)
   @prop {string[]} properties - list of terrain properties (e.g., ["shallow_water", "flat"])
   @prop {string} color - minimap color of this terrain type
*/

(function() {
    var exports;
    if(typeof module != "undefined") {
        exports = module.exports;
    } else {
        exports = window.mapUtils = {};
    }

    var Terrain = 
        /**
           Terrain object
           @namespace module:terrain.Terrain
           @prop {Object.<string,TerrainType>} bases - dictionary of base tile types
           @prop {Object.<string,TerrainType>} overlays - dictionary of overlay tile types
        */
    exports.Terrain = {
        bases: {
            GRASS: { symbol: "Gg", name: "grass", img: "/data/img/terrain/green.png", properties: ["flat"], color:"#0F0" },
            SEMI_GRASS: { symbol: "Gs", name: "semi-dry grass", img: "/data/img/terrain/semi-dry.png", properties: ["flat"], color:"#0F0" },
            DRY_GRASS: { symbol: "Gd", name: "dry grass", img: "/data/img/terrain/dry.png", properties: ["flat"], color:"#0F0" },
            LITTER: { symbol: "Gll", name: "leaf litter", img: "/data/img/terrain/green.png", properties: ["flat"], color:"#0F0" },

            DIRT: { symbol: "Re", name: "dirt", img: "/data/img/terrain/dirt.png", properties:["flat"], color:"#573B0C" },
            DARK_DIRT: { symbol: "Rb", name: "dark dirt", img: "/data/img/terrain/dirt-dark.png", properties:["flat"], color:"#573B0C" },
            DRY_DIRT: { symbol: "Rd", name: "dry dirt", img: "/data/img/terrain/desert-road.png", properties:["flat"], color:"#573B0C" },

            COBBLES: { symbol: "Rr", name: "cobbles", img: "/data/img/terrain/road.png", properties:["flat"], color:"#573B0C" },
            GRAY_COBBLES: { symbol: "Rrc", name: "cobbles", img: "/data/img/terrain/road-clean.png", properties:["flat"], color:"#573B0C" },
            OVERGROW_COBBLES: { symbol: "Rp", name: "cobbles", img: "/data/img/terrain/stone-path.png", properties:["flat"], color:"#573B0C" },

            HUMAN_CASTLE: { symbol: "Ch", name: "human castle", img: "/data/img/terrain/castle.png", properties:["castle"], color:"#AAA" },
            HUMAN_KEEP: { symbol: "Kh", name: "human keep", img: "/data/img/terrain/keep.png", properties:["castle", "keep"], color:"#999" },
            ENCAMPMENT_CASTLE: { symbol: "Ce", name: "encampment castle", img: "/data/img/terrain/castle.png", properties:["castle"], color:"#AAA" },
            ENCAMPMENT_KEEP: { symbol: "Ke", name: "encampment keep", img: "/data/img/terrain/keep.png", properties:["castle", "keep"], color:"#999" },

            GRAY_DEEP_WATER: { symbol: "Wog", name: "gray deep water", img: "/data/img/terrain/ocean-grey-tile.png", properties:["deep_water"], color:"#00A" },
            TOPICAL_DEEP_WATER: { symbol: "Wot", name: "tropical deep water", img: "/data/img/terrain/ocean-tropical-tile.png", properties:["deep_water"], color:"#00A" },
            DEEP_WATER: { symbol: "Wo", name: "deep water", img: "/data/img/terrain/ocean-tile.png", properties:["deep_water"], color:"#00A" },
            TOPICAL_SHALLOW_WATER: { symbol: "Wwt", name: "tropical shallow water", img: "/data/img/terrain/coast-grey-tile.png", properties:["shallow_water"], color:"#00D" },
            GRAY_SHALLOW_WATER: { symbol: "Wwg", name: "gray shallow water", img: "/data/img/terrain/coast-grey-tile.png", properties:["shallow_water"], color:"#00D" },
            SHALLOW_WATER: { symbol: "Ww", name: "shallow water", img: "/data/img/terrain/coast-tile.png", properties:["shallow_water"], color:"#00D" },
            FORD: { symbol: "Wwf", name: "ford", img: "/data/img/terrain/ford-tile.png", properties:["shallow_water", "flat"], color:"#00D" },

            SWAMP: { symbol: "Sw", name: "swamp", img: "/data/img/terrain/swamp.png", properties: ["swamp"], color:"#079" },
            MUD: { symbol: "Ss", name: "mud", img: "/data/img/terrain/mud-tile.png", properties: ["flat"], color:"#079" },

            ICE: { symbol: "Ai", name: "ice", img: "/data/img/terrain/ice.png", properties:["frozen"], color:"#99E" },
            SNOW: { symbol: "Aa", name: "snow", img: "/data/img/terrain/snow.png", properties:["frozen"], color:"#99D" },

            HILLS: { symbol: "Hh", name: "hills", img: "/data/img/terrain/hills.png", properties:["hills"], color:"#3A3" },
            SNOW_HILLS: { symbol: "Ha", name: "snow hills", img: "/data/img/terrain/snow-hills.png", properties:["hills", "frozen"], color:"#99D" },
            DRY_HILLS: { symbol: "Hhd", name: "dry hills", img: "/data/img/terrain/dry-hills.png", properties:["hills"], color:"#3A3" },
            DUNES: { symbol: "Hd", name: "dunes", img: "/data/img/terrain/dunes.png", properties:["hills"], color:"#EDC9AF" },

            MOUNTAINS: { symbol: "Mm", name: "mountains", img: "/data/img/terrain/mountains.png", properties:["mountains"], color:"#AAA" },
            DRY_MOUNTAINS: { symbol: "Md", name: "dry mountains", img: "/data/img/terrain/dry-mountains.png", properties:["mountains"], color:"#AAA" },
            SNOWY_MOUNTAINS: { symbol: "Ms", name: "snowy mountains", img: "/data/img/terrain/snow-mountains.png", properties:["mountains", "frozen"], color:"#99D" },

            DESERT: { symbol: "Dd", name: "desert", img: "/data/img/terrain/desert.png", properties:["sand"], color:"#EDC9AF" },
            BEACH: { symbol: "Ds", name: "beach", img: "/data/img/terrain/desert.png", properties:["sand"], color:"#EDC9AF" },

            CAVE_PATH: { symbol: "Ur", name: "cave path", img: "/data/img/terrain/cave-path.png", properties:["cave", "flat"], color:"#666" },
            CAVE_FLOOR: { symbol: "Uu", name: "cave floor", img: "/data/img/terrain/cave-floor.png", properties:["cave"], color:"#666" },
            ROCKBOUND_CAVE: { symbol: "Uh", name: "rockbound cave", img: "/data/img/terrain/rockbound-cave.png", properties:["cave"], color:"#666" },

            VOLCANO: { symbol: "Mv", name: "volcano", img: "/data/img/terrain/volcano-tile.png", properties:["impassable"], color:"#666" },

            /* --- imported from Wesnoth's terrain.cfg by tools/import_terrain.py --- */
            GRAY_REEF: { symbol: "Wwrg", name: "Gray Coastal Reef", img: "/data/img/terrain/wesnoth/water/reef-gray-tile.png", properties: ["reef"], color:"#0BC" },
            MEDIUM_REEF: { symbol: "Wwr", name: "Medium Coastal Reef", img: "/data/img/terrain/wesnoth/water/reef-tile.png", properties: ["reef"], color:"#0BC" },
            TROPICAL_REEF: { symbol: "Wwrt", name: "Tropical Coastal Reef", img: "/data/img/terrain/wesnoth/water/reef-tropical-tile.png", properties: ["reef"], color:"#0BC" },
            QUAGMIRE: { symbol: "Sm", name: "Muddy Quagmire", img: "/data/img/terrain/wesnoth/swamp/mud-tile.png", properties: ["swamp"], color:"#079" },
            ROAD_DESERT: { symbol: "Rrd", name: "Gravel", img: "/data/img/terrain/wesnoth/flat/sandy-path.png", properties: ["flat"], color:"#0F0" },
            ROAD_ICY: { symbol: "Rra", name: "Icy Cobbles", img: "/data/img/terrain/wesnoth/flat/road-icy.png", properties: ["flat"], color:"#0F0" },
            DESERT_MOUNTAINS: { symbol: "Mdd", name: "Desert Mountains", img: "/data/img/terrain/wesnoth/desert_mountains/desert-tile.png", properties: ["mountains"], color:"#AAA" },
            REGULAR_STONE_FLOOR: { symbol: "Isr", name: "Basic Stone Floor", img: "/data/img/terrain/wesnoth/interior/stone-regular.png", properties: ["flat"], color:"#0F0" },
            ANCIENT_STONE_FLOOR: { symbol: "Isa", name: "Ancient Stone Floor", img: "/data/img/terrain/wesnoth/interior/stone-ancient.png", properties: ["flat"], color:"#0F0" },
            RUG_FLOOR: { symbol: "Isc", name: "Royal Rug", img: "/data/img/terrain/wesnoth/interior/royal-rug/rug-tile.png", properties: ["flat"], color:"#0F0" },
            RUG2_FLOOR: { symbol: "Iwc", name: "Normal Rug", img: "/data/img/terrain/wesnoth/interior/regular-rug/rug-tile.png", properties: ["flat"], color:"#0F0" },
            RUG3_FLOOR: { symbol: "Urc", name: "Cave Rug", img: "/data/img/terrain/wesnoth/interior/cave-rug/rug-tile.png", properties: ["flat"], color:"#0F0" },
            WOOD_FLOOR: { symbol: "Iwr", name: "Basic Wooden Floor", img: "/data/img/terrain/wesnoth/interior/wood-regular.png", properties: ["flat"], color:"#0F0" },
            OLD_WOOD_FLOOR: { symbol: "Iwo", name: "Old Wooden Floor", img: "/data/img/terrain/wesnoth/interior/wood-ruined.png", properties: ["flat"], color:"#0F0" },
            CAVE_EARTHY: { symbol: "Uue", name: "Earthy Cave Floor", img: "/data/img/terrain/wesnoth/cave/earthy-floor3.png", properties: ["cave"], color:"#666" },
            FLAGSTONES_DARK: { symbol: "Urb", name: "Dark Flagstones", img: "/data/img/terrain/wesnoth/cave/flagstones-dark.png", properties: ["flat"], color:"#0F0" },
            FUNGUS_FLOOR: { symbol: "Tb", name: "Mycelium", img: "/data/img/terrain/wesnoth/forest/mushroom-base.png", properties: ["fungus"], color:"#A75" },
            EARTHY_ROCKY_CAVE: { symbol: "Uhe", name: "Earthy Rockbound Cave", img: "/data/img/terrain/wesnoth/cave/earthy-hills-variation.png", properties: ["cave", "hills"], color:"#3A3" },
            CANYON: { symbol: "Qxu", name: "Regular Chasm", img: "/data/img/terrain/wesnoth/chasm/depths.png", properties: ["unwalkable"], color:"#334" },
            CHASM_EARTHY: { symbol: "Qxe", name: "Earthy Chasm", img: "/data/img/terrain/wesnoth/chasm/depths.png", properties: ["unwalkable"], color:"#334" },
            ABYSS: { symbol: "Qxua", name: "Ethereal Abyss", img: "/data/img/terrain/wesnoth/chasm/abyss.png", properties: ["unwalkable"], color:"#334" },
            LAVA_CHASM: { symbol: "Ql", name: "Lava Chasm", img: "/data/img/terrain/wesnoth/unwalkable/lava-tile.png", properties: ["unwalkable"], color:"#334" },
            LAVA: { symbol: "Qlf", name: "Lava", img: "/data/img/terrain/wesnoth/unwalkable/lava-tile.png", properties: ["unwalkable"], color:"#334" },
            CLOUD: { symbol: "Mm^Xm", name: "Regular Impassable Mountains", img: "/data/img/terrain/wesnoth/mountains/cloud-tile.png", properties: ["mountains", "impassable"], color:"#666" },
            CLOUD_DRY: { symbol: "Md^Xm", name: "Dry Impassable Mountains", img: "/data/img/terrain/wesnoth/mountains/cloud-desert-tile.png", properties: ["mountains", "impassable"], color:"#666" },
            CLOUD_SNOW: { symbol: "Ms^Xm", name: "Snowy Impassable Mountains", img: "/data/img/terrain/wesnoth/mountains/cloud-snow-tile.png", properties: ["mountains", "impassable"], color:"#666" },
            CLOUD_DESERT: { symbol: "Mdd^Xm", name: "Desert Impassable Mountains", img: "/data/img/terrain/wesnoth/desert_mountains/cloud-desert-tile.png", properties: ["mountains", "impassable"], color:"#666" },
            CAVEWALL: { symbol: "Xu", name: "Natural Cave Wall", img: "/data/img/terrain/wesnoth/cave/wall-rough-tile.png", properties: ["impassable"], color:"#666" },
            MINEWALL: { symbol: "Xuc", name: "Mine Wall", img: "/data/img/terrain/wesnoth/walls/wall-mine-tile.png", properties: ["impassable"], color:"#666" },
            CAVEWALL_EARTHY: { symbol: "Xue", name: "Natural Earthy Cave Wall", img: "/data/img/terrain/wesnoth/cave/earthy-wall-rough-tile.png", properties: ["impassable"], color:"#666" },
            CAVEWALL_DAMAGED: { symbol: "Xur", name: "Damaged Cave Wall", img: "/data/img/terrain/wesnoth/walls/rubble/wall-rough-tile.png", properties: ["impassable"], color:"#666" },
            WALL_HEDGE: { symbol: "Xuf", name: "Hedges Wall", img: "/data/img/terrain/wesnoth/walls/hedge/wall-hedge-tile.png", properties: ["impassable"], color:"#666" },
            CAVEWALL_EARTHY_HEWN: { symbol: "Xuce", name: "Reinforced Earthy Cave Wall", img: "/data/img/terrain/wesnoth/void/void.png", properties: ["impassable"], color:"#666" },
            WALL_STONE: { symbol: "Xos", name: "Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/wall-stone-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_LIT: { symbol: "Xol", name: "Lit Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/wall-stone-lit-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_MINE: { symbol: "Xom", name: "Straight Mine Wall", img: "/data/img/terrain/wesnoth/walls/stone/wall-stone-mine-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_WHITE: { symbol: "Xoi", name: "Straight White Wall", img: "/data/img/terrain/wesnoth/walls/stone/wall-stone-white-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_CLEAN: { symbol: "Xoc", name: "Clean Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/clean/wall-stone-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_ANCIENT: { symbol: "Xoa", name: "Ancient Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/ancient/wall-stone-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_TOMB: { symbol: "Xot", name: "Catacombs Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/catacombs/wall-stone-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_OVERGROWN: { symbol: "Xof", name: "Overgrown Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/overgrown/wall-stone-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_DAMAGED: { symbol: "Xor", name: "Damaged Stone Wall", img: "/data/img/terrain/wesnoth/walls/stone/damaged/wall-stone-tile.png", properties: ["impassable"], color:"#666" },
            WALL_STONE_RUINS: { symbol: "Exos", name: "Ruined Wall", img: "/data/img/terrain/wesnoth/walls/stone/ruins/wall-stone-tile.png", properties: ["flat", "cave"], color:"#666" },
            VOID: { symbol: "Xv", name: "Void", img: "/data/img/terrain/wesnoth/void/void-editor.png", properties: ["impassable"], color:"#666" },
            ENCAMPMENT_RUIN: { symbol: "Cer", name: "Ruined Encampment", img: "/data/img/terrain/wesnoth/castle/encampment-ruin/regular-tile.png", properties: ["castle"], color:"#AAA" },
            ENCAMPMENT_SNOW: { symbol: "Cea", name: "Snowy Encampment", img: "/data/img/terrain/wesnoth/castle/encampment/snow-tile.png", properties: ["castle", "frozen"], color:"#AAA" },
            ORCISH_FORT: { symbol: "Co", name: "Orcish Castle", img: "/data/img/terrain/wesnoth/castle/orcish/tile.png", properties: ["castle"], color:"#AAA" },
            SNOW_ORCISH_FORT: { symbol: "Coa", name: "Snowy Orcish Castle", img: "/data/img/terrain/wesnoth/castle/winter-orcish/tile.png", properties: ["castle", "frozen"], color:"#AAA" },
            SNOW_CASTLE: { symbol: "Cha", name: "Snowy Human Castle", img: "/data/img/terrain/wesnoth/castle/snowy/castle-tile.png", properties: ["castle", "frozen"], color:"#AAA" },
            ELVEN_CASTLE: { symbol: "Cv", name: "Elven Castle", img: "/data/img/terrain/wesnoth/castle/elven/tile.png", properties: ["castle"], color:"#AAA" },
            ELVEN_CASTLE_RUIN: { symbol: "Cvr", name: "Elven Castle Ruin", img: "/data/img/terrain/wesnoth/castle/elven-ruin/tile.png", properties: ["castle"], color:"#AAA" },
            ELVEN_CASTLE_WINTER: { symbol: "Cva", name: "Winter Elven Castle", img: "/data/img/terrain/wesnoth/castle/winter-elven/tile.png", properties: ["castle"], color:"#AAA" },
            DWARVEN_CASTLE: { symbol: "Cud", name: "Dwarven Underground Castle", img: "/data/img/terrain/wesnoth/castle/dwarven-castle-tile.png", properties: ["castle"], color:"#AAA" },
            DWARVEN_CASTLE2: { symbol: "Cf", name: "Dwarven Castle", img: "/data/img/terrain/wesnoth/castle/outside-dwarven/dwarven-castle-tile.png", properties: ["castle"], color:"#AAA" },
            DWARVEN_CASTLE_RUIN: { symbol: "Cfr", name: "Dwarven Castle Ruins", img: "/data/img/terrain/wesnoth/castle/ruin-dwarven/dwarven-castle-tile.png", properties: ["castle"], color:"#AAA" },
            DWARVEN_CASTLE_WINTER: { symbol: "Cfa", name: "Winter Dwarven Castle", img: "/data/img/terrain/wesnoth/castle/winter-dwarven/dwarven-castle-tile.png", properties: ["castle"], color:"#AAA" },
            RUIN: { symbol: "Chr", name: "Ruined Human Castle", img: "/data/img/terrain/wesnoth/castle/ruin-tile.png", properties: ["castle"], color:"#AAA" },
            SUNKENRUIN: { symbol: "Chw", name: "Sunken Human Ruin", img: "/data/img/terrain/wesnoth/castle/sunken-ruin-tile.png", properties: ["castle", "shallow_water"], color:"#00D" },
            SWAMPRUIN: { symbol: "Chs", name: "Swamp Human Ruin", img: "/data/img/terrain/wesnoth/castle/swamp-ruin-tile.png", properties: ["castle", "swamp"], color:"#079" },
            SAND_CASTLE: { symbol: "Cd", name: "Desert Castle", img: "/data/img/terrain/wesnoth/castle/sand/tile.png", properties: ["castle"], color:"#AAA" },
            SAND_CASTLE_RUIN: { symbol: "Cdr", name: "Ruined Desert Castle", img: "/data/img/terrain/wesnoth/castle/sand/ruin-tile.png", properties: ["castle"], color:"#AAA" },
            TROLL_ENCAMPMENT: { symbol: "Cte", name: "Troll Encampment", img: "/data/img/terrain/wesnoth/castle/troll/tile.png", properties: ["castle"], color:"#AAA" },
            AQUATIC_CAMP: { symbol: "Cme", name: "Aquatic Encampment", img: "/data/img/terrain/wesnoth/castle/aquatic-camp/tile.png", properties: ["castle", "reef"], color:"#0BC" },
            AQUATIC_CASTLE: { symbol: "Cm", name: "Aquatic Castle", img: "/data/img/terrain/wesnoth/castle/aquatic-castle/castle-tile.png", properties: ["castle", "reef"], color:"#0BC" },
            ENCAMPMENT_RUIN_KEEP: { symbol: "Ker", name: "Ruined Encampment Keep", img: "/data/img/terrain/wesnoth/castle/encampment-ruin/regular-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            ENCAMPMENT_KEEP_TALL: { symbol: "Ket", name: "Tall Encampment Keep", img: "/data/img/terrain/wesnoth/castle/encampment/tall-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            ENCAMPMENT_SNOW_KEEP: { symbol: "Kea", name: "Snowy Encampment Keep", img: "/data/img/terrain/wesnoth/castle/encampment/snow-keep-tile.png", properties: ["castle", "frozen", "keep"], color:"#AAA" },
            ORCISH_KEEP: { symbol: "Ko", name: "Orcish Keep", img: "/data/img/terrain/wesnoth/castle/orcish/keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            SNOW_ORCISH_KEEP: { symbol: "Koa", name: "Snowy Orcish Keep", img: "/data/img/terrain/wesnoth/castle/winter-orcish/keep-tile.png", properties: ["castle", "frozen", "keep"], color:"#AAA" },
            SNOW_KEEP: { symbol: "Kha", name: "Snowy Human Castle Keep", img: "/data/img/terrain/wesnoth/castle/snowy/keep-tile.png", properties: ["castle", "frozen", "keep"], color:"#AAA" },
            ELVEN_KEEP: { symbol: "Kv", name: "Elven Castle Keep", img: "/data/img/terrain/wesnoth/castle/elven/keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            ELVEN_KEEP_RUIN: { symbol: "Kvr", name: "Elven Keep Ruin", img: "/data/img/terrain/wesnoth/castle/elven-ruin/keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            ELVEN_KEEP_WINTER: { symbol: "Kva", name: "Winter Elven Keep", img: "/data/img/terrain/wesnoth/castle/winter-elven/keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            DWARVEN_KEEP: { symbol: "Kud", name: "Dwarven Underground Keep", img: "/data/img/terrain/wesnoth/castle/dwarven-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            DWARVEN_KEEP2: { symbol: "Kf", name: "Dwarven Castle Keep", img: "/data/img/terrain/wesnoth/castle/outside-dwarven/dwarven-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            DWARVEN_KEEP_RUIN: { symbol: "Kfr", name: "Dwarven Ruin Keep", img: "/data/img/terrain/wesnoth/castle/ruin-dwarven/dwarven-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            DWARVEN_KEEP_WINTER: { symbol: "Kfa", name: "Winter Dwarven Keep", img: "/data/img/terrain/wesnoth/castle/winter-dwarven/dwarven-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            RUINED_KEEP: { symbol: "Khr", name: "Ruined Human Castle Keep", img: "/data/img/terrain/wesnoth/castle/ruined-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            SUNKEN_KEEP: { symbol: "Khw", name: "Sunken Human Castle Keep", img: "/data/img/terrain/wesnoth/castle/sunken-keep-tile.png", properties: ["castle", "shallow_water", "keep"], color:"#00D" },
            SWAMP_KEEP: { symbol: "Khs", name: "Swamp Human Castle Keep", img: "/data/img/terrain/wesnoth/castle/swamp-keep-tile.png", properties: ["castle", "swamp", "keep"], color:"#079" },
            DESERT_KEEP: { symbol: "Kd", name: "Desert Keep", img: "/data/img/terrain/wesnoth/castle/sand/keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            DESERT_KEEP_RUINED: { symbol: "Kdr", name: "Ruined Desert Keep", img: "/data/img/terrain/wesnoth/castle/sand/ruin-keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            MERMAN_CAMPKEEP: { symbol: "Kme", name: "Aquatic Encampment Keep", img: "/data/img/terrain/wesnoth/castle/aquatic-camp/keep-tile.png", properties: ["castle", "reef", "keep"], color:"#0BC" },
            TROLL_CAMPKEEP: { symbol: "Kte", name: "Troll Encampment Keep", img: "/data/img/terrain/wesnoth/castle/troll/keep-tile.png", properties: ["castle", "keep"], color:"#AAA" },
            MERMAN_CASTLEKEEP: { symbol: "Km", name: "Aquatic Keep", img: "/data/img/terrain/wesnoth/castle/aquatic-castle/keep-tile.png", properties: ["castle", "reef", "keep"], color:"#0BC" },
            OFF_MAP: { symbol: "_off^_usr", name: "Off Map", img: "/data/img/terrain/wesnoth/off-map/symbol.png", properties: [], color:"#888" },
            SHROUD: { symbol: "_s", name: "Shroud", img: "/data/img/terrain/wesnoth/void/shroud-editor.png", properties: [], color:"#888" },
            FOG: { symbol: "_f", name: "Fog", img: "/data/img/terrain/wesnoth/fog/fog1.png", properties: [], color:"#888" },
            FUNGUS: { symbol: "Tt", name: "Fungus", img: "/data/img/terrain/wesnoth/forest/mushrooms-tile.png", properties: ["fungus"], color:"#A75" },
            CAVE: { symbol: "Ut", name: "Cave", img: "/data/img/terrain/wesnoth/cave/floor6.png", properties: ["cave"], color:"#666" },
            SAND: { symbol: "Dt", name: "Sand", img: "/data/img/terrain/wesnoth/sand/desert.png", properties: ["sand"], color:"#EDC9AF" },
            REEF: { symbol: "Wrt", name: "Coastal Reef", img: "/data/img/terrain/wesnoth/water/reef-tile.png", properties: ["reef"], color:"#0BC" },
            HILLS_HT: { symbol: "Ht", name: "Hills", img: "/data/img/terrain/wesnoth/hills/regular.png", properties: ["hills"], color:"#3A3" },
            SWAMP_WATER: { symbol: "St", name: "Swamp", img: "/data/img/terrain/wesnoth/swamp/mud-tile.png", properties: ["swamp"], color:"#079" },
            SHALLOW_WATER_WST: { symbol: "Wst", name: "Shallow Water", img: "/data/img/terrain/wesnoth/water/coast-tile.png", properties: ["shallow_water"], color:"#00D" },
            CASTLE: { symbol: "Ct", name: "Castle", img: "/data/img/terrain/wesnoth/castle/castle-tile.png", properties: ["castle"], color:"#AAA" },
            MOUNTAINS_MT: { symbol: "Mt", name: "Mountains", img: "/data/img/terrain/wesnoth/mountains/basic-tile.png", properties: ["mountains"], color:"#AAA" },
            DEEP_WATER_WDT: { symbol: "Wdt", name: "Deep Water", img: "/data/img/terrain/wesnoth/water/ocean-tile.png", properties: ["deep_water"], color:"#00A" },
            FLAT: { symbol: "Gt", name: "Flat", img: "/data/img/terrain/wesnoth/grass/green-symbol.png", properties: ["flat"], color:"#0F0" },
            FOREST: { symbol: "Ft", name: "Forest", img: "/data/img/terrain/wesnoth/forest/pine-tile.png", properties: ["forest"], color:"#090" },
            FROZEN: { symbol: "At", name: "Frozen", img: "/data/img/terrain/wesnoth/frozen/snow.png", properties: ["frozen"], color:"#99D" },
            VILLAGE: { symbol: "Vt", name: "Village", img: "/data/img/terrain/wesnoth/village/human-tile.png", properties: ["village"], color:"#DDD" },
            IMPASSABLE: { symbol: "Xt", name: "Impassable", img: "/data/img/terrain/wesnoth/cave/wall-rough-tile.png", properties: ["impassable"], color:"#666" },
            UNWALKABLE: { symbol: "Qt", name: "Unwalkable", img: "/data/img/terrain/wesnoth/chasm/depths.png", properties: ["unwalkable"], color:"#334" },
            RAILS: { symbol: "Rt", name: "Rails", img: "/data/img/terrain/wesnoth/grass/green-symbol.png", properties: ["flat"], color:"#0F0" },
            REGULAR_STONE_FLOOR_DEPRECATED: { symbol: "Irs", name: "Deprecated", img: "/data/img/terrain/wesnoth/interior/stone-regular.png", properties: ["flat"], color:"#0F0" },
            ANCIENT_STONE_FLOOR_DEPRECATED: { symbol: "Ias", name: "Deprecated", img: "/data/img/terrain/wesnoth/interior/stone-ancient.png", properties: ["flat"], color:"#0F0" },
            RUG_FLOOR_DEPRECATED: { symbol: "Icr", name: "Deprecated", img: "/data/img/terrain/wesnoth/interior/royal-rug/rug-tile.png", properties: ["flat"], color:"#0F0" },
            RUG2_FLOOR_DEPRECATED: { symbol: "Icn", name: "Deprecated", img: "/data/img/terrain/wesnoth/interior/regular-rug/rug-tile.png", properties: ["flat"], color:"#0F0" },
            OLD_WOOD_FLOOR_DEPRECATED: { symbol: "Ior", name: "Deprecated", img: "/data/img/terrain/wesnoth/interior/wood-ruined.png", properties: ["flat"], color:"#0F0" }
},

        overlays: {
            SUMMER_DFOREST: { symbol: "Fd", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            WINTER_DFOREST: { symbol: "Fdw", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            AUTUMN_DFOREST: { symbol: "Fdf", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            SNOWY_DFOREST: { symbol: "Fda", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            SUMMER_PFOREST: { symbol: "Fp", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            WINTER_PFOREST: { symbol: "Fpw", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            AUTUMN_PFOREST: { symbol: "Fpf", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            SNOWY_PFOREST: { symbol: "Fpa", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            SUMMER_MFOREST: { symbol: "Fm", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            WINTER_MFOREST: { symbol: "Fmw", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            AUTUMN_MFOREST: { symbol: "Fmf", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            SNOWY_MFOREST: { symbol: "Fma", name: "forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            RAINFOREST: { symbol: "Ftr", name: "summer forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },
            TROP_FOREST: { symbol: "Ft", name: "summer forest", img: "/data/img/terrain/forest.png", properties: ["forest"], color:"#090" },

            MUSHROOM_GROVE: { symbol: "Uf", name: "mushroom grove", img: "/data/img/terrain/mushrooms-tile.png", properties: ["fungus"], color:"#A75" },
            ELVEN_VILLAGE: { symbol: "Vht", name: "elven village", img: "/data/img/terrain/village.png", properties: ["village"], color:"#DDD" },
            TROPICAL_VILLAGE: { symbol: "Ve", name: "tropical village", img: "/data/img/terrain/village/tropical-forest.png", properties: ["village"], color:"#DDD" },
            SWAMP_VILLAGE: { symbol: "Vhs", name: "swamp village", img: "/data/img/terrain/village/swampwater.png", properties: ["village","water"], color:"#DDD" },
            DWARVEN_VILLAGE: { symbol: "Vud", name: "dwarven village", img: "/data/img/terrain/village/dwarven.png", properties: ["village","cave"], color:"#DDD" },
            MERFOLK_VILLAGE: { symbol: "Vm", name: "merfolk village", img: "/data/img/terrain/village/swampwater.png", properties: ["village","water"], color:"#DDD" },
            WOODEN_BRIDGE_N: { symbol: "Bw|", name: "wooden bridge", img: "/data/img/terrain/wood-n-s.png", properties: ["flat","water"], color:"#DDD" },
            WOODEN_BRIDGE_NE: { symbol: "Bw/", name: "wooden bridge", img: "/data/img/terrain/wood-ne-sw.png", properties: ["flat","water"], color:"#DDD" },
            IMPASSABLE_MOUNTAIN: { symbol: "Xm", name: "impassable mountain", img: "/data/img/terrain/cloud.png", properties: ["impassable"], color:"#DDD" },

            /* --- imported from Wesnoth's terrain.cfg by tools/import_terrain.py --- */
            SEA_KELP: { symbol: "Wkf", name: "Kelp Forest", img: "/data/img/terrain/wesnoth/water/seaweed/kelp-tile.png", properties: ["swamp"], color:"#079" },
            OASIS: { symbol: "Do", name: "Oasis", img: "/data/img/terrain/wesnoth/sand/desert-oasis.png", properties: ["shallow_water"], color:"#00D" },
            SAND_RUBBLE: { symbol: "Dr", name: "Rubble", img: "/data/img/terrain/wesnoth/misc/rubble-tile.png", properties: ["hills"], color:"#3A3" },
            CRATER: { symbol: "Dc", name: "Crater", img: "/data/img/terrain/wesnoth/sand/crater.png", properties: ["sand"], color:"#EDC9AF" },
            FLOWERS_MIXED: { symbol: "Efm", name: "Mixed Flowers", img: "/data/img/terrain/wesnoth/embellishments/flowers-mixed.png", properties: [], color:"#888" },
            FARM: { symbol: "Gvs", name: "Farmland", img: "/data/img/terrain/wesnoth/embellishments/farm-veg-spring-icon.png", properties: [], color:"#888" },
            STONES_SMALL: { symbol: "Es", name: "Stones", img: "/data/img/terrain/wesnoth/embellishments/stones-small7.png", properties: [], color:"#888" },
            SNOWBITS_SMALL: { symbol: "Esa", name: "Snowbits", img: "/data/img/terrain/wesnoth/embellishments/snowbits-small4.png", properties: [], color:"#888" },
            MUSHROOMS_SMALL: { symbol: "Em", name: "Small Mushrooms", img: "/data/img/terrain/wesnoth/embellishments/mushroom.png", properties: [], color:"#888" },
            MUSHROOMS_FARM: { symbol: "Emf", name: "Mushroom Farm", img: "/data/img/terrain/wesnoth/embellishments/mushroom-farm-small.png", properties: [], color:"#888" },
            DESERT_PLANTS: { symbol: "Edp", name: "Desert Plants", img: "/data/img/terrain/wesnoth/embellishments/plants/desert-bones.png", properties: [], color:"#888" },
            DESERT_PLANTS_SANS_BONES: { symbol: "Edpp", name: "Desert Plants without Bones", img: "/data/img/terrain/wesnoth/embellishments/plants/desert-plant8.png", properties: [], color:"#888" },
            WINDMILL: { symbol: "Wm", name: "Windmill", img: "/data/img/terrain/wesnoth/misc/windmill-embellishment-tile.png", properties: [], color:"#888" },
            CAMPFIRE: { symbol: "Ecf", name: "Campfire", img: "/data/img/terrain/wesnoth/misc/fire-A01.png", properties: [], color:"#888" },
            WALLFIRE: { symbol: "Efs", name: "Sconce", img: "/data/img/terrain/wesnoth/walls/stone/flames/flames-tile.png", properties: [], color:"#888" },
            BRAZIER: { symbol: "Eb", name: "Brazier", img: "/data/img/terrain/wesnoth/misc/brazier-embellishment.png", properties: [], color:"#888" },
            BRAZIER_LIT: { symbol: "Ebn", name: "Lit Brazier", img: "/data/img/terrain/wesnoth/misc/brazier-A01.png", properties: [], color:"#888" },
            FENCE: { symbol: "Eff", name: "Fence", img: "/data/img/terrain/wesnoth/embellishments/fence-se-nw-01.png", properties: [], color:"#888" },
            FENCE_IRON: { symbol: "Eqf", name: "Iron Fence", img: "/data/img/terrain/wesnoth/embellishments/fence-iron-tile.png", properties: ["unwalkable"], color:"#334" },
            FENCE_PALISADE: { symbol: "Eqp", name: "Wooden Palisade", img: "/data/img/terrain/wesnoth/embellishments/fence-palisade-tile.png", properties: ["unwalkable"], color:"#334" },
            SAND_DRIFTS: { symbol: "Esd", name: "Stones with Sand Drifts", img: "/data/img/terrain/wesnoth/embellishments/rocks.png", properties: [], color:"#888" },
            WATER_LILIES: { symbol: "Ewl", name: "Water Lilies", img: "/data/img/terrain/wesnoth/embellishments/water-lilies-tile.png", properties: [], color:"#888" },
            WATER_LILIES_FLOWER: { symbol: "Ewf", name: "Flowering Water Lilies", img: "/data/img/terrain/wesnoth/embellishments/water-lilies-flower-tile.png", properties: [], color:"#888" },
            SEASHELLS: { symbol: "Ewsh", name: "Seashells", img: "/data/img/terrain/wesnoth/embellishments/seashells-tile.png", properties: [], color:"#888" },
            DETRITUS_TRASH: { symbol: "Edt", name: "Trash", img: "/data/img/terrain/wesnoth/misc/detritus/trashC-1.png", properties: [], color:"#888" },
            DETRITUS_BONES: { symbol: "Edb", name: "Remains", img: "/data/img/terrain/wesnoth/misc/detritus/detritusC-1.png", properties: [], color:"#888" },
            WALL_WINDOWS: { symbol: "Exw", name: "Window", img: "/data/img/terrain/wesnoth/walls/windows/dark-stone-tile.png", properties: [], color:"#888" },
            GREAT_TREE: { symbol: "Fet", name: "Great Tree", img: "/data/img/terrain/wesnoth/forest/great-tree-tile.png", properties: ["forest"], color:"#090" },
            GREAT_TREE_SNOWY: { symbol: "Feta", name: "Snowy Great Tree", img: "/data/img/terrain/wesnoth/forest/great-tree-snowy-tile.png", properties: ["forest"], color:"#090" },
            GREAT_TREE_DEAD: { symbol: "Fetd", name: "Dead Great Tree", img: "/data/img/terrain/wesnoth/forest/great-tree-dead-tile.png", properties: ["forest"], color:"#090" },
            GREAT_TREE_DEAD_OAK: { symbol: "Feth", name: "Dead Great Oak Tree", img: "/data/img/terrain/wesnoth/forest/great-oak-tree-dead-tile.png", properties: ["forest"], color:"#090" },
            PALM_DESERT_FOREST: { symbol: "Ftd", name: "Palm Forest", img: "/data/img/terrain/wesnoth/forest/tropical/palm-desert-tile.png", properties: ["forest"], color:"#090" },
            PALM_FOREST: { symbol: "Ftp", name: "Dense Palm Forest", img: "/data/img/terrain/wesnoth/forest/tropical/palms-tile.png", properties: ["forest"], color:"#090" },
            SAVANNA_FOREST: { symbol: "Fts", name: "Savanna", img: "/data/img/terrain/wesnoth/forest/tropical/savanna-tile.png", properties: ["forest"], color:"#090" },
            DECIDUOUS_FOREST_SUMMER: { symbol: "Fds", name: "Summer Deciduous Forest", img: "/data/img/terrain/wesnoth/forest/deciduous-summer-tile.png", properties: ["forest"], color:"#090" },
            MIXED_FOREST_SUMMER: { symbol: "Fms", name: "Summer Mixed Forest", img: "/data/img/terrain/wesnoth/forest/mixed-summer-tile.png", properties: ["forest"], color:"#090" },
            LIT: { symbol: "Ii", name: "Beam of Light", img: "/data/img/terrain/wesnoth/cave/beam-tile.png", properties: [], color:"#888" },
            FUNGUS_BEAM_OLD: { symbol: "Ufi", name: "Lit Non-mixed Mushroom Grove", img: "/data/img/terrain/wesnoth/forest/mushrooms-beam-tile.png", properties: ["fungus"], color:"#A75" },
            FUNGUS_GROVE: { symbol: "Tf", name: "Mushroom Grove", img: "/data/img/terrain/wesnoth/forest/mushrooms-tile.png", properties: ["fungus"], color:"#A75" },
            FUNGUS_BEAM: { symbol: "Tfi", name: "Lit Mushroom Grove", img: "/data/img/terrain/wesnoth/forest/mushrooms-beam-tile.png", properties: ["fungus"], color:"#A75" },
            MINE_RAILS: { symbol: "Br|", name: "Mine Rail", img: "/data/img/terrain/wesnoth/misc/rails-n-s.png", properties: ["flat"], color:"#0F0" },
            MINE_RAILSDIAG1: { symbol: "Br/", name: "Mine Rail", img: "/data/img/terrain/wesnoth/misc/rails-ne-sw.png", properties: ["flat"], color:"#0F0" },
            MINE_RAILSDIAG2: { symbol: "Br\\", name: "Mine Rail", img: "/data/img/terrain/wesnoth/misc/rails-se-nw.png", properties: ["flat"], color:"#0F0" },
            HIGH_BORDER: { symbol: "Qhh", name: "Bluff", img: "/data/img/terrain/wesnoth/elevation/bluffs-tile.png", properties: [], color:"#888" },
            HIGH_CANYON: { symbol: "Qhu", name: "Gulch", img: "/data/img/terrain/wesnoth/elevation/regular-tile.png", properties: [], color:"#888" },
            HIGH_CANYON_OBST: { symbol: "Qhux", name: "Unwalkable Ravine", img: "/data/img/terrain/wesnoth/elevation/obstacle-tile.png", properties: ["unwalkable"], color:"#334" },
            HIGH_BORDER_WOODS: { symbol: "Qhhf", name: "Wooded Bluffs", img: "/data/img/terrain/wesnoth/forest/pine-tile.png", properties: ["forest"], color:"#090" },
            HIGH_CANYON_WOODS: { symbol: "Qhuf", name: "Wooded Gulch", img: "/data/img/terrain/wesnoth/forest/pine-tile.png", properties: ["forest"], color:"#090" },
            PORTAL_GATE_RUSTY_SW: { symbol: "Pr\\", name: "Rusty Gate", img: "/data/img/terrain/wesnoth/portals/gate-rusty-sw-tile.png", properties: ["impassable"], color:"#666" },
            PORTAL_GATE_RUSTY_SE: { symbol: "Pr/", name: "Rusty Gate", img: "/data/img/terrain/wesnoth/portals/gate-rusty-se-tile.png", properties: ["impassable"], color:"#666" },
            PORTAL_GATE_RUSTY_N: { symbol: "Pr|", name: "Rusty Gate", img: "/data/img/terrain/wesnoth/portals/gate-rusty-n-tile.png", properties: ["impassable"], color:"#666" },
            PORTAL_DOOR_WOODEN_SW: { symbol: "Pw\\", name: "Wooden Door", img: "/data/img/terrain/wesnoth/portals/door-wooden-sw-tile.png", properties: ["impassable"], color:"#666" },
            PORTAL_DOOR_WOODEN_SE: { symbol: "Pw/", name: "Wooden Door", img: "/data/img/terrain/wesnoth/portals/door-wooden-se-tile.png", properties: ["impassable"], color:"#666" },
            PORTAL_DOOR_WOODEN_N: { symbol: "Pw|", name: "Wooden Door", img: "/data/img/terrain/wesnoth/portals/door-wooden-n-tile.png", properties: ["impassable"], color:"#666" },
            PORTAL_GATE_RUSTY_OPEN_SW: { symbol: "Pr\\o", name: "Open Rusty Gate", img: "/data/img/terrain/wesnoth/portals/gate-rusty-open-sw-tile.png", properties: [], color:"#888" },
            PORTAL_GATE_RUSTY_OPEN_SE: { symbol: "Pr/o", name: "Open Rusty Gate", img: "/data/img/terrain/wesnoth/portals/gate-rusty-open-se-tile.png", properties: [], color:"#888" },
            PORTAL_GATE_RUSTY_OPEN_N: { symbol: "Pr|o", name: "Open Rusty Gate", img: "/data/img/terrain/wesnoth/portals/gate-rusty-open-n-tile.png", properties: [], color:"#888" },
            PORTAL_DOOR_WOODEN_OPEN_SW: { symbol: "Pw\\o", name: "Open Wooden Door", img: "/data/img/terrain/wesnoth/portals/door-wooden-open-sw-tile.png", properties: [], color:"#888" },
            PORTAL_DOOR_WOODEN_OPEN_SE: { symbol: "Pw/o", name: "Open Wooden Door", img: "/data/img/terrain/wesnoth/portals/door-wooden-open-se-tile.png", properties: [], color:"#888" },
            PORTAL_DOOR_WOODEN_OPEN_N: { symbol: "Pw|o", name: "Open Wooden Door", img: "/data/img/terrain/wesnoth/portals/door-wooden-open-n-tile.png", properties: [], color:"#888" },
            IMPASSABLE_OVERLAY: { symbol: "Xo", name: "Impassable Overlay", img: "", properties: ["impassable"], color:"#666" },
            UNWALKABLE_OVERLAY: { symbol: "Qov", name: "Unwalkable Overlay", img: "", properties: ["unwalkable"], color:"#334" },
            DESERT_VILLAGE: { symbol: "Vda", name: "Adobe Village", img: "/data/img/terrain/wesnoth/village/desert-tile.png", properties: ["village"], color:"#DDD" },
            DESERT_VILLAGE_RUIN: { symbol: "Vdr", name: "Ruined Adobe Village", img: "/data/img/terrain/wesnoth/village/desert-ruin-tile.png", properties: ["village"], color:"#DDD" },
            DESERT_VILLAGE_TENT: { symbol: "Vdt", name: "Desert Tent Village", img: "/data/img/terrain/wesnoth/village/desert-camp-tile.png", properties: ["village"], color:"#DDD" },
            CAMP_VILLAGE: { symbol: "Vct", name: "Tent Village", img: "/data/img/terrain/wesnoth/village/camp-tile.png", properties: ["village"], color:"#DDD" },
            ORCISH_VILLAGE: { symbol: "Vo", name: "Orcish Village", img: "/data/img/terrain/wesnoth/village/orc-tile.png", properties: ["village"], color:"#DDD" },
            ORCISH_SNOW_VILLAGE: { symbol: "Voa", name: "Snowy Orcish Village", img: "/data/img/terrain/wesnoth/village/orc-snow-tile.png", properties: ["village"], color:"#DDD" },
            ELVEN_SNOW_VILLAGE: { symbol: "Vea", name: "Snowy Elven Village", img: "/data/img/terrain/wesnoth/village/elven-snow-tile.png", properties: ["village"], color:"#DDD" },
            HUMAN_VILLAGE: { symbol: "Vh", name: "Cottage", img: "/data/img/terrain/wesnoth/village/human-tile.png", properties: ["village"], color:"#DDD" },
            SNOW_VILLAGE: { symbol: "Vha", name: "Snowy Cottage", img: "/data/img/terrain/wesnoth/village/snow-tile.png", properties: ["village"], color:"#DDD" },
            HUMAN_VILLAGE_RUIN: { symbol: "Vhr", name: "Ruined Cottage", img: "/data/img/terrain/wesnoth/village/human-cottage-ruin-tile.png", properties: ["village"], color:"#DDD" },
            CITY_VILLAGE: { symbol: "Vhc", name: "Human City", img: "/data/img/terrain/wesnoth/village/human-city-tile.png", properties: ["village"], color:"#DDD" },
            WINDMILL_VILLAGE: { symbol: "Vwm", name: "Windmill Village", img: "/data/img/terrain/wesnoth/misc/windmill-tile.png", properties: ["village"], color:"#DDD" },
            CITY_VILLAGE_WNO: { symbol: "Vhca", name: "Snowy Human City", img: "/data/img/terrain/wesnoth/village/human-city-snow-tile.png", properties: ["village"], color:"#DDD" },
            CITY_VILLAGE_RUIN: { symbol: "Vhcr", name: "Ruined Human City", img: "/data/img/terrain/wesnoth/village/human-city-ruin-tile.png", properties: ["village"], color:"#DDD" },
            HILL_VILLAGE: { symbol: "Vhh", name: "Hill Stone Village", img: "/data/img/terrain/wesnoth/village/human-hills-tile.png", properties: ["village"], color:"#DDD" },
            SNOW_HILL_VILLAGE: { symbol: "Vhha", name: "Snowy Hill Stone Village", img: "/data/img/terrain/wesnoth/village/human-snow-hills-tile.png", properties: ["village"], color:"#DDD" },
            HILL_VILLAGE_RUIN: { symbol: "Vhhr", name: "Ruined Hill Stone Village", img: "/data/img/terrain/wesnoth/village/human-hills-ruin-tile.png", properties: ["village"], color:"#DDD" },
            DRAKE_VILLAGE: { symbol: "Vd", name: "Drake Village", img: "/data/img/terrain/wesnoth/village/drake-tile.png", properties: ["village"], color:"#DDD" },
            DRAKE_SNOW_VILLAGE: { symbol: "Vka", name: "Snowy Drake Village", img: "/data/img/terrain/wesnoth/village/drake-snow-tile.png", properties: ["village"], color:"#DDD" },
            UNDERGROUND_VILLAGE: { symbol: "Vu", name: "Cave Village", img: "/data/img/terrain/wesnoth/village/cave-tile.png", properties: ["village"], color:"#DDD" },
            HUT_VILLAGE: { symbol: "Vc", name: "Hut", img: "/data/img/terrain/wesnoth/village/hut-tile.png", properties: ["village"], color:"#DDD" },
            HUT_SNOW_VILLAGE: { symbol: "Vca", name: "Snowy Hut", img: "/data/img/terrain/wesnoth/village/hut-snow-tile.png", properties: ["village"], color:"#DDD" },
            LOGCABIN_VILLAGE: { symbol: "Vl", name: "Log Cabin", img: "/data/img/terrain/wesnoth/village/log-cabin-tile.png", properties: ["village"], color:"#DDD" },
            LOGCABIN_SNOW_VILLAGE: { symbol: "Vla", name: "Snowy Log Cabin", img: "/data/img/terrain/wesnoth/village/log-cabin-snow-tile.png", properties: ["village"], color:"#DDD" },
            IGLOO: { symbol: "Vaa", name: "Igloo", img: "/data/img/terrain/wesnoth/village/igloo-tile.png", properties: ["village"], color:"#DDD" },
            VILLAGE_OVERLAY: { symbol: "Vov", name: "Village Overlay", img: "/data/img/terrain/wesnoth/fog/fog1.png", properties: [], color:"#888" },
            CASTLE_OVERLAY: { symbol: "Cov", name: "Castle Overlay", img: "/data/img/terrain/wesnoth/fog/fog1.png", properties: [], color:"#888" },
            KEEP_OVERLAY: { symbol: "Kov", name: "Keep Overlay", img: "/data/img/terrain/wesnoth/fog/fog1.png", properties: ["keep"], color:"#888" },
            BRIDGEDIAG2: { symbol: "Bw\\", name: "Wooden Bridge", img: "/data/img/terrain/wesnoth/bridge/wood-se-nw.png", properties: ["flat"], color:"#0F0" },
            ROTBRIDGE: { symbol: "Bw|r", name: "Rotting Bridge", img: "/data/img/terrain/wesnoth/bridge/wood-rotting-n-s.png", properties: ["flat"], color:"#0F0" },
            ROTBRIDGEDIAG1: { symbol: "Bw/r", name: "Rotting Bridge", img: "/data/img/terrain/wesnoth/bridge/wood-rotting-ne-sw.png", properties: ["flat"], color:"#0F0" },
            ROTBRIDGEDIAG2: { symbol: "Bw\\r", name: "Rotting Bridge", img: "/data/img/terrain/wesnoth/bridge/wood-rotting-se-nw.png", properties: ["flat"], color:"#0F0" },
            STONE_BRIDGE: { symbol: "Bsb|", name: "Basic Stone Bridge", img: "/data/img/terrain/wesnoth/bridge/stonebridge-n-s-tile.png", properties: ["flat"], color:"#0F0" },
            STONE_BRIDGEDIAG1: { symbol: "Bsb\\", name: "Basic Stone Bridge", img: "/data/img/terrain/wesnoth/bridge/stonebridge-se-nw-tile.png", properties: ["flat"], color:"#0F0" },
            STONE_BRIDGEDIAG2: { symbol: "Bsb/", name: "Basic Stone Bridge", img: "/data/img/terrain/wesnoth/bridge/stonebridge-ne-sw-tile.png", properties: ["flat"], color:"#0F0" },
            SNOW_STONE_BRIDGE: { symbol: "Bsa|", name: "Snowy Stone Bridge", img: "/data/img/terrain/wesnoth/bridge/snow/stonebridge-n-s-tile.png", properties: ["flat"], color:"#0F0" },
            SNOW_STONE_BRIDGEDIAG1: { symbol: "Bsa\\", name: "Snowy Stone Bridge", img: "/data/img/terrain/wesnoth/bridge/snow/stonebridge-se-nw-tile.png", properties: ["flat"], color:"#0F0" },
            SNOW_STONE_BRIDGEDIAG2: { symbol: "Bsa/", name: "Snowy Stone Bridge", img: "/data/img/terrain/wesnoth/bridge/snow/stonebridge-ne-sw-tile.png", properties: ["flat"], color:"#0F0" },
            BRIDGECHASM: { symbol: "Bs|", name: "Cave Chasm Bridge", img: "/data/img/terrain/wesnoth/cave/chasm-stone-bridge-s-n-tile.png", properties: ["cave"], color:"#666" },
            BRIDGECHASMDIAG1: { symbol: "Bs/", name: "Cave Chasm Bridge", img: "/data/img/terrain/wesnoth/cave/chasm-stone-bridge-sw-ne-tile.png", properties: ["cave"], color:"#666" },
            BRIDGECHASMDIAG2: { symbol: "Bs\\", name: "Cave Chasm Bridge", img: "/data/img/terrain/wesnoth/cave/chasm-stone-bridge-se-nw-tile.png", properties: ["cave"], color:"#666" },
            HANGINGBRIDGEDIAG1: { symbol: "Bh\\", name: "Hanging Bridge", img: "/data/img/terrain/wesnoth/bridge/hanging-se-nw-tile.png", properties: ["flat"], color:"#0F0" },
            HANGINGBRIDGEDIAG2: { symbol: "Bh/", name: "Hanging Bridge", img: "/data/img/terrain/wesnoth/bridge/hanging-sw-ne-tile.png", properties: ["flat"], color:"#0F0" },
            HANGINGBRIDGE: { symbol: "Bh|", name: "Hanging Bridge", img: "/data/img/terrain/wesnoth/bridge/hanging-s-n-tile.png", properties: ["flat"], color:"#0F0" },
            STONECHASMBRIDGEDIAG1: { symbol: "Bcx\\", name: "Stone Chasm Bridge", img: "/data/img/terrain/wesnoth/bridge/chasm-se-nw-tile.png", properties: ["flat"], color:"#0F0" },
            STONECHASMBRIDGEDIAG2: { symbol: "Bcx/", name: "Stone Chasm Bridge", img: "/data/img/terrain/wesnoth/bridge/chasm-sw-ne-tile.png", properties: ["flat"], color:"#0F0" },
            STONECHASMBRIDGE: { symbol: "Bcx|", name: "Stone Chasm Bridge", img: "/data/img/terrain/wesnoth/bridge/chasm-s-n-tile.png", properties: ["flat"], color:"#0F0" },
            PLANKBRIDGEDIAG1: { symbol: "Bp\\", name: "Plank Bridge", img: "/data/img/terrain/wesnoth/bridge/planks-se-nw-tile.png", properties: ["flat"], color:"#0F0" },
            PLANKBRIDGEDIAG2: { symbol: "Bp/", name: "Plank Bridge", img: "/data/img/terrain/wesnoth/bridge/planks-sw-ne-tile.png", properties: ["flat"], color:"#0F0" },
            PLANKBRIDGE: { symbol: "Bp|", name: "Plank Bridge", img: "/data/img/terrain/wesnoth/bridge/planks-s-n.png", properties: ["flat"], color:"#0F0" },
            MARK_HIGH: { symbol: "_mh", name: "Marker High", img: "/data/img/terrain/wesnoth/floodfill/marker-high-tile.png", properties: [], color:"#888" },
            MARK_HIGH2: { symbol: "_mhh", name: "Marker High 2", img: "/data/img/terrain/wesnoth/floodfill/marker-high-2-tile.png", properties: [], color:"#888" },
            MARK_LOW: { symbol: "_ml", name: "Marker Low", img: "/data/img/terrain/wesnoth/floodfill/marker-low-tile.png", properties: [], color:"#888" },
            MARK_LOW2: { symbol: "_mll", name: "Marker Low 2", img: "/data/img/terrain/wesnoth/floodfill/marker-low-2-tile.png", properties: [], color:"#888" },
            OFF_MAP2: { symbol: "_fme", name: "Fake Map Border", img: "/data/img/terrain/wesnoth/off-map/border.png", properties: [], color:"#888" },
            OVERLAY_ARTPLACEHOLDER: { symbol: "Xxxx", name: "Art Placeholder", img: "/data/img/terrain/wesnoth/off-map/symbol.png", properties: [], color:"#888" },
            FAKE_SHROUD_OVERLAY: { symbol: "_s", name: "Fake Shroud", img: "", properties: [], color:"#888" }
},

        transitionRank:["FORD", "SHALLOW_WATER", "DEEP_WATER", "DRY_GRASS", "SEMI_GRASS", "GRASS", "HUMAN_CASTLE", "HUMAN_KEEP", "ENCAMPMENT_CASTLE", "ENCAMPMENT_KEEP"],

        transitions: {
            FORD: { imgBase:"/data/img/terrain/trans/ford", dirs:['n','s','ne','nw','se','sw'] },
            GRASS: { imgBase:"/data/img/terrain/trans/green", dirs:['n','s','ne','nw','se','sw'] },
            DRY_GRASS: { imgBase:"/data/img/terrain/trans/dry", dirs:['n','s','ne','nw','se','sw'] },
            SEMI_GRASS: { imgBase:"/data/img/terrain/trans/semi-dry", dirs:['n','s','ne','nw','se','sw'] },
            DEEP_WATER: { imgBase:"/data/img/terrain/trans/ocean-A01", dirs:['n','s','ne','nw','se','sw'] },
            SHALLOW_WATER: { imgBase:"/data/img/terrain/trans/ocean-blend-A01", dirs:['n','s','ne','nw','se','sw'] }
        },

        /**
           Takes one or two strings from the Wesnoth map file and returns a TerrainType object. Base and overlay are represented in the map file as either a 2 or 3 char symbol string like "Bb" (just base) or two symbols joined by a carret "Bb^Oo" (base and overlay)
           @memberof module:terrain.Terrain
           @prop {string} baseSymbol - symbol for tiles with no carret or symbole from the left side of the carret
           @prop {string} overlaySymbol - optional symbol from the right side of the carret
           @return {TerrainType} an object representing the aggregate types and images of the combination of base and overlay types
        */
        getTerrainBySymbol: function(baseSymbol, overlaySymbol) {
            var terrainObj = { properties:[] };
            for(var prop in this.bases) {
                if(this.bases[prop].symbol == baseSymbol) {
                    var base = this.bases[prop];
                    terrainObj.tileType = prop;
                    terrainObj.name = base.name;
                    terrainObj.properties = terrainObj.properties.concat(base.properties);
                    terrainObj.img = base.img;
                    terrainObj.imgObj = base.imgObj;
                    terrainObj.color = base.color;
                }
            }
            for(var prop in this.overlays) {
                if(this.overlays[prop].symbol == overlaySymbol) {
                    var overlay = this.overlays[prop];
                    
                    // overlays that confer terrain properties eliminate the "flat" terrain type from the base terrain
                    // e.g., green grass overlayed with forest is "forest"-type only, not "forest" and "flat"
                    if(overlay.properties.length > 0) {
                        var flatIndex = terrainObj.properties.indexOf("flat");
                        if(flatIndex != -1) { terrainObj.properties.splice(flatIndex, 1); }
                    }

                    terrainObj.properties = terrainObj.properties.concat(overlay.properties);
                    terrainObj.name = overlay.name;
                    terrainObj.overlayImg = overlay.img;
                    terrainObj.overlayImgObj = overlay.imgObj;
                    terrainObj.color = overlay.color;
                }

                if(terrainObj.properties.length == 0) {
                    terrainObj = { name: "void", properties: ["flat"], img: "/data/img/terrain/void-editor.png", color: "#000" };

                    if(overlaySymbol) { terrainObj.overlayImg = "/data/img/terrain/forest.png"; }
                }
            }

            if(overlaySymbol && !overlay) {
                //console.log("Missing overlay:", overlaySymbol);
            }

            return terrainObj;
        },

        /**
           Given an object with `x` and `y` properties, return array 
           of adjacent coordinate objects (without regard to the existence
           of an actual space at those coordinates)
           @memberof module:terrain.Terrain
           @param {{x:number, y:number}} space - object with x and y properties
           @return {Object[]} list of objects with x and y properties
        */
        getNeighborCoords: function(space) {
            var x = space.x, y = space.y;
            
            // -1 if odd, +1 if even
            var offset = 1 - (x % 2) * 2;
            return [{ x: x-1, y: y+offset },
                    { x: x,   y: y+offset },
                    { x: x+1, y: y+offset },
                    { x: x-1, y: y },
                    { x: x,   y: y-offset },
                    { x: x+1, y: y }];
        },

        /**
           Given two objects with `x` and `y` properties, return a string
           representing the compass direction from the first space to the
           second. (The spaces need not be adjacent.)
           @memberof module:terrain.Terrain
           @param {{x:number, y:number}} s1 - source corrdinates
           @param {{x:number, y:number}} s1 - destination coordinates
           @return {string} one of `n`, `s`, `ne`, `nw`, `se`, `sw`
         */
        getDirection: function(s1, s2) {
            if(s1.x == s2.x) {
                return s1.y > s2.y ? "n" : "s";
            }

            // is a high space on a row
            var isHigh = (s1.x % 2);
            var result = "";
            
            if((isHigh && s1.y == s2.y) || (!isHigh && s1.y < s2.y)) {
                result = "s";
            } else {
                result = "n";
            }

            if(s1.x > s2.x) { result += "w"; }
            else { result += "e"; }

            return result;
        }
    }

    // TerrainType objects should stringify to their name
    var terrainToString = function() { return this.name; };
    for(var i in Terrain.bases) {
        Terrain.bases[i].toString = terrainToString;
    }
    for(var i in Terrain.overlays) {
        Terrain.overlays[i].toString = terrainToString;
    }

    /**
       Parse a Wesnoth map file string into MapData

       @param {string} map_data - a Wesnoth map file as a string
       @return {MapData} a dictionary-based representation of the Wesnoth map
    */
    exports.toMapDict = function(map_data) {
        var misc_lines = 0;
        var row = 0;
        var map_array = map_data.split('\n');
        var map_dict = {};

        // read each line in the map file
        for(var line_num = 0; line_num < map_array.length; line_num++) {
            var line = map_array[line_num];
            line = line.trim();
            line = line.replace(/\s+/g, ' ');

            // use this line only if it describes terrain
            if(line.indexOf('=') == -1 && line != '') {
                var tiles = line.split(",");

                // place each tile described in the line
                for(var tile_num = 0; tile_num < tiles.length; tile_num++) {
                    var tile = tiles[tile_num];
                    tile = tile.trim();
                    var tileObj = { x:tile_num, y:row }
                    var componentsBySpace = tile.split(' ');

                    // if the tile has a start position, add it
                    if(componentsBySpace.length == 2) {
                        tileObj.start = componentsBySpace[0];
                    }

                    var componentsByCarret = componentsBySpace.pop().split("^");
                    var base = componentsByCarret[0];
                    var overlay = componentsByCarret[1];

                    var terrain = Terrain.getTerrainBySymbol(base, overlay);
                    tileObj.terrain = terrain;

                    map_dict[tile_num+","+row] = tileObj;

                }
                row++;
            } else {
                misc_lines += 1;
            }
        }
        
        return map_dict;
    }

}());
