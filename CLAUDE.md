# CLAUDE.md – Regeln für KI-Agenten

Dieses Repository ist ein **KI-gepflegtes Rezept-Kochbuch**. Rezepte liegen als
JSON-Dateien in `recipes/`, die Website (`site/`) wird über GitHub Pages
veröffentlicht: <https://daniel17903.github.io/recipes/>.

Neue Rezepte werden direkt in einer Claude-Code-Session hinzugefügt: Der Nutzer
liefert eine URL, einen Text oder ein Foto, und der Agent legt daraus ein
schemakonformes Rezept an.

## Repository-Aufbau

```
data/categories.json        gültige Kategorien (geordnet)
data/unit-conversions.json  Umrechnung EL/TL/Tasse -> g/ml
schema/recipe.schema.json   JSON-Schema (Draft 2020-12)
recipes/<slug>.json         ein Rezept pro Datei
recipes/images/<slug>.webp  Bilder (WebP, ≤ 1200 px)
scripts/validate.py         prüft alle Rezepte (keine Abhängigkeiten)
scripts/build.py            baut _site/ (Website + gebündeltes recipes.json)
site/                       Single-Page-App (Vanilla JS, mobile-first)
```

## Ein Rezept hinzufügen

1. **Sprache Deutsch.** Nicht-deutsche Rezepte (Titel, Zutaten, Schritte)
   vollständig übersetzen. Offensichtliche Tippfehler korrigieren.
2. **Schema einhalten** (`schema/recipe.schema.json`). Englische Schlüssel,
   deutsche Werte. Pflichtfelder: `id`, `title`, `category`, `yield`,
   `ingredients`, `steps`, `dateAdded`. Optionale Felder weglassen statt leer.
3. **`id` / Slug:** aus dem Titel, klein, `ä→ae ö→oe ü→ue ß→ss`,
   Nicht-Alphanumerisches → `-`. Muss eindeutig sein und dem Dateinamen
   entsprechen.
4. **Genau eine `category`** aus `data/categories.json`. Neue Kategorien nur
   auf ausdrücklichen Nutzerwunsch anlegen (dann in `data/categories.json`
   eintragen).
5. **Einheiten-Regel (verbindlich):**
   - `EL`, `TL`, `Tasse`/`cup` **immer umrechnen** – feste Zutaten in **g**,
     Flüssigkeiten in **ml**. Basis: 1 Tasse = 240 ml, 1 EL = 15 ml,
     1 TL = 5 ml, je × zutatenspezifischer Dichte aus
     `data/unit-conversions.json` (Tabelle bei Bedarf erweitern – Werte
     recherchieren, nicht raten).
   - Erhalten bleiben: `ml` (Flüssigkeiten), `Prise`, `Msp.`, `Pck.`, `Stück`,
     `Blatt`, `Zehe`, `Bund`, `Dose`, `Glas`.
   - Erlaubte `unit`-Werte: `g`, `ml`, `Stück`, `Pck.`, `Prise`, `Msp.`,
     `Blatt`, `Zehe`, `Bund`, `Dose`, `Glas`, `null`. **Niemals** `EL`, `TL`,
     `Tasse`, `cup`.
   - Original-Angabe in `note` dokumentieren (`"entspricht 1 TL"`).
   - Mengen immer als **Zahl** (`amount`) erfassen (auch `½` → `0.5`), damit die
     Website skalieren kann. `null` = „nach Geschmack".
6. **Bilder:** als **WebP**, lange Kante ≤ 1200 px, nach `recipes/images/`
   als `<slug>.webp` (weitere: `<slug>-2.webp` …). Im Rezept unter `images`
   referenzieren.
7. **Schritte:** Fließtext in sinnvolle, nummerierbare Schritte gliedern.

## Vor jedem Commit

```bash
python scripts/validate.py      # muss fehlerfrei durchlaufen
```

Lokale Vorschau:

```bash
python scripts/build.py && python -m http.server -d _site
```

## Deployment

Automatisch bei jedem Push auf `main` (GitHub Actions → GitHub Pages,
`.github/workflows/deploy.yml`). Kein manueller Schritt nötig.

## Commit-Konvention

- Neues Rezept: `Rezept hinzugefügt: <Titel>`
- Änderung: `Rezept aktualisiert: <Titel>`
- Sonstiges: kurze, beschreibende Nachricht.
