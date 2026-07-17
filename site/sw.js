"use strict";

const CACHE_NAME = "kochbuch-v1";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./recipes.json",
];

async function cacheCookbook() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_FILES);

  const response = await cache.match("./recipes.json");
  const data = await response.json();
  const images = new Set();
  data.recipes.forEach((recipe) => {
    (recipe.images || []).forEach((name) => images.add(`./images/${name}`));
  });
  await cache.addAll([...images]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCookbook().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith("kochbuch-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cache.match(request);
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request).then(
      (response) => response || caches.match("./index.html"),
    ));
    return;
  }

  if (url.pathname.endsWith("/recipes.json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    })),
  );
});
