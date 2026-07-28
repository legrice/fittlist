// The service worker exists so the app is installable, and it is deliberately
// almost inert.
//
// Every screen here is force-dynamic and behind a session, so caching a page
// means serving one account's schedule to whoever opens the app next. It
// touches nothing but the fonts and the icons: static, public, and the only
// things worth having ready before the network answers.
const VERSION = "fittlist-v1";
const SHELL = [
  "/fonts/delight-400.woff2",
  "/fonts/delight-700.woff2",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isShell(url) {
  return url.pathname.startsWith("/fonts/") || SHELL.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isShell(url)) return; // straight to the network

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
