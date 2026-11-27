// ===============================
// Настройки звука чатов
// ===============================

const CHAT_SOUND_KEY = "chatSoundSettings";

const CHAT_SOUND_ICON_ON = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>';
const CHAT_SOUND_ICON_OFF = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m16.5 9.5 5 5M21.5 9.5l-5 5" stroke="#ff0000" stroke-width="3.1"/></svg>';

let chatSoundAudioUnlocked = false;
let chatSoundUnlockPromise = null;
let chatSoundUnlockLastAttempt = 0;
let chatSoundQueue = 0;
let chatSoundPlaying = false;

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
    if (chatSoundAudioUnlocked) return Promise.resolve();

    if (chatSoundUnlockPromise) return chatSoundUnlockPromise;

    const now = Date.now();
    if (now - chatSoundUnlockLastAttempt < 2000) {
        return Promise.reject(new Error("Разблокировка звука недавно выполнялась"));
    }
    chatSoundUnlockLastAttempt = now;

    const sound = document.getElementById("messageSound");
    if (!sound) return Promise.reject(new Error("messageSound не найден"));

    chatSoundUnlockPromise = new Promise(function (resolve, reject) {
        try {
            sound.muted = false;
            sound.volume = 0;
            sound.currentTime = 0;

            const promise = sound.play();

            if (promise && typeof promise.then === "function") {
                promise.then(function () {
                    sound.pause();
                    sound.currentTime = 0;
                    sound.volume = 1;
                    chatSoundAudioUnlocked = true;
                    resolve();
                }).catch(function (error) {
                    sound.pause();
                    sound.currentTime = 0;
                    sound.volume = 1;
                    chatSoundUnlockPromise = null;
                    reject(error);
                });
            } else {
                sound.pause();
                sound.currentTime = 0;
                sound.volume = 1;
                chatSoundAudioUnlocked = true;
                resolve();
            }
        } catch (error) {
            chatSoundUnlockPromise = null;
            reject(error);
        }
    });

    return chatSoundUnlockPromise;
}

function playNextChatSound() {
    if (chatSoundPlaying || chatSoundQueue <= 0) return;

    const sound = document.getElementById("messageSound");
    if (!sound) {
        chatSoundQueue = 0;
        return;
    }

    chatSoundQueue--;
    chatSoundPlaying = true;
    sound.muted = false;
    sound.volume = 1;
    sound.currentTime = 0;

    const finish = function () {
        chatSoundPlaying = false;
        playNextChatSound();
    };

    sound.addEventListener("ended", finish, { once: true });

    try {
        const promise = sound.play();
        if (promise && typeof promise.catch === "function") {
            promise.catch(function (error) {
                console.log("Звук не воспроизведён:", error);
                sound.removeEventListener("ended", finish);
                finish();
            });
        }
    } catch (error) {
        console.log("Ошибка воспроизведения звука:", error);
        sound.removeEventListener("ended", finish);
        finish();
    }
}

function playMessageSound(chatId) {
    if (!chatId || !isChatSoundEnabled(chatId)) return;

    chatSoundQueue++;

    unlockChatSound()
        .then(function () {
            playNextChatSound();
        })
        .catch(function (error) {
            chatSoundQueue = Math.max(0, chatSoundQueue - 1);
            console.log("Звук не воспроизведён:", error);
        });
}

["click", "keydown"].forEach(function (eventName) {
    document.addEventListener(eventName, unlockChatSound, {
        passive: true
    });
});

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
