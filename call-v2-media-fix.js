// =========================================
// WebRTC media compatibility fixes for call-v2.js
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallMediaFixInstalled) return;
    window.__chatCallMediaFixInstalled = true;

    const OriginalRTCPeerConnection = window.RTCPeerConnection;

    if (OriginalRTCPeerConnection) {
        const originalAddTrack = OriginalRTCPeerConnection.prototype.addTrack;

        // Keep one video transceiver reserved during an audio call.
        // It starts recvonly, so an audio call remains an audio call.
        // When the camera is enabled, the reserved sender is switched to
        // sendrecv and receives the camera track. This produces one clean
        // negotiation instead of creating a second video m-line mid-call.
        OriginalRTCPeerConnection.prototype.addTrack = function (track, ...streams) {
            if (track?.kind === "video") {
                const transceiver = this.getTransceivers().find(item =>
                    item.receiver?.track?.kind === "video" &&
                    item.sender?.track == null &&
                    !item.stopped
                );

                if (transceiver) {
                    const sender = transceiver.sender;
                    const result = sender.replaceTrack(track).then(() => {
                        if (typeof sender.setStreams === "function" && streams.length) {
                            sender.setStreams(...streams);
                        }
                        if (transceiver.direction !== "sendrecv") {
                            transceiver.direction = "sendrecv";
                        }
                        return sender;
                    });

                    // call-v2 expects an RTCRtpSender synchronously from addTrack.
                    // Attach the promise for diagnostics but return the sender.
                    sender.__chatVideoAttachPromise = result;
                    return sender;
                }
            }

            const sender = originalAddTrack.call(this, track, ...streams);

            // As soon as the normal audio sender is added, reserve a video
            // receiver. The negotiationneeded event is queued by the platform,
            // so call-v2 has already installed its handler by the time it fires.
            if (track?.kind === "audio" &&
                !this.getTransceivers().some(item => item.receiver?.track?.kind === "video" && !item.stopped)) {
                try {
                    this.addTransceiver("video", { direction: "recvonly" });
                } catch (error) {
                    console.warn("Не удалось подготовить видеоканал:", error);
                }
            }

            return sender;
        };
    }

    // On iPhone/iPad Safari, explicitly use a real-time communication audio
    // session before microphone capture. This gives an audio-only call the
    // normal phone-like receiver/earpiece route instead of loudspeaker.
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
