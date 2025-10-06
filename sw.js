/* CDL Panel – Service Worker */
const SW_VERSION = 'v3.0.0';
const CACHE_STATIC = `cdl-static-${SW_VERSION}`;
const CACHE_RUNTIME = `cdl-runtime-${SW_VERSION}`;

/* Rutas a precache (añade/ajusta si cambian nombres) */
const PRECACHE_URLS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  // imágenes usadas por el layout
  './logo-cdl.png',
  './logo_mantenimiento.png',
  './angular.png',
  './linea-kaltenbach.png',
  // iconos PWA
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

/* Dominio de Apps Script para tratarlo como “red primero” */
const APPSCRIPT_HOST = 'script.google.com';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // limpia versiones antiguas
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_RUNTIME].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* Estrategias:
   - Navegación (document): Offline-first -> devuelve offline.html si falla
   - Apps Script/API: Network-first con fallback a caché si hubiera
   - Resto (imgs, etc.): Stale-While-Revalidate
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Navegaciones (SPA): offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // opcional: cachear el HTML de index
          const cache = await caches.open(CACHE_RUNTIME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_STATIC);
          const offline = await cache.match('./offline.html');
          return offline || Response.error();
        }
      })()
    );
    return;
  }

  // 2) Llamadas al API (Apps Script): network-first
  if (url.hostname === APPSCRIPT_HOST) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_RUNTIME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_RUNTIME);
          const cached = await cache.match(req);
          return cached || new Response(JSON.stringify({ ok: false, offline: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        }
      })()
    );
    return;
  }

  // 3) Estático: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_RUNTIME);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((resp) => {
          // Evita cachear respuestas opaques de otros orígenes si no interesa
          if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
            cache.put(req, resp.clone());
          }
          return resp;
        })
        .catch(() => null);

      return cached || fetchPromise || caches.match('./offline.html');
    })()
  );
});