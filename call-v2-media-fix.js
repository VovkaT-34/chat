// =========================================
// WebRTC audio-session + early ICE recovery
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallMediaFixInstalled) return;
    window.__chatCallMediaFixInstalled = true;

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
            console.warn("Не удалось сбросить Audio Session для звонка:", error);
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

    // ---------------------------------------------------------
    // Early ICE recovery
    // ---------------------------------------------------------
    // The callee does not create RTCPeerConnection until "Принять" is pressed.
    // ICE can arrive before that and used to be discarded. Keep those
    // candidates separately and apply them as soon as the incoming offer is
    // installed on the newly-created peer connection.

    if (typeof RTCPeerConnection === "undefined") return;

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

        // Keep only a small number of abandoned calls.
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
                // call-v2.js may also have received this candidate and put it
                // into its own pendingIce queue. Duplicate ICE is harmless.
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
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "call_signals",
                    filter: `recipient_id=eq.${userId}`
                },
                payload => {
                    const signal = payload?.new;
                    if (!signal) return;

                    if (signal.signal_type === "offer") {
                        // Do not clear candidates here: another Realtime
                        // channel may deliver ICE before it delivers this offer.
                        incomingCallId = signal.call_id || null;
                        return;
                    }

                    if (signal.signal_type === "ice" && signal.call_id) {
                        rememberCandidate(signal.call_id, signal.payload?.candidate);
                    }
                }
            )
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

        if (description?.type === "offer" && incomingCallId) {
            await applyEarlyIce(incomingCallId, this);
        }

        return result;
    };

    function bootEarlyIce() {
        if (currentUserId()) {
            void subscribeEarlyIce();
            return;
        }
        setTimeout(bootEarlyIce, 500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootEarlyIce, { once: true });
    } else {
        bootEarlyIce();
    }
})();
