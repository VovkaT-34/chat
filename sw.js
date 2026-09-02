const CACHE_NAME = "chat-pwa-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./chat.css",
  "./chat-mobile.css",
  "./manifest.webmanifest",
  "./favicon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: "Браузерный чат",
      body: event.data ? event.data.text() : "Новое сообщение"
    };
  }

  const title = data.title || "Браузерный чат";
  const options = {
    body: data.body || "Новое сообщение",
    icon: data.icon || "./favicon.svg",
    badge: data.badge || "./favicon.svg",
    tag: data.tag || "chat-message",
    renotify: true,
    data: {
      url: data.url || "./index.html",
      chatId: data.chatId || null,
      messageId: data.messageId || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "./index.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
