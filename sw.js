const CACHE_NAME = "chat-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./chat.css",
  "./chat-mobile.css",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./message.mp3"
];

const SUPABASE_URL = "https://sxkukrqjtgkxmzuzondm.supabase.co";
const CONFIRM_DELIVERY_URL = `${SUPABASE_URL}/functions/v1/confirm-push-delivery`;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => undefined)
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
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

async function confirmPushDelivery(data) {
  if (!data?.messageId || !data?.deliveryToken) return;

  try {
    await fetch(CONFIRM_DELIVERY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-delivery-token": data.deliveryToken
      },
      body: JSON.stringify({ messageId: data.messageId })
    });
  } catch (error) {
    console.warn("Не удалось подтвердить доставку push:", error);
  }
}

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      type: "message",
      title: "Браузерный чат",
      body: event.data ? event.data.text() : "Новое сообщение"
    };
  }

  const isCall = data.type === "incoming-call";
  const title = data.title || (isCall ? "Входящий звонок" : "Браузерный чат");
  const count = Number.isFinite(Number(data.count)) && Number(data.count) > 0
    ? Number(data.count)
    : 1;

  const options = {
    body: data.body || (isCall ? "Входящий звонок" : "Новое сообщение"),
    icon: data.icon || "./favicon.svg",
    badge: data.badge || "./favicon.svg",
    tag: data.tag || `${isCall ? "call" : "chat-message"}-${data.chatId || "general"}`,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: data.url || "./index.html",
      chatId: data.chatId || null,
      messageId: data.messageId || null,
      callId: data.callId || null,
      type: data.type || "message"
    }
  };

  if (!isCall && count > 1) {
    options.body = `${data.body || "Новое сообщение"}\nНепрочитанных: ${count}`;
  }

  const work = [self.registration.showNotification(title, options)];
  if (data.type === "message") work.push(confirmPushDelivery(data));
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./index.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }

      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
