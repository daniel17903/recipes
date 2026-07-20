#!/usr/bin/env python3
"""Validiert alle recipes/*.json gegen das Rezept-Schema und die Projektregeln.

Ohne externe Abhängigkeiten (nur Standardbibliothek). Aufruf:

    python scripts/validate.py

Exit-Code 0 = alles in Ordnung, 1 = Fehler gefunden.
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECIPES_DIR = os.path.join(ROOT, "recipes")
IMAGES_DIR = os.path.join(RECIPES_DIR, "images")
CATEGORIES_FILE = os.path.join(ROOT, "data", "categories.json")

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ALLOWED_UNITS = {"g", "ml", "Stück", "Pck.", "Prise", "Msp.", "Blatt",
                 "Zehe", "Bund", "Dose", "Glas", None}
FORBIDDEN_UNITS = {"EL", "TL", "Tasse", "cup", "Cup", "tbsp", "tsp"}
YIELD_UNIT_EMPTY_PARENS_RE = re.compile(r"\(\s*(x|ø)?\s*\)|\(\s*x\s*cm\s*\)", re.IGNORECASE)
YIELD_UNIT_BAD_VALUES = {"portion(en)", "portions"}


def load_categories() -> list[str]:
    with open(CATEGORIES_FILE, encoding="utf-8") as fh:
        return json.load(fh)


def check_yield(y, err, loc: str = "yield") -> None:
    if not isinstance(y, dict) or "amount" not in y or "unit" not in y:
        err(f"'{loc}' fehlt oder unvollständig (amount/unit)")
        return
    if not isinstance(y["amount"], (int, float)) or y["amount"] <= 0:
        err(f"'{loc}.amount' muss eine positive Zahl sein: {y['amount']!r}")
    unit = y["unit"]
    if not isinstance(unit, str) or not unit:
        err(f"'{loc}.unit' muss ein nicht-leerer String sein")
        return
    if "  " in unit:
        err(f"'{loc}.unit' enthält Doppel-Leerzeichen: {unit!r}")
    if YIELD_UNIT_EMPTY_PARENS_RE.search(unit):
        err(f"'{loc}.unit' enthält leere Klammer-Reste: {unit!r}")
    if unit.lower() in YIELD_UNIT_BAD_VALUES:
        err(f"'{loc}.unit' ist unnormalisiert: {unit!r} (erwartet 'Portionen')")
    if unit.startswith("cm "):
        err(f"'{loc}.unit' beginnt mit 'cm ': {unit!r}")


def check_ingredients(ings, err, loc: str = "ingredients") -> None:
    if not isinstance(ings, list) or not ings:
        err(f"'{loc}' fehlt oder ist leer")
        return
    for i, ing in enumerate(ings):
        iloc = f"{loc}[{i}]"
        if not isinstance(ing, dict):
            err(f"{iloc} ist kein Objekt")
            continue
        for key in ("group", "amount", "unit", "name"):
            if key not in ing:
                err(f"{iloc}: Feld '{key}' fehlt")
        if not isinstance(ing.get("name"), str) or not ing.get("name"):
            err(f"{iloc}: 'name' fehlt oder leer")
        amt = ing.get("amount")
        if amt is not None and not isinstance(amt, (int, float)):
            err(f"{iloc}: 'amount' muss Zahl oder null sein: {amt!r}")
        unit = ing.get("unit")
        if unit in FORBIDDEN_UNITS:
            err(f"{iloc}: verbotene Einheit {unit!r} (umrechnen!)")
        elif unit not in ALLOWED_UNITS:
            err(f"{iloc}: unbekannte Einheit {unit!r}")
        grp = ing.get("group")
        if grp is not None and not isinstance(grp, str):
            err(f"{iloc}: 'group' muss String oder null sein")


def check_steps(steps, err, loc: str = "steps") -> None:
    if not isinstance(steps, list) or not steps:
        err(f"'{loc}' fehlt oder ist leer")
    elif any(not isinstance(s, str) or not s.strip() for s in steps):
        err(f"'{loc}' enthält leere Einträge")


VARIATION_KEYS = {"id", "title", "description", "yield", "times",
                  "ingredients", "steps", "notes", "source"}


def check_variations(variations, err) -> None:
    if not isinstance(variations, list) or not variations:
        err("'variations' muss eine nicht-leere Liste sein")
        return
    seen_ids: set[str] = set()
    for i, v in enumerate(variations):
        loc = f"variations[{i}]"
        if not isinstance(v, dict):
            err(f"{loc} ist kein Objekt")
            continue
        vid = v.get("id")
        if not isinstance(vid, str) or not SLUG_RE.match(vid or ""):
            err(f"{loc}: 'id' fehlt oder ist kein gültiger Slug: {vid!r}")
        elif vid in seen_ids:
            err(f"{loc}: doppelte Varianten-id {vid!r}")
        else:
            seen_ids.add(vid)
        if not isinstance(v.get("title"), str) or not v.get("title"):
            err(f"{loc}: 'title' fehlt oder leer")
        for key in v:
            if key not in VARIATION_KEYS:
                err(f"{loc}: unbekanntes Feld {key!r}")
        if "yield" in v:
            check_yield(v["yield"], err, f"{loc}.yield")
        if "ingredients" in v:
            check_ingredients(v["ingredients"], err, f"{loc}.ingredients")
        if "steps" in v:
            check_steps(v["steps"], err, f"{loc}.steps")
        if "source" in v and not isinstance(v["source"], dict):
            err(f"{loc}: 'source' muss ein Objekt sein")


def validate_recipe(path: str, categories: set[str], errors: list[str],
                    used_images: set[str]) -> None:
    name = os.path.basename(path)
    try:
        with open(path, encoding="utf-8") as fh:
            r = json.load(fh)
    except json.JSONDecodeError as exc:
        errors.append(f"{name}: ungültiges JSON ({exc})")
        return

    def err(msg: str) -> None:
        errors.append(f"{name}: {msg}")

    # id / Dateiname
    rid = r.get("id")
    if not isinstance(rid, str) or not SLUG_RE.match(rid or ""):
        err(f"'id' fehlt oder ist kein gültiger Slug: {rid!r}")
    elif f"{rid}.json" != name:
        err(f"'id' ({rid}) passt nicht zum Dateinamen ({name})")

    for field in ("title", "category", "dateAdded"):
        if not isinstance(r.get(field), str) or not r.get(field):
            err(f"Pflichtfeld '{field}' fehlt oder ist leer")

    if isinstance(r.get("dateAdded"), str) and not DATE_RE.match(r["dateAdded"]):
        err(f"'dateAdded' hat kein ISO-Format: {r['dateAdded']!r}")

    if r.get("category") not in categories:
        err(f"Kategorie {r.get('category')!r} nicht in data/categories.json")

    check_yield(r.get("yield"), err)
    check_ingredients(r.get("ingredients"), err)
    check_steps(r.get("steps"), err)

    # variations (optional)
    if "variations" in r:
        check_variations(r["variations"], err)

    # images
    imgs = r.get("images")
    if imgs is not None:
        if not isinstance(imgs, list):
            err("'images' muss eine Liste sein")
        else:
            for img in imgs:
                used_images.add(img)
                if not os.path.exists(os.path.join(IMAGES_DIR, img)):
                    err(f"referenziertes Bild fehlt: {img}")

    # optionale Objektfelder
    src = r.get("source")
    if src is not None and not isinstance(src, dict):
        err("'source' muss ein Objekt sein")


def main() -> int:
    categories = load_categories()
    cat_set = set(categories)
    errors: list[str] = []
    used_images: set[str] = set()

    files = sorted(
        f for f in os.listdir(RECIPES_DIR)
        if f.endswith(".json")
    ) if os.path.isdir(RECIPES_DIR) else []

    if not files:
        print("Keine Rezepte in recipes/ gefunden.", file=sys.stderr)
        return 1

    ids: dict[str, str] = {}
    titles: dict[str, str] = {}
    for f in files:
        path = os.path.join(RECIPES_DIR, f)
        with open(path, encoding="utf-8") as fh:
            try:
                data = json.load(fh)
            except json.JSONDecodeError:
                data = {}
        rid = data.get("id")
        if rid in ids:
            errors.append(f"{f}: doppelte id {rid!r} (auch in {ids[rid]})")
        elif rid:
            ids[rid] = f
        title = data.get("title")
        if isinstance(title, str) and title:
            if title in titles:
                errors.append(f"{f}: doppelter title {title!r} (auch in {titles[title]})")
            else:
                titles[title] = f
        validate_recipe(path, cat_set, errors, used_images)

    # verwaiste Bilder
    if os.path.isdir(IMAGES_DIR):
        on_disk = {f for f in os.listdir(IMAGES_DIR) if not f.startswith(".")}
        orphans = on_disk - used_images
        for o in sorted(orphans):
            errors.append(f"images/{o}: verwaistes Bild (von keinem Rezept referenziert)")

    if errors:
        print(f"❌ {len(errors)} Fehler in {len(files)} Rezepten:\n", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        return 1

    print(f"✅ {len(files)} Rezepte valide, {len(used_images)} Bilder referenziert.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
