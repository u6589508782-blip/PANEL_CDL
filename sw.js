/* =========================================================
   CDL · Service Worker (completo)
   - Precache de assets críticos
   - Estrategias por tipo de recurso
   - Fallback offline para navegación
   - Soporte SKIP_WAITING desde la app
   ========================================================= */

const SW_VERSION = 'v7';
const CACHE_CORE   = `cdl-core-${SW_VERSION}`;
const CACHE_STATIC = `cdl-static-${SW_VERSION}`;
const CACHE_IMAGES = `cdl-img-${SW_VERSION}`;
const CACHE_API    = `cdl-api-${SW_VERSION}`;

/* --- Ajusta si cambias el endpoint --- */
const API_HINT = 'script.google.com/macros/s/';

/* --- Núcleo a precachear (coincide con tu index) --- */
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './favicon.ico',

  // Imágenes y UI usadas en el HTML
  './logo-cdl.png',
  './logo_mantenimiento.png',
  './angular.png',
  './manual_no_disponible.pdf',

  // Carrusel portada (ruta correcta: img/Carousel/)
  './img/Carousel/corte.webp',
  './img/Carousel/kaltenbach.webp',
  './img/Carousel/trumpf.webp',
  './img/Carousel/hgg.webp',
  './img/Carousel/tecoi.webp',
  './img/Carousel/mazak.webp'
];

/* =========================================================
   INSTALL: precache núcleo
========================================================= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CORE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

/* =========================================================
   ACTIVATE: limpia versiones antiguas
========================================================= */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) =>
            ![CACHE_CORE, CACHE_STATIC, CACHE_IMAGES, CACHE_API].includes(k)
          )
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* =========================================================
   MENSAJES: soporta SKIP_WAITING
========================================================= */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* =========================================================
   FETCH: rutas por tipo
========================================================= */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Sólo nos interesa GET
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Navegación de páginas → network-first con fallback offline
  if (req.mode === 'navigate') {
    event.respondWith(pageNetworkFirst(req));
    return;
  }

  // 2) API de Apps Script → network-first con cache de respaldo
  if (url.href.includes(API_HINT)) {
    event.respondWith(apiNetworkFirst(req));
    return;
  }

  // 3) Imágenes → cache-first
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(imageCacheFirst(req));
    return;
  }

  // 4) Estáticos de mismo origen (css/js/json/etc.) → stale-while-revalidate
  if (sameOrigin) {
    event.respondWith(staticStaleWhileRevalidate(req));
    return;
  }

  // 5) Por defecto: intenta red y cae en caché si existe
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

/* =========================================================
   Estrategias
========================================================= */

// Navegación: network-first → offline.html
async function pageNetworkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Opcional: guarda copia en estáticos
    const cache = await caches.open(CACHE_STATIC);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (_e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('./offline.html');
  }
}

// API: network-first con timeout y copia en CACHE_API
async function apiNetworkFirst(request) {
  const cache = await caches.open(CACHE_API);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000); // 8s de cortesía

  try {
    const fresh = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(t);
    // Guarda sólo si OK
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_e) {
    clearTimeout(t);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Último recurso: responde 503 suave
    return new Response(JSON.stringify({ ok:false, offline:true, error:'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Estáticos: stale-while-revalidate
async function staticStaleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(stripQuery(request));
  const fetchPromise = fetch(request).then((netRes) => {
    if (netRes && netRes.ok) cache.put(stripQuery(request), netRes.clone());
    return netRes;
  }).catch(() => null);
  return cached || fetchPromise || caches.match('./offline.html');
}

// Imágenes: cache-first con tope de entradas
async function imageCacheFirst(request) {
  const cache = await caches.open(CACHE_IMAGES);
  const cached = await cache.match(stripQuery(request));
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res && res.ok) {
      await cache.put(stripQuery(request), res.clone());
      limitCacheEntries(cache, 120); // evita crecer infinito
    }
    return res;
  } catch (_e) {
    // Como fallback, intenta una de las del núcleo
    return caches.match('./img/Carousel/corte.webp') ||
           caches.match('./offline.html');
  }
}

/* =========================================================
   Utilidades
========================================================= */

// Ignora querystrings para estáticos (evita duplicados en caché)
function stripQuery(request) {
  try {
    const url = new URL(request.url);
    url.search = '';
    return new Request(url.toString(), { headers: request.headers, mode: request.mode, credentials: request.credentials, redirect: request.redirect });
  } catch {
    return request;
  }
}

// Limita nº de entradas en un caché
async function limitCacheEntries(cache, maxItems = 100) {
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  const toDelete = keys.length - maxItems;
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
}-