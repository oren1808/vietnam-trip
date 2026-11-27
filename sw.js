// Offline service worker for the trip app. f5ae7508db14 is replaced at build time.
const V = 'vt-f5ae7508db14';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
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
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      const c = await caches.open(V);
      try {
        const res = await Promise.race([fetch(req, {cache: 'no-store'}), timeout(3500)]);
        if (res.ok) { c.put('./index.html', res.clone()); return res; }
      } catch (_) {}
      return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
    })());
    return;
  }

  // Everything else on our origin: cache-first.
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(res => {
    if (res.ok) caches.open(V).then(c => c.put(req, res.clone()));
    return res;
  })));
});
