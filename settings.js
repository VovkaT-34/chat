const $ = id => document.getElementById(id);

function showMessage(text, error = false) {
    const box = $("message");
    if (!box) return;
    box.textContent = text;
    box.style.color = error ? "#b42318" : "#356b4a";
}

function hasNativeNotificationBridge() { return Boolean(window.AndroidNotifications); }
function getNativeNotificationsEnabled() {
    if (!hasNativeNotificationBridge()) return null;
    try { return Boolean(window.AndroidNotifications.isEnabled()); }
    catch (error) { console.warn("Не удалось проверить состояние уведомлений Android:", error); return null; }
}
function updateNotificationUi() {
    const button = $("notificationToggle"), status = $("notificationStatus");
    if (!button || !status) return;
    const nativeState = getNativeNotificationsEnabled();
    if (nativeState === true) { button.textContent = "Вкл."; status.textContent = "Системные уведомления включены"; return; }
    if (nativeState === false) { button.textContent = "Включить"; status.textContent = "Системные уведомления выключены — нажмите «Включить»"; return; }
    if ("Notification" in window) {
        if (Notification.permission === "granted") { button.textContent = "Вкл."; status.textContent = "Web Push разрешён"; }
        else if (Notification.permission === "denied") { button.textContent = "Открыть настройки"; status.textContent = "Уведомления запрещены браузером — откройте настройки"; }
        else { button.textContent = "Включить"; status.textContent = "Системные уведомления о новых сообщениях"; }
    }
}
async function enableNotifications() {
    const button = $("notificationToggle");
    if (button) { button.disabled = true; button.textContent = "Подключение…"; }
    try {
        if (hasNativeNotificationBridge()) {
            const enabled = getNativeNotificationsEnabled();
            if (enabled === true) { showMessage("Уведомления уже включены."); return; }
            window.AndroidNotifications.requestPermission(); showMessage("Разрешите уведомления в системном окне Android."); setTimeout(updateNotificationUi, 700); return;
        }
        if (typeof enableChatPushNotifications === "function") {
            const subscription = await enableChatPushNotifications();
            if (subscription) showMessage("Уведомления включены.");
            else if ("Notification" in window && Notification.permission === "denied") showMessage("Уведомления запрещены. Разрешите их в настройках браузера.", true);
            else showMessage("Не удалось включить уведомления.", true);
            updateNotificationUi(); return;
        }
        showMessage("Уведомления недоступны в этом окружении.", true);
    } catch (error) { console.error("Ошибка включения уведомлений:", error); showMessage("Не удалось включить уведомления: " + (error && error.message ? error.message : String(error)), true); }
    finally { if (button) button.disabled = false; updateNotificationUi(); }
}

const VOICE_LANGUAGES = {
    ru: {name: "Русский", url: "https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-ru-0.22.tar.gz"},
    en: {name: "English", url: "https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-en-us-0.15.tar.gz"},
    cn: {name: "中文", url: "https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-cn-0.22.tar.gz"}
};
let voiceScriptPromise = null;
let voiceModelPromises = {};
function loadVoskScript() {
    if (window.Vosk) return Promise.resolve();
    if (voiceScriptPromise) return voiceScriptPromise;
    voiceScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.5/dist/vosk.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Не удалось загрузить движок голосового ввода."));
        document.head.appendChild(script);
    }).catch(error => { voiceScriptPromise = null; throw error; });
    return voiceScriptPromise;
}
function updateVoiceLanguageButtons() {
    document.querySelectorAll("[data-voice-language]").forEach(button => {
        const code = button.getAttribute("data-voice-language"), ready = localStorage.getItem("chat-voice-language-ready-" + code) === "true", selected = (localStorage.getItem("chat-voice-language") || "ru") === code;
        button.textContent = ready ? (selected ? "Выбрано" : "Готово") : "Скачать";
        button.disabled = false;
    });
}
function updateVoiceDownload(text, active = true) {
    const box = $("voiceDownload"), progress = $("voiceDownloadProgress"), percentBox = $("voiceDownloadPercent"), textBox = $("voiceDownloadText");
    if (box) box.classList.toggle("open", active);
    if (progress) {
        if (active) progress.removeAttribute("value");
        else progress.value = 100;
    }
    if (percentBox) percentBox.textContent = "";
    if (textBox) textBox.textContent = text;
}
function hideVoiceDownload() { const box = $("voiceDownload"); if (box) box.classList.remove("open"); }
async function downloadVoiceLanguage(code) {
    const language = VOICE_LANGUAGES[code], button = document.querySelector('[data-voice-language="' + code + '"]');
    if (!language || !button) return;
    if (voiceModelPromises[code]) return voiceModelPromises[code];
    button.disabled = true;
    updateVoiceDownload("Подготовка " + language.name + "…", true);
    showMessage("Загружается модель " + language.name + ". Это может занять несколько минут.");
    voiceModelPromises[code] = (async () => {
        try {
            await loadVoskScript();
            updateVoiceDownload("Скачивание " + language.name + "…", true);
            const model = await Vosk.createModel(language.url);
            if (!model) throw new Error("Модель не создана");
            localStorage.setItem("chat-voice-language-ready-" + code, "true");
            localStorage.setItem("chat-voice-language", code);
            updateVoiceDownload("Готово: " + language.name + " установлен", false);
            showMessage("Язык " + language.name + " установлен и выбран для голосового ввода.");
            updateVoiceLanguageButtons();
            setTimeout(hideVoiceDownload, 1800);
            return model;
        } catch (error) {
            console.error("Ошибка загрузки голосовой модели:", error);
            localStorage.removeItem("chat-voice-language-ready-" + code);
            hideVoiceDownload();
            showMessage("Не удалось установить " + language.name + ": " + (error && error.message ? error.message : "ошибка загрузки"), true);
            throw error;
        } finally {
            delete voiceModelPromises[code];
            updateVoiceLanguageButtons();
        }
    })();
    return voiceModelPromises[code];
}

