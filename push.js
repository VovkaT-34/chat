// =========================================
// Web Push / PWA
// =========================================

const CHAT_VAPID_PUBLIC_KEY = "BDiBPq7oIur30bHa0GlYLuNxBwzkph4srXdSHVD2j_rzbJVmxAwXJIKZucYWEgRIXzTAXwHuZv73lEpd5g0h36w";
const CHAT_PUSH_SUBSCRIPTION_KEY = "chat_push_subscription";

function isPushConfigured() {
    return Boolean(
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
    if (!("serviceWorker" in navigator)) return null;

    try {
        const registration = await navigator.serviceWorker.register("./sw.js", {
            scope: "./"
        });
        await navigator.serviceWorker.ready;
        return registration;
    } catch (error) {
        console.error("Не удалось зарегистрировать Service Worker:", error);
        return null;
    }
}

async function saveChatPushSubscription(subscription) {
    if (!subscription || !window.supabaseClient || !window.currentUser) return false;

    const json = subscription.toJSON();
    const keys = json.keys || {};

    if (!json.endpoint || !keys.p256dh || !keys.auth) return false;

    const { error } = await window.supabaseClient
        .from("web_push_subscriptions")
        .upsert(
            {
                user_id: window.currentUser.id,
                endpoint: json.endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                updated_at: new Date().toISOString()
            },
            { onConflict: "user_id,endpoint" }
        );

    if (error) {
        console.error("Не удалось сохранить push-подписку:", error);
        return false;
    }

    localStorage.setItem(CHAT_PUSH_SUBSCRIPTION_KEY, JSON.stringify(json));
    return true;
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
    if (permission !== "granted") return null;

    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CHAT_VAPID_PUBLIC_KEY)
    });

    const saved = await saveChatPushSubscription(subscription);
    return saved ? subscription : null;
}

async function syncChatPushSubscription() {
    if (!isPushConfigured() || !window.supabaseClient || !window.currentUser) return null;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    if (Notification.permission !== "granted") return null;

    try {
        const registration = await registerChatServiceWorker();
        if (!registration) return null;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return null;
        await saveChatPushSubscription(subscription);
        return subscription;
    } catch (error) {
        console.error("Не удалось синхронизировать push-подписку:", error);
        return null;
    }
}

function createPushButton() {
    if (!isPushConfigured()) return;
    if (document.getElementById("enablePushButton")) return;

    const button = document.createElement("button");
    button.id = "enablePushButton";
    button.type = "button";
    button.textContent = Notification.permission === "granted"
        ? "✅ Уведомления включены"
        : "🔔 Включить уведомления";
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
        button.textContent = subscription
            ? "✅ Уведомления включены"
            : "🔔 Включить уведомления";
    });

    document.body.appendChild(button);
}

(async function initChatPush() {
    await registerChatServiceWorker();
    await syncChatPushSubscription();
    createPushButton();
})();
