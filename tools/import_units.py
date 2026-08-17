#!/usr/bin/env python3
"""Import Wesnoth's default-era factions into static/data.

Lords of the Fey shipped with two hand-written factions (elves and orcs). This
script reads the unit definitions straight from the Wesnoth repository and
writes out the remaining default-era factions -- Loyalists, Undead, Drakes and
the Knalgan Alliance -- along with every unit they can advance into.

For each unit it writes:

  * static/data/units/<unit_id>.json   stats, attacks, terrain table, resistances
  * static/data/img/units/<unit_id>.png  the unit's base image
  * static/data/img/attacks/<icon>.png   any attack icon not already present

and finally the faction files plus the faction index that the lobby, the client
and createGame all read.

Units that already exist in static/data/units are left untouched, so the
hand-tuned elf and orc data is preserved.

Usage:
    python tools/import_units.py [--dry-run] [--refresh]
"""

import argparse
import io
import json
import os
import re
import sys
import urllib.request
import urllib.error

WESNOTH_RAW = "https://raw.githubusercontent.com/wesnoth/wesnoth/master"
UNITS_CFG_URL = WESNOTH_RAW + "/data/core/units.cfg"
MOVETYPE_MACROS_URL = WESNOTH_RAW + "/data/core/macros/movetypes.cfg"
UNIT_DIR_URL = WESNOTH_RAW + "/data/core/units/%s"
IMAGE_URL = WESNOTH_RAW + "/data/core/images/%s"
TREE_URL = "https://api.github.com/repos/wesnoth/wesnoth/git/trees/master?recursive=1"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "static", "data")
UNIT_JSON_DIR = os.path.join(DATA_DIR, "units")
FACTION_DIR = os.path.join(DATA_DIR, "factions")
UNIT_IMG_DIR = os.path.join(DATA_DIR, "img", "units")
ATTACK_IMG_DIR = os.path.join(DATA_DIR, "img", "attacks")
CACHE_DIR = os.path.join(REPO_ROOT, ".wesnoth-cache")

# The terrain keys a unit's JSON uses, in the order the existing files list them.
TERRAIN_KEYS = [
    "castle", "cave", "reef", "deep_water", "flat", "forest", "frozen", "hills",
    "mountains", "fungus", "sand", "shallow_water", "swamp", "unwalkable",
    "village", "impassable",
]

# Wesnoth calls it swamp_water; everything else lines up already.
WESNOTH_TERRAIN_KEY = {"swamp": "swamp_water"}

DAMAGE_TYPES = ["blade", "pierce", "impact", "fire", "cold", "arcane"]

# Weapon special macros worth carrying over. The game engine acts on poison,
# slows, magical, marksman and firststrike; the rest are shown in the attack
# prompt so the player can see what a weapon does.
WEAPON_SPECIALS = {
    "WEAPON_SPECIAL_POISON": "poison",
    "WEAPON_SPECIAL_SLOW": "slows",
    "WEAPON_SPECIAL_MAGICAL": "magical",
    "WEAPON_SPECIAL_MARKSMAN": "marksman",
    "WEAPON_SPECIAL_FIRSTSTRIKE": "firststrike",
    "WEAPON_SPECIAL_BACKSTAB": "backstab",
    "WEAPON_SPECIAL_CHARGE": "charge",
    "WEAPON_SPECIAL_DRAIN": "drain",
    "WEAPON_SPECIAL_BERSERK": "berserk",
    "WEAPON_SPECIAL_PLAGUE": "plague",
    "WEAPON_SPECIAL_SWARM": "swarm",
    "WEAPON_SPECIAL_STUN": "stun",
    "WEAPON_SPECIAL_PETRIFY": "petrifies",
}

# Traits a unit always has, invoked as bare macros in its [unit_type] block.
TRAIT_MACROS = {
    "TRAIT_FEARLESS": "fearless",
    "TRAIT_FEARLESS_MUSTHAVE": "fearless",
    "TRAIT_LOYAL": "loyal",
    "TRAIT_UNDEAD": "undead",
    "TRAIT_MECHANICAL": "mechanical",
    "TRAIT_ELEMENTAL": "elemental",
}

