/**
 * sw.js - the service worker: the site keeps working without a network once it has been opened.
 *
 * NETWORK FIRST, ALWAYS: every request of this site goes to the network as
 * usual, and the answer is kept in a cache on the way through. Only when the
 * network fails is the kept answer given instead. So a deploy is seen at
 * once, development never meets a stale file, and offline the clock still
 * opens: everything it needs (pages, modules, styles, the core, icons) is
 * static, and the core computes every reading on the device.
 *
 * What to keep: the page sends the list of everything it loaded (its own
 * resource timing) once it is ready (app/shell/offline.js), so there is no
 * list of files to maintain here. Requests to other origins are left alone
 * (the site makes none).
 */
const CACHE = 'fractonica';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** The page's list of URLs: fetch and keep each one that is ours. */
self.addEventListener('message', (event) => {
  const urls = Array.isArray(event.data?.keep) ? event.data.keep : [];
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(urls.filter((url) => new URL(url).origin === self.location.origin).map((url) => cache.add(url).catch(() => null))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const answer = await fetch(request);
        if (answer.ok) cache.put(request, answer.clone());
        return answer;
      } catch (error) {
        // offline: the kept answer; a page asked with other URL state (?t=, &screen= ...) is the same page
        const kept = (await cache.match(request)) ?? (await cache.match(request, { ignoreSearch: true }));
        if (kept) return kept;
        throw error;
      }
    })(),
  );
});
