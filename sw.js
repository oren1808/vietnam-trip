// Offline service worker for the trip app. 81e3230c2045 is replaced at build time.
const V = 'vt-81e3230c2045';
const PAGES = ["./index.html", "./games.html"];
const CORE = ['./', ...PAGES, './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([V, 'vt-fonts']);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts: cache-first, fill on first online visit.
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open('vt-fonts').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // The page: try the network briefly (fresh version when there is signal), else the cached copy.
  const page = PAGES.find(p => url.pathname.endsWith(p.slice(1))) || (url.pathname.endsWith('/') ? './index.html' : null);
  if (page || req.mode === 'navigate') {
    const key = page || './index.html';
    e.respondWith((async () => {
      const c = await caches.open(V);
      try {
        const res = await Promise.race([fetch(req, {cache: 'no-store'}), timeout(3500)]);
        if (res.ok) { c.put(key, res.clone()); return res; }
      } catch (_) {}
      return (await c.match(key)) || (await c.match('./index.html')) || Response.error();
    })());
    return;
  }

  // Everything else on our origin: cache-first.
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(res => {
    if (res.ok) caches.open(V).then(c => c.put(req, res.clone()));
    return res;
  })));
});