# A handful of units describe themselves entirely through WML macros, which this
# reader deliberately does not expand. Their few missing fields are filled in here.
UNIT_OVERRIDES = {
    "Walking Corpse": {"image": "units/undead/zombie.png", "movement_type": "undeadfoot",
                       "hitpoints": "18", "movement": "4"},
    "Soulless": {"image": "units/undead/soulless.png", "movement_type": "undeadfoot",
                 "hitpoints": "28", "movement": "4"},
}

ABILITY_MACROS = {
    "ABILITY_HEALS": ["heals +4"],
    "ABILITY_CURES": ["cures", "heals +8"],
    "ABILITY_EXTRA_HEAL": ["heals +8"],
    "ABILITY_REGENERATES": ["regenerates"],
    "ABILITY_LEADERSHIP": ["leadership"],
    "ABILITY_AMBUSH": ["ambush"],
    "ABILITY_ILLUMINATES": ["illuminates"],
    "ABILITY_TELEPORT": ["teleport"],
    "ABILITY_SKIRMISHER": ["skirmisher"],
    "ABILITY_STEADFAST": ["steadfast"],
    "ABILITY_NIGHTSTALK": ["nightstalk"],
    "ABILITY_SUBMERGE": ["submerge"],
    "ABILITY_FEEDING": ["feeding"],
}

# How each race draws its random traits, matching the existing hand-written files.
RACE_TRAITS = {
    "elf": {"attributePool": ["dextrous"]},
    "troll": {"attributePool": ["fearless"], "omittedAttributes": ["intelligent"]},
    "goblin": {
        "omittedAttributes": ["quick", "strong", "resilient", "intelligent"],
        "attributePool": ["weak", "dim", "slow"],
        "attributeCount": 1,
    },
    "wose": {"attributeCount": 0},
    "mechanical": {"attributeCount": 0},
    "undead": {"fixedAttributes": ["undead"], "attributeCount": 1,
               "omittedAttributes": ["intelligent"]},
    "bats": {"attributePool": ["feral"]},
    "dwarf": {"attributePool": ["healthy"]},
}

# The six default-era factions. Recruit lists and leaders follow Wesnoth's
# multiplayer/factions definitions; ids are Wesnoth unit ids.
FACTIONS = [
    {
        "id": "elves", "name": "Elves",
        "recruit": ["Elvish Fighter", "Elvish Archer", "Elvish Shaman", "Elvish Scout",
                    "Mage", "Merman Hunter", "Wose"],
        "commander": ["Elvish Ranger"],
    },
    {
        "id": "orcs", "name": "Orcs",
        "recruit": ["Orcish Grunt", "Orcish Archer", "Orcish Assassin", "Naga Fighter",
                    "Goblin Spearman", "Troll Whelp", "Wolf Rider"],
        "commander": ["Orcish Warrior"],
    },
    {
        "id": "loyalists", "name": "Loyalists",
        "recruit": ["Spearman", "Bowman", "Fencer", "Heavy Infantryman", "Cavalryman",
                    "Horseman", "Mage", "Merman Fighter"],
        "commander": ["Lieutenant"],
    },
    {
        "id": "undead", "name": "Undead",
        "recruit": ["Skeleton", "Skeleton Archer", "Ghoul", "Vampire Bat",
                    "Walking Corpse", "Dark Adept", "Ghost"],
        "commander": ["Dark Sorcerer"],
    },
    {
        "id": "drakes", "name": "Drakes",
        "recruit": ["Drake Fighter", "Drake Clasher", "Drake Burner", "Drake Glider",
                    "Saurian Skirmisher", "Saurian Augur"],
        "commander": ["Drake Flare"],
    },
    {
        "id": "knalgans", "name": "Knalgan Alliance",
        "recruit": ["Dwarvish Fighter", "Dwarvish Guardsman", "Dwarvish Thunderer",
                    "Dwarvish Ulfserker", "Dwarvish Scout", "Footpad", "Poacher",
                    "Thief", "Gryphon Rider"],
        "commander": ["Dwarvish Steelclad"],
    },
]


