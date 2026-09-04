// ===============================
// Настройки звука чатов
// ===============================

const CHAT_SOUND_KEY = "chatSoundSettings";

// Уникальные SVG-иконки без внешних библиотек/картинок.
// Цвет намеренно очень тёмный, чтобы иконки не терялись на мобильном интерфейсе.
const CHAT_SOUND_ICON_ON = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>';
const CHAT_SOUND_ICON_OFF = '<svg class="icon-svg chat-sound-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171d24" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 10 4 4M21 10l-4 4"/></svg>';

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

function playMessageSound(chatId) {
    if (!chatId || !isChatSoundEnabled(chatId)) return;

    const sound = document.getElementById("messageSound");
    if (!sound) return;

    sound.currentTime = 0;
    sound.play().catch(error =>
        console.log("Звук не воспроизведён:", error)
    );
}
