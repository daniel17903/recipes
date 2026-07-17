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

    # yield
    y = r.get("yield")
    if not isinstance(y, dict) or "amount" not in y or "unit" not in y:
        err("'yield' fehlt oder unvollständig (amount/unit)")
    else:
        if not isinstance(y["amount"], (int, float)) or y["amount"] <= 0:
            err(f"'yield.amount' muss eine positive Zahl sein: {y['amount']!r}")
        if not isinstance(y["unit"], str) or not y["unit"]:
            err("'yield.unit' muss ein nicht-leerer String sein")
        elif isinstance(y["unit"], str):
            unit = y["unit"]
            if "  " in unit:
                err(f"'yield.unit' enthält Doppel-Leerzeichen: {unit!r}")
            if YIELD_UNIT_EMPTY_PARENS_RE.search(unit):
                err(f"'yield.unit' enthält leere Klammer-Reste: {unit!r}")
            if unit.lower() in YIELD_UNIT_BAD_VALUES:
                err(f"'yield.unit' ist unnormalisiert: {unit!r} (erwartet 'Portionen')")
            if unit.startswith("cm "):
                err(f"'yield.unit' beginnt mit 'cm ': {unit!r}")

    # ingredients
    ings = r.get("ingredients")
    if not isinstance(ings, list) or not ings:
        err("'ingredients' fehlt oder ist leer")
    else:
        for i, ing in enumerate(ings):
            loc = f"ingredients[{i}]"
            if not isinstance(ing, dict):
                err(f"{loc} ist kein Objekt")
                continue
            for key in ("group", "amount", "unit", "name"):
                if key not in ing:
                    err(f"{loc}: Feld '{key}' fehlt")
            if not isinstance(ing.get("name"), str) or not ing.get("name"):
                err(f"{loc}: 'name' fehlt oder leer")
            amt = ing.get("amount")
            if amt is not None and not isinstance(amt, (int, float)):
                err(f"{loc}: 'amount' muss Zahl oder null sein: {amt!r}")
            unit = ing.get("unit")
            if unit in FORBIDDEN_UNITS:
                err(f"{loc}: verbotene Einheit {unit!r} (umrechnen!)")
            elif unit not in ALLOWED_UNITS:
                err(f"{loc}: unbekannte Einheit {unit!r}")
            grp = ing.get("group")
            if grp is not None and not isinstance(grp, str):
                err(f"{loc}: 'group' muss String oder null sein")

    # steps
    steps = r.get("steps")
    if not isinstance(steps, list) or not steps:
        err("'steps' fehlt oder ist leer")
    elif any(not isinstance(s, str) or not s.strip() for s in steps):
        err("'steps' enthält leere Einträge")

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
