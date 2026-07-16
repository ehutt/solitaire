/* Better Solitaire — service worker
   Offline-first shell caching. Bump CACHE when assets change so clients
   pick up the new version (old caches are purged on activate). */
const CACHE = "solitaire-v6";
const SHELL = [
  ".",
  "index.html",
  "manifest.json",
  "assets/audio/card-shuffle.mp3",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll fails the whole install if one URL 404s; add individually so a
      // missing icon never blocks offline support for the rest of the shell.
      Promise.allSettled(SHELL.map((u) => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Navigations: network-first so a fresh index.html wins when online, but
  // fall back to the cached shell offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() =>
          caches.match("index.html").then((r) => r || caches.match("."))
        )
    );
    return;
  }

  // Everything else: cache-first, populate on miss.
  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
