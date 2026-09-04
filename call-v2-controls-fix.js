// =========================================
// WebRTC call controls / iOS audio-output fix
// =========================================
(function () {
    "use strict";

    if (window.__chatCallControlsFixInstalled) return;
    window.__chatCallControlsFixInstalled = true;

    const ICON = {
        phone: '<svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5c1.2 0 2.2.5 3 1.3l1.8 1.8c.7.7.9 1.8.5 2.7l-1.1 2.2c-.3.6-.2 1.3.3 1.8l3.2 3.2c.5.5 1.2.6 1.8.3l2.2-1.1c.9-.4 2-.2 2.7.5l1.8 1.8c.8.8 1.3 1.8 1.3 3v1.2c0 1.4-1.1 2.5-2.5 2.5h-1.8C9.3 22 2 14.7 2 6.3V4.5C2 3.1 3.1 2 4.5 2h2z"/></svg>',
        mic: '<svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
        camera: '<svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
        speaker: '<svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>'
    };

    let speakerOn = false;
    let lastMedia = null;

    function isVideoCall() {
        const local = document.getElementById("cv2Local");
        const remote = document.getElementById("cv2Remote");
        return Boolean(local?.srcObject?.getVideoTracks?.().some(track => track.enabled)) ||
               Boolean(remote?.srcObject?.getVideoTracks?.().some(track => track.readyState === "live"));
    }

    function activeRemoteMedia() {
        const audio = document.getElementById("cv2RemoteAudio");
        const video = document.getElementById("cv2Remote");
        return isVideoCall() ? video : audio;
    }

    function status(text) {
        const el = document.getElementById("cv2Status");
        if (el) el.textContent = text;
    }

    function localVideoEnabled() {
        const local = document.getElementById("cv2Local");
        return Boolean(local?.srcObject?.getVideoTracks?.().some(track => track.enabled));
    }

    function preparePhoneAudioSession() {
        try {
            if (navigator.audioSession && "type" in navigator.audioSession) navigator.audioSession.type = "play-and-record";
        } catch (error) {
            console.warn("Не удалось включить телефонный Audio Session:", error);
        }
    }

    function setCallVolume() {
        const media = activeRemoteMedia();
        if (!media) return;
        media.volume = 1;
    }

    function sync() {
        const audio = document.getElementById("cv2RemoteAudio");
        const video = document.getElementById("cv2Remote");
        const media = activeRemoteMedia();
        preparePhoneAudioSession();
        if (audio) {
            if (media !== audio) { audio.pause(); audio.muted = true; audio.volume = 0; }
            else { audio.autoplay = true; audio.muted = false; audio.volume = 1; }
        }
        if (video) {
            if (media !== video) { video.pause(); video.muted = true; video.volume = 0; }
            else { video.autoplay = true; video.playsInline = true; video.muted = false; video.volume = 1; }
        }
        if (!media) return;
        if (media.srcObject && media.srcObject !== lastMedia) {
            lastMedia = media.srcObject;
            speakerOn = false;
            const button = document.getElementById("cv2Speaker");
            if (button) { button.classList.remove("green"); button.title = "Включить громкую связь"; button.innerHTML = ICON.speaker; }
        }
        setCallVolume();
        if (media.srcObject) void media.play().catch(() => {});
    }

    async function sink(media, id) {
        if (!media || typeof media.setSinkId !== "function") return false;
        try { await media.setSinkId(id); return true; }
        catch (error) { console.warn("Аудиовыход не переключён:", error); return false; }
    }

    async function speaker() {
        const media = activeRemoteMedia();
        if (!media) return false;
        sync();
        if (navigator.mediaDevices?.selectAudioOutput) {
            try {
                const selected = await navigator.mediaDevices.selectAudioOutput();
                if (selected?.deviceId && await sink(media, selected.deviceId)) return true;
            } catch (error) { console.info("Выбор динамика отменён или недоступен:", error); }
        }
        if (navigator.mediaDevices?.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter(d => d.kind === "audiooutput" && d.deviceId);
                const preferred = outputs.find(d => /speaker|динамик|громк|iphone|ipad/i.test(d.label || "")) || outputs.find(d => d.deviceId !== "default");
                if (preferred && await sink(media, preferred.deviceId)) return true;
            } catch (error) { console.warn("Не удалось получить аудиовыходы:", error); }
        }
        return false;
    }

    async function phone() {
        const media = activeRemoteMedia();
        if (!media) return false;
        preparePhoneAudioSession();
        let ok = true;
        if (typeof media.setSinkId === "function") ok = await sink(media, "default");
        return ok;
    }

    async function toggle() {
        sync();
        const button = document.getElementById("cv2Speaker");
        if (!button) return;
        if (!speakerOn) {
            status("Переключаем на громкую связь…");
            const ok = await speaker();
            if (ok) { speakerOn = true; button.classList.add("green"); button.title = "Выключить громкую связь"; status("Громкая связь"); }
            else { button.classList.remove("green"); status("Переключение динамика не поддерживается этим браузером"); }
        } else {
            status("Возвращаем звук к уху…");
            const ok = await phone();
            if (ok) { speakerOn = false; button.classList.remove("green"); button.title = "Включить громкую связь"; status("Звонок"); }
        }
        sync();
    }

    function cameraButton() {
        const button = document.getElementById("cv2VideoControl");
        if (!button) return;
        const active = localVideoEnabled();
        button.innerHTML = ICON.camera;
        button.classList.toggle("green", active);
        button.title = active ? "Выключить видео" : "Включить видео";
    }

    function replaceCallButtonIcons() {
        const map = [
            ["cv2Mute", ICON.mic, "Микрофон"],
            ["cv2VideoControl", ICON.camera, localVideoEnabled() ? "Выключить видео" : "Включить видео"],
            ["cv2Speaker", ICON.speaker, speakerOn ? "Выключить громкую связь" : "Включить громкую связь"],
            ["cv2Hangup", ICON.phone, "Завершить"]
        ];
        map.forEach(([id, html, title]) => {
            const button = document.getElementById(id);
            if (button) { button.innerHTML = html; button.title = title; }
        });
    }

    function install() {
        replaceCallButtonIcons();
        const button = document.getElementById("cv2Speaker");
        if (button && button.dataset.fixedHandler !== "1") {
            button.dataset.fixedHandler = "1";
            button.onclick = () => void toggle();
        }
        cameraButton();
        sync();
    }

    setInterval(install, 500);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) { preparePhoneAudioSession(); sync(); replaceCallButtonIcons(); }
    });
})();
