// =========================================
// WebRTC call controls / iOS audio-output fix
// =========================================
(function () {
    "use strict";

    if (window.__chatCallControlsFixInstalled) return;
    window.__chatCallControlsFixInstalled = true;

    let speakerOn = false;
    let lastMedia = null;

    const PHONE_VOLUME = 0.32;
    const LOUD_VOLUME = 1;

    function remoteMedia() {
        return document.getElementById("cv2Remote");
    }

    function status(text) {
        const el = document.getElementById("cv2Status");
        if (el) el.textContent = text;
    }

    function localVideoEnabled() {
        const local = document.getElementById("cv2Local");
        return Boolean(local?.srcObject?.getVideoTracks?.().some(track => track.enabled));
    }

    function setCallVolume() {
        const video = remoteMedia();
        if (!video) return;

        // Normal audio call: quiet phone-like listening volume.
        // Video call or explicit speaker mode: return to the louder level.
        video.volume = speakerOn || localVideoEnabled() ? LOUD_VOLUME : PHONE_VOLUME;
    }

    function sync() {
        const video = remoteMedia();
        const audio = document.getElementById("cv2RemoteAudio");

        // Use exactly one media element for remote WebRTC audio/video.
        // Keeping the second element muted avoids double playback and iOS
        // routing conflicts.
        if (audio) {
            audio.pause();
            audio.muted = true;
            audio.volume = 0;
        }

        if (!video) return;

        video.autoplay = true;
        video.playsInline = true;
        video.muted = false;
        setCallVolume();

        if (video.srcObject && video.srcObject !== lastMedia) {
            lastMedia = video.srcObject;
            speakerOn = false;
            const button = document.getElementById("cv2Speaker");
            if (button) {
                button.classList.remove("green");
                button.title = "Включить громкую связь";
            }
        }

        if (video.srcObject) void video.play().catch(() => {});
    }

    async function sink(media, id) {
        if (!media || typeof media.setSinkId !== "function") return false;
        try {
            await media.setSinkId(id);
            return true;
        } catch (error) {
            console.warn("Аудиовыход не переключён:", error);
            return false;
        }
    }

    async function speaker() {
        const media = remoteMedia();
        if (!media) return false;
        sync();

        if (navigator.mediaDevices?.selectAudioOutput) {
            try {
                const selected = await navigator.mediaDevices.selectAudioOutput();
                if (selected?.deviceId && await sink(media, selected.deviceId)) return true;
            } catch (error) {
                console.info("Выбор динамика отменён или недоступен:", error);
            }
        }

        if (navigator.mediaDevices?.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter(d => d.kind === "audiooutput" && d.deviceId);
                const preferred = outputs.find(d => /speaker|динамик|громк|iphone|ipad/i.test(d.label || "")) || outputs.find(d => d.deviceId !== "default");
                if (preferred && await sink(media, preferred.deviceId)) return true;
            } catch (error) {
                console.warn("Не удалось получить аудиовыходы:", error);
            }
        }

        return false;
    }

    async function phone() {
        const media = remoteMedia();
        if (!media) return false;

        let ok = true;
        if (typeof media.setSinkId === "function") ok = await sink(media, "default");

        try {
            if (navigator.audioSession && "type" in navigator.audioSession) {
                navigator.audioSession.type = "play-and-record";
            }
        } catch (error) {
            console.warn("Не удалось включить телефонный режим:", error);
        }

        return ok;
    }

    async function toggle() {
        sync();
        const button = document.getElementById("cv2Speaker");
        if (!button) return;

        if (!speakerOn) {
            status("Переключаем на громкую связь…");
            const ok = await speaker();
            if (ok) {
                speakerOn = true;
                button.classList.add("green");
                button.title = "Выключить громкую связь";
                setCallVolume();
                status("Громкая связь");
            } else {
                // Even if the browser cannot expose a selectable output,
                // keep the button honest and do not pretend that routing changed.
                button.classList.remove("green");
                setCallVolume();
                status("Переключение динамика не поддерживается этим браузером");
            }
        } else {
            status("Возвращаем звук к уху…");
            const ok = await phone();
            if (ok) {
                speakerOn = false;
                button.classList.remove("green");
                button.title = "Включить громкую связь";
                setCallVolume();
                status("Звонок");
            }
        }

        sync();
    }

    function cameraButton() {
        const button = document.getElementById("cv2VideoControl");
        if (!button) return;
        const active = localVideoEnabled();
        button.textContent = "📹";
        button.classList.toggle("green", active);
        button.title = active ? "Выключить видео" : "Включить видео";
    }

    function install() {
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
        if (!document.hidden) sync();
    });
})();
