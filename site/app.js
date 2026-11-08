"use strict";

// ---------------------------------------------------------------------------
// Datenladen
// ---------------------------------------------------------------------------
let DATA = null;
const app = document.getElementById("app");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

fetch("recipes.json")
  .then((r) => r.json())
  .then((data) => {
    DATA = data;
    data.byId = {};
    data.recipes.forEach((r) => (data.byId[r.id] = r));
    data.recipes.forEach((r) => (r._hay = haystacks(r)));
    const total = document.getElementById("recipe-total");
    if (total) total.textContent = `${data.count} Rezepte`;
    render();
  })
  .catch(() => {
    app.innerHTML = `<p class="empty">Rezepte konnten nicht geladen werden.</p>`;
  });

window.addEventListener("hashchange", render);

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------
// Umlaute auf Grundvokal falten (ä->a). "käse", "kase" -> "kase".
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}
// Zusätzliche ae/oe/ue-Faltung, damit auch "kaese" gefunden wird.
function normalizeAe(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Beide Faltungen in einem Suchfeld, damit "käse", "kase" und "kaese" treffen.
function folded(parts) {
  const joined = parts.filter(Boolean).join(" ");
  return normalize(joined) + " " + normalizeAe(joined);
}

// Drei getrennte Suchfelder: Titel schlägt Zutaten, Zutaten schlagen Fließtext.
function haystacks(r) {
  const titles = [r.title];
  const ings = [];
  const text = [r.category, r.notes, r.source && r.source.name, ...(r.steps || [])];

  r.ingredients.forEach((i) => ings.push(i.name, i.note));
  r.ingredients.forEach((i) => text.push(i.group));
  (r.variations || []).forEach((v) => {
    titles.push(v.title);
    (v.ingredients || []).forEach((i) => {
      ings.push(i.name, i.note);
      text.push(i.group);
    });
    text.push(v.description, v.notes, v.source && v.source.name, ...(v.steps || []));
  });

  return { title: folded(titles), ing: folded(ings), text: folded(text) };
}

// 3 = Titeltreffer, 2 = Zutatentreffer, 1 = Treffer im übrigen Text, 0 = kein Treffer.
function searchScore(r, nq) {
  if (!nq) return 0;
  if (r._hay.title.includes(nq)) return 3;
  if (r._hay.ing.includes(nq)) return 2;
  if (r._hay.text.includes(nq)) return 1;
  return 0;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const FRACTIONS = [
  [1, "1"], [0.875, "⅞"], [0.8, "⅘"], [0.75, "¾"], [0.6667, "⅔"], [0.625, "⅝"],
  [0.5, "½"], [0.375, "⅜"], [0.3333, "⅓"], [0.25, "¼"], [0.2, "⅕"], [0.125, "⅛"],
];

function fractionStr(v) {
  const whole = Math.floor(v);
  let frac = v - whole;
  let best = "", bestErr = 1;
  for (const [f, s] of FRACTIONS) {
    const err = Math.abs(frac - f);
    if (err < bestErr) { bestErr = err; best = s; }
  }
  if (bestErr < 0.08) {
    if (best === "1") return String(whole + 1);
    return whole > 0 ? `${whole} ${best}` : best;
  }
  const rounded = Math.round(v * 10) / 10;
  return String(rounded).replace(".", ",");
}

function formatAmount(amount, unit, factor) {
  if (amount == null) return "";
  const v = amount * factor;
  if (unit === "g" || unit === "ml") {
    const val = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    return String(val).replace(".", ",");
  }
  // Stückzahlen & Co -> gängige Brüche
  return fractionStr(v);
}

// ---------------------------------------------------------------------------
// Routing / State (im Hash)
// ---------------------------------------------------------------------------
function parseHash() {
  const h = location.hash.replace(/^#/, "");
  const m = h.match(/^\/rezept\/([^?]+)(?:\?(.*))?$/);
  if (m) {
    const vm = (m[2] || "").match(/(?:^|&)variante=([^&]*)/);
    return {
      view: "recipe",
      id: decodeURIComponent(m[1]),
      variante: vm ? decodeURIComponent(vm[1]) : "",
    };
  }
  const q = h.match(/[?&]q=([^&]*)/);
  const kat = h.match(/[?&]kategorie=([^&]*)/);
  return {
    view: "list",
    q: q ? decodeURIComponent(q[1]) : "",
    kategorie: kat ? decodeURIComponent(kat[1]) : "",
  };
}

function listHash(q, kategorie) {
  const p = [];
  if (kategorie) p.push("kategorie=" + encodeURIComponent(kategorie));
  if (q) p.push("q=" + encodeURIComponent(q));
  return "#/" + (p.length ? "?" + p.join("&") : "");
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  if (!DATA) return;
  const state = parseHash();
  if (state.view === "recipe" && DATA.byId[state.id]) {
    renderRecipe(DATA.byId[state.id], state.variante);
  } else {
    renderList(state);
  }
  window.scrollTo(0, 0);
}

function filterRecipes(q, kat) {
  const nq = normalize(q);
  let list = DATA.recipes;
  if (kat) list = list.filter((r) => r.category === kat);
  if (nq) list = list.filter((r) => searchScore(r, nq) > 0);
  return list;
}

function renderList(state) {
  const q = state.q || "";
  const kat = state.kategorie || "";

  const list = filterRecipes(q, kat);

  // Kategorien nach Summe der Klicks ihrer Rezepte sortieren
  const clicks = loadClicks();
  const catClicks = {};
  DATA.recipes.forEach((r) => {
    catClicks[r.category] = (catClicks[r.category] || 0) + (clicks[r.id] || 0);
  });
  const categories = DATA.categories.slice().sort(
    (a, b) => (catClicks[b] || 0) - (catClicks[a] || 0));

  const chips = [
    `<button class="chip" data-kat="" aria-pressed="${kat === "" ? "true" : "false"}">Alle <span class="count">${DATA.count}</span></button>`,
    ...categories.map((c) =>
      `<button class="chip" data-kat="${esc(c)}" aria-pressed="${kat === c ? "true" : "false"}">${esc(c)} <span class="count">${DATA.counts[c] || 0}</span></button>`),
  ].join("");

  app.innerHTML = `
    <div class="controls">
      <div class="search-wrap${q ? " has-value" : ""}">
        <span class="search-icon" aria-hidden="true">${SEARCH_ICON}</span>
        <input class="search" id="search" type="search" inputmode="search"
          placeholder="Rezept, Zutat, Kategorie …" value="${esc(q)}"
          autocomplete="off" aria-label="Rezepte durchsuchen">
        <button class="search-clear" id="search-clear" type="button"
          aria-label="Suche löschen">${CLEAR_ICON}</button>
      </div>
      <div class="chips" role="group" aria-label="Kategorien">${chips}</div>
    </div>
    <div id="results">${resultsHtml(list, q, kat)}</div>
  `;

  const search = document.getElementById("search");
  const searchWrap = search.parentElement;
  let t;
  search.addEventListener("input", () => {
    searchWrap.classList.toggle("has-value", search.value !== "");
    clearTimeout(t);
    t = setTimeout(() => {
      const cur = parseHash();
      history.replaceState(null, "", listHash(search.value, cur.kategorie || kat));
      updateResults(search.value, kat);
    }, 120);
  });

  document.getElementById("search-clear").addEventListener("click", () => {
    clearTimeout(t);
    search.value = "";
    searchWrap.classList.remove("has-value");
    const cur = parseHash();
    history.replaceState(null, "", listHash("", cur.kategorie || kat));
    updateResults("", kat);
    search.focus();
  });

  app.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newKat = btn.dataset.kat;
      location.hash = listHash(search.value, newKat);
    });
  });

}

