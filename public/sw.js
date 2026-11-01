// Jarso service worker: shows a web push notice and opens its record (FR16). It caches nothing:
// the app works offline through its own outbox, and a stale shell would be worse than none.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Jarso", body: "Something new in your inbox.", url: "/", tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // A payload that isn't JSON still shows the default line.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

/** Only Jarso's own pages open from a notice, whatever the payload says. */
function targetUrl(raw) {
  const home = `${self.location.origin}/`;
  try {
    const url = new URL(raw ?? "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : home;
  } catch {
    return home;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // A tab already on the record is focused; any other tab may hold unsent work, so a new
      // one opens instead of navigating it away.
      const there = clients.find((client) => client.url === url && "focus" in client);
      return there ? there.focus() : self.clients.openWindow(url);
    }),
  );
});
