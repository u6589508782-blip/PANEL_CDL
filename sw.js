/* =========================================================
BLOQUE 20 — NUEVO sw.js (guardar como /sw.js en la raíz)
========================================================= */
const CACHE_VERSION = 'cdl-v3';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const CORE_ASSETS = [
  '/', '/index.html', '/offline.html', '/manifest.webmanifest',
  '/logo-cdl.png', '/logo_mantenimiento.png',
  '/icon-192.png', '/icon-512.png'
];

// Install: precache core
self.addEventListener('install', event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE).then(c=>c.addAll(CORE_ASSETS)));
});

// Activate: clear old caches
self.addEventListener('activate', event=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('static-') && k!==STATIC_CACHE)
      .map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

// Strategy helpers
async function cacheFirst(req){
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req, {ignoreSearch:true});
  if(hit) return hit;
  try{
    const res = await fetch(req);
    if(res && res.ok && req.method==='GET' && new URL(req.url).origin===location.origin){
      cache.put(req, res.clone());
    }
    return res;
  }catch(e){
    if(req.mode==='navigate') return caches.match(OFFLINE_URL);
    return new Response('Offline', {status:503});
  }
}

async function networkFirst(req){
  const cache = await caches.open(STATIC_CACHE);
  try{
    const res = await fetch(req);
    if(res && res.ok) cache.put(req, res.clone());
    return res;
  }catch(e){
    const hit = await cache.match(req);
    if(hit) return hit;
    if(req.mode==='navigate') return caches.match(OFFLINE_URL);
    return new Response('Offline', {status:503});
  }
}

self.addEventListener('fetch', event=>{
  const req = event.request;
  const url = new URL(req.url);

  // Navegaciones: network-first con fallback offline
  if(req.mode==='navigate'){
    event.respondWith(networkFirst(req));
    return;
  }

  // Archivos propios (png, css, js, manifest) => cache-first
  if(url.origin === location.origin){
    if(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|json|webmanifest)$/i.test(url.pathname)){
      event.respondWith(cacheFirst(req));
      return;
    }
  }

  // Resto: network-first
  event.respondWith(networkFirst(req));
});

// Mensaje para forzar actualización desde la app
self.addEventListener('message', (event)=>{
  if(event.data==='skipWaiting'){ self.skipWaiting(); }
});