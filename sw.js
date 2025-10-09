/* =========================================================
   CDL · Service Worker (v9)
   - Cache-first para estáticos
   - Network-first para la API (Apps Script)
   - Fallback elegante a offline.html
   - Soporte de actualización inmediata (SKIP_WAITING)
========================================================= */

const CACHE_VERSION = "v11";
const CACHE_NAME    = `cdl-cache-${CACHE_VERSION}`;

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
  // "./favicon.ico", // opcional si existe
];

const API_HINT = "script.google.com/macros/s/";

/* lifecycle */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (c) => {
      for (const url of CORE_ASSETS) {
        try { await c.add(url); } catch(e) { /* ignora faltantes */ }
      }
    })
  );
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

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* fetch */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const isAPI = req.url.includes(API_HINT);
  event.respondWith(isAPI ? networkFirst(req) : cacheFirst(req));
});

/* strategies */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    if (isHtmlRequest(request)) {
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
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (isHtmlRequest(request)) {
      const offline = await cache.match("./offline.html", { ignoreSearch: true });
      if (offline) return offline;
    }
    return new Response("Offline", { status: 503 });
  }
}

/* helpers */
function isHtmlRequest(request) {
  return request.mode === "navigate" ||
         request.headers.get("accept")?.includes("text/html");
}