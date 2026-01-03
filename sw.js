/* CDL · PWA Service Worker — v46 (scope-aware + HTML network-first fix) */
const SW_VERSION = 'v46';
const CACHE_STATIC = `cdl-static-${SW_VERSION}`;
const CACHE_PAGES  = `cdl-pages-${SW_VERSION}`;

/* Precache SOLO de ficheros que están en la raíz (ajusta según tu repo) */
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './favicon.ico',

  // Branding/UI
  './logo-cdl.png',
  './logo_mantenimiento.png',
  './angular.png',

  // Iconos
  './apple-touch-icon.png',
  './icon-32.png',
  './icon-152.png',
  './icon-192.png',
  './icon-512-maskable.png',

  // CSV inicial
  './repuestos.csv'
];

/* Extensiones estáticas genéricas */
const STATIC_EXT = /\.(?:png|jpg|jpeg|webp|gif|svg|ico|css|js|json|webmanifest|ttf|woff2?|pdf|csv)$/i;
/* HTML: lo tratamos aparte (network-first) */
const HTML_EXT = /\.html$/i;

/* Heurística de endpoints de Apps Script */
const API_HINT = /script\.google\.com\/macros\/s\/.+\/exec/i;

/* Helpers: path relativo al scope de registro (soporta GitHub Pages en subcarpeta) */
const SCOPE_PATH = new URL(self.registration.scope).pathname;
function pathRelativeToScope(url) {
  const p = new URL(url).pathname;
  return p.startsWith(SCOPE_PATH) ? p.slice(SCOPE_PATH.length) : p;
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    try {
      await cache.addAll(CORE_ASSETS);
    } catch (err) {
      await cache.addAll(['./', './offline.html', './manifest.webmanifest']);
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![CACHE_STATIC, CACHE_PAGES].includes(k)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (evt) => {
  if (evt.data && evt.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const rel = pathRelativeToScope(req.url);

  /* 0) HTML (incluido index.html) -> NETWORK FIRST SIEMPRE
        Evita que se te quede un index antiguo “pegado” por cache-first. */
  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html') || HTML_EXT.test(url.pathname);

  if (isHTML) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_PAGES);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_PAGES);
        const page = await cache.match(req);
        return page || caches.match('./offline.html');
      }
    })());
    return;
  }

  /* 1) API Apps Script (GET): network-first, copia de emergencia */
  if (API_HINT.test(req.url)) {
    e.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_PAGES);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(CACHE_PAGES);
        const old = await cache.match(req);
        if (old) return old;
        return new Response(JSON.stringify({ ok: false, error: 'offline' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  /* 2) Manuales dentro del scope: cache-first, fallback a offline */
  if (rel.startsWith('manuales/') && /\.pdf$/i.test(rel)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const net = await fetch(req, { cache: 'no-store' });
        if (net && net.ok) { cache.put(req, net.clone()); return net; }
      } catch { /* ignore */ }

      return caches.match('./offline.html');
    })());
    return;
  }

  /* 3) Estáticos genéricos: cache-first */
  if (STATIC_EXT.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const net = await fetch(req);
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        if (/\.pdf$/i.test(url.pathname)) return caches.match('./offline.html');
        return caches.match('./offline.html');
      }
    })());
    return;
  }

  /* 4) Resto GET: network con fallback liviano */
  e.respondWith((async () => {
    try {
      return await fetch(req, { cache: 'no-store' });
    } catch {
      const cache = await caches.open(CACHE_PAGES);
      const alt = await cache.match(req);
      return alt || caches.match('./offline.html');
    }
  })());
});