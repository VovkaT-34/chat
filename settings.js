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
    ru: {name: "Русский", url: "https://raw.githubusercontent.com/kercre123/vosk-models/main/vosk-model-small-ru-0.22.zip"},
    en: {name: "English", url: "https://raw.githubusercontent.com/kercre123/vosk-models/main/vosk-model-small-en-us-0.15.zip"},
    cn: {name: "中文", url: "https://raw.githubusercontent.com/kercre123/vosk-models/main/vosk-model-small-cn-0.22.zip"}
};
const VOICE_MODEL_CACHE = "chat-vosk-models-v1";
let voiceScriptPromise = null;
let voiceModelPromises = {};
let voiceServiceWorkerPromise = null;
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
function loadVoiceTools() {
    if (window.fflate) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Не удалось загрузить архиватор голосовой модели."));
        document.head.appendChild(script);
    });
}
function ensureVoiceServiceWorker() {
    if (voiceServiceWorkerPromise) return voiceServiceWorkerPromise;
    if (!("serviceWorker" in navigator)) return Promise.reject(new Error("Service Worker недоступен в этом браузере."));
    voiceServiceWorkerPromise = navigator.serviceWorker.register("./sw.js", {scope:"./"}).then(async function(){
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
            await new Promise(function(resolve){
                var done=false;
                function finish(){if(done)return;done=true;clearTimeout(timer);resolve();}
                var timer=setTimeout(finish,3000);
                navigator.serviceWorker.addEventListener("controllerchange",finish,{once:true});
            });
        }
    }).catch(function(error){voiceServiceWorkerPromise=null;throw error;});
    return voiceServiceWorkerPromise;
}
function voiceModelUrl(code) { return "./voice-model/" + code + ".tar.gz"; }
function oldVoiceModelUrl(code) { return "https://chat.local/voice-model/" + code + ".tar.gz"; }
function writeTarHeader(view, offset, name, size) {
    const put = (text, at, length) => { const bytes = new TextEncoder().encode(text); for (let i = 0; i < Math.min(bytes.length, length); i++) view.setUint8(offset + at + i, bytes[i]); };
    put(name, 0, 100); put("0000644", 100, 8); put("0000000", 108, 8); put("0000000", 116, 8); put(size.toString(8).padStart(11, "0") + " ", 124, 12); put("00000000000 ", 136, 12); view.setUint8(offset + 156, 0); put("ustar\0", 257, 6); put("00", 263, 2);
    for (let i = 148; i < 156; i++) view.setUint8(offset + i, 32);
    let checksum = 0; for (let i = 0; i < 512; i++) checksum += view.getUint8(offset + i); put(checksum.toString(8).padStart(6, "0") + " ", 148, 8);
}
function zipToTarGz(zipBytes) {
    const files = window.fflate.unzipSync(zipBytes);
    const entries = Object.keys(files).filter(name => !name.endsWith("/"));
    let total = 1024; entries.forEach(name => { const size = files[name].length; total += 512 + Math.ceil(size / 512) * 512; });
    const tar = new Uint8Array(total), view = new DataView(tar.buffer); let offset = 0;
    entries.forEach(name => { const data = files[name]; writeTarHeader(view, offset, name, data.length); offset += 512; tar.set(data, offset); offset += Math.ceil(data.length / 512) * 512; });
    return window.fflate.gzipSync(tar, {level: 6});
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
    document.querySelectorAll("[data-voice-language]").forEach(button => {
        const code = button.getAttribute("data-voice-language"), ready = localStorage.getItem("chat-voice-language-ready-" + code) === "true";
        if (ready) button.textContent = "Удалить";
        else if (!button.disabled) button.textContent = "Скачать";
    });
}
async function downloadVoiceArchive(url, code) {
    const response = await fetch(url, {cache: "no-store"});
    if (!response.ok || !response.body) throw new Error("Сервер вернул ошибку загрузки (" + response.status + ")");
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader(), chunks = []; let loaded = 0;
    while (true) {
        const part = await reader.read(); if (part.done) break; chunks.push(part.value); loaded += part.value.length;
        const progress = total ? Math.round(loaded / total * 100) : 0;
        updateVoiceDownload(("Скачивание " + VOICE_LANGUAGES[code].name + ": " + (loaded / 1048576).toFixed(1) + (total ? " из " + (total / 1048576).toFixed(1) : "") + " МБ (" + progress + "%)"), true);
    }
    const zip = new Uint8Array(loaded); let offset = 0; chunks.forEach(chunk => { zip.set(chunk, offset); offset += chunk.length; }); return zip;
}
async function cacheVoiceModel(code, archive) {
    const cache = await caches.open(VOICE_MODEL_CACHE);
    await cache.put(new Request(voiceModelUrl(code)), new Response(archive, {headers:{"Content-Type":"application/gzip","Cache-Control":"no-store"}}));
    if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
}
async function deleteVoiceLanguage(code) {
    const cache = await caches.open(VOICE_MODEL_CACHE);
    await cache.delete(voiceModelUrl(code));
    await cache.delete(oldVoiceModelUrl(code));
    localStorage.removeItem("chat-voice-language-ready-" + code);
    if (localStorage.getItem("chat-voice-language") === code) {
        const next = Object.keys(VOICE_LANGUAGES).find(key => localStorage.getItem("chat-voice-language-ready-" + key) === "true");
        if (next) localStorage.setItem("chat-voice-language", next); else localStorage.removeItem("chat-voice-language");
    }
    updateVoiceLanguageButtons();
    showMessage("Язык " + VOICE_LANGUAGES[code].name + " удалён из памяти браузера.");
}
async function downloadVoiceLanguage(code) {
    const language = VOICE_LANGUAGES[code], button = document.querySelector('[data-voice-language="' + code + '"]');
    if (!language || !button) return;
    if (voiceModelPromises[code]) return voiceModelPromises[code];
    if (localStorage.getItem("chat-voice-language-ready-" + code) === "true") return deleteVoiceLanguage(code);
    button.disabled = true; updateVoiceDownload("Подготовка " + language.name + "…", true); showMessage("Загружается модель " + language.name + ". Это может занять несколько минут.");
    voiceModelPromises[code] = (async () => {
        try {
            await loadVoskScript(); await loadVoiceTools(); await ensureVoiceServiceWorker();
            const zip = await downloadVoiceArchive(language.url, code);
            updateVoiceDownload("Распаковка и подготовка " + language.name + "… 0%", true);
            await new Promise(resolve => setTimeout(resolve, 0));
            const archive = zipToTarGz(zip);
            await cacheVoiceModel(code, archive);
            updateVoiceDownload("Распаковка и подготовка " + language.name + "… 100%", true);
            await new Promise(resolve => setTimeout(resolve, 0));
            updateVoiceDownload("Проверка модели…", true);
            const model = await Vosk.createModel(voiceModelUrl(code));
            if (!model) throw new Error("Модель не создана");
            localStorage.setItem("chat-voice-language-ready-" + code, "true"); localStorage.setItem("chat-voice-language", code);
            updateVoiceDownload("Готово: " + language.name + " установлен", true); showMessage("Язык " + language.name + " установлен и выбран для голосового ввода."); updateVoiceLanguageButtons(); setTimeout(hideVoiceDownload, 1800); return true;
        } catch (error) {
            console.error("Ошибка загрузки голосовой модели:", error); localStorage.removeItem("chat-voice-language-ready-" + code); hideVoiceDownload(); showMessage("Не удалось установить " + language.name + ": " + (error && error.message ? error.message : "ошибка загрузки"), true); throw error;
        } finally { delete voiceModelPromises[code]; button.disabled = false; updateVoiceLanguageButtons(); }
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
