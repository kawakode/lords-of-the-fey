#!/usr/bin/env python3
"""Import Wesnoth's full terrain table into static/shared/terrain.js.

Wesnoth's map editor can emit any of the ~280 terrain codes defined in its
terrain.cfg. Lords of the Fey only understood a small hand-written subset, so
maps drawn in the editor came out full of void tiles. This script reads
terrain.cfg straight from the Wesnoth repository, downloads the matching hex
symbol images, and rewrites the `bases` and `overlays` tables in terrain.js.

Terrain codes that terrain.js already defines are left exactly as they are, so
the tiles the game already draws (and the transition images keyed off their
names) keep working.

Usage:
    python tools/import_terrain.py [--offline]

    --offline   reuse previously downloaded images instead of fetching them
"""

import argparse
import io
import os
import re
import sys
import urllib.request
import urllib.error

WESNOTH_RAW = "https://raw.githubusercontent.com/wesnoth/wesnoth/master"
TERRAIN_CFG_URL = WESNOTH_RAW + "/data/core/terrain.cfg"
TERRAIN_IMAGE_URL = WESNOTH_RAW + "/data/core/images/terrain/%s.png"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TERRAIN_JS = os.path.join(REPO_ROOT, "static", "shared", "terrain.js")
IMAGE_DIR = os.path.join(REPO_ROOT, "static", "data", "img", "terrain", "wesnoth")
IMAGE_WEB_ROOT = "/data/img/terrain/wesnoth"

# Wesnoth expresses movement/defence in terms of a handful of "alias" terrain
# codes. These are exactly the keys used by the `terrain` block of a unit's
# JSON, except that Wesnoth's swamp_water is simply "swamp" here, and rails have
# no separate cost.
ALIAS_PROPERTIES = {
    "Gt": "flat",
    "Ft": "forest",
    "Ht": "hills",
    "Mt": "mountains",
    "At": "frozen",
    "Dt": "sand",
    "St": "swamp",
    "Tt": "fungus",
    "Ut": "cave",
    "Ct": "castle",
    "Vt": "village",
    "Wst": "shallow_water",
    "Wdt": "deep_water",
    "Wrt": "reef",
    "Qt": "unwalkable",
    "Xt": "impassable",
    "Rt": "flat",
}

# minimap colour per property, most specific first
PROPERTY_COLORS = [
    ("deep_water", "#00A"),
    ("shallow_water", "#00D"),
    ("reef", "#0BC"),
    ("swamp", "#079"),
    ("village", "#DDD"),
    ("castle", "#AAA"),
    ("impassable", "#666"),
    ("unwalkable", "#334"),
    ("frozen", "#99D"),
    ("mountains", "#AAA"),
    ("hills", "#3A3"),
    ("forest", "#090"),
    ("fungus", "#A75"),
    ("cave", "#666"),
    ("sand", "#EDC9AF"),
    ("flat", "#0F0"),
]


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "lords-of-the-fey-importer"})
    return urllib.request.urlopen(request, timeout=60).read()


