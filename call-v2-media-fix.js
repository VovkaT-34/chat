// =========================================
// WebRTC audio-session + early ICE recovery + mobile camera switch
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallMediaFixInstalled) return;
    window.__chatCallMediaFixInstalled = true;

    const isSupportedMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") && Number(navigator.maxTouchPoints || 0) > 0;
    let requestedFacingMode = null;
    let currentFacingMode = "user";
    let cameraSwitchBusy = false;

    function prepareCallAudioSession() {
        try {
            if (navigator.audioSession && "type" in navigator.audioSession) navigator.audioSession.type = "play-and-record";
        } catch (error) {
            console.warn("Не удалось настроить Audio Session для звонка:", error);
        }
    }

    function resetCallAudioSession() {
        try {
            if (navigator.audioSession && "type" in navigator.audioSession) navigator.audioSession.type = "auto";
        } catch (error) {
            console.warn("Не удалось сбросить Audio Session для звонка:", error);
        }
    }

    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices?.getUserMedia) {
        const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
        mediaDevices.getUserMedia = function (constraints) {
            if (constraints?.audio) prepareCallAudioSession();
            if (requestedFacingMode && constraints?.video) {
                constraints = {
                    ...constraints,
                    video: {
                        ...(constraints.video === true ? {} : constraints.video),
                        facingMode: { exact: requestedFacingMode }
                    }
                };
            }
            return originalGetUserMedia(constraints);
        };
    }

    window.__chatCallPrepareAudioSession = prepareCallAudioSession;
    window.__chatCallResetAudioSession = resetCallAudioSession;

    function localVideo() {
        return document.getElementById("cv2Local");
    }

    function localVideoTrack() {
        return localVideo()?.srcObject?.getVideoTracks?.()[0] || null;
    }

    function localVideoEnabled() {
        const track = localVideoTrack();
        return Boolean(track && track.enabled && track.readyState === "live");
    }

    function detectCurrentFacingMode() {
        const track = localVideoTrack();
        const facing = track?.getSettings?.().facingMode;
        if (facing === "environment" || facing === "user") currentFacingMode = facing;
        return currentFacingMode;
    }

    function ensureCameraSwitchButton() {
        if (!isSupportedMobile) return;
        const video = localVideo();
        const media = document.querySelector("#chatCallV2 .cv2-media");
        if (!video || !media) return;

        let button = document.getElementById("cv2CameraSwitch");
        if (!button) {
            const style = document.createElement("style");
            style.id = "cv2-camera-switch-style";
            style.textContent = `
                #cv2CameraSwitch{position:absolute;right:20px;bottom:20px;z-index:20;width:40px;height:40px;min-width:40px;min-height:40px;padding:0;border:1px solid rgba(255,255,255,.75);border-radius:50%;background:rgba(20,18,18,.72);color:#fff;display:none;align-items:center;justify-content:center;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
                #cv2CameraSwitch:active{transform:scale(.94)}
            `;
            document.head.appendChild(style);
            button = document.createElement("button");
            button.id = "cv2CameraSwitch";
            button.type = "button";
            button.setAttribute("aria-label", "Переключить камеру");
            button.title = "Переключить камеру";
            button.textContent = "↻";
            button.addEventListener("click", switchCamera);
            media.appendChild(button);
        }
        button.style.display = localVideoEnabled() ? "flex" : "none";
    }

    async function getCameraTrack(facingMode) {
        requestedFacingMode = facingMode;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: { exact: facingMode }
                },
                audio: false
            });
            const track = stream.getVideoTracks()[0];
            if (!track) {
                stream.getTracks().forEach(item => item.stop());
                throw new Error("Видеотрек не получен");
            }
            return track;
        } finally {
            requestedFacingMode = null;
        }
    }

    async function switchCamera() {
        if (!isSupportedMobile || !localVideoEnabled() || cameraSwitchBusy) return;

        const video = localVideo();
        const oldTrack = localVideoTrack();
        if (!video || !oldTrack) return;

        cameraSwitchBusy = true;
        const previousFacingMode = detectCurrentFacingMode();
        const targetFacingMode = previousFacingMode === "environment" ? "user" : "environment";

        try {
            const status = document.getElementById("cv2Status");
            if (status) status.textContent = "Переключаем камеру…";

            // Не обращаемся к localStream из call-v2.js: он находится
            // внутри его замыкания и недоступен этому модулю. Именно это
            // вызывало чёрное локальное видео после предыдущего переключения.
            const sender = window.__chatCallGetVideoSender?.() || null;

            // Сначала полностью освобождаем текущую камеру. Для Safari/iOS
            // это важно при переходе user <-> environment.
            oldTrack.stop();

            let newTrack;
            try {
                newTrack = await getCameraTrack(targetFacingMode);
            } catch (firstError) {
                // Мягкий fallback для браузеров, которые принимают
                // environment/user только как обычное, а не exact-условие.
                requestedFacingMode = targetFacingMode;
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            frameRate: { ideal: 30, max: 30 },
                            facingMode: targetFacingMode
                        },
                        audio: false
                    });
                    newTrack = stream.getVideoTracks()[0];
                    if (!newTrack) throw firstError;
                } finally {
                    requestedFacingMode = null;
                }
            }

            if (!newTrack) throw new Error("Новая камера не получена");

            if (sender) {
                await sender.replaceTrack(newTrack);
            } else if (window.__chatCallAddVideoTrack) {
                await window.__chatCallAddVideoTrack(newTrack);
            } else {
                throw new Error("Видеосендер WebRTC не найден");
            }

            // Локальный preview получает только новый видеотрек.
            // Аудиотрек звонка при этом не затрагивается.
            const previewStream = new MediaStream([newTrack]);
            video.srcObject = previewStream;
            video.style.display = "block";
            await video.play().catch(() => {});

            const actualFacingMode = newTrack.getSettings?.().facingMode;
            currentFacingMode = actualFacingMode === "environment" || actualFacingMode === "user"
                ? actualFacingMode
                : targetFacingMode;

            const control = document.getElementById("cv2VideoControl");
            if (control) {
                control.classList.add("green");
                control.title = "Выключить видео";
            }

            if (status) status.textContent = "Видеозвонок";

            newTrack.onended = () => {
                const current = localVideoTrack();
                if (current === newTrack) {
                    const button = document.getElementById("cv2VideoControl");
                    if (button) button.classList.remove("green");
                }
            };
        } catch (error) {
            console.error("Ошибка переключения камеры:", error);

            // Возвращаем предыдущую камеру, если новая не открылась.
            try {
                const restoreTrack = await getCameraTrack(previousFacingMode);
                const sender = window.__chatCallGetVideoSender?.() || null;
                if (sender) {
                    await sender.replaceTrack(restoreTrack);
                } else if (window.__chatCallAddVideoTrack) {
                    await window.__chatCallAddVideoTrack(restoreTrack);
                } else {
                    throw new Error("Видеосендер WebRTC не найден");
                }
                const restorePreview = new MediaStream([restoreTrack]);
                video.srcObject = restorePreview;
                video.style.display = "block";
                await video.play().catch(() => {});
                currentFacingMode = previousFacingMode;
            } catch (restoreError) {
                console.error("Не удалось восстановить предыдущую камеру:", restoreError);
            }

            const status = document.getElementById("cv2Status");
            if (status) status.textContent = "Не удалось переключить камеру";
        } finally {
            requestedFacingMode = null;
            cameraSwitchBusy = false;
            ensureCameraSwitchButton();
        }
    }

    function installCameraSwitch() {
        if (!isSupportedMobile) return;
        ensureCameraSwitchButton();
    }

    if (typeof RTCPeerConnection === "undefined") {
        if (isSupportedMobile) setInterval(installCameraSwitch, 500);
        return;
    }

    // call-v2.js хранит RTCPeerConnection внутри замыкания. Перехватываем
    // только addTrack, чтобы получить ссылку на уже созданное соединение
    // для безопасного replaceTrack() без изменения остальной архитектуры.
    if (!window.__chatCallMediaFixPeerHooked) {
        window.__chatCallMediaFixPeerHooked = true;
        const originalAddTrack = RTCPeerConnection.prototype.addTrack;
        RTCPeerConnection.prototype.addTrack = function (...args) {
            window.__chatCallActivePeerConnection = this;
            return originalAddTrack.apply(this, args);
        };
    }

    window.__chatCallGetVideoSender = function () {
        const peer = window.__chatCallActivePeerConnection;
        if (!peer || peer.connectionState === "closed") return null;
        return peer.getSenders?.().find(sender => sender.track?.kind === "video") || null;
    };

    window.__chatCallAddVideoTrack = async function (track) {
        const peer = window.__chatCallActivePeerConnection;
        if (!peer || peer.connectionState === "closed") throw new Error("WebRTC соединение не найдено");
        return peer.addTrack(track, localVideo()?.srcObject || new MediaStream([track]));
    };

    const earlyIce = new Map();
    let incomingCallId = null;
    let signalChannel = null;
    let subscribeTimer = null;

    function candidateKey(candidate) {
        try {
            return JSON.stringify([
                candidate?.candidate || "",
                candidate?.sdpMid || null,
                candidate?.sdpMLineIndex ?? null,
                candidate?.usernameFragment || null
            ]);
        } catch {
            return String(candidate?.candidate || "");
        }
    }

    function rememberCandidate(callId, candidate) {
        if (!callId || !candidate) return;
        if (!earlyIce.has(callId)) earlyIce.set(callId, new Map());
        const map = earlyIce.get(callId);
        map.set(candidateKey(candidate), candidate);
        while (earlyIce.size > 8) {
            const first = earlyIce.keys().next().value;
            if (!first || first === callId) break;
            earlyIce.delete(first);
        }
    }

    async function applyEarlyIce(callId, pc) {
        if (!callId || !pc) return;
        const map = earlyIce.get(callId);
        if (!map?.size) return;
        for (const candidate of map.values()) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.debug("Ранний ICE уже применён или отклонён:", error);
            }
        }
        earlyIce.delete(callId);
    }

    function currentUserId() {
        return window.currentUser?.id || null;
    }

    async function subscribeEarlyIce() {
        if (signalChannel || !window.supabaseClient || !currentUserId()) return;
        const userId = currentUserId();
        signalChannel = window.supabaseClient
            .channel(`call-early-ice-${userId}`)
            .on("postgres_changes", { event:"INSERT", schema:"public", table:"call_signals", filter:`recipient_id=eq.${userId}` }, payload => {
                const signal = payload?.new;
                if (!signal) return;
                if (signal.signal_type === "offer") incomingCallId = signal.call_id || null;
                if (signal.signal_type === "ice" && signal.call_id) rememberCandidate(signal.call_id, signal.payload?.candidate);
            })
            .subscribe(status => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    signalChannel = null;
                    clearTimeout(subscribeTimer);
                    subscribeTimer = setTimeout(() => void subscribeEarlyIce(), 2500);
                }
            });
    }

    const originalSetRemoteDescription = RTCPeerConnection.prototype.setRemoteDescription;
    RTCPeerConnection.prototype.setRemoteDescription = async function (description) {
        const result = await originalSetRemoteDescription.call(this, description);
        if (description?.type === "offer" && incomingCallId) await applyEarlyIce(incomingCallId, this);
        return result;
    };

    function bootEarlyIce() {
        if (currentUserId()) {
            void subscribeEarlyIce();
            return;
        }
        setTimeout(bootEarlyIce, 500);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootEarlyIce, { once:true });
    else bootEarlyIce();

    if (isSupportedMobile) {
        setInterval(installCameraSwitch, 500);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(installCameraSwitch, 100); });
    }
})();
