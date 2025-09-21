// SW CDL · cache-first con actualización en segundo plano
const VERSION = 'v2025.01';
const STATIC_CACHE = `cdl-static-${VERSION}`;
const RUNTIME_CACHE = `cdl-runtime-${VERSION}`;
const OFFLINE_URL = '/';

const CORE_ASSETS = [
  '/', '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png',
  '/angular.png'
];

// Instala: precache básico
self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(STATIC_CACHE).then(c=>c.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activa: limpia versiones viejas
self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![STATIC_CACHE,RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Estrategia: cache-first para estáticos; network-first para API
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  // Ignora otros orígenes si quieres
  if (e.request.method !== 'GET') return;

  const isAPI = url.pathname.startsWith('/macros/s/') || url.href.includes('script.google.com/macros');

  if (isAPI) {
    // network-first (mejor frescura)
    e.respondWith((async ()=>{
      try{
        const net = await fetch(e.request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(e.request, net.clone());
        return net;
      }catch(_){
        const cache = await caches.open(RUNTIME_CACHE);
        const hit = await cache.match(e.request);
        return hit || new Response(JSON.stringify({ok:false, offline:true}), {status:503, headers:{'Content-Type':'application/json'}});
      }
    })());
    return;
  }

  // estáticos: cache-first
  e.respondWith((async ()=>{
    const hit = await caches.match(e.request, {ignoreSearch:true});
    if (hit) return hit;
    try{
      const net = await fetch(e.request);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(e.request, net.clone());
      return net;
    }catch(_){
      // fallback muy básico
      if (e.request.mode === 'navigate') {
        const shell = await caches.match(OFFLINE_URL);
        if (shell) return shell;
      }
      return new Response('offline', {status:503, headers:{'Content-Type':'text/plain'}});
    }
  })());
});

// Mensajería opcional para forzar skipWaiting
self.addEventListener('message', (e)=>{
  if (e.data === 'skipWaiting') self.skipWaiting();
});