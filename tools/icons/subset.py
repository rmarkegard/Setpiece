"""
Builds the icon font Setpiece ships: Material Symbols Rounded with only the icons the interface names.

The full font (material-symbols-rounded.woff2 here, about 5 MB) holds every Material Symbol in four axes.
Every Setpiece page (Studio, each desk, each browser card) loads its own copy of the icon font, so shipping
the full one cost several megabytes of memory per page. Setpiece draws its icons at one weight, grade and
optical size (see .material-symbols in UI/src/styles/_base.scss) and only switches FILL, so the shipped font
keeps the FILL axis and the icons named in UI/src, and nothing else.

Every quoted lowercase word in UI/src that is also an icon name is kept, so an icon is found wherever it is
named (a template, a widget definition, a map of status icons). UI/tests/icons.test.ts fails when the source
names an icon the shipped font lacks: run this again after adding one.

    pip install fonttools brotli
    python tools/icons/subset.py
"""
import json
import pathlib
import re

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "icons" / "material-symbols-rounded.woff2"
OUTPUT = ROOT / "UI" / "public" / "fonts" / "material-symbols-rounded.woff2"
NAMES = ROOT / "tools" / "icons" / "names.json"
# The axes the interface pins in font-variation-settings ('wght' var(--icon-weight, 400), 'GRAD' 0, 'opsz' 24).
PINNED = {"wght": 400, "GRAD": 0, "opsz": 24}


def ligatures(font):
    """Every icon name the font knows, with the glyph its ligature makes."""
    reverse = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
    result = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            table = table.ExtSubTable if lookup.LookupType == 7 else table
            for first, rules in getattr(table, "ligatures", {}).items():
                for rule in rules:
                    parts = [first, *rule.Component]
                    if all(part in reverse for part in parts):
                        result.setdefault("".join(reverse[part] for part in parts), rule.LigGlyph)
    return result


def named_in_source():
    words = set()
    for path in (ROOT / "UI" / "src").rglob("*"):
        if path.suffix in (".ts", ".html"):
            words.update(re.findall(r"""['"`]([a-z][a-z0-9_]*)['"`]""", path.read_text(encoding="utf-8")))
    return words


def main():
    font = TTFont(SOURCE)
    available = ligatures(font)
    wanted = sorted(named_in_source() & available.keys())
    letters = sorted({char for name in wanted for char in name})
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["rlig", "liga"]
    # Without closure, a ligature survives only when its icon glyph is kept, so the letters do not pull in every icon.
    options.layout_closure = False
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(glyphs=[available[name] for name in wanted], unicodes=[ord(char) for char in letters])
    subsetter.subset(font)
    font = instancer.instantiateVariableFont(font, PINNED)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUTPUT)
    NAMES.write_text(json.dumps({"included": wanted, "available": sorted(available)}, indent=0) + "\n", encoding="utf-8")
    print(f"{len(wanted)} icons, {OUTPUT.stat().st_size:,} bytes -> {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
