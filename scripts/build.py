#!/usr/bin/env python3
"""Baut die statische Website nach _site/.

- kopiert site/ (index.html, app.js, style.css) nach _site/
- bündelt alle recipes/*.json + data/categories.json zu _site/recipes.json
- kopiert recipes/images/ nach _site/images/

Nur relative Pfade -> läuft unter https://<user>.github.io/recipes/.
Aufruf:  python scripts/build.py
"""
from __future__ import annotations
import json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
RECIPES = os.path.join(ROOT, "recipes")
IMAGES = os.path.join(RECIPES, "images")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "_site")


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    # statische Dateien
    for name in os.listdir(SITE):
        src = os.path.join(SITE, name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(OUT, name))
        elif os.path.isdir(src):
            shutil.copytree(src, os.path.join(OUT, name))

    # Rezepte bündeln
    recipes = []
    for f in sorted(os.listdir(RECIPES)):
        if f.endswith(".json"):
            with open(os.path.join(RECIPES, f), encoding="utf-8") as fh:
                recipes.append(json.load(fh))

    with open(os.path.join(DATA, "categories.json"), encoding="utf-8") as fh:
        categories = json.load(fh)

    # Kategorien nur behalten, wenn belegt; Zählung mitgeben
    counts = {}
    for r in recipes:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    categories = [c for c in categories if counts.get(c)]

    recipes.sort(key=lambda r: r["title"].lower())

    bundle = {
        "categories": categories,
        "counts": counts,
        "recipes": recipes,
        "count": len(recipes),
    }
    with open(os.path.join(OUT, "recipes.json"), "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, ensure_ascii=False, separators=(",", ":"))

    # Bilder
    if os.path.isdir(IMAGES):
        shutil.copytree(IMAGES, os.path.join(OUT, "images"))

    # .nojekyll, damit GitHub Pages nichts umschreibt
    open(os.path.join(OUT, ".nojekyll"), "w").close()

    print(f"✅ _site/ gebaut: {len(recipes)} Rezepte, "
          f"{len(categories)} Kategorien.")


if __name__ == "__main__":
    main()
