// ===============================
// Настройки звука чатов
// ===============================

const CHAT_SOUND_KEY = "chatSoundSettings";

const CHAT_SOUND_ICON_ON = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>';
const CHAT_SOUND_ICON_OFF = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 10 4 4M21 10l-4 4" stroke="#ff0000" stroke-width="2.4"/></svg>';

let chatSoundAudioUnlocked = false;
let chatSoundUnlockPromise = null;
let chatSoundAudioContext = null;
let chatSoundAudioBuffer = null;
let chatSoundAudioSource = null;
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

    // A real user gesture is the most reliable place to unlock Web Audio.
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

function getChatSoundAudioContext() {
    if (chatSoundAudioContext) return chatSoundAudioContext;

    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        throw new Error("Web Audio API не поддерживается");
    }

    chatSoundAudioContext = new AudioContextClass();

    return chatSoundAudioContext;
}

function unlockChatSound() {
    if (
        chatSoundAudioUnlocked &&
        chatSoundAudioContext &&
        chatSoundAudioContext.state === "running" &&
        chatSoundAudioBuffer
    ) {
        return Promise.resolve();
    }

    if (chatSoundUnlockPromise) return chatSoundUnlockPromise;

    let context;

    try {
        context = getChatSoundAudioContext();
    } catch (error) {
        return Promise.reject(error);
    }

    // resume() is intentionally called synchronously from the user gesture.
    const resumePromise =
        context.state === "suspended"
            ? context.resume()
            : Promise.resolve();

    chatSoundUnlockPromise = resumePromise
        .then(function () {
            if (chatSoundAudioBuffer) {
                chatSoundAudioUnlocked = true;
                return;
            }

            return fetch("message.mp3", { cache: "force-cache" })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("Не удалось загрузить message.mp3");
                    }
                    return response.arrayBuffer();
                })
                .then(function (data) {
                    return new Promise(function (resolve, reject) {
                        context.decodeAudioData(
                            data,
                            function (buffer) {
                                chatSoundAudioBuffer = buffer;
                                chatSoundAudioUnlocked = true;
                                resolve();
                            },
                            reject
                        );
                    });
                });
        })
        .then(function () {
            chatSoundAudioUnlocked = true;
        })
        .catch(function (error) {
            chatSoundUnlockPromise = null;
            chatSoundAudioUnlocked = false;
            throw error;
        });

    return chatSoundUnlockPromise;
}

function playNextChatSound() {
    if (chatSoundPlaying || chatSoundQueue <= 0) return;

    const context = chatSoundAudioContext;
    const buffer = chatSoundAudioBuffer;

    if (!context || !buffer) {
        chatSoundQueue = 0;
        chatSoundPlaying = false;
        return;
    }

    chatSoundQueue--;
    chatSoundPlaying = true;

    if (context.state !== "running") {
        context.resume()
            .then(function () {
                playNextChatSound();
            })
            .catch(function (error) {
                console.log("Звук не воспроизведён:", error);
                chatSoundPlaying = false;
            });
        return;
    }

    try {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        chatSoundAudioSource = source;

        source.onended = function () {
            if (chatSoundAudioSource === source) {
                chatSoundAudioSource = null;
            }
            chatSoundPlaying = false;
            playNextChatSound();
        };

        source.start(0);
    } catch (error) {
        console.log("Ошибка воспроизведения звука:", error);
        if (chatSoundAudioSource) {
            chatSoundAudioSource = null;
        }
        chatSoundPlaying = false;
        playNextChatSound();
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

// Unlock Web Audio after the first real interaction with the app.
["touchstart", "touchend", "click", "keydown"].forEach(function (eventName) {
    document.addEventListener(eventName, unlockChatSound, {
        passive: true
    });
});

// Restore Web Audio after iOS interrupts the audio session.
document.addEventListener("visibilitychange", function () {
    if (!document.hidden && chatSoundAudioContext) {
        chatSoundAudioContext.resume().catch(function () {});
    }
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
