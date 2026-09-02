// =========================================
// Web Push / PWA
// =========================================
// ВАЖНО: публичный VAPID-ключ добавляется сюда после
// генерации пары VAPID на серверной стороне.
// Секретный VAPID-ключ НИКОГДА не помещается в этот файл.

const CHAT_VAPID_PUBLIC_KEY = "REPLACE_WITH_VAPID_PUBLIC_KEY";

function isPushConfigured() {
    return (
        CHAT_VAPID_PUBLIC_KEY &&
        CHAT_VAPID_PUBLIC_KEY !== "REPLACE_WITH_VAPID_PUBLIC_KEY"
    );
}

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function registerChatServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return null;
    }

    try {
        return await navigator.serviceWorker.register("./sw.js", {
            scope: "./"
        });
    } catch (error) {
        console.error("Не удалось зарегистрировать Service Worker:", error);
        return null;
    }
}

async function enableChatPushNotifications() {
    if (!isPushConfigured()) {
        console.warn("Web Push ещё не настроен: отсутствует VAPID public key.");
        return null;
    }

    if (!("Notification" in window) || !("PushManager" in window)) {
        alert("Этот браузер не поддерживает Web Push.");
        return null;
    }

    const registration = await registerChatServiceWorker();
    if (!registration) return null;

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
        return null;
    }

    const existingSubscription = await registration.pushManager.getSubscription();

    const subscription = existingSubscription ||
        await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(CHAT_VAPID_PUBLIC_KEY)
        });

    // Пока backend-таблица push_subscriptions не создана,
    // подписку сохраняем локально. После добавления таблицы этот
    // объект должен отправляться в Supabase вместе с currentUser.id.
    localStorage.setItem(
        "chat_push_subscription",
        JSON.stringify(subscription.toJSON())
    );

    return subscription;
}

function createPushButton() {
    if (!isPushConfigured()) return;
    if (document.getElementById("enablePushButton")) return;

    const button = document.createElement("button");
    button.id = "enablePushButton";
    button.type = "button";
    button.textContent = "🔔 Включить уведомления";
    button.style.cssText = [
        "position:fixed",
        "left:12px",
        "bottom:12px",
        "z-index:9999",
        "min-height:42px",
        "padding:9px 13px",
        "border:1px solid rgba(255,255,255,.2)",
        "border-radius:11px",
        "background:linear-gradient(135deg,#171412,#735039)",
        "color:#fffaf5",
        "font-weight:700",
        "font-size:13px",
        "box-shadow:0 5px 14px rgba(55,38,25,.2)",
        "cursor:pointer"
    ].join(";");

    button.addEventListener("click", async () => {
        button.disabled = true;
        const subscription = await enableChatPushNotifications();
        button.disabled = false;

        if (subscription) {
            button.textContent = "✅ Уведомления включены";
        }
    });

    document.body.appendChild(button);
}

(async function initChatPush() {
    await registerChatServiceWorker();
    createPushButton();
})();