function updateResults(q, kat) {
  document.getElementById("results").innerHTML = resultsHtml(filterRecipes(q, kat), q, kat);
}

const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.2" stroke="currentColor" stroke-width="1.6"></circle><line x1="11" y1="11" x2="14.4" y2="14.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line></svg>`;
const CLEAR_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></line><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></line></svg>`;

// Tipp des Tages: deterministisch pro Kalendertag, damit alle Besucher denselben sehen.
function tippOfTheDay() {
  if (!DATA.recipes.length) return null;
  const today = new Date();
  const seed = today.getFullYear() * 372 + (today.getMonth() + 1) * 31 + today.getDate();
  return DATA.recipes[seed % DATA.recipes.length].id;
}

function resultsHtml(list, q, kat) {
  if (!list.length) return `<p class="empty">Hmm, dazu findet sich nichts. Probier's mal anders! 🍳</p>`;
  // Meistgeklickte zuerst; bei Gleichstand bleibt die alphabetische Reihenfolge
  list = sortByClicks(list);
  // Bei einer Suche zählt zuerst, wo der Treffer sitzt: Titel vor Zutaten vor
  // Fließtext. Der stabile Sort erhält innerhalb einer Stufe die Klick-Reihenfolge.
  const nq = normalize(q);
  if (nq) list.sort((a, b) => searchScore(b, nq) - searchScore(a, nq));
  const editorial = !q && !kat;
  const tippId = editorial ? tippOfTheDay() : null;
  if (tippId) list = [...list].sort((a, b) => (a.id === tippId ? -1 : 0) - (b.id === tippId ? -1 : 0));
  return `<div class="grid">${list.map((r, idx) => card(r, editorial && idx === 0)).join("")}</div>`;
}