$("usernameToggle").onclick = () => $("usernameField").classList.toggle("open");
$("passwordToggle").onclick = () => $("passwordField").classList.toggle("open");
const voiceLanguageToggle = $("voiceLanguageToggle");
if (voiceLanguageToggle) voiceLanguageToggle.onclick = () => { const box = $("voiceLanguages"); if (!box) return; box.classList.toggle("open"); voiceLanguageToggle.textContent = box.classList.contains("open") ? "Скрыть" : "Открыть"; updateVoiceLanguageButtons(); };
document.querySelectorAll("[data-voice-language]").forEach(button => { button.onclick = () => void downloadVoiceLanguage(button.getAttribute("data-voice-language")); });
$("usernameSave").onclick = async () => { const username = $("usernameInput").value.trim(); if (!username) return showMessage("Введите ник.", true); const { data, error } = await supabaseClient.rpc("update_my_profile", { p_username: username }); if (error) return showMessage("Не удалось изменить ник: " + error.message, true); const savedName = data && data[0] && data[0].username ? data[0].username : username; $("username").textContent = savedName; $("usernameInput").value = savedName; $("usernameField").classList.remove("open"); showMessage("Ник изменён."); };
$("passwordSave").onclick = async () => { const password = $("passwordInput").value; if (password.length < 6) return showMessage("Пароль должен содержать не менее 6 символов.", true); const { error } = await supabaseClient.auth.updateUser({ password }); if (error) return showMessage("Не удалось изменить пароль: " + error.message, true); $("passwordInput").value = ""; $("passwordField").classList.remove("open"); showMessage("Пароль изменён."); };
$("soundToggle").onclick = () => { const next = localStorage.getItem("chat-sound-enabled") === "false"; localStorage.setItem("chat-sound-enabled", String(next)); $("soundToggle").textContent = next ? "Вкл." : "Выкл."; };
$("notificationToggle").onclick = () => void enableNotifications(); $("logoutButton").onclick = () => void logout();
async function loadSettings() {
    const { data: { user }, error } = await supabaseClient.auth.getUser(); if (error || !user) { window.location.replace("./login.html"); return; } $("email").textContent = user.email || "";
    const { data: profile, error: profileError } = await supabaseClient.rpc("get_my_profile"); if (!profileError && profile && profile[0]) { const name = profile[0].username || "Пользователь"; $("username").textContent = name; $("usernameInput").value = name; }
    const soundEnabled = localStorage.getItem("chat-sound-enabled"); $("soundToggle").textContent = soundEnabled === "false" ? "Выкл." : "Вкл."; updateNotificationUi(); updateVoiceLanguageButtons();
    if (location.hash === "#voice-language" && voiceLanguageToggle) { const box = $("voiceLanguages"); if (box) box.classList.add("open"); voiceLanguageToggle.textContent = "Скрыть"; }
}
loadSettings();
