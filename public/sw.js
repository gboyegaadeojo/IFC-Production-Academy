// IFC Production Academy service worker (SPEC §PWA "launch"). It keeps one small offline page and
// the app icons, and never caches pages or data, so nothing private is stored on the device. It
// also shows the alerts the Academy sends (web push) and opens the right page when one is tapped.
// v2: the Signal Line icon (2026-11-10). A new name makes every installed copy fetch it again.
const CACHE = "academy-shell-v2";
const SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Pages always come from the network; only when there's no connection does the offline page show.
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "IFC Academy";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: typeof data.body === "string" ? data.body : "",
        icon: "/icons/icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : undefined,
        data: { url: typeof data.url === "string" ? data.url : "/notifications" },
      }),
      showBadge(data.badge),
    ]),
  );
});

// The number on the app's icon: everything unread, sent with each alert, so it's right even with
// the app closed. Devices that can't show one (Android's Chrome shows its own dot) skip it.
function showBadge(count) {
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return Promise.resolve();
  }
  const host = self.navigator;
  const step =
    count > 0
      ? host.setAppBadge && host.setAppBadge(Math.floor(count))
      : host.clearAppBadge && host.clearAppBadge();
  return Promise.resolve(step).catch(() => undefined);
}

// Opens the alert's page in the app, reusing an open window when there is one. Only paths inside
// the Academy are followed.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url;
  const url = new URL(
    typeof path === "string" && path.startsWith("/") ? path : "/notifications",
    self.location.origin,
  );
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      if (open) {
        return open.focus().then((w) => (w && "navigate" in w ? w.navigate(url.href) : undefined));
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
