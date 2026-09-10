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

const TRANSFORMERS_SCRIPT = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
const VOICE_MODEL = "onnx-community/whisper-tiny";
const VOICE_LANGUAGES = {
    ru: {name: "Русский", code: "russian"},
    en: {name: "English", code: "english"},
    cn: {name: "中文", code: "chinese"}
};
let voiceModulePromise = null;
let voiceModelPromise = null;
let voiceModel = null;
function loadTransformers() {
    if (window.__chatTransformers) return Promise.resolve(window.__chatTransformers);
    if (voiceModulePromise) return voiceModulePromise;
    voiceModulePromise = import(TRANSFORMERS_SCRIPT).then(module => { window.__chatTransformers = module; return module; }).catch(error => { voiceModulePromise = null; throw error; });
    return voiceModulePromise;
}
function updateVoiceDownload(text, visible = true) {
    const box = $("voiceDownload"), label = $("voiceDownloadText"), percent = $("voiceDownloadPercent"), progress = $("voiceDownloadProgress");
    if (!box || !label || !percent || !progress) return;
    if (!visible) { box.classList.remove("open"); return; }
    box.classList.add("open"); label.textContent = text;
    const match = String(text).match(/(\d+(?:\.\d+)?)%/); const value = match ? Math.max(0, Math.min(100, Number(match[1]))) : (text.indexOf("Готово:") === 0 ? 100 : 0);
    percent.textContent = Math.round(value) + "%"; progress.value = value;
}
function hideVoiceDownload() { const box = $("voiceDownload"); if (box) box.classList.remove("open"); }
function updateVoiceLanguageButtons() {
    const selected = localStorage.getItem("chat-voice-language") || "ru";
    const ready = localStorage.getItem("chat-voice-model-ready") === "true";
    document.querySelectorAll("[data-voice-language]").forEach(button => {
        const code = button.getAttribute("data-voice-language");
        button.textContent = ready ? (selected === code ? "Выбрано" : "Выбрать") : "Подготовить";
    });
}
async function loadVoiceModel() {
    if (voiceModel) return voiceModel;
    if (voiceModelPromise) return voiceModelPromise;
    voiceModelPromise = (async function() {
        const module = await loadTransformers();
        if (module.env) {
            module.env.useBrowserCache = true;
            module.env.useWasmCache = true;
            module.env.allowRemoteModels = true;
            module.env.logLevel = module.env.ERROR;
        }
        const options = {
            dtype: "q8",
            progress_callback: function(progress) {
                let percent = 0;
                if (progress && typeof progress.progress === "number") percent = progress.progress;
                else if (progress && progress.status === "ready") percent = 100;
                updateVoiceDownload(progress && progress.file_name ? "Загрузка модели: " + progress.file_name : "Загрузка модели…", true);
                const value = $("voiceDownloadPercent"); if (value) value.textContent = Math.round(percent) + "%";
                const bar = $("voiceDownloadProgress"); if (bar) bar.value = percent;
            }
        };
        const safari = module.env && typeof module.env.isSafari === "function" ? module.env.isSafari() : /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|Android/i.test(navigator.userAgent);
        if (!safari && navigator.gpu) options.device = "webgpu";
        else options.device = "wasm";
        try {
            return await module.pipeline("automatic-speech-recognition", VOICE_MODEL, options);
        } catch (error) {
            if (options.device === "webgpu") {
                options.device = "wasm";
                return await module.pipeline("automatic-speech-recognition", VOICE_MODEL, options);
            }
            throw error;
        }
    })().then(model => {
        voiceModel = model;
        localStorage.setItem("chat-voice-model-ready", "true");
        updateVoiceLanguageButtons();
        return model;
    }).catch(error => { voiceModelPromise = null; localStorage.removeItem("chat-voice-model-ready"); throw error; });
    return voiceModelPromise;
}
async function downloadVoiceLanguage(code) {
    const language = VOICE_LANGUAGES[code], button = document.querySelector('[data-voice-language="' + code + '"]');
    if (!language || !button) return;
    document.querySelectorAll("[data-voice-language]").forEach(item => { item.disabled = true; });
    try {
        localStorage.setItem("chat-voice-language", code);
        updateVoiceLanguageButtons();
        if (voiceModel || localStorage.getItem("chat-voice-model-ready") === "true") {
            updateVoiceDownload("Готово: " + language.name + " выбран", true);
            showMessage("Язык " + language.name + " выбран для голосового ввода.");
            setTimeout(hideVoiceDownload, 1200);
            return true;
        }
        updateVoiceDownload("Подготовка голосового ввода…", true);
        showMessage("Загружается общая модель голосового ввода. Это выполняется один раз и затем используется для всех языков.");
        await loadVoiceModel();
        updateVoiceDownload("Готово: модель установлена", true);
        showMessage("Модель голосового ввода установлена. Выбран язык: " + language.name + ".");
        setTimeout(hideVoiceDownload, 1800);
        return true;
    } catch (error) {
        console.error("Ошибка загрузки голосовой модели:", error);
        localStorage.removeItem("chat-voice-model-ready");
        hideVoiceDownload();
        showMessage("Не удалось подготовить голосовой ввод: " + (error && error.message ? error.message : "ошибка загрузки"), true);
        throw error;
    } finally {
        document.querySelectorAll("[data-voice-language]").forEach(item => { item.disabled = false; });
        updateVoiceLanguageButtons();
    }
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
