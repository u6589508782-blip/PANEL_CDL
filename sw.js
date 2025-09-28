/* Service Worker — CDL sólido para demo real/producción */
const V = 'cdl-v1-' + (self.registration?.scope || '') + '-' + 20250928;
const CORE = [
  '/', '/index.html', '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
  '/logo-cdl.png',
  '/linea-kaltenbach.png' // ← sube este archivo (enlace que te he dado)
];

// Instalación: precache básico
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

// Activación: limpia versiones antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k!==V && caches.delete(k))))
  );
  self.clients.claim();
});

// Estrategia:
// - Navegación (HTML): red primero, si falla -> cache, si no hay -> offline.html
// - JSON: red primero, si falla -> cache
// - Estáticos (css/js/img): cache primero, si no hay -> red
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');
  const isJSON = accept.includes('application/json');

  if (isHTML) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone(); caches.open(V).then(c => c.put(req, copy));
        return res;
      }).catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match('/offline.html');
      })
    );
    return;
  }

  if (isJSON) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone(); caches.open(V).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone(); caches.open(V).then(c => c.put(req, copy));
      return res;
    }))
  );
});

// Mensaje para activar nueva versión al vuelo
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});