function card(r, featured) {
  const img = r.images && r.images.length
    ? `<img class="card-img" loading="lazy" src="images/${esc(r.images[0])}" alt="${esc(r.title)}">`
    : `<div class="card-noimg" aria-hidden="true">🍽️</div>`;
  return `<a class="card${featured ? " featured" : ""}" data-id="${esc(r.id)}" href="#/rezept/${encodeURIComponent(r.id)}">
    <div class="card-media">
      ${img}
      ${featured ? `<span class="card-tipp">Tipp des Tages</span>` : ""}
    </div>
    <div class="card-body">
      <div class="card-cat">${esc(r.category)}</div>
      <h2 class="card-title">${esc(r.title)}</h2>
    </div>
  </a>`;
}

// Variante über das Basisrezept legen: Varianten überschreiben komplette
// Felder, alles andere wird geerbt.
const VARIANT_FIELDS = ["yield", "times", "ingredients", "steps", "notes", "source"];

function mergeVariant(r, v) {
  if (!v) return r;
  const m = Object.assign({}, r);
  VARIANT_FIELDS.forEach((k) => { if (v[k] !== undefined) m[k] = v[k]; });
  return m;
}

function recipeHash(id, variantId) {
  return "#/rezept/" + encodeURIComponent(id) +
    (variantId ? "?variante=" + encodeURIComponent(variantId) : "");
}

