// =========================================
// Web Push / PWA
// =========================================

const CHAT_VAPID_PUBLIC_KEY = "BDiBPq7oIur30bHa0GlYLuNxBwzkph4srXdSHVD2j_rzbJVmxAwXJIKZucYWEgRIXzTAXwHuZv73lEpd5g0h36w";
const CHAT_PUSH_SUBSCRIPTION_KEY = "chat_push_subscription";
const CHAT_PUSH_BUTTON_ID = "enablePushButton";
const CHAT_IS_ANDROID = /Android/i.test(navigator.userAgent || "");

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

function removePushButton() {
    const button = document.getElementById(CHAT_PUSH_BUTTON_ID);
    if (button) button.remove();
}

async function registerChatServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;

    try {
        const registration = await navigator.serviceWorker.register(
            "./sw.js",
            { scope: "./" }
        );
        await navigator.serviceWorker.ready;
        return registration;
    } catch (error) {
        console.error("Не удалось зарегистрировать Service Worker:", error);
        return null;
    }
}

async function getChatPushUser() {
    if (window.currentUser?.id) return window.currentUser;
    if (!window.supabaseClient) return null;

    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (error || !data?.user) return null;
        return data.user;
    } catch (error) {
        console.error("Не удалось определить пользователя для push:", error);
        return null;
    }
}

async function saveChatPushSubscription(subscription) {
    if (!subscription || !window.supabaseClient) return false;

    const user = await getChatPushUser();
    if (!user?.id) {
        console.warn("Push-подписка не сохранена: пользователь ещё не авторизован.");
        return false;
    }

    const json = subscription.toJSON();
    const keys = json.keys || {};

    if (!json.endpoint || !keys.p256dh || !keys.auth) {
        console.error("Push-подписка не содержит необходимых ключей.");
        return false;
    }

    const { error } = await window.supabaseClient
        .from("web_push_subscriptions")
        .upsert({
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id,endpoint" });

    if (error) {
        console.error("Не удалось сохранить push-подписку:", error);
        return false;
    }

    localStorage.setItem(CHAT_PUSH_SUBSCRIPTION_KEY, JSON.stringify(json));
    return true;
}

async function enableChatPushNotifications() {
    if (!isPushConfigured()) return null;

    if (!("Notification" in window) || !("PushManager" in window)) {
        alert("Этот браузер не поддерживает Web Push.");
        return null;
    }

    const registration = await registerChatServiceWorker();
    if (!registration) return null;

    let permission = Notification.permission;

    if (permission !== "granted") {
        permission = await Notification.requestPermission();
    }

    if (permission !== "granted") return null;

    const existingSubscription =
        await registration.pushManager.getSubscription();

    const subscription =
        existingSubscription ||
        await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey:
                urlBase64ToUint8Array(CHAT_VAPID_PUBLIC_KEY)
        });

    const saved = await saveChatPushSubscription(subscription);
    if (!saved) return null;

    localStorage.setItem("chat_push_enabled", "1");
    removePushButton();

    return subscription;
}

async function syncChatPushSubscription() {
    if (!isPushConfigured() || !window.supabaseClient) return null;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    if (!("Notification" in window) || Notification.permission !== "granted") return null;

    try {
        const registration = await registerChatServiceWorker();
        if (!registration) return null;

        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return null;

        const saved = await saveChatPushSubscription(subscription);
        if (!saved) return null;

        localStorage.setItem("chat_push_enabled", "1");
        removePushButton();
        return subscription;
    } catch (error) {
        console.error("Не удалось синхронизировать push-подписку:", error);
        return null;
    }
}

async function sendChatPushForMessage(messageId) {
    if (!messageId || !window.supabaseClient) return;

    try {
        const { data, error } =
            await window.supabaseClient.functions.invoke(
                "send-message-push",
                { body: { messageId } }
            );

        if (error) {
            console.warn("Web Push не отправлен:", error);
            return;
        }

        if (data?.error) {
            console.warn("Web Push сервер вернул ошибку:", data.error);
        }
    } catch (error) {
        console.warn("Ошибка вызова Web Push:", error);
    }
}

async function createPushButton() {
    if (!isPushConfigured()) return;
    if (document.getElementById(CHAT_PUSH_BUTTON_ID)) return;

    const permission = "Notification" in window
        ? Notification.permission
        : "default";

    // iPhone оставляем на прежней рабочей схеме.
    if (!CHAT_IS_ANDROID && permission === "granted") return;

    // На Android permission может быть granted, а PushSubscription отсутствовать
    // после очистки данных браузера/старой установки. В таком случае кнопку
    // нужно показать снова, иначе пользователь не сможет восстановить push.
    if (CHAT_IS_ANDROID && permission === "granted") {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) return;
        } catch (error) {
            console.warn("Не удалось проверить Android push-подписку:", error);
        }
    }

    const button = document.createElement("button");
    button.id = CHAT_PUSH_BUTTON_ID;
    button.type = "button";
    button.textContent = "🔔 Включить уведомления";
    button.setAttribute("aria-label", "Включить уведомления");

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
        button.textContent = "⏳ Подключаем уведомления...";

        const subscription = await enableChatPushNotifications();

        if (!subscription) {
            button.disabled = false;

            if (
                "Notification" in window &&
                Notification.permission === "denied"
            ) {
                button.textContent = "⚠️ Разрешите уведомления в настройках";
            } else {
                button.textContent = "🔔 Включить уведомления";
            }
        }
    });

    document.body.appendChild(button);
}

async function initChatPush() {
    await registerChatServiceWorker();
    await syncChatPushSubscription();
    await createPushButton();

    if (window.supabaseClient?.auth?.onAuthStateChange) {
        window.supabaseClient.auth.onAuthStateChange(() => {
            setTimeout(() => {
                void syncChatPushSubscription();
                void createPushButton();
            }, 0);
        });
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            void syncChatPushSubscription();
            void createPushButton();
        }
    });
}

void initChatPush();
