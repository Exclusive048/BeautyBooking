self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "МастерРядом", {
      body: data.body,
      icon: "/icons/icon-192.png",
      // PUSH-COVERAGE-01: прежний `/icons/badge-72.png` в public/ не существовал.
      badge: "/icons/icon-72.png",
      // Сообщения одной переписки схлопываются в одну плашку (tag), но каждое
      // новое всё равно звенит (renotify). Без тега — как раньше, стопкой.
      ...(data.tag ? { tag: data.tag, renotify: true } : {}),
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if already open
      for (const client of windowClients) {
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client) {
            return client.navigate(url);
          }
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.includes("pages-cache"))
          .map((key) => caches.delete(key))
      )
    )
  );
});