function renderRecipe(r, variantId) {
  const variations = r.variations || [];
  const active = variations.find((v) => v.id === variantId) || null;
  const m = mergeVariant(r, active);

  const base = m.yield ? m.yield.amount : 1;
  const unit = m.yield ? m.yield.unit : "Portionen";
  let hero = "";
  if (r.images && r.images.length) {
    hero = `<div class="recipe-hero"><img src="images/${esc(r.images[0])}" alt="${esc(r.title)}"></div>`;
  }
  const gallery = r.images && r.images.length > 1
    ? `<div class="recipe-gallery">${r.images.slice(1).map((i) =>
        `<img loading="lazy" src="images/${esc(i)}" alt="${esc(r.title)}">`).join("")}</div>`
    : "";

  const meta = [];
  if (m.times && m.times.prep) meta.push(`⏱ Vorbereitung: ${esc(m.times.prep)}`);
  if (m.times && m.times.cook) meta.push(`🔥 Backen/Kochen: ${esc(m.times.cook)}`);
  if (m.source && m.source.url) {
    const label = m.source.name || hostOf(m.source.url);
    meta.push(`Quelle: <a class="source-link" href="${esc(m.source.url)}" target="_blank" rel="noopener">${esc(label)}</a>`);
  } else if (m.source && m.source.name) {
    meta.push(`Quelle: ${esc(m.source.name)}`);
  }

  const variantTabs = variations.length
    ? `<div class="chips variants" role="group" aria-label="Varianten">
        <button class="chip" data-variant="" aria-pressed="${active ? "false" : "true"}">Original</button>
        ${variations.map((v) =>
          `<button class="chip" data-variant="${esc(v.id)}" aria-pressed="${active && active.id === v.id ? "true" : "false"}">${esc(v.title)}</button>`).join("")}
      </div>`
    : "";
  const variantDesc = active && active.description
    ? `<p class="variant-desc">${esc(active.description)}</p>`
    : "";

  app.innerHTML = `
    <button class="back" id="back">← Alle Rezepte</button>
    ${hero}
    <div class="recipe-cat">${esc(r.category)}</div>
    <h1 class="recipe-title">${esc(r.title)}</h1>
    ${variantTabs}
    ${variantDesc}
    ${meta.length ? `<div class="recipe-meta">${meta.join("")}</div>` : ""}
    ${gallery}

    <div class="recipe-body">
      <section class="panel ingredients-panel">
        <div class="yield-row">
          <h2>Zutaten</h2>
          <div class="stepper" role="group" aria-label="Portionen anpassen">
            <button id="dec" aria-label="weniger">−</button>
            <input id="portions" type="text" value="${fmtNum(base)}"
              inputmode="decimal" aria-label="Menge">
            <span class="yield-unit" id="yield-unit">${esc(yieldUnitLabel(unit, base))}</span>
            <button id="inc" aria-label="mehr">+</button>
          </div>
        </div>
        <div id="ing-list"></div>
      </section>

      <section class="panel steps-panel">
        <h2>Zubereitung</h2>
        <ol class="steps">${m.steps.map((s, i) => `<li>${stepHtml(s, i + 1)}</li>`).join("")}</ol>
      </section>
    </div>

    ${m.notes ? `<section class="panel"><h2>Notizen</h2><p class="notes">${esc(m.notes)}</p></section>` : ""}
    ${r.nutrition ? `<section class="panel"><h2>Nährwerte</h2><p class="notes">${esc(r.nutrition)}</p></section>` : ""}
  `;

  app.querySelectorAll(".step-timer").forEach((btn) => {
    btn.addEventListener("click", () => {
      startTimer(Number(btn.dataset.seconds), btn.dataset.label, recipeHash(r.id, active ? active.id : ""), r.title);
    });
  });

  document.getElementById("back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = "#/";
  });

  app.querySelectorAll(".variants .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Variante wechseln, ohne einen neuen History-Eintrag zu erzeugen: sonst
      // führt "← Alle Rezepte" (history.back) nur zur vorherigen Variante zurück
      // statt zur Übersicht. Wie bei der Suche daher replaceState + Neu-Rendern.
      const variant = btn.dataset.variant;
      history.replaceState(null, "", recipeHash(r.id, variant));
      renderRecipe(r, variant);
    });
  });

  const input = document.getElementById("portions");
  const renderIng = () => {
    let val = parseFloat(String(input.value).replace(",", "."));
    if (!val || val <= 0) val = base;
    const factor = val / base;
    document.getElementById("ing-list").innerHTML = ingredientsHtml(m, factor);
    document.getElementById("yield-unit").textContent = yieldUnitLabel(unit, val);
  };
  document.getElementById("inc").addEventListener("click", () => {
    input.value = fmtNum((parseFloat(String(input.value).replace(",", ".")) || base) + stepFor(base));
    renderIng();
  });
  document.getElementById("dec").addEventListener("click", () => {
    const next = (parseFloat(String(input.value).replace(",", ".")) || base) - stepFor(base);
    input.value = fmtNum(Math.max(stepFor(base), next));
    renderIng();
  });
  input.addEventListener("input", renderIng);
  renderIng();
}

const SINGULAR_UNITS = { "Portionen": "Portion", "Pancakes": "Pancake", "Gläser": "Glas", "kleine Gläser": "kleines Glas" };
function yieldUnitLabel(unit, value) {
  return value === 1 && SINGULAR_UNITS[unit] ? SINGULAR_UNITS[unit] : unit;
}

function stepFor(base) { return base >= 4 ? 1 : 0.5; }
function fmtNum(v) { return String(Math.round(v * 100) / 100).replace(".", ","); }

function ingredientsHtml(r, factor) {
  let html = "";
  let lastGroup = null;
  const ul = [];
  r.ingredients.forEach((i) => {
    if ((i.group || null) !== lastGroup) {
      if (ul.length) { html += `<ul class="ingredients">${ul.join("")}</ul>`; ul.length = 0; }
      lastGroup = i.group || null;
      if (lastGroup) html += `<div class="ing-group">${esc(lastGroup)}</div>`;
    }
    const amt = formatAmount(i.amount, i.unit, factor);
    const unit = i.unit && i.unit !== "Stück" ? " " + esc(i.unit) : "";
    const amtStr = amt ? `${esc(amt)}${unit}` : "";
    ul.push(`<li>
      <span class="ing-amt">${amtStr}</span>
      <span class="ing-name">${esc(i.name)}${i.note ? `<span class="ing-note">${esc(i.note)}</span>` : ""}</span>
    </li>`);
  });
  if (ul.length) html += `<ul class="ingredients">${ul.join("")}</ul>`;
  return html;
}

