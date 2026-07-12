// Minimal, deliberately conservative service worker. Its job is to make Okolo
// installable (Android's install prompt needs a SW with a fetch handler) and to
// show the app shell when offline — NOT to cache app code (that risks serving
// stale Next.js chunks). So: network-first for navigations, cached shell only as
// an offline fallback; everything else passes straight through to the network.
const CACHE = 'okolo-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add('/')).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      })
      .catch(() => caches.match('/'))
  );
});
