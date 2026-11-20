// Cache dell'app per l'uso offline. Cambia il numero quando pubblichi una nuova versione.
const CACHE = 'arca-vendite-v7';
const SHELL = ['./', 'index.html', 'styles.css', 'splash.js', 'app.js', 'manifest.webmanifest',
  'img/logo-arca.png', 'img/logo-nome.png', 'img/logo-zampe.png','icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const FBV = '12.3.0';
const FIREBASE = ['app', 'auth', 'firestore'].map(m => `https://www.gstatic.com/firebasejs/${FBV}/firebase-${m}-compat.js`);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    // librerie Firebase (da un altro sito): si salvano una per una, senza bloccare l'installazione se una fallisce
    await Promise.all(FIREBASE.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => { })));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Prima la cache (apertura istantanea e offline), poi aggiorna in background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/__/')) return;   // pagine di accesso di Firebase: mai dalla cache
  const ok = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)
    || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
  if (!ok) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
