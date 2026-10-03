// Imported by the generated service worker (vite.config.ts › workbox.importScripts).
// Push/notification events only — no fetch/cache handlers, so Convex traffic
// is never intercepted (README › PWA rule).
self.addEventListener("push", (event) => {
  let payload = { title: "Familienapp", body: "", url: "/" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // Malformed payload: fall back to the generic defaults above.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
