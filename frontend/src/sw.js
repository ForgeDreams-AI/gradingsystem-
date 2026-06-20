/**
 * sw.js — service worker for offline use.
 * ----------------------------------------------------------------------------
 * Caches the app shell (page + bundle + styles) so the iPad can open and run
 * the app with no signal. It deliberately does NOT cache API calls — those
 * always go to the network, and the app's own offline queue handles retries.
 *
 * Bump CACHE (e.g. v1 -> v2) whenever you ship a new app.js so devices refresh.
 * ----------------------------------------------------------------------------
 */
const CACHE = 'grading-v13';
const ASSETS = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                         // never touch API POSTs
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // let the backend (other origin) hit the network
  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