// ---------------------------------------------------------------------------
// Klick-Zähler (localStorage) – sortiert Rezepte & Kategorien nach Beliebtheit
// ---------------------------------------------------------------------------
const CLICKS_KEY = "kochbuch:clicks";

function loadClicks() {
  try {
    const obj = JSON.parse(localStorage.getItem(CLICKS_KEY));
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return {};
  }
}

function trackClick(id) {
  try {
    const clicks = loadClicks();
    clicks[id] = (clicks[id] || 0) + 1;
    localStorage.setItem(CLICKS_KEY, JSON.stringify(clicks));
  } catch (e) {
    // localStorage nicht verfügbar (z. B. privater Modus) – dann ohne Zählung
  }
}

function sortByClicks(list) {
  const clicks = loadClicks();
  return list.slice().sort((a, b) => (clicks[b.id] || 0) - (clicks[a.id] || 0));
}

// Delegierter Listener zählt Klicks auf Rezeptkarten – auch nach dem
// Re-Render der Trefferliste beim Suchen.
app.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card && card.dataset.id) trackClick(card.dataset.id);
});

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch (e) { return url; }
}

// ---------------------------------------------------------------------------
// Zeitangaben in Schritten erkennen + Küchentimer
// ---------------------------------------------------------------------------
// Erkennt z. B. "10 Minuten", "10–15 Min.", "1,5 Stunden", "eine halbe Stunde",
// "1 Stunde 20 Minuten", "30 Sekunden". Bei Spannen startet der Timer mit dem
// unteren Wert – lieber einmal zu früh nachsehen als zu spät.
const NUM_WORDS = {
  ein: 1, eine: 1, einer: 1, einen: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12,
  "fünfzehn": 15, zwanzig: 20, "dreißig": 30, vierzig: 40, "fünfzig": 50,
  anderthalb: 1.5, eineinhalb: 1.5,
};
const NUM_RE = "(?:\\d+(?:[.,]\\d+)?(?:\\s*(?:½|\\d+\\/\\d+))?|½|\\d+\\/\\d+|" +
  "(?:eine[rn]?\\s+)?halbe[n]?|" +
  Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join("|") + ")";
const UNIT_RE = "(Sekunden?|Sek\\.?|Minuten?|Min\\.?|Stunden?|Std\\.?)";
const L = "[A-Za-zÄÖÜäöüß]";
const TIME_RE = new RegExp(
  `(?<!${L})(${NUM_RE})(?:\\s*(?:[-–—]|bis)\\s*(${NUM_RE}))?\\s*${UNIT_RE}(?!${L})` +
  // optional: "… Stunde(n) [und] 20 Minuten"
  `(?:\\s*(?:und\\s+)?(\\d+)\\s*(Minuten?|Min\\.?)(?!${L}))?`,
  "gi");

function parseNum(s) {
  s = s.toLowerCase().trim();
  if (/halbe/.test(s)) return 0.5;
  if (s in NUM_WORDS) return NUM_WORDS[s];
  let m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:(½)|(\d+)\/(\d+))?$/);
  if (m) return parseFloat(m[1].replace(",", ".")) + (m[2] ? 0.5 : m[3] ? Number(m[3]) / Number(m[4]) : 0);
  if (s === "½") return 0.5;
  return NaN;
}

function unitSeconds(u) {
  u = u.toLowerCase();
  if (u.startsWith("sek")) return 1;
  if (u.startsWith("min")) return 60;
  return 3600;
}

