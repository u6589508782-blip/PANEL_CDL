/* =========================================================
   CDL · Service Worker (v16)
   - Instala core assets (incluye iconos maskable)
   - Limpia cachés viejas
   - Activación inmediata apoyada por SKIP_WAITING vía postMessage
   - HTML: network-first con fallback a offline.html
   - Estáticos: cache-first con revalidación ligera
   - Todo lo EXTERNO (Apps Script, Google Fonts/CDNs) pasa directo
========================================================= */

const CACHE_VERSION = 'v16';
const CACHE_NAME = `cdl-cache-${CACHE_VERSION}`;

// Archivos esenciales (añade aquí cualquier imagen/asset nuevo que quieras offline)
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',

  // UI
  './logo-cdl.png',
  './logo_mantenimiento.png',
  './angular.png',
  './linea-kaltenbach.png',

  // (opcional, si los tienes)
  // './favicon.ico',
  // './styles.css',
  // './app.js',

  // PWA
  './manifest.webmanifest',
  './apple-touch-icon.png',

  // ICONOS PWA
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
];

// ————————————————————————————
// INSTALL: precache de core
// ————————————————————————————
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS)));
});

// ————————————————————————————
// ACTIVATE: limpiar cachés antiguas + claim
// ————————————————————————————
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('cdl-cache-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );

    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
  })());
  self.clients.claim();
});

// ————————————————————————————
// Mensajes desde la página (forzar activación)
// ————————————————————————————
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ————————————————————————————
// FETCH: estrategia por tipo
// ————————————————————————————
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Sólo GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Externo => red directa
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) HTML / navegaciones => network-first
  const isHTML = req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html');
  if (isHTML) {
    event.respondWith(networkFirstPage(event));
    return;
  }

  // 3) Estáticos propios => cache-first + revalidate
  event.respondWith(cacheFirstStatic(req));
});

// ————————————————————————————
// Estrategias
// ————————————————————————————
async function networkFirstPage(event) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);

  try {
    const preloaded = await event.preloadResponse;
    const netRes = preloaded || await fetch(request, { cache: 'no-store' });

    if (netRes && netRes.ok) cache.put(request, netRes.clone());
    return netRes;
  } catch {
    // Sin red: intenta caché del documento base (ignora query para SPA)
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Fallback a offline.html
    const offline = await cache.match('./offline.html', { ignoreSearch: true });
    return offline || new Response('Offline', { status: 503 });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(CACHE_NAME);

  // Para estáticos NO ignoramos query por defecto (evita mezclar variantes)
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res.clone());
    }).catch(()=>{});
    return cached;
  }

  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    // Si resulta ser HTML por cabecera (caso raro), fallback a offline
    if (request.headers.get('accept')?.includes('text/html')) {
      const offline = await cache.match('./offline.html', { ignoreSearch: true });
      if (offline) return offline;
    }
    return new Response('Recurso no disponible', { status: 503 });
  }
}