#!/usr/bin/env python3
"""Build attack and death sprite sheets for imported units.

Wesnoth ships each animation as a folder of numbered PNGs, while this game draws
units from a single horizontal sprite sheet plus a table of frame ranges (see
`unit.animations` and `attack.animation` in the unit JSON files). This script
reads the [attack_anim] and [death] blocks out of Wesnoth's unit definitions,
downloads the frames they name, stitches them into one sheet per unit and
records the ranges in that unit's JSON.

Frames are laid out as: frame 0 is the standing image, then each attack's frames
in attack order, then the death frames.

Units whose animations are defined through WML macros rather than inline frames
are skipped; they keep their single standing image, which the game already
handles.

Requires Pillow.

Usage:
    python tools/build_sprites.py [--limit N] [--only unit_id,unit_id]
"""

import argparse
import io
import json
import os
import re
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import import_units as wesnoth

from PIL import Image

FRAME_SIZE = 72

REPO_ROOT = wesnoth.REPO_ROOT
UNIT_JSON_DIR = wesnoth.UNIT_JSON_DIR
UNIT_IMG_DIR = wesnoth.UNIT_IMG_DIR

RANGE_PATTERN = re.compile(r"\[([0-9~,\s]+)\]")


def expand_frame_list(spec):
    """Turn "grunt-attack-[1~5].png" into the list of file names it stands for.

    Wesnoth's ranges may count down and may be chained, as in [1~5,4~1].
    """
    spec = spec.strip().strip('"')
    spec = spec.split(":")[0]          # trailing frame durations
    spec = spec.split("~")[0] if ".png~" in spec else spec   # image-path filters

    match = RANGE_PATTERN.search(spec)
    if not match:
        return [spec]

    numbers = []
    for part in match.group(1).split(","):
        part = part.strip()
        if "~" in part:
            first, last = [int(n) for n in part.split("~")]
            step = 1 if last >= first else -1
            numbers.extend(range(first, last + step, step))
        elif part:
            numbers.append(int(part))

    return [spec[:match.start()] + str(n) + spec[match.end():] for n in numbers]


def frames_in(node):
    """Collect the frame images of an animation block, ignoring north-east variants."""
    images = []
    for frame in node.children:
        if frame.name not in ("frame", "if", "else"):
            continue
        if frame.name in ("if", "else"):
            # directional animations: keep the south-facing set only
            direction = frame.attrs.get("direction", "")
            if "ne" in direction.split(",") or "n" in direction.split(","):
                continue
            images.extend(frames_in(frame))
            continue
        spec = frame.attrs.get("image")
        if spec:
            images.extend(expand_frame_list(spec))

    for child in node.children:
        if child.name not in ("frame", "if", "else"):
            images.extend(frames_in(child))

    return [i for i in images if "-ne-" not in i and not i.endswith("-ne.png")]


def attack_frames(unit_node):
    """Map an attack's internal name to its animation frames."""
    by_attack = {}
    for animation in unit_node.find_all("attack_anim"):
        filters = animation.find_all("filter_attack")
        names = [f.attrs.get("name") for f in filters if f.attrs.get("name")]
        images = frames_in(animation)
        if not images:
            continue
        for name in (names or [None]):
            by_attack.setdefault(name, images)
    return by_attack


def death_frames(unit_node):
    death = unit_node.find("death")
    return frames_in(death) if death else []


def load_frame(path):
    """Fetch one animation frame and centre it in a fixed-size cell."""
    try:
        data = wesnoth.fetch(wesnoth.IMAGE_URL % path, binary=True)
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None

    try:
        frame = Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        return None

    cell = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    frame.thumbnail((FRAME_SIZE, FRAME_SIZE), Image.LANCZOS)
    cell.paste(frame, ((FRAME_SIZE - frame.width) // 2, (FRAME_SIZE - frame.height) // 2))
    return cell


def build_sheet(identifier, unit_node, unit_json):
    """Compose one unit's sheet; returns True when the unit's JSON was updated."""
    base_image = unit_node.attrs.get("image")
    if not base_image:
        return False

    per_attack = attack_frames(unit_node)
    deaths = death_frames(unit_node)
    if not per_attack and not deaths:
        return False

    standing = load_frame(base_image)
    if standing is None:
        return False

    cells = [standing]
    animations = {}
    attack_ranges = {}

    for index, attack in enumerate(unit_node.find_all("attack")):
        images = per_attack.get(attack.attrs.get("name")) or per_attack.get(None)
        if not images:
            continue
        loaded = [c for c in (load_frame(i) for i in images) if c is not None]
        if not loaded:
            continue
        attack_ranges[index] = [len(cells), len(cells) + len(loaded) - 1]
        cells.extend(loaded)

    if deaths:
        loaded = [c for c in (load_frame(i) for i in deaths) if c is not None]
        if loaded:
            animations["die"] = [len(cells), len(cells) + len(loaded) - 1]
            cells.extend(loaded)

    if len(cells) < 2:
        return False

    sheet = Image.new("RGBA", (FRAME_SIZE * len(cells), FRAME_SIZE), (0, 0, 0, 0))
    for position, cell in enumerate(cells):
        sheet.paste(cell, (FRAME_SIZE * position, 0))

    sheet_name = identifier + "-sprite.png"
    sheet.save(os.path.join(UNIT_IMG_DIR, sheet_name))

    unit_json["sprite"] = "/data/img/units/" + sheet_name
    if animations:
        unit_json["animations"] = animations
    for index, frame_range in attack_ranges.items():
        if index < len(unit_json.get("attacks", [])):
            unit_json["attacks"][index]["animation"] = frame_range

    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="stop after this many sheets")
    parser.add_argument("--only", default="", help="comma-separated unit ids to build")
    args = parser.parse_args()

    only = set(filter(None, args.only.split(",")))

    tree = json.loads(wesnoth.fetch(wesnoth.TREE_URL))
    unit_paths = [entry["path"] for entry in tree["tree"]
                  if entry["path"].startswith("data/core/units/") and entry["path"].endswith(".cfg")]

    print("reading %d unit files..." % len(unit_paths))
    unit_types = wesnoth.load_all_unit_types(unit_paths)

    by_identifier = {}
    for wesnoth_id, node in unit_types.items():
        by_identifier[wesnoth.unit_id(wesnoth_id)] = node

    built = 0
    for file_name in sorted(os.listdir(UNIT_JSON_DIR)):
        if not file_name.endswith(".json") or file_name == "index.json":
            continue

        identifier = file_name[:-len(".json")]
        if only and identifier not in only:
            continue

        node = by_identifier.get(identifier)
        if not node:
            continue

        path = os.path.join(UNIT_JSON_DIR, file_name)
        with io.open(path, encoding="utf8") as handle:
            unit_json = json.load(handle)

        if "sprite" in unit_json:
            continue

        try:
            updated = build_sheet(identifier, node, unit_json)
        except Exception as error:
            print("  %-24s failed: %s" % (identifier, error))
            continue

        if not updated:
            continue

        with io.open(path, "w", encoding="utf8") as handle:
            handle.write(json.dumps(unit_json, indent=2))

        built += 1
        print("  %-24s %s" % (identifier, unit_json.get("animations", {})))

        if args.limit and built >= args.limit:
            break

    print("built %d sprite sheets" % built)


if __name__ == "__main__":
    sys.exit(main())
