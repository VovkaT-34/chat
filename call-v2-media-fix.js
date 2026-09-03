// =========================================
// WebRTC media compatibility fixes for call-v2.js
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallMediaFixInstalled) return;
    window.__chatCallMediaFixInstalled = true;

    // call-v2.js already adds tracks explicitly with RTCPeerConnection.addTrack().
    // The previous compatibility shim added a camera track a second time from
    // MediaStream.addTrack(), causing duplicate senders and competing
    // negotiationneeded events during audio -> video switching.
    // Do not intercept MediaStream.addTrack().

    // On iPhone/iPad Safari, declare a real-time communication audio session
    // before microphone capture. This gives an audio-only call phone-like
    // routing (receiver/earpiece) instead of immediately using the loudspeaker.
    function prepareCallAudioSession() {
        try {
            if (navigator.audioSession && "type" in navigator.audioSession) {
                navigator.audioSession.type = "play-and-record";
            }
        } catch (error) {
            console.warn("Не удалось настроить Audio Session для звонка:", error);
        }
    }

    function resetCallAudioSession() {
        try {
            if (navigator.audioSession && "type" in navigator.audioSession) {
                navigator.audioSession.type = "auto";
            }
        } catch (error) {
            console.warn("Не удалось сбросить Audio Session:", error);
        }
    }

    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices?.getUserMedia) {
        const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

        mediaDevices.getUserMedia = function (constraints) {
            if (constraints?.audio) prepareCallAudioSession();
            return originalGetUserMedia(constraints);
        };
    }

    window.__chatCallPrepareAudioSession = prepareCallAudioSession;
    window.__chatCallResetAudioSession = resetCallAudioSession;
})();
