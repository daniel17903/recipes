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
  (r.variations || []).forEach((v) => {
    parts.push(v.title);
    (v.ingredients || []).forEach((i) => parts.push(i.name));
  });
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
  const nq = normalize(q);
  let list = DATA.recipes;
  if (kat) list = list.filter((r) => r.category === kat);
  if (nq) list = list.filter((r) => r._hay.includes(nq));

  document.getElementById("results").innerHTML = resultsHtml(list, q, kat);
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
  const editorial = !q && !kat;
  const tippId = editorial ? tippOfTheDay() : null;
  if (tippId) list = [...list].sort((a, b) => (a.id === tippId ? -1 : 0) - (b.id === tippId ? -1 : 0));
  return `<div class="grid">${list.map((r, idx) => card(r, editorial && idx === 0)).join("")}</div>`;
}

function card(r, featured) {
  const img = r.images && r.images.length
    ? `<img class="card-img" loading="lazy" src="images/${esc(r.images[0])}" alt="${esc(r.title)}">`
    : `<div class="card-noimg" aria-hidden="true">🍽️</div>`;
  return `<a class="card${featured ? " featured" : ""}" href="#/rezept/${encodeURIComponent(r.id)}">
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
        <ol class="steps">${m.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </section>
    </div>

    ${m.notes ? `<section class="panel"><h2>Notizen</h2><p class="notes">${esc(m.notes)}</p></section>` : ""}
    ${r.nutrition ? `<section class="panel"><h2>Nährwerte</h2><p class="notes">${esc(r.nutrition)}</p></section>` : ""}
  `;

  document.getElementById("back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = "#/";
  });

  app.querySelectorAll(".variants .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = recipeHash(r.id, btn.dataset.variant);
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