# --------------------------------------------------------------------------
# fetching
# --------------------------------------------------------------------------

def fetch(url, binary=False):
    cache_name = re.sub(r"[^A-Za-z0-9._-]+", "_", url)[-180:]
    cache_path = os.path.join(CACHE_DIR, cache_name)
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as handle:
            data = handle.read()
        return data if binary else data.decode("utf8")

    request = urllib.request.Request(url, headers={"User-Agent": "lords-of-the-fey-importer"})
    data = urllib.request.urlopen(request, timeout=60).read()

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "wb") as handle:
        handle.write(data)
    return data if binary else data.decode("utf8")


# --------------------------------------------------------------------------
# a very small WML reader
# --------------------------------------------------------------------------

class Node(object):
    """One WML tag: its attributes, its child tags and the macros it invokes."""

    def __init__(self, name):
        self.name = name
        self.attrs = {}
        self.children = []
        self.macros = []

    def find_all(self, name):
        return [c for c in self.children if c.name == name]

    def find(self, name):
        found = self.find_all(name)
        return found[0] if found else None


def parse_wml(text):
    """Parse WML into a root Node. Preprocessor lines and macro bodies are ignored."""
    root = Node("root")
    stack = [root]
    pending_key = None
    pending_value = None

    for line in text.split("\n"):
        line = line.strip()

        if pending_key is not None:
            pending_value += "\n" + line
            if '"' in line:
                stack[-1].attrs[pending_key] = pending_value.strip().strip('"')
                pending_key = pending_value = None
            continue

        if not line or line.startswith("#"):
            continue

        if line.startswith("{"):
            stack[-1].macros.append(line.strip("{}").split()[0] if line.strip("{}").split() else "")
            continue

        if line.startswith("[/"):
            if len(stack) > 1:
                stack.pop()
            continue

        if line.startswith("["):
            name = line[1:line.index("]")].lstrip("+")
            node = Node(name)
            stack[-1].children.append(node)
            stack.append(node)
            continue

        if "=" in line:
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()

            # translatable strings are written as: key= _ "Some Text"
            if value.startswith("_"):
                value = value[1:].strip()

            if value.startswith('"'):
                closing = value.find('"', 1)
                if closing == -1:
                    # a string that runs on to the next line
                    pending_key, pending_value = key, value
                    continue
                # anything after the closing quote is a trailing wmllint comment
                value = value[1:closing]
            else:
                value = value.split("#")[0].strip()

            stack[-1].attrs[key] = value

    return root


# --------------------------------------------------------------------------
# conversion
# --------------------------------------------------------------------------

def unit_id(wesnoth_id):
    """"Elvish Ranger" -> "elvish_ranger" (the file name used by loadUnitType)."""
    return re.sub(r"[^a-z0-9]+", "_", wesnoth_id.lower()).strip("_")


def macros_of(node):
    """Every macro invoked by a node or any of its children."""
    found = list(node.macros)
    for child in node.children:
        found.extend(macros_of(child))
    return found


MACRO_CALL = re.compile(r"\{([A-Z_][A-Z0-9_]*)((?:[^{}]|\{[^{}]*\})*)\}")


def collect_defines(text):
    """Read `#define NAME ARGS ... #enddef` blocks into {name: (args, body)}."""
    defines = {}
    lines = text.split("\n")
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if line.startswith("#define "):
            header = line[len("#define "):].split()
            name, params = header[0], header[1:]
            body = []
            index += 1
            depth = 1
            while index < len(lines):
                inner = lines[index].strip()
                if inner.startswith("#define "):
                    depth += 1
                elif inner.startswith("#enddef"):
                    depth -= 1
                    if depth == 0:
                        break
                body.append(lines[index])
                index += 1
            defines[name] = (params, "\n".join(body))
        index += 1
    return defines


