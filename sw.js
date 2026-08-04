const CACHE = 'commander-forge-shell-v5-same-origin-precons';
const ASSETS = ['./', './index.html', './styles.css', './main.js', './constants.js', './utils.js', './api.js', './state.js', './rules.js', './game.js', './coach.js', './forge-mark.svg', './card-back.svg', './demo-card.svg', './token.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  ]));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // Never cache MTGJSON or Scryfall API responses here.

  // Network-first keeps deployments fresh; cached shell remains an offline fallback.
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request)),
  );
});
