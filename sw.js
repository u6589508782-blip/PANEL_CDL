/* CDL PWA Service Worker — FINAL */
const SW_VERSION = 'cdl-sw-v3';
const CORE_CACHE = 'core-' + SW_VERSION;
const RUNTIME_CACHE = 'runtime-' + SW_VERSION;

// Recursos críticos (ajusta si cambias rutas/nombres)
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './logo-cdl.png',
  './logo_mantenimiento.png',
  './angular.png',
  './apple-touch-icon.png',
  './favicon-192.png',
  './favicon-512.png',
  // Carruseles (dos variantes usadas en tu index)
  './img/Carousel/corte.webp',
  './img/Carousel/kaltenbach.webp',
  './img/Carousel/trumpf.webp',
  './img/Carousel/hgg.webp',
  './img/Carousel/tecoi.webp',
  './img/Carousel/mazzak.webp',
  './Images/carrusel/01.jpg',
  './Images/carrusel/02.jpg',
  './Images/carrusel/03.jpg',
  './Images/carrusel/04.jpg',
  './Images/carrusel/05.jpg',
  './Images/carrusel/06.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then(cache => cache.addAll(CORE_ASSETS)).then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![CORE_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k))
    )).then(()=> self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Estrategia: navegación → offline.html; estáticos → cache-first; peticiones API → network-first con fallback cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navegación de páginas
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./offline.html'))
    );
    return;
  }

  // Peticiones Apps Script (API): network-first
  if (/script\.google\.com\/macros\//.test(url.href)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Estáticos: cache-first
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Otros (externos): network-first con fallback cache
  event.respondWith(networkFirst(req));
});

async function cacheFirst(req){
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try{
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  }catch(_e){
    return cached || caches.match('./offline.html');
  }
}

async function networkFirst(req){
  const cache = await caches.open(RUNTIME_CACHE);
  try{
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  }catch(_e){
    const cached = await cache.match(req);
    return cached || caches.match('./offline.html');
  }
}