def split_macro_args(text):
    """Split a macro's argument list, keeping quoted arguments in one piece."""
    args, current, quoted = [], "", False
    for char in text:
        if char == '"':
            quoted = not quoted
        elif char.isspace() and not quoted:
            if current:
                args.append(current)
                current = ""
            continue
        current += char
    if current:
        args.append(current)
    return args


def expand_macros(text, defines, rounds=6):
    """Expand the movetype macros Wesnoth uses to share movement and defence tables."""
    for _ in range(rounds):
        def replace(match):
            name = match.group(1)
            if name not in defines:
                return match.group(0)
            params, body = defines[name]
            values = split_macro_args(match.group(2))
            for position, param in enumerate(params):
                value = values[position] if position < len(values) else ""
                body = body.replace("{" + param + "}", value)
            return body

        expanded = MACRO_CALL.sub(replace, text)
        if expanded == text:
            break
        text = expanded
    return text


def build_movetypes(units_cfg):
    """name -> {movement_costs, defense, resistance} from data/core/units.cfg."""
    root = parse_wml(units_cfg)
    movetypes = {}

    def collect(node):
        for child in node.children:
            if child.name == "movetype":
                movetypes[child.attrs.get("name", "")] = child
            collect(child)

    collect(root)
    return movetypes


def terrain_table(movetype):
    """Convert a Wesnoth movetype into the JSON `terrain` block.

    Wesnoth's [defense] numbers are the chance of *being hit*, so a unit's cover
    is what is left over. Terrains a movetype does not mention cannot be entered.
    """
    costs = movetype.find("movement_costs")
    defense = movetype.find("defense")
    costs = costs.attrs if costs else {}
    defense = defense.attrs if defense else {}

    table = {}
    for key in TERRAIN_KEYS:
        wesnoth_key = WESNOTH_TERRAIN_KEY.get(key, key)
        raw_cost = costs.get(wesnoth_key)
        try:
            cost = int(raw_cost)
        except (TypeError, ValueError):
            cost = -1
        if cost >= 99:
            cost = -1

        try:
            hit_chance = int(defense.get(wesnoth_key))
        except (TypeError, ValueError):
            hit_chance = 100

        cover = 0 if cost == -1 else round(1 - hit_chance / 100.0, 2)
        table[key] = {"move": cost, "cover": cover}

    return table


def resistance_table(movetype, override):
    """Wesnoth resistance 90 means 90% damage taken, i.e. 10% resistance here."""
    values = {}
    base = movetype.find("resistance") if movetype else None
    if base:
        values.update(base.attrs)
    if override:
        values.update(override.attrs)

    table = {}
    for damage_type in DAMAGE_TYPES:
        try:
            taken = int(values.get(damage_type, 100))
        except ValueError:
            taken = 100
        table[damage_type] = round(1 - taken / 100.0, 2)
    return table


def attacks_of(unit_node, downloader):
    attacks = []
    for attack in unit_node.find_all("attack"):
        name = attack.attrs.get("description") or attack.attrs.get("name", "attack")
        entry = {
            "name": name.replace("_", " ").strip().capitalize(),
            "type": attack.attrs.get("range", "melee"),
            "damageType": attack.attrs.get("type", "blade"),
            "damage": int(attack.attrs.get("damage", 0) or 0),
            "number": int(attack.attrs.get("number", 1) or 1),
        }

        icon = attack.attrs.get("icon")
        if icon:
            web_path = downloader(icon, ATTACK_IMG_DIR, "/data/img/attacks")
            if web_path:
                entry["icon"] = web_path

        properties = []
        for listed in (attack.attrs.get("specials_list") or "").split(","):
            listed = listed.strip()
            if listed:
                properties.append(listed)
        for macro in macros_of(attack):
            special = WEAPON_SPECIALS.get(macro)
            if special and special not in properties:
                properties.append(special)
        if properties:
            entry["properties"] = properties

        attacks.append(entry)
    return attacks


