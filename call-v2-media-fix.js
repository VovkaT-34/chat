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
        const originalCreateOffer = OriginalRTCPeerConnection.prototype.createOffer;

        // Keep one video transceiver reserved during an audio call.
        // It starts recvonly, so the initial call stays audio-only.
        // When the camera is enabled, the reserved sender is changed to
        // sendrecv and receives the camera track. This avoids creating a
        // second video m-line during the active call.
        OriginalRTCPeerConnection.prototype.addTrack = function (track, ...streams) {
            if (track?.kind === "video") {
                const transceiver = this.getTransceivers().find(item =>
                    item.receiver?.track?.kind === "video" &&
                    item.sender?.track == null &&
                    !item.stopped
                );

                if (transceiver) {
                    const sender = transceiver.sender;
                    const attachPromise = sender.replaceTrack(track).then(() => {
                        if (typeof sender.setStreams === "function" && streams.length) {
                            sender.setStreams(...streams);
                        }
                        if (transceiver.direction !== "sendrecv") {
                            transceiver.direction = "sendrecv";
                        }
                    });

                    sender.__chatVideoAttachPromise = attachPromise;
                    return sender;
                }
            }

            const sender = originalAddTrack.call(this, track, ...streams);

            // Reserve the video transceiver when the first audio track is added.
            // negotiationneeded is queued by WebRTC, so call-v2 can keep its
            // existing signaling architecture unchanged.
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

        // call-v2 calls createOffer immediately after addTrack(). Wait for the
        // reserved sender to finish replaceTrack() so the offer cannot race
        // ahead of the camera attachment.
        OriginalRTCPeerConnection.prototype.createOffer = function (...args) {
            const pending = this.getSenders()
                .map(sender => sender.__chatVideoAttachPromise)
                .filter(Boolean);

            if (!pending.length) return originalCreateOffer.apply(this, args);

            return Promise.allSettled(pending).then(() => {
                this.getSenders().forEach(sender => {
                    if (sender.__chatVideoAttachPromise) delete sender.__chatVideoAttachPromise;
                });
                return originalCreateOffer.apply(this, args);
            });
        };
    }

    // On iPhone/iPad Safari, explicitly use a real-time communication audio
    // session before microphone capture. This requests phone-like routing
    // through the receiver/earpiece for an audio call instead of loudspeaker.
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
