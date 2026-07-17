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
    data.recipes.forEach((r) => (r._hay = haystack(r)));
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

function haystack(r) {
  const parts = [r.title, r.category];
  r.ingredients.forEach((i) => parts.push(i.name));
  const joined = parts.join(" ");
  return normalize(joined) + " " + normalizeAe(joined);
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
  const m = h.match(/^\/rezept\/(.+)$/);
  if (m) return { view: "recipe", id: decodeURIComponent(m[1]) };
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
    renderRecipe(DATA.byId[state.id]);
  } else {
    renderList(state);
  }
  window.scrollTo(0, 0);
}

function renderList(state) {
  const q = state.q || "";
  const kat = state.kategorie || "";
  const nq = normalize(q);

  let list = DATA.recipes;
  if (kat) list = list.filter((r) => r.category === kat);
  if (nq) list = list.filter((r) => r._hay.includes(nq));

  const chips = [
    `<button class="chip" data-kat="" aria-pressed="${kat === "" ? "true" : "false"}">Alle <span class="count">${DATA.count}</span></button>`,
    ...DATA.categories.map((c) =>
      `<button class="chip" data-kat="${esc(c)}" aria-pressed="${kat === c ? "true" : "false"}">${esc(c)} <span class="count">${DATA.counts[c] || 0}</span></button>`),
  ].join("");

  app.innerHTML = `
    <div class="controls">
      <input class="search" id="search" type="search" inputmode="search"
        placeholder="Suche nach Rezept, Zutat …" value="${esc(q)}"
        autocomplete="off" aria-label="Rezepte durchsuchen">
      <div class="chips" role="group" aria-label="Kategorien">${chips}</div>
    </div>
    <div id="results">${list.length
      ? `<div class="grid">${list.map(card).join("")}</div>`
      : `<p class="empty">Keine Rezepte gefunden.</p>`}</div>
  `;

  const search = document.getElementById("search");
  let t;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const cur = parseHash();
      history.replaceState(null, "", listHash(search.value, cur.kategorie || kat));
      updateResults(search.value, kat);
    }, 120);
  });

  app.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newKat = btn.dataset.kat;
      location.hash = listHash(search.value, newKat);
    });
  });
}

function updateResults(q, kat) {
  const nq = normalize(q);
  let list = DATA.recipes;
  if (kat) list = list.filter((r) => r.category === kat);
  if (nq) list = list.filter((r) => r._hay.includes(nq));

  document.getElementById("results").innerHTML = list.length
    ? `<div class="grid">${list.map(card).join("")}</div>`
    : `<p class="empty">Keine Rezepte gefunden.</p>`;
}

function card(r) {
  const img = r.images && r.images.length
    ? `<img class="card-img" loading="lazy" src="images/${esc(r.images[0])}" alt="${esc(r.title)}">`
    : `<div class="card-noimg" aria-hidden="true">🍽️</div>`;
  return `<a class="card" href="#/rezept/${encodeURIComponent(r.id)}">
    ${img}
    <div class="card-body">
      <div class="card-cat">${esc(r.category)}</div>
      <h2 class="card-title">${esc(r.title)}</h2>
    </div>
  </a>`;
}

function renderRecipe(r) {
  const base = r.yield ? r.yield.amount : 1;
  const unit = r.yield ? r.yield.unit : "Portionen";
  let hero = "";
  if (r.images && r.images.length) {
    hero = `<div class="recipe-hero"><img src="images/${esc(r.images[0])}" alt="${esc(r.title)}"></div>`;
  }
  const gallery = r.images && r.images.length > 1
    ? `<div class="recipe-gallery">${r.images.slice(1).map((i) =>
        `<img loading="lazy" src="images/${esc(i)}" alt="${esc(r.title)}">`).join("")}</div>`
    : "";

  const meta = [];
  if (r.times && r.times.prep) meta.push(`⏱ Vorbereitung: ${esc(r.times.prep)}`);
  if (r.times && r.times.cook) meta.push(`🔥 Backen/Kochen: ${esc(r.times.cook)}`);
  if (r.source && r.source.url) {
    const label = r.source.name || hostOf(r.source.url);
    meta.push(`🔗 <a class="source-link" href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(label)}</a>`);
  } else if (r.source && r.source.name) {
    meta.push(`🔗 ${esc(r.source.name)}`);
  }

  app.innerHTML = `
    <button class="back" id="back">← Übersicht</button>
    ${hero}
    <div class="recipe-cat">${esc(r.category)}</div>
    <h1 class="recipe-title">${esc(r.title)}</h1>
    ${meta.length ? `<div class="recipe-meta">${meta.join("")}</div>` : ""}
    ${gallery}

    <section class="panel">
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

    <section class="panel">
      <h2>Zubereitung</h2>
      <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    </section>

    ${r.notes ? `<section class="panel"><h2>Notizen</h2><p class="notes">${esc(r.notes)}</p></section>` : ""}
    ${r.nutrition ? `<section class="panel"><h2>Nährwerte</h2><p class="notes">${esc(r.nutrition)}</p></section>` : ""}
  `;

  document.getElementById("back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = "#/";
  });

  const input = document.getElementById("portions");
  const renderIng = () => {
    let val = parseFloat(String(input.value).replace(",", "."));
    if (!val || val <= 0) val = base;
    const factor = val / base;
    document.getElementById("ing-list").innerHTML = ingredientsHtml(r, factor);
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

const SINGULAR_UNITS = { "Portionen": "Portion", "Pancakes": "Pancake", "kleine Gläser": "kleines Glas" };
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

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch (e) { return url; }
}
