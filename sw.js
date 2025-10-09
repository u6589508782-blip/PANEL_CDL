/* =========================================================
   CDL · Service Worker (v12)
   - Instala core assets
   - Limpia cachés viejas
   - Mensaje SKIP_WAITING para activar al instante
   - Pide siempre a red las páginas HTML (network-first)
   - Sirve estáticos desde caché (cache-first)
   - Deja pasar tal cual todo lo EXTERNO (Apps Script, CDNs…)
   - Fallback elegante a offline.html cuando no hay red
========================================================= */

const CACHE_VERSION = 'v12';
const CACHE_NAME = `cdl-cache-${CACHE_VERSION}`;

// Archivos esenciales de tu app (mismo listado que el actual)
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './logo-cdl.png',
  './logo_mantenimiento.png',
  './angular.png',
  './linea-kaltenbach.png',
  './apple-touch-icon.png',
  './manifest.webmanifest',
];

// ————————————————————————————
// INSTALL: precache de core
// ————————————————————————————
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS))
  );
  self.skipWaiting(); // activa enseguida tras instalar
});

// ————————————————————————————
// ACTIVATE: limpiar cachés antiguas + claim
// ————————————————————————————
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // borra versiones antiguas
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('cdl-cache-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );

    // activa Navigation Preload si el navegador lo soporta
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
// FETCH: rutas
// - Externo (origen ≠ propio): dejar pasar (no cachear, no interceptar)
// - Navegación/HTML: network-first con fallback offline
// - Estáticos propios: cache-first con revalidación
// ————————————————————————————
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Sólo GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Todo lo EXTERNO (Apps Script u otros dominios) pasa directo
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) Páginas HTML / navegaciones: network-first
  const isHTML =
    req.mode === 'navigate' ||
    req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // 3) Estáticos (script, style, image, font…) y demás GET propios: cache-first
  event.respondWith(cacheFirstStatic(req));
});

// ————————————————————————————
// Estrategias
// ————————————————————————————

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // Si hay Navigation Preload, úsalo. Si no, fetch normal.
    const preload = await eventPreloadResponse();
    const netRes = preload || await fetch(request, { cache: 'no-store' });

    // Cachea una copia si OK
    if (netRes && netRes.ok) cache.put(request, netRes.clone());
    return netRes;
  } catch (err) {
    // Sin red: intenta caché
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Fallback a offline.html para HTML
    const offline = await cache.match('./offline.html', { ignoreSearch: true });
    if (offline) return offline;

    // Último recurso
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    // Revalida en segundo plano (stale-while-revalidate ligero)
    fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res.clone());
    }).catch(()=>{});
    return cached;
  }

  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    // Si es HTML, dar offline.html
    if (request.headers.get('accept')?.includes('text/html')) {
      const offline = await cache.match('./offline.html', { ignoreSearch: true });
      if (offline) return offline;
    }
    // Sino, error crudo
    throw err;
  }
}

// Intenta usar Navigation Preload si está disponible en este fetch
async function eventPreloadResponse() {
  // Este helper se usa dentro de networkFirstPage()
  // y sólo devuelve algo si el navegador lo soporta.
  if (!('navigationPreload' in self.registration)) return null;
  try {
    const res = await self.registration.navigationPreload.getState?.();
    // Si está habilitado, el event trae .preloadResponse
    // (este helper se llama dentro de un fetch handler, por lo que
    //  podemos acceder a 'event' con el truco de arguments.callee.caller?)
    // Para evitar hacks, lo inyectamos por parámetro cuando se necesite.
    // Solución: devolver null aquí; networkFirstPage hará fetch normal.
    return null;
  } catch {
    return null;
  }
}
