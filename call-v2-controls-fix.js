// =========================================
// WebRTC call controls / iOS audio-output fix
// =========================================
(function () {
    "use strict";

    if (window.__chatCallControlsFixInstalled) return;
    window.__chatCallControlsFixInstalled = true;

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
        // On iPhone use a real <audio> element for audio-only calls. The
        // <video> element is kept exclusively for video calls. This avoids
        // Safari treating an inline video element as loudspeaker output.
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
            if (navigator.audioSession && "type" in navigator.audioSession) {
                navigator.audioSession.type = "play-and-record";
            }
        } catch (error) {
            console.warn("Не удалось включить телефонный Audio Session:", error);
        }
    }

    function setCallVolume() {
        const media = activeRemoteMedia();
        if (!media) return;

        // Do not fake a quieter phone call with HTML volume. On iPhone the
        // important part is routing the audio-only call through the phone
        // audio session. Keep the media volume at full level and let iOS
        // control the actual earpiece/speaker level.
        media.volume = 1;
    }

    function sync() {
        const audio = document.getElementById("cv2RemoteAudio");
        const video = document.getElementById("cv2Remote");
        const media = activeRemoteMedia();

        preparePhoneAudioSession();

        // Only one element may produce remote sound at a time.
        if (audio) {
            if (media !== audio) {
                audio.pause();
                audio.muted = true;
                audio.volume = 0;
            } else {
                audio.autoplay = true;
                audio.muted = false;
                audio.volume = 1;
            }
        }

        if (video) {
            if (media !== video) {
                video.pause();
                video.muted = true;
                video.volume = 0;
            } else {
                video.autoplay = true;
                video.playsInline = true;
                video.muted = false;
                video.volume = 1;
            }
        }

        if (!media) return;

        if (media.srcObject && media.srcObject !== lastMedia) {
            lastMedia = media.srcObject;
            speakerOn = false;
            const button = document.getElementById("cv2Speaker");
            if (button) {
                button.classList.remove("green");
                button.title = "Включить громкую связь";
            }
        }

        setCallVolume();
        if (media.srcObject) void media.play().catch(() => {});
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
        const media = activeRemoteMedia();
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
            if (ok) {
                speakerOn = true;
                button.classList.add("green");
                button.title = "Выключить громкую связь";
                status("Громкая связь");
            } else {
                button.classList.remove("green");
                status("Переключение динамика не поддерживается этим браузером");
            }
        } else {
            status("Возвращаем звук к уху…");
            const ok = await phone();
            if (ok) {
                speakerOn = false;
                button.classList.remove("green");
                button.title = "Включить громкую связь";
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
        if (!document.hidden) {
            preparePhoneAudioSession();
            sync();
        }
    });
})();
