// CDL CMMS — Service Worker (app shell + cache-first estático)
const VERSION = 'v1.0.0';
const STATIC_CACHE = `cdl-static-${VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/angular.png'
];
// Rutas de terceros que conviene cachear
const CDN_ALLOW = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://fonts.gstatic.com'
];

self.addEventListener('install', (e)=>{
  e.waitUntil((async ()=>{
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('cdl-static-') && k!==STATIC_CACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

/* Estrategia:
   - Navegación (document): Network-first -> fallback cache -> offline HTML mínimo.
   - Estático (same-origin + CDN_ALLOW): Cache-first -> network update en background.
   - API Google Apps Script: Network-first -> si offline devuelve 503 simulado. */

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  const url = new URL(req.url);

  // Navegación (documentos)
  if (req.mode === 'navigate') {
    e.respondWith((async ()=>{
      try {
        const fresh = await fetch(req);
        const cc = fresh.clone();
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, cc);
        return fresh;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req) || await cache.match('/index.html');
        return cached || new Response('<!doctype html><meta charset="utf-8"><title>Sin conexión</title><body style="font-family:system-ui;padding:24px"><h1>Sin conexión</h1><p>Esta página no está en caché aún. Conéctate e inténtalo de nuevo.</p></body>', {headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
    })());
    return;
  }

  // Estático de mismo origen o whitelisted CDNs
  const isStatic = url.origin === location.origin ||
                   CDN_ALLOW.some(s => url.href.startsWith(s));
  if (isStatic && req.method === 'GET') {
    e.respondWith((async ()=>{
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req).then(res=>{
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(()=>null);
      return cached || fetchAndUpdate || new Response('', {status:504});
    })());
    return;
  }

  // API (network-first con fallback 503 JSON)
  if (url.hostname.endsWith('script.google.com')) {
    e.respondWith((async ()=>{
      try{
        return await fetch(req);
      }catch{
        return new Response(JSON.stringify({ ok:false, offline:true, error:'offline' }), {
          status: 503, headers: {'Content-Type':'application/json'}
        });
      }
    })());
    return;
  }
});