def parse_terrain_cfg(text):
    """Return one dict per [terrain_type] block."""
    records = []
    for block in re.findall(r"\[terrain_type\](.*?)\[/terrain_type\]", text, re.S):
        record = {}
        for line in block.split("\n"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            # strip the translation marker and quotes from _ "Some Name"
            match = re.match(r'^_?\s*"(.*)"$', value)
            if match:
                value = match.group(1)
            record[key.strip()] = value
        if "string" in record and "id" in record:
            records.append(record)
    return records


def clean_code(raw):
    """Terrain codes carry trailing wmllint comments in the config file."""
    return raw.split("#")[0].strip()


def properties_of(record):
    """Resolve a terrain's movement aliases to Lords of the Fey terrain properties."""
    raw = record.get("mvt_alias") or record.get("aliasof") or ""
    properties = []
    for alias in raw.split(","):
        alias = alias.strip()
        # "-" means "no alias of its own" and "_bas" means "whatever the base is"
        if not alias or alias in ("-", "_bas"):
            continue
        prop = ALIAS_PROPERTIES.get(clean_code(alias))
        if prop and prop not in properties:
            properties.append(prop)

    # the generic terrains are the alias targets themselves, so they name their
    # own property rather than pointing at another terrain
    if not properties:
        own = ALIAS_PROPERTIES.get(clean_code(record.get("string", "")))
        if own:
            properties.append(own)

    # keeps are castles a commander can recruit from
    if record.get("recruit_from") == "yes" and "keep" not in properties:
        properties.append("keep")

    return properties


def color_of(properties):
    for prop, color in PROPERTY_COLORS:
        if prop in properties:
            return color
    return "#888"


def image_name(record):
    """Pick the hex image to draw this terrain with.

    Walls, portals and fences carry `symbol_image=void/void` because Wesnoth
    draws them entirely from terrain_graphics rules; their `editor_image` is the
    single-hex picture we actually want.
    """
    symbol = record.get("symbol_image")
    if symbol and symbol != "void/void":
        return symbol
    return record.get("editor_image") or symbol


def download_image(name, offline):
    """Download one hex symbol image, returning its web path (or None)."""
    target = os.path.join(IMAGE_DIR, name.replace("/", os.sep) + ".png")
    web_path = IMAGE_WEB_ROOT + "/" + name + ".png"

    if os.path.exists(target):
        return web_path
    if offline:
        return None

    os.makedirs(os.path.dirname(target), exist_ok=True)
    try:
        data = fetch(TERRAIN_IMAGE_URL % name)
    except urllib.error.HTTPError:
        return None
    with open(target, "wb") as handle:
        handle.write(data)
    return web_path


def existing_tables(source):
    """Pull the symbols and entry names terrain.js already defines.

    Base and overlay symbols live in separate namespaces -- a map tile is written
    as `base^overlay` -- so they are collected separately.
    """
    split_at = source.index("\n        overlays: {")
    names = set()

    def symbols_in(fragment):
        found = set()
        for match in re.finditer(r"^\s{12}([A-Z0-9_]+):\s*\{[^\n]*symbol:\s*\"([^\"]*)\"", fragment, re.M):
            names.add(match.group(1))
            found.add(match.group(2))
        return found

    return symbols_in(source[:split_at]), symbols_in(source[split_at:]), names


def entry_name(record, taken):
    name = re.sub(r"[^A-Z0-9]+", "_", record["id"].upper()).strip("_")
    if name not in taken:
        return name
    # ids are unique in Wesnoth but may clash with the hand-written entries
    suffix = re.sub(r"[^A-Za-z0-9]+", "", clean_code(record["string"])).upper()
    candidate = (name + "_" + suffix) if suffix else (name + "_ALT")
    index = 2
    while candidate in taken:
        candidate = "%s_%d" % (name, index)
        index += 1
    return candidate


def js_entry(name, code, record, properties, web_path):
    label = record.get("editor_name") or record.get("name") or record["id"]
    return '            %s: { symbol: "%s", name: "%s", img: "%s", properties: [%s], color:"%s" }' % (
        name,
        code.replace("\\", "\\\\").replace('"', '\\"'),
        label.replace('"', '\\"'),
        web_path,
        ", ".join('"%s"' % p for p in properties),
        color_of(properties),
    )


def splice(source, table, generated):
    """Append generated entries to the end of a table literal in terrain.js."""
    marker = "\n        %s: {\n" % table
    start = source.index(marker) + len(marker)

    depth = 1
    index = start
    while depth:
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                break
        index += 1

    head = source[:index].rstrip()
    if not head.endswith(","):
        head += ","
    block = "\n\n            /* --- imported from Wesnoth's terrain.cfg by tools/import_terrain.py --- */\n"
    return head + block + ",\n".join(generated) + "\n" + source[index:]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="do not download anything new")
    args = parser.parse_args()

    cfg_cache = os.path.join(IMAGE_DIR, "terrain.cfg")
    if args.offline and os.path.exists(cfg_cache):
        text = io.open(cfg_cache, encoding="utf8").read()
    else:
        text = fetch(TERRAIN_CFG_URL).decode("utf8")
        os.makedirs(IMAGE_DIR, exist_ok=True)
        io.open(cfg_cache, "w", encoding="utf8").write(text)

    records = parse_terrain_cfg(text)
    source = io.open(TERRAIN_JS, encoding="utf8").read()
    base_symbols, overlay_symbols, taken_names = existing_tables(source)

    new_bases = []
    new_overlays = []
    skipped = []

    # Wesnoth's generic terrains (plain "hills", plain "castle"...) are placeable
    # in the editor but have no picture of their own, so each borrows one from a
    # representative terrain of the same kind.
    representative_code = {
        "flat": "Gg", "forest": "^Fp", "hills": "Hh", "mountains": "Mm",
        "frozen": "Aa", "sand": "Dd", "swamp": "Sm", "fungus": "^Tf",
        "cave": "Uu", "castle": "Ch", "village": "^Vh", "shallow_water": "Ww",
        "deep_water": "Wo", "reef": "Wwr", "unwalkable": "Qxu", "impassable": "Xu",
    }
    by_code = dict((clean_code(r["string"]), r) for r in records)
    stand_in_image = {}
    for prop, code in representative_code.items():
        donor = by_code.get(code)
        if donor and image_name(donor):
            stand_in_image[prop] = image_name(donor)

    for record in records:
        raw_code = clean_code(record["string"])
        if not raw_code:
            continue

        # a map tile reads "base^overlay", so overlays are stored without the caret
        is_overlay = raw_code.startswith("^")
        code = raw_code[1:] if is_overlay else raw_code
        known = overlay_symbols if is_overlay else base_symbols
        if not code or code in known:
            continue

        properties = properties_of(record)
        name = image_name(record)

        # Overlays such as ^Xo only mark a hex as impassable; the only picture
        # Wesnoth has for them is an editor marker, which does not belong on the
        # board, so they carry the rules but no picture.
        if is_overlay and (name or "").endswith("-editor"):
            name = None
            web_path = ""
        else:
            if not name and properties:
                name = stand_in_image.get(properties[0])
            if not name:
                skipped.append((raw_code, "no image"))
                continue

            web_path = download_image(name, args.offline)
            if not web_path:
                skipped.append((raw_code, "image not found: " + name))
                continue

        known.add(code)
        key = entry_name(record, taken_names)
        taken_names.add(key)

        entry = js_entry(key, code, record, properties, web_path)
        if is_overlay:
            new_overlays.append(entry)
        else:
            new_bases.append(entry)

    if new_bases:
        source = splice(source, "bases", new_bases)
    if new_overlays:
        source = splice(source, "overlays", new_overlays)

    io.open(TERRAIN_JS, "w", encoding="utf8").write(source)

    print("added %d base tiles and %d overlays" % (len(new_bases), len(new_overlays)))
    for code, reason in skipped:
        print("  skipped %-8s %s" % (code, reason))


if __name__ == "__main__":
    sys.exit(main())
