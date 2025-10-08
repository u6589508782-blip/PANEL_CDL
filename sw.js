/* =========================================================
   CDL · Service Worker
   - Cache-first para estáticos
   - Network-first para la API (Apps Script)
   - Fallback elegante a offline.html
========================================================= */

const CACHE_VERSION = "v6";                 // <— súbelo en cada deploy
const CACHE_NAME = `cdl-cache-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./logo-cdl.png",
  "./logo_mantenimiento.png",
  "./angular.png",
  "./linea-kaltenbach.png",
  "./apple-touch-icon.png",
  "./manifest.webmanifest",
];

// Tu endpoint de Apps Script (detección genérica)
const API_HINT = "script.google.com/macros/s/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(k => k.startsWith("cdl-cache-") && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Permite forzar la activación inmediata del nuevo SW desde la página
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isAPI = req.url.includes(API_HINT);
  event.respondWith(isAPI ? networkFirst(req) : cacheFirst(req));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    // Si es una navegación HTML, devuelve offline.html
    if (request.headers.get("accept")?.includes("text/html")) {
      const offline = await cache.match("./offline.html", { ignoreSearch: true });
      if (offline) return offline;
    }
    throw e;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    // Si no hay red: intenta cache
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // Y si era navegación HTML, muestra offline.html
    if (request.headers.get("accept")?.includes("text/html")) {
      const offline = await cache.match("./offline.html", { ignoreSearch: true });
      if (offline) return offline;
    }
    return new Response("Offline", { status: 503 });
  }
}