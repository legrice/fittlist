// The service worker exists so the app is installable, and it is deliberately
// almost inert.
//
// Every screen here is force-dynamic and behind a session, so caching a page
// means serving one account's schedule to whoever opens the app next. It
// touches nothing but the fonts and the icons: static, public, and the only
// things worth having ready before the network answers.
const VERSION = "fittlist-v2";
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

// Push: the admin's signup pings. The payload is small JSON {title, body,
// url}; a push with no payload still shows something rather than being
// silently dropped, because browsers punish workers that swallow pushes.
self.addEventListener("push", (event) => {
  let data = { title: "fittlist", body: "Something happened.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // an unparseable payload keeps the fallback text
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

// Tapping the notification lands on the page it points at, reusing an open
// window when there is one instead of stacking new ones.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
