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
8. **Varianten:** Ist ein neues Rezept nur eine Abwandlung eines bestehenden
   (gleiches Gericht, andere Ausführung – z. B. vegan, mit Chiasamen, andere
   Backform), als Eintrag im optionalen `variations`-Array des bestehenden
   Rezepts anlegen statt als eigene Datei. Jede Variante braucht `id` (Slug,
   eindeutig innerhalb des Rezepts) und `title`; optional sind `description`,
   `yield`, `times`, `ingredients`, `steps`, `notes`, `source`. Angegebene
   Felder ersetzen das jeweilige Feld des Basisrezepts **vollständig**,
   weggelassene Felder werden geerbt. Ein anderes Gericht bleibt eine eigene
   Datei. Die Website zeigt Varianten als Umschalter auf der Rezeptseite
   (`#/rezept/<id>?variante=<varianten-id>`).

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

## Service Worker / PWA-Cache (wichtig bei Änderungen an `site/`)

Die Seite ist eine installierbare PWA. `site/sw.js` cacht die App-Shell
(`index.html`, `style.css`, `app.js`, Icons, `recipes.json`, Bilder).

- **Cache-Key ist automatisch.** `site/sw.js` enthält den Platzhalter
  `kochbuch-__BUILD_HASH__`; `scripts/build.py` ersetzt ihn durch einen
  Inhalts-Hash über `index.html`, `style.css`, `app.js`,
  `manifest.webmanifest`, `sw.js` und `recipes.json`. Jede relevante
  Änderung erzeugt also ein byte-verschiedenes `sw.js` → der Worker
  installiert neu und lädt alle Dateien frisch. **Kein manuelles Hochzählen
  von `CACHE_NAME` nötig** – einfach `build.py` laufen lassen (macht der
  Deploy-Workflow ohnehin).
- **Statische Assets** (CSS/JS) laufen über **stale-while-revalidate**: Sie
  werden sofort aus dem Cache geliefert und im Hintergrund neu geladen.
  Änderungen erscheinen dadurch in der installierten PWA **erst beim
  übernächsten Öffnen** – niemals sofort. Das ist gewollt (Offline-Fähigkeit),
  aber beim Testen daran denken.
- `index.html` und `recipes.json` laufen **network-first**, kommen also
  (online) sofort aktuell an.
- Immer über `scripts/build.py` ausliefern/testen, nie `site/` direkt – sonst
  bleibt der Platzhalter `__BUILD_HASH__` stehen und der Cache bricht nie um.

## Commit-Konvention

- Neues Rezept: `Rezept hinzugefügt: <Titel>`
- Änderung: `Rezept aktualisiert: <Titel>`
- Sonstiges: kurze, beschreibende Nachricht.
