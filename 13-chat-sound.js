// ===============================
// Настройки звука чатов
// ===============================

const CHAT_SOUND_KEY = "chatSoundSettings";

const CHAT_SOUND_ICON_ON = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>';
const CHAT_SOUND_ICON_OFF = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 10 4 4M21 10l-4 4"/></svg>';

let chatSoundAudioUnlocked = false;

function getChatSoundSettings() {
    try {
        return JSON.parse(localStorage.getItem(CHAT_SOUND_KEY)) || {};
    } catch {
        return {};
    }
}

function isChatSoundEnabled(chatId) {
    const settings = getChatSoundSettings();
    return settings[String(chatId)] !== false;
}

function toggleChatSound(chatId) {
    const settings = getChatSoundSettings();
    const key = String(chatId);
    settings[key] = settings[key] === false;
    localStorage.setItem(CHAT_SOUND_KEY, JSON.stringify(settings));
    updateChatSoundButton(chatId);

    // A real user gesture is the most reliable place to unlock WebView audio.
    unlockChatSound();
}

function updateChatSoundButton(chatId) {
    const button = document.querySelector(
        `[data-sound-chat-id="${chatId}"]`
    );

    if (!button) return;

    const enabled = isChatSoundEnabled(chatId);

    button.innerHTML = enabled
        ? CHAT_SOUND_ICON_ON
        : CHAT_SOUND_ICON_OFF;

    button.style.color = "#171d24";
    button.title = enabled
        ? "Выключить звук"
        : "Включить звук";
    button.setAttribute("aria-label", button.title);
}

function unlockChatSound() {
    if (chatSoundAudioUnlocked) return;

    const sound = document.getElementById("messageSound");
    if (!sound) return;

    try {
        sound.muted = true;
        sound.volume = 0;
        sound.currentTime = 0;

        const promise = sound.play();

        if (promise && typeof promise.then === "function") {
            promise.then(function () {
                sound.pause();
                sound.currentTime = 0;
                sound.muted = false;
                sound.volume = 1;
                chatSoundAudioUnlocked = true;
            }).catch(function () {
                sound.muted = false;
                sound.volume = 1;
            });
        } else {
            sound.pause();
            sound.currentTime = 0;
            sound.muted = false;
            sound.volume = 1;
            chatSoundAudioUnlocked = true;
        }
    } catch (error) {
        console.log("Не удалось разблокировать звук:", error);
    }
}

function playMessageSound(chatId) {
    if (!chatId || !isChatSoundEnabled(chatId)) return;

    // The APK has its own notification channel for background messages.
    // This part is for the in-app message sound while the WebView is active.
    unlockChatSound();

    const sound = document.getElementById("messageSound");
    if (!sound) return;

    try {
        sound.muted = false;
        sound.volume = 1;
        sound.currentTime = 0;

        const promise = sound.play();
        if (promise && typeof promise.catch === "function") {
            promise.catch(error =>
                console.log("Звук не воспроизведён:", error)
            );
        }
    } catch (error) {
        console.log("Ошибка воспроизведения звука:", error);
    }
}

// Unlock HTML audio after the first real interaction with the app.
["touchstart", "touchend", "click", "keydown"].forEach(function (eventName) {
    document.addEventListener(eventName, unlockChatSound, {
        passive: true,
        once: true
    });
});

// Android 13+ requires a runtime notification permission. The APK already
// exposes a native bridge for it; ask only after the page is usable.
function requestAndroidNotificationPermission() {
    if (!window.AndroidNotifications ||
        typeof window.AndroidNotifications.requestPermission !== "function") {
        return;
    }

    try {
        window.AndroidNotifications.requestPermission();
    } catch (error) {
        console.warn("Не удалось запросить разрешение уведомлений Android:", error);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", requestAndroidNotificationPermission, {
        once: true
    });
} else {
    requestAndroidNotificationPermission();
}
