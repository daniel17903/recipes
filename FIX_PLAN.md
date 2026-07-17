# Fix-Plan: Korrekturen nach Review des Rezept-Imports

Dieses Dokument ist ein vollständiger, von einem KI-Agenten auszuführender
Korrekturplan. Grundlage ist ein Review des Imports auf `main` gegen den
Original-Export und den ursprünglichen Implementierungsplan. Alle Soll-Werte
unten wurden bereits gegen die Original-HTML-Dateien verifiziert — sie können
direkt übernommen werden, der Original-Export wird nicht benötigt.

Arbeitsweise: Änderungen auf einem Branch entwickeln, vor jedem Commit
`python scripts/validate.py` ausführen (muss fehlerfrei sein), am Ende
`python scripts/build.py` und die Abnahme-Checks unten. Regeln aus `CLAUDE.md`
gelten unverändert.

---

## Fix 1 (Bug): `yield` in 12 Rezepten reparieren

Der Import hat Ziffern aus dem `yield.unit`-Text entfernt und Formangaben
(„26cm Form") fälschlich als skalierbare Portionszahl interpretiert — der
Portionen-Stepper skaliert dort Zentimeter. Exakte Soll-Werte:

| Datei (`recipes/…`) | Ist | Soll |
|---|---|---|
| `vanillekipferl.json` | `{1, "Blech ( Stück)"}` | `{"amount": 35, "unit": "Stück"}` (Original: „1 Blech (35 Stück)") |
| `beerentorte.json` | `{1, "torte (ø  cm)"}` | `{"amount": 1, "unit": "Torte (ø 18 cm)"}` |
| `rhabarber-blechkuchen.json` | `{1, "standardbackblech ( x  cm)"}` | `{"amount": 1, "unit": "Standardbackblech (30 x 40 cm)"}` |
| `apfel-moehren-gewuerzkuchen-mit-pumpkin-spice.json` | `{1, "standardbackblech ca. xcm"}` | `{"amount": 1, "unit": "Standardbackblech (ca. 30 x 40 cm)"}` |
| `vegane-pancakes.json` | `{12, "ca  Pancakes"}` | `{"amount": 12, "unit": "Pancakes"}` |
| `schoko-mousse.json` | `{4, "ca  kleine Gläser"}` | `{"amount": 4, "unit": "kleine Gläser"}` |
| `suesskartoffel-brownies.json` | `{1, "cm Form"}` | `{"amount": 1, "unit": "26cm-Form"}` (Original: „1 26cm Form") |
| `apfel-pudding-kuchen.json` | `{26, "cm Form"}` | `{"amount": 1, "unit": "26cm-Form"}` |
| `schokokuchen-mit-frosting.json` | `{26, "cm Form"}` | `{"amount": 1, "unit": "26cm-Form"}` |
| `schwarzwaelder-kirschtorte.json` | `{22, "cm Form"}` | `{"amount": 1, "unit": "22cm-Form"}` |
| `schoko-kaesekuchen.json` | `{22, "cm Form"}` | `{"amount": 1, "unit": "22cm-Form"}` |
| `bienenstich.json` | `{46, "cm Form"}` | `{"amount": 1, "unit": "26cm-Form"}` — Original lautete kryptisch „46-26cm Form"; Interpretation als 26cm-Form in der Commit-Message dokumentieren |

Zusätzlich unnormalisierte Labels vereinheitlichen (reine String-Ersetzung in
`yield.unit`, Werte/`amount` unverändert):

- `"portion(en)"` → `"Portionen"` (12 Dateien: `dampfnudeln`,
  `kuerbis-rosenkohl-maronen-pfanne`, `geroesteter-rote-bete-hummus`,
  `saftiges-vollkornbrot`, `pasta-mit-brokkoli`, `orangen-schoko-cookies`,
  `rotkohl-apfel-salat`, `gruenkohlchips`, `reis-mit-bohnen`,
  `rote-linsen-curry-mit-suesskartoffeln`, `bananenbrot`, + ggf. weitere —
  per grep über `recipes/*.json` finden)
- `"portions"` → `"Portionen"` (`dattel-aprikose-zopf.json`)
- `"stück"`/`"stücke"` → `"Stück"` (`vegane-nussmakronen.json`,
  `zitronen-upside-down-kuchen.json`)
- `"brötchen"` → `"Brötchen"` (`pizzabroetchen.json`,
  `vollwertige-rosinenbroetchen.json`)

Danach per Skript prüfen: kein `yield.unit` enthält Doppel-Leerzeichen, leere
Klammern (`( )`, `( x  cm)`, `(ø  cm)`), `portion(en)`, `portions`, oder
beginnt mit `cm `.

## Fix 2 (Bug): Falsche Umrechnungen in `orangen-zimt-weihnachtskekse.json`

Drei Zutaten wurden falsch umgerechnet (Original: „1/2 cup water",
„2 cups ground almonds", „1 3/4 cup ground hazelnuts"; Tabellenwerte aus
`data/unit-conversions.json`: Wasser 240 ml/Cup, gemahlene Nüsse 100 g/Cup):

| Zutat | Ist | Soll |
|---|---|---|
| `Wasser` (Gruppe „Teig") | `60 ml` | **`120 ml`** |
| `gemahlene Mandeln` | `240 g` | **`200 g`** |
| `gemahlene Haselnüsse` | `210 g` | **`175 g`** |

Notes (`"ca. 1/2 Tasse"` usw.) unverändert lassen. Danach alle übrigen
Zutaten dieses Rezepts einmal gegen die Tabelle nachrechnen (Stichprobe beim
Review: Rest war korrekt).

## Fix 3: Doppelter Titel „Rhabarber-Blechkuchen"

`rhabarber-blechkuchen.json` (Quelle: vegan-taste-week.de) und
`rhabarber-blechkuchen-2.json` (ohne Quelle) tragen denselben Titel und sind
auf der Website nicht unterscheidbar.

1. Beide Rezepte inhaltlich vergleichen (Zutaten/Zubereitung).
2. **Falls praktisch identisch:** `rhabarber-blechkuchen-2.json` löschen und
   die Löschung in der Commit-Message begründen.
3. **Falls verschieden:** beide Titel anhand des tatsächlichen Unterschieds
   differenzieren (z. B. „Rhabarber-Blechkuchen mit Streuseln" /
   „… mit Quark-Öl-Teig" — aus dem Inhalt ableiten, nicht raten; notfalls
   „Rhabarber-Blechkuchen (Variante 2)").
4. **`id`s und Dateinamen unverändert lassen** (Links bleiben stabil), nur
   `title` ändern.

## Fix 4: EL/TL-Reste in Zutaten-`name`-Feldern (9 Stellen)

Regel: Steckt die eigentliche Menge im Text → umrechnen (Tabelle in
`data/unit-conversions.json`, bei fehlenden Zutaten Tabelle mit recherchierten
Werten erweitern). Ist es nur eine Alternative/Beschreibung → Text nach
`note` verschieben, `name` auf die reine Zutat kürzen.

| Datei | Zutat (Ist) | Soll |
|---|---|---|
| `bananenbrot.json` | `name: "Zimt, ich nehme 1 TL voll"`, amount null | `{"amount": 3, "unit": "g", "name": "Zimt", "note": "entspricht 1 TL"}` |
| `gesunder-schokokuchen.json` | `name: "optional: 1 Tasse Espresso (40 ml)"` | `{"amount": 40, "unit": "ml", "name": "Espresso", "note": "optional"}` |
| `linzertorte.json` | `name: "pürierte Himbeeren + 2 EL Chiasamen (30min quellen lassen)"` | Chiasamen als eigene Zutat in g (≈ 10 g/EL → 20 g; Wert recherchieren und in `unit-conversions.json` eintragen), Rest in `name`/`note` aufteilen |
| `apfel-moehren-gewuerzkuchen-mit-pumpkin-spice.json` | Pumpkin-Spice-Alternativmischung im `name` | `name: "Pumpkin Spice"`, Alternativmischung (mit EL/TL-Angaben) nach `note` |
| `apfel-pudding-kuchen.json` | „…oder 40 g Speisestärke + 1 TL Vanilleextrakt" | Alternative nach `note` |
| `kaesekuchen.json` | „…oder 80g Speisestärke + 1/2 TL Vanille" | Alternative nach `note` |
| `kuerbiskern-cookies.json` | Leinsamenei-Anleitung im `name` | `name: "Leinsamenei"`, Anleitung nach `note` |
| `rauchige-schwarzaugenbohnen-kohlblaetter.json` | „…oder 1/4 TL Kurkumapulver" | Alternative nach `note` |
| `vollwertige-rosinenbroetchen.json` | „ein wenig Hefe (ca 1/2 TL Trockenhefe …)" | `name: "Hefe"`, Mengenbeschreibung nach `note` |

Optional (geringe Priorität, nur wenn ohne Bedeutungsverlust möglich): grob
verunglückte `name`-Texte in `name` + `note` aufteilen, z. B. Bananenbrot
`"Vollkornmehl ,ich nehme Weizenvollkornmehl, alternativ geht auch …"` →
`name: "Vollkornmehl"`, Rest als `note`. Keinen Volltext-Umbau aller 102
Rezepte — nur offensichtliche Fälle.

## Fix 5 (Polish)

1. **Singular-Anzeige:** `site/app.js` — zeigt aktuell „1 Portionen". In der
   Rezeptansicht das Einheiten-Label singularisieren, wenn der eingegebene
   Wert 1 ist: Mapping `{"Portionen": "Portion", "Pancakes": "Pancake",
   "kleine Gläser": "kleines Glas"}`, sonst Label unverändert. Achtung: das
   Label muss beim Ändern des Steppers mit aktualisiert werden (derzeit wird
   nur `#ing-list` neu gerendert).
2. **Bilder:** `orangen-schoko-cookies.webp` (244 KB) und `broetchen.webp`
   (212 KB) auf < 200 KB nachkomprimieren (Qualität senken, nicht Auflösung,
   solange < 200 KB erreichbar).
3. **Validator härten** (`scripts/validate.py`), damit diese Fehlerklassen
   künftig CI brechen:
   - `yield.unit`: Fehler bei Doppel-Leerzeichen, leeren Klammer-Resten
     (Regex `\(\s*(x|ø)?\s*\)` bzw. `\(\s*x\s*cm\s*\)`-artige Muster),
     exaktem Wert `portion(en)`/`portions`, oder Beginn mit `cm `.
   - **Titel-Eindeutigkeit:** doppelte `title`-Werte über alle Rezepte sind
     ein Fehler (analog zur bestehenden `id`-Prüfung).
4. **Branch-Hygiene:** nach Merge dieses Fixes den Branch
   `claude/ai-recipe-cookbook-plan-hg4b6w` und dieses `FIX_PLAN.md` löschen.

## Abnahme

- [ ] `python scripts/validate.py` fehlerfrei (inkl. neuer Prüfungen).
- [ ] `grep -E '"unit": *"(cm Form|ca  |portion)' recipes/*.json` liefert nichts;
      kein `yield.unit` mit Doppel-Leerzeichen oder leeren Klammern.
- [ ] `orangen-zimt-weihnachtskekse.json`: Wasser 120 ml, Mandeln 200 g,
      Haselnüsse 175 g.
- [ ] Keine zwei Rezepte mit identischem `title`.
- [ ] Die 9 Zutaten aus Fix 4 enthalten keine unkonvertierten Primärmengen
      mehr im `name`; Alternativen stehen in `note`.
- [ ] Website-Kontrolle (lokal `python scripts/build.py && python -m
      http.server -d _site`): Rezeptansicht von `apfel-pudding-kuchen` zeigt
      „1 26cm-Form" und skaliert die Zutaten sinnvoll; `bananenbrot` zeigt
      „12 Portionen", bei Eingabe 1 „Portion"; alle Bilder < 200 KB.
- [ ] CI auf `main` grün, Deployment erfolgreich.

Anzahl der Rezepte (102) darf sich nur durch Fix 3 Schritt 2 (Duplikat-
Löschung) auf 101 ändern.
