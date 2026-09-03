// =========================================
// WebRTC call controls / iOS audio-output fix
// Must load AFTER call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallControlsFixInstalled) return;
    window.__chatCallControlsFixInstalled = true;

    let speakerOn = false;

    function getRemoteMedia() {
        return document.getElementById("cv2Remote");
    }

    function setStatus(text) {
        const element = document.getElementById("cv2Status");
        if (element) element.textContent = text;
    }

    function syncRemoteAudioRouting() {
        const video = getRemoteMedia();
        const audio = document.getElementById("cv2RemoteAudio");

        // Safari/iOS handles WebRTC audio more reliably when the remote
        // MediaStream is attached to one media element. The old implementation
        // attached the same stream to separate <video> and <audio> elements,
        // which could put the call into the wrong audio route.
        if (audio) {
            audio.muted = true;
            audio.volume = 0;
        }

        if (video) {
            video.autoplay = true;
            video.playsInline = true;
            video.muted = false;

            if (video.srcObject) {
                void video.play().catch(() => {});
            }
        }
    }

    async function setOutput(media, sinkId) {
        if (!media || typeof media.setSinkId !== "function") {
            return false;
        }

        try {
            await media.setSinkId(sinkId);
            return true;
        } catch (error) {
            console.warn("Не удалось переключить аудиовыход:", error);
            return false;
        }
    }

    async function enableSpeaker() {
        const media = getRemoteMedia();
        if (!media) return false;

        syncRemoteAudioRouting();

        // Safari 26 / iOS 26 supports Speaker Selection. Calling
        // selectAudioOutput from the button click keeps the operation inside
        // a user gesture, as required by the API.
        if (navigator.mediaDevices?.selectAudioOutput) {
            try {
                const selected = await navigator.mediaDevices.selectAudioOutput();
                if (selected?.deviceId) {
                    const ok = await setOutput(media, selected.deviceId);
                    if (ok) return true;
                }
            } catch (error) {
                // User cancellation is not a call failure.
                console.info("Выбор динамика отменён или недоступен:", error);
            }
        }

        // If an output is already exposed by the browser, try a real device
        // instead of merely changing the icon.
        if (navigator.mediaDevices?.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter(
                    device => device.kind === "audiooutput" && device.deviceId
                );

                const preferred = outputs.find(device =>
                    /speaker|динамик|громк|iphone|ipad/i.test(device.label || "")
                ) || outputs.find(device => device.deviceId !== "default");

                if (preferred && await setOutput(media, preferred.deviceId)) {
                    return true;
                }
            } catch (error) {
                console.warn("Ошибка поиска аудиовыходов:", error);
            }
        }

        return false;
    }

    async function disableSpeaker() {
        const media = getRemoteMedia();
        if (!media) return false;

        syncRemoteAudioRouting();

        // "default" means the browser/system default output. On browsers
        // without speaker selection this is the only safe standard fallback.
        if (typeof media.setSinkId === "function") {
            return await setOutput(media, "default");
        }

        return true;
    }

    async function toggleSpeakerFixed() {
        syncRemoteAudioRouting();

        const button = document.getElementById("cv2Speaker");
        if (!button) return;

        if (!speakerOn) {
            setStatus("Переключаем на динамик…");
            const ok = await enableSpeaker();

            if (ok) {
                speakerOn = true;
                button.textContent = "🔊";
                button.classList.add("green");
                button.title = "Выключить громкую связь";
                setStatus("Громкая связь");
            } else {
                // Do not fake success. If the browser does not expose an
                // audio-output API, the button must say so instead of merely
                // changing color.
                button.classList.remove("green");
                setStatus(
                    "Браузер не разрешил переключить динамик. Используйте системный выбор аудиовыхода."
                );
            }
        } else {
            setStatus("Возвращаем обычный режим…");
            const ok = await disableSpeaker();

            if (ok) {
                speakerOn = false;
                button.textContent = "🔊";
                button.classList.remove("green");
                button.title = "Включить громкую связь";
                setStatus("Звонок");
            }
        }

        syncRemoteAudioRouting();
    }

    function normalizeCameraButton() {
        const button = document.getElementById("cv2VideoControl");
        if (!button) return;

        // Camera is OFF at the beginning of an audio call. It must still be a
        // camera button, not a green/active button with a blocked icon.
        const localVideo = document.getElementById("cv2Local");
        const active = Boolean(
            localVideo?.srcObject?.getVideoTracks?.().some(track => track.enabled)
        );

        button.textContent = "📹";
        button.classList.toggle("green", active);
        button.title = active ? "Выключить видео" : "Включить видео";
        button.setAttribute("aria-label", active ? "Выключить видео" : "Включить видео");
    }

    function installControlOverrides() {
        const speaker = document.getElementById("cv2Speaker");
        if (speaker && speaker.dataset.fixedHandler !== "1") {
            speaker.dataset.fixedHandler = "1";
            speaker.onclick = () => void toggleSpeakerFixed();
        }

        normalizeCameraButton();
        syncRemoteAudioRouting();
    }

    setInterval(installControlOverrides, 500);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            syncRemoteAudioRouting();
        }
    });
})();