def abilities_of(unit_node):
    abilities = []

    for listed in (unit_node.attrs.get("abilities_list") or "").split(","):
        listed = listed.strip()
        if listed:
            abilities.append(listed)

    node = unit_node.find("abilities")
    for macro in (macros_of(node) if node else []):
        for ability in ABILITY_MACROS.get(macro, []):
            if ability not in abilities:
                abilities.append(ability)

    # traits the unit always carries, written as bare macros in its own block
    for macro in unit_node.macros:
        trait = TRAIT_MACROS.get(macro)
        if trait and trait not in abilities:
            abilities.append(trait)

    return abilities


def convert(unit_node, movetypes, downloader):
    """Turn one [unit_type] into the JSON this game loads, or None if unusable."""
    attrs = dict(unit_node.attrs)
    attrs.update(UNIT_OVERRIDES.get(attrs.get("id", ""), {}))

    movetype = movetypes.get(attrs.get("movement_type", ""))
    if not movetype:
        return None

    image = attrs.get("image")
    if not image:
        return None

    identifier = unit_id(attrs["id"])
    image_path = downloader(image, UNIT_IMG_DIR, "/data/img/units", rename=identifier + ".png")
    if not image_path:
        return None

    unit = {
        "name": attrs.get("name", attrs["id"]),
        "img": image_path,
        "cost": int(attrs.get("cost", 0) or 0),
        "maxHp": int(attrs.get("hitpoints", 1) or 1),
        "move": int(attrs.get("movement", 0) or 0),
        "maxXp": int(attrs.get("experience", 100) or 100),
        "level": int(attrs.get("level", 1) or 1),
        "alignment": attrs.get("alignment", "neutral"),
    }

    abilities = abilities_of(unit_node)
    if abilities:
        unit["fixedAttributes"] = abilities

    unit.update(RACE_TRAITS.get(attrs.get("race", ""), {}))

    advances = [a.strip() for a in (attrs.get("advances_to") or "").split(",") if a.strip()]
    advances = [a for a in advances if a.lower() != "null"]
    if advances:
        unit["advancesTo"] = [unit_id(a) for a in advances]

    unit["attacks"] = attacks_of(unit_node, downloader)
    unit["terrain"] = terrain_table(movetype)
    unit["resistances"] = resistance_table(movetype, unit_node.find("resistance"))

    return identifier, unit, advances


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------

def make_downloader(dry_run):
    def download(source, target_dir, web_dir, rename=None):
        """Fetch an image out of Wesnoth's image tree, returning its web path."""
        file_name = rename or os.path.basename(source)
        target = os.path.join(target_dir, file_name)
        web_path = web_dir + "/" + file_name

        if os.path.exists(target):
            return web_path
        if dry_run:
            return web_path

        try:
            data = fetch(IMAGE_URL % source, binary=True)
        except urllib.error.HTTPError:
            return None

        os.makedirs(target_dir, exist_ok=True)
        with open(target, "wb") as handle:
            handle.write(data)
        return web_path

    return download


def load_all_unit_types(paths):
    """Read every mainline unit cfg and index the [unit_type] blocks by Wesnoth id."""
    by_id = {}
    for path in paths:
        try:
            text = fetch(WESNOTH_RAW + "/" + path)
        except urllib.error.HTTPError:
            continue
        for node in parse_wml(text).find_all("unit_type"):
            if "id" in node.attrs:
                by_id[node.attrs["id"]] = node
    return by_id


