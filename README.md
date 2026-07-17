# 🍰 Kochbuch

Ein KI-gepflegtes Rezept-Kochbuch. Alle Rezepte liegen als JSON-Dateien im
Repository; die Website wird automatisch über GitHub Pages veröffentlicht.

**➡️ Website: <https://daniel17903.github.io/recipes/>**

## Features

- **Übersicht** als responsives Rezeptkarten-Grid (mobile-first).
- **Kategorie-Filter** als Chip-Leiste mit Anzahl je Kategorie.
- **Live-Suche** über Titel, Zutaten und Kategorie – umlaut-tolerant
  (`käse` = `kase` = `kaese`) und mit dem Filter kombinierbar.
- **Portionen-Skalierung**: Zutatenmengen skalieren linear per Stepper.
- **Direktlinks** zu jedem Rezept (`#/rezept/<id>`) und teilbare Filter-URLs.
- **Druckfreundliche** Rezeptansicht.

## Aufbau

| Pfad | Zweck |
|---|---|
| `recipes/*.json` | ein Rezept pro Datei |
| `recipes/images/` | Bilder als WebP |
| `data/categories.json` | gültige Kategorien |
| `data/unit-conversions.json` | Umrechnung EL/TL/Tasse → g/ml |
| `schema/recipe.schema.json` | JSON-Schema der Rezepte |
| `scripts/validate.py` | prüft alle Rezepte (ohne Abhängigkeiten) |
| `scripts/build.py` | baut die Website nach `_site/` |
| `site/` | Single-Page-App (Vanilla JS) |

## Lokal bauen & ansehen

```bash
python scripts/validate.py                 # Rezepte prüfen
python scripts/build.py                    # Website nach _site/ bauen
python -m http.server -d _site             # http://localhost:8000
```

Nur die Bild-Konvertierung benötigt einmalig [Pillow](https://python-pillow.org/);
`validate.py` und `build.py` laufen mit der Python-Standardbibliothek.

## Rezepte hinzufügen

Rezepte werden in einer Claude-Code-Session gepflegt – Regeln und Schema stehen
in [`CLAUDE.md`](CLAUDE.md). Nach dem Push auf `main` deployt GitHub Actions die
Website automatisch neu.
