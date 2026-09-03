// =========================================
// WebRTC media compatibility fixes for call-v2.js
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallMediaFixInstalled) return;
    window.__chatCallMediaFixInstalled = true;

    const streamToPeer = new WeakMap();

    const OriginalRTCPeerConnection = window.RTCPeerConnection;
    const OriginalStreamAddTrack = window.MediaStream?.prototype?.addTrack;

    if (OriginalRTCPeerConnection) {
        const originalAddTrack = OriginalRTCPeerConnection.prototype.addTrack;

        OriginalRTCPeerConnection.prototype.addTrack = function (track, ...streams) {
            const sender = originalAddTrack.call(this, track, ...streams);

            for (const stream of streams) {
                if (stream) streamToPeer.set(stream, this);
            }

            return sender;
        };
    }

    if (OriginalStreamAddTrack) {
        window.MediaStream.prototype.addTrack = function (track) {
            const result = OriginalStreamAddTrack.call(this, track);

            // call-v2 creates its RTCPeerConnection first and only later adds
            // a camera track to the existing local MediaStream. The standard
            // API requires that new track to be explicitly added to the peer.
            if (track?.kind === "video") {
                const peer = streamToPeer.get(this);

                if (peer && peer.connectionState !== "closed") {
                    const alreadySent = peer.getSenders().some(
                        sender => sender.track === track
                    );

                    if (!alreadySent) {
                        try {
                            peer.addTrack(track, this);
                        } catch (error) {
                            console.warn(
                                "Не удалось добавить видеотрек в WebRTC-соединение:",
                                error
                            );
                        }
                    }
                }
            }

            return result;
        };
    }
})();