def update_proto_list():
    """Rewrite unitLib.protoList so the client and server load every unit file.

    Unit files whose image is missing are left out: the loader treats a failed
    image as a fatal error for the whole batch.
    """
    unit_js = os.path.join(REPO_ROOT, "static", "shared", "unit.js")
    source = io.open(unit_js, encoding="utf8").read()

    names = []
    dropped = []
    for file_name in sorted(os.listdir(UNIT_JSON_DIR)):
        if not file_name.endswith(".json") or file_name == "index.json":
            continue
        identifier = file_name[:-len(".json")]
        with io.open(os.path.join(UNIT_JSON_DIR, file_name), encoding="utf8") as handle:
            unit = json.load(handle)
        image = os.path.join(REPO_ROOT, "static", unit.get("img", "").lstrip("/").replace("/", os.sep))
        if not unit.get("img") or not os.path.exists(image):
            dropped.append(identifier)
            continue
        names.append(identifier)

    listing = ", ".join('"%s"' % name for name in names)
    source = re.sub(r"protoList: \[[^\]]*\]", "protoList: [" + listing + "]", source, count=1)
    io.open(unit_js, "w", encoding="utf8").write(source)

    print("unitLib.protoList now lists %d units" % len(names))
    for identifier in dropped:
        print("  left out %-24s (no image on disk)" % identifier)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report what would be written")
    parser.add_argument("--refresh", action="store_true", help="rewrite unit files that already exist")
    args = parser.parse_args()

    tree = json.loads(fetch(TREE_URL))
    unit_paths = [entry["path"] for entry in tree["tree"]
                  if entry["path"].startswith("data/core/units/") and entry["path"].endswith(".cfg")]

    print("reading %d unit files..." % len(unit_paths))
    unit_types = load_all_unit_types(unit_paths)
    # movement and defence tables are shared through macros defined alongside them
    macro_defines = collect_defines(fetch(MOVETYPE_MACROS_URL))
    macro_defines.update(collect_defines(fetch(UNITS_CFG_URL)))
    movetypes = build_movetypes(expand_macros(fetch(UNITS_CFG_URL), macro_defines))
    print("found %d unit types and %d movement types" % (len(unit_types), len(movetypes)))

    download = make_downloader(args.dry_run)

    # every recruitable unit, plus everything it can ever advance into
    wanted = []
    for faction in FACTIONS:
        wanted.extend(faction["recruit"])
        wanted.extend(faction["commander"])

    seen = set()
    queue = list(wanted)
    written = 0
    skipped = []

    while queue:
        wesnoth_id = queue.pop(0)
        if wesnoth_id in seen:
            continue
        seen.add(wesnoth_id)

        node = unit_types.get(wesnoth_id)
        if not node:
            skipped.append((wesnoth_id, "no such unit in Wesnoth"))
            continue

        identifier = unit_id(wesnoth_id)
        target = os.path.join(UNIT_JSON_DIR, identifier + ".json")

        converted = convert(node, movetypes, download)
        if not converted:
            skipped.append((wesnoth_id, "missing movement type or image"))
            continue

        identifier, unit, advances = converted
        queue.extend(advances)

        if os.path.exists(target) and not args.refresh:
            continue

        if not args.dry_run:
            os.makedirs(UNIT_JSON_DIR, exist_ok=True)
            with io.open(target, "w", encoding="utf8") as handle:
                handle.write(json.dumps(unit, indent=2))
        written += 1

    # faction files and the index the lobby and client read
    if not args.dry_run:
        os.makedirs(FACTION_DIR, exist_ok=True)
        for faction in FACTIONS:
            recruit = [unit_id(u) for u in faction["recruit"] if unit_id(u) + ".json" in os.listdir(UNIT_JSON_DIR)]
            commanders = [unit_id(u) for u in faction["commander"]]
            path = os.path.join(FACTION_DIR, faction["id"] + ".json")
            with io.open(path, "w", encoding="utf8") as handle:
                handle.write(json.dumps({
                    "name": faction["name"],
                    "recruitList": recruit,
                    "commanderList": commanders,
                }, indent=4))

        with io.open(os.path.join(FACTION_DIR, "index.json"), "w", encoding="utf8") as handle:
            handle.write(json.dumps({
                "factions": [{"id": f["id"], "name": f["name"]} for f in FACTIONS]
            }, indent=4))

    if not args.dry_run:
        update_proto_list()

    print("wrote %d unit files across %d factions" % (written, len(FACTIONS)))
    for wesnoth_id, reason in skipped:
        print("  skipped %-24s %s" % (wesnoth_id, reason))


if __name__ == "__main__":
    sys.exit(main())
