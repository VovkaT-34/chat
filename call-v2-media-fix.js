// =========================================
// WebRTC audio-session + early ICE recovery
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallMediaFixInstalled) return;
    window.__chatCallMediaFixInstalled = true;

    // Keep the native WebRTC track/negotiation flow intact.
    // The important reliability fix here is buffering ICE candidates that
    // arrive before the callee accepts the call and creates RTCPeerConnection.

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

    // ---------------------------------------------------------
    // Early ICE recovery
    // ---------------------------------------------------------
    // call-v2.js intentionally waits until the user presses "Принять"
    // before creating the peer connection. ICE candidates, however, can
    // arrive immediately after the offer. The old implementation discarded
    // such candidates because pc was still null. This makes the first call
    // race-dependent and especially visible on iPhone.

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
        // Prevent an abandoned call from accumulating data forever.
        if (earlyIce.size > 8) {
            const first = earlyIce.keys().next().value;
            if (first && first !== callId) earlyIce.delete(first);
        }
    }

    function clearCallCandidates(callId) {
        if (callId) earlyIce.delete(callId);
    }

    async function applyEarlyIce(callId, pc) {
        if (!callId || !pc) return;
        const map = earlyIce.get(callId);
        if (!map?.size) return;

        for (const candidate of map.values()) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                // call-v2.js may already have received the same candidate and
                // placed it in its own pendingIce queue. Duplicate ICE is safe.
                console.debug("Ранний ICE уже применён или отклонён:", error);
            }
        }

        clearCallCandidates(callId);
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
                        incomingCallId = signal.call_id || null;
                        if (incomingCallId) clearCallCandidates(incomingCallId);
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

    // Patch only setRemoteDescription. No addTrack/addIceCandidate or
    // negotiation methods are replaced, so the existing call implementation
    // remains the owner of normal WebRTC negotiation.
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
