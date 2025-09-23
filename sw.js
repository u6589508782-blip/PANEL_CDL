/* sw.js */
const VERSION = 'v3';              // ← BUMPEA si cambias assets/estrategia
const CACHE   = `cdl-${VERSION}`;

const ASSETS = [
  // Shell
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',

  // Iconos
  '/icon-192.png',
  '/icon-512.png',

  // Imágenes UI
  '/angular.png',
  '/linea-kaltenbach.png'
  // Nota: librerías CDN (Chart.js, QRCode) se cachean en ejecución (runtime)
];

/* ====== install ====== */
self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();                           // ← importante
});

/* ====== activate ====== */
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Mensajes