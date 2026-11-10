// Minimal service worker.
// Caches ONLY public static assets + the offline page. It never caches /api/* or authenticated HTML,
// so one user's data can never be served to another user on a shared device.
const CACHE = "routine-static-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network only

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(payload.title || "Routine reminder", {
      body: payload.body || "You have tasks left to complete today.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || "routine-reminder",
      data: { url: payload.url || "/tasks" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/tasks", self.location.origin);
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : new URL("/tasks", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((candidate) => new URL(candidate.url).origin === self.location.origin);
      if (client) {
        if ("navigate" in client) client.navigate(targetUrl);
        return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