// Schritttext escapen und hinter jede Zeitangabe einen Timer-Knopf setzen.
function stepHtml(text, stepNo) {
  let out = "", last = 0;
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(text))) {
    const n = parseNum(m[1]);
    let secs = n * unitSeconds(m[3]);
    if (m[4]) secs += Number(m[4]) * 60;
    secs = Math.round(secs);
    if (!(secs > 0) || secs > 48 * 3600) continue;
    const label = m[0].trim();
    out += esc(text.slice(last, m.index));
    out += `<span class="step-time">${esc(label)}<button type="button" class="step-timer"` +
      ` data-seconds="${secs}" data-label="${esc(`Schritt ${stepNo} · ${label}`)}"` +
      ` aria-label="Timer ${esc(fmtDuration(secs))} starten" title="Timer starten">${TIMER_ICON}</button></span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

const TIMER_ICON = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="9" r="5.6" stroke="currentColor" stroke-width="1.6"></circle><line x1="8" y1="9" x2="8" y2="6.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line><line x1="6.3" y1="1.6" x2="9.7" y2="1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line></svg>`;

function fmtDuration(secs) {
  secs = Math.max(0, Math.ceil(secs));
  const h = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60), s = secs % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${pad(mi)}:${pad(s)}`;
}

// Timer laufen über Endzeitpunkte (nicht über Zählen), damit gedrosselte
// Hintergrund-Tabs nicht nachgehen. In localStorage gesichert, damit ein
// Neuladen der PWA die Timer nicht verliert.
const TIMERS_KEY = "kochbuch:timers";
let timers = loadTimers();
let timerTick = null;
let audioCtx = null;

function loadTimers() {
  try {
    const t = JSON.parse(localStorage.getItem(TIMERS_KEY));
    return Array.isArray(t) ? t : [];
  } catch (e) { return []; }
}
function saveTimers() {
  try { localStorage.setItem(TIMERS_KEY, JSON.stringify(timers)); } catch (e) { /* egal */ }
}

function remainingOf(t) {
  return t.paused ? t.remaining : (t.endAt - Date.now()) / 1000;
}

function startTimer(secs, label, href, recipeTitle) {
  if (!(secs > 0)) return;
  unlockAudio();
  timers.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label, href, recipe: recipeTitle, total: secs,
    endAt: Date.now() + secs * 1000, paused: false, remaining: secs, done: false,
  });
  saveTimers();
  renderTimers();
}

function timerAction(id, action) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  if (action === "remove") {
    timers = timers.filter((x) => x.id !== id);
  } else if (action === "toggle" && !t.done) {
    if (t.paused) { t.endAt = Date.now() + t.remaining * 1000; t.paused = false; }
    else { t.remaining = remainingOf(t); t.paused = true; }
  } else if (action === "plus") {
    if (t.done) { t.done = false; t.paused = false; t.endAt = Date.now() + 60000; }
    else if (t.paused) t.remaining += 60;
    else t.endAt += 60000;
  }
  saveTimers();
  renderTimers();
}

function timerTray() {
  let tray = document.getElementById("timer-tray");
  if (!tray) {
    tray = document.createElement("div");
    tray.id = "timer-tray";
    tray.className = "timer-tray";
    document.body.appendChild(tray);
    tray.addEventListener("click", (e) => {
      const b = e.target.closest("[data-action]");
      if (!b) return;
      unlockAudio(); // Klick (auch per Enter/Leertaste) ist eine Nutzergeste
      timerAction(b.closest(".timer").dataset.id, b.dataset.action);
    });
  }
  return tray;
}

function renderTimers() {
  const tray = timerTray();
  // Fokus über das Neu-Rendern retten (Tastaturbedienung).
  const f = tray.contains(document.activeElement) ? document.activeElement : null;
  const fId = f && f.closest(".timer") ? f.closest(".timer").dataset.id : null;
  const fAction = f ? f.dataset.action || "link" : null;
  tray.innerHTML = timers.map((t) => `
    <div class="timer${t.done ? " done" : ""}${t.paused ? " paused" : ""}" data-id="${esc(t.id)}">
      <span class="timer-time">${t.done ? "Fertig!" : fmtDuration(remainingOf(t))}</span>
      <a class="timer-label" href="${esc(t.href)}">${esc(t.label)}<span>${esc(t.recipe)}</span></a>
      ${t.done ? "" : `<button type="button" data-action="toggle" aria-label="${t.paused ? "Fortsetzen" : "Pausieren"}">${t.paused ? "▶" : "❚❚"}</button>`}
      <button type="button" data-action="plus" aria-label="Eine Minute mehr">+1</button>
      <button type="button" data-action="remove" aria-label="${t.done ? "Schließen" : "Timer abbrechen"}">✕</button>
    </div>`).join("");
  if (fId) {
    const el = tray.querySelector(`.timer[data-id="${fId}"]`);
    const target = el && (el.querySelector(fAction === "link" ? ".timer-label" : `[data-action="${fAction}"]`) ||
      el.querySelector("[data-action]"));
    if (target) target.focus();
  }
  // Seitenende freihalten: Abstand folgt der tatsächlichen Leistenhöhe.
  document.querySelector(".page").style.paddingBottom = timers.length ? `${tray.offsetHeight + 16}px` : "";
  if (timers.length && !timerTick) timerTick = setInterval(updateTimers, 250);
  if (!timers.length && timerTick) { clearInterval(timerTick); timerTick = null; }
}

let lastAlarm = 0;
function updateTimers() {
  let changed = false, ringing = false;
  timers.forEach((t) => {
    if (!t.done && !t.paused && remainingOf(t) <= 0) {
      t.done = true; t.doneAt = Date.now(); changed = true;
    }
    // Bis zu zwei Minuten lang klingeln, bis der Timer geschlossen wird.
    if (t.done && Date.now() - (t.doneAt || 0) < 120000) ringing = true;
  });
  if (changed) { saveTimers(); renderTimers(); }
  else {
    timerTray().querySelectorAll(".timer").forEach((el) => {
      const t = timers.find((x) => x.id === el.dataset.id);
      const tt = el.querySelector(".timer-time");
      if (t && !t.done && tt.textContent !== fmtDuration(remainingOf(t))) tt.textContent = fmtDuration(remainingOf(t));
    });
  }
  if (ringing && Date.now() - lastAlarm > 2000) { lastAlarm = Date.now(); alarm(); }
}

// iOS gibt Audio erst nach einer Nutzergeste frei – daher beim Timerstart.
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { audioCtx = null; }
}

function alarm() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((d) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.3, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + d); o.stop(now + d + 0.2);
    });
  } catch (e) { /* ohne Ton */ }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && timers.length) {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    updateTimers();
  }
});
// Andere Fenster/Tabs haben Timer geändert -> deren Stand übernehmen.
window.addEventListener("storage", (e) => {
  if (e.key === TIMERS_KEY) { timers = loadTimers(); renderTimers(); }
});
// Nach einem Neuladen mit laufenden Timern: Audio beim ersten Tippen freigeben.
["pointerdown", "keydown"].forEach((ev) =>
  document.addEventListener(ev, () => { if (timers.length) unlockAudio(); }, { passive: true }));
if (timers.length) renderTimers();

// ---------------------------------------------------------------------------
// Bildschirm wach halten (Screen Wake Lock API)
// ---------------------------------------------------------------------------
// Beim Kochen liegt das Handy daneben, ohne dass man es anfasst – der
// Bildschirm soll dabei nicht ausgehen. Unterstützt von Android/Chrome 84+ und
// iOS/Safari 16.4+ (auch als installierte PWA). Ältere Browser ignorieren das
// stillschweigend, die Seite funktioniert dort unverändert.
let wakeLock = null;
// Wird synchron vor dem ersten await gesetzt: sonst kämen mehrere schnell
// aufeinanderfolgende Events (z. B. zwei pointerdown) alle an der
// wakeLock-Prüfung vorbei und würden parallel Locks anfordern – von denen dann
// nur der zuletzt aufgelöste eine Referenz behält.
let wakeLockPending = false;

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (wakeLock || wakeLockPending || document.visibilityState !== "visible") return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    wakeLock = lock;
    // Das System gibt den Lock z. B. beim Sperren des Geräts von selbst frei.
    lock.addEventListener("release", () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch (e) {
    // Verweigert (Akkusparmodus, fehlende Nutzerinteraktion, kein Support) –
    // der nächste Versuch läuft über visibilitychange bzw. den nächsten Tap.
    wakeLock = null;
  } finally {
    wakeLockPending = false;
  }
}

// Nach dem Zurückschalten in die App ist der Lock weg und muss neu geholt werden.
document.addEventListener("visibilitychange", requestWakeLock);
// Fallback: Browser, die den Lock nur nach einer Nutzergeste vergeben, bekommen
// beim ersten Tippen eine zweite Chance. requestWakeLock ist idempotent.
document.addEventListener("pointerdown", requestWakeLock, { passive: true });

requestWakeLock();
