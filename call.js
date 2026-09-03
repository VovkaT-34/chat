// =========================================
// 1-to-1 WebRTC calls
// =========================================
(function () {
    const SUPPORTED = Boolean(
        window.RTCPeerConnection &&
        navigator.mediaDevices?.getUserMedia
    );

    const STUN_SERVERS = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ];

    let callId = null;
    let peerConnection = null;
    let localStream = null;
    let remoteStream = null;
    let currentMode = "audio";
    let currentPeerId = null;
    let currentPeerName = "Пользователь";
    let currentRole = null;
    let pendingOffer = null;
    let signalChannel = null;
    let queuedIceCandidates = [];
    let callTimer = null;
    let callStartedAt = null;
    let callClosed = false;

    const $ = id => document.getElementById(id);

    function ensureCallUi() {
        if ($("callOverlay")) return;

        const style = document.createElement("style");
        style.textContent = `
            #callOverlay{display:none;position:fixed;inset:0;z-index:20000;background:rgba(16,12,9,.94);color:#fff;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
            #callOverlay.call-open{display:flex}
            .call-card{width:min(520px,100%);min-height:360px;border-radius:24px;background:linear-gradient(160deg,#241b16,#4b3324);box-shadow:0 20px 70px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}
            .call-top{padding:20px 20px 10px;text-align:center}
            .call-name{font-size:22px;font-weight:800}
            .call-status{margin-top:6px;color:#e8d8ca;font-size:14px}
            .call-media{position:relative;flex:1;min-height:210px;background:#0c0b0a;display:flex;align-items:center;justify-content:center;overflow:hidden}
            #remoteCallVideo{width:100%;height:100%;object-fit:cover;display:none}
            #localCallVideo{position:absolute;right:14px;top:14px;width:120px;height:170px;object-fit:cover;border-radius:14px;background:#111;display:none;border:1px solid rgba(255,255,255,.25)}
            .call-avatar{font-size:70px;opacity:.9}
            .call-controls{display:flex;justify-content:center;gap:12px;padding:18px;flex-wrap:wrap}
            .call-control{width:52px;height:52px;border:0;border-radius:50%;background:#6b513f;color:#fff;font-size:21px;cursor:pointer}
            .call-control:hover{filter:brightness(1.1)}
            .call-control.active{background:#b9a28e;color:#201812}
            .call-control.call-green{background:#20d85a;color:#062b11}
            .call-control.call-red{background:#e33b3b;color:#fff}
            .incoming-actions{display:flex;justify-content:center;gap:18px;padding:20px}
            .incoming-action{border:0;border-radius:999px;padding:13px 24px;font-weight:800;font-size:15px;cursor:pointer}
            .incoming-accept{background:#20d85a;color:#062b11}.incoming-reject{background:#e33b3b;color:#fff}
            #callVideoButton{display:none;padding:4px 9px;background:#1eea5a;color:#062b11;border:none;border-radius:7px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 3px 9px rgba(0,0,0,.18)}
            #callVideoButton:hover{filter:brightness(1.08);transform:translateY(-1px)}
            @media(max-width:700px){#callOverlay{padding:0}.call-card{width:100%;height:100%;border-radius:0}.call-media{min-height:0}.call-control{width:50px;height:50px}.call-top{padding-top:24px}}
        `;
        document.head.appendChild(style);

        const overlay = document.createElement("div");
        overlay.id = "callOverlay";
        overlay.innerHTML = `
            <div class="call-card">
                <div class="call-top">
                    <div class="call-name" id="callName">Пользователь</div>
                    <div class="call-status" id="callStatus">Подключение...</div>
                </div>
                <div class="call-media">
                    <div class="call-avatar" id="callAvatar">📞</div>
                    <video id="remoteCallVideo" autoplay playsinline></video>
                    <video id="localCallVideo" autoplay playsinline muted></video>
                </div>
                <div class="incoming-actions" id="incomingCallActions" style="display:none">
                    <button class="incoming-action incoming-reject" id="rejectIncomingCall">Отклонить</button>
                    <button class="incoming-action incoming-accept" id="acceptIncomingCall">Принять</button>
                </div>
                <div class="call-controls" id="activeCallControls" style="display:none">
                    <button class="call-control" id="muteCallButton" title="Выключить микрофон">🎙️</button>
                    <button class="call-control" id="videoCallButton" title="Включить видео">📹</button>
                    <button class="call-control" id="speakerCallButton" title="Динамик">🔊</button>
                    <button class="call-control call-red" id="hangupCallButton" title="Завершить">📞</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        $("rejectIncomingCall").onclick = rejectIncomingCall;
        $("acceptIncomingCall").onclick = acceptIncomingCall;
        $("hangupCallButton").onclick = () => endCall(true);
        $("muteCallButton").onclick = toggleMute;
        $("videoCallButton").onclick = toggleVideo;
        $("speakerCallButton").onclick = toggleSpeaker;
    }

    function setStatus(text) {
        const node = $("callStatus");
        if (node) node.textContent = text;
    }

    function setCallVisible(visible) {
        ensureCallUi();
        $("callOverlay")?.classList.toggle("call-open", visible);
    }

    function resetTimer() {
        if (callTimer) clearInterval(callTimer);
        callTimer = null;
        callStartedAt = null;
    }

    function startTimer() {
        resetTimer();
        callStartedAt = Date.now();
        callTimer = setInterval(() => {
            const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
            const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
            const ss = String(seconds % 60).padStart(2, "0");
            setStatus(`${currentMode === "video" ? "Видеозвонок" : "Звонок"} • ${mm}:${ss}`);
        }, 1000);
    }

    async function getPeer() {
        if (!currentChatId || !window.supabaseClient) return null;
        const { data, error } = await window.supabaseClient.rpc("get_private_chat_peer", {
            p_chat_id: Number(currentChatId)
        });
        if (error) {
            console.error("Не удалось определить собеседника:", error);
            return null;
        }
        return data?.[0] || null;
    }

    async function sendSignal(type, payload = {}) {
        if (!callId || !currentChatId || !currentPeerId || !window.supabaseClient) return;
        const { error } = await window.supabaseClient.from("call_signals").insert({
            chat_id: Number(currentChatId),
            sender_id: currentUser.id,
            recipient_id: currentPeerId,
            call_id: callId,
            signal_type: type,
            payload
        });
        if (error) console.error("Ошибка сигнала звонка:", error);
    }

    async function sendCallPush() {
        try {
            const { error } = await window.supabaseClient.functions.invoke("send-call-push", {
                body: {
                    chatId: Number(currentChatId),
                    recipientId: currentPeerId,
                    callId,
                    mode: currentMode
                }
            });
            if (error) console.warn("Push входящего звонка не отправлен:", error);
        } catch (error) {
            console.warn("Ошибка push звонка:", error);
        }
    }

    function createPeerConnection() {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
        queuedIceCandidates = [];

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                void sendSignal("ice", { candidate: event.candidate.toJSON() });
            }
        };

        peerConnection.ontrack = event => {
            if (!remoteStream) remoteStream = new MediaStream();
            event.streams?.[0]?.getTracks().forEach(track => {
                if (!remoteStream.getTracks().some(existing => existing.id === track.id)) {
                    remoteStream.addTrack(track);
                }
            });
            if (!event.streams?.[0]) remoteStream.addTrack(event.track);
            const video = $("remoteCallVideo");
            if (video) {
                video.srcObject = remoteStream;
                if (currentMode === "video") video.style.display = "block";
            }
            $("callAvatar").style.display = currentMode === "video" ? "none" : "block";
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection?.connectionState;
            if (state === "connected") startTimer();
            if (state === "failed" || state === "disconnected" || state === "closed") {
                setStatus("Соединение завершено");
                setTimeout(() => endCall(false), 800);
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }
        return peerConnection;
    }

    async function prepareMedia(mode) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Микрофон/камера недоступны");
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: mode === "video"
        });
        const localVideo = $("localCallVideo");
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.display = mode === "video" ? "block" : "none";
        }
    }

    async function handleRemoteIce(candidate) {
        if (!peerConnection || !candidate) return;
        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(candidate);
            } else {
                queuedIceCandidates.push(candidate);
            }
        } catch (error) {
            console.warn("Не удалось добавить ICE candidate:", error);
        }
    }

    async function flushIce() {
        const candidates = queuedIceCandidates.splice(0);
        for (const candidate of candidates) {
            try { await peerConnection.addIceCandidate(candidate); } catch {}
        }
    }

    async function subscribeSignals() {
        if (signalChannel || !window.supabaseClient || !currentUser?.id) return;
        signalChannel = window.supabaseClient
            .channel(`call-signals-${currentUser.id}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "call_signals",
                filter: `recipient_id=eq.${currentUser.id}`
            }, payload => {
                void handleSignal(payload.new);
            })
            .subscribe();
    }

    async function handleSignal(signal) {
        if (!signal || signal.recipient_id !== currentUser.id) return;

        if (signal.signal_type === "offer") {
            if (callId && callId !== signal.call_id) return;
            if (callId === signal.call_id && currentRole === "callee" && peerConnection) return;

            callId = signal.call_id;
            currentChatId = Number(signal.chat_id);
            currentPeerId = signal.sender_id;
            currentPeerName = signal.payload?.callerName || "Пользователь";
            currentMode = signal.payload?.mode === "video" ? "video" : "audio";
            pendingOffer = signal.payload?.description || null;
            currentRole = "callee";

            ensureCallUi();
            $("callName").textContent = currentPeerName;
            $("callAvatar").textContent = currentMode === "video" ? "📹" : "📞";
            $("incomingCallActions").style.display = "flex";
            $("activeCallControls").style.display = "none";
            setStatus(currentMode === "video" ? "Входящий видеозвонок" : "Входящий звонок");
            setCallVisible(true);
            return;
        }

        if (signal.call_id !== callId) return;

        if (signal.signal_type === "answer" && peerConnection) {
            try {
                await peerConnection.setRemoteDescription(signal.payload.description);
                await flushIce();
                setStatus("Соединение...");
            } catch (error) {
                console.error("Ошибка установки answer:", error);
                endCall(true);
            }
            return;
        }

        if (signal.signal_type === "ice") {
            await handleRemoteIce(signal.payload?.candidate);
            return;
        }

        if (signal.signal_type === "reject") {
            setStatus("Звонок отклонён");
            setTimeout(() => endCall(false), 600);
            return;
        }

        if (signal.signal_type === "hangup") {
            setStatus("Собеседник завершил звонок");
            setTimeout(() => endCall(false), 600);
        }
    }

    async function startCall(mode = "audio") {
        if (!SUPPORTED) {
            alert("Этот браузер не поддерживает WebRTC-звонки.");
            return;
        }
        if (!currentUser?.id || !currentChatId) return;

        const peer = await getPeer();
        if (!peer?.user_id) {
            alert("Звонки доступны только в личном чате один-на-один.");
            return;
        }

        await subscribeSignals();
        endCall(false);

        currentChatId = Number(currentChatId);
        currentPeerId = peer.user_id;
        currentPeerName = peer.username || "Пользователь";
        currentMode = mode === "video" ? "video" : "audio";
        currentRole = "caller";
        callId = crypto.randomUUID();
        callClosed = false;

        try {
            await prepareMedia(currentMode);
            createPeerConnection();
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: currentMode === "video"
            });
            await peerConnection.setLocalDescription(offer);

            ensureCallUi();
            $("callName").textContent = currentPeerName;
            $("callAvatar").textContent = currentMode === "video" ? "📹" : "📞";
            $("incomingCallActions").style.display = "none";
            $("activeCallControls").style.display = "flex";
            setStatus("Вызов...");
            setCallVisible(true);

            await sendSignal("offer", {
                description: peerConnection.localDescription?.toJSON(),
                mode: currentMode,
                callerName: currentUser.username || currentUser.email || "Пользователь"
            });
            await sendCallPush();
        } catch (error) {
            console.error("Не удалось начать звонок:", error);
            alert("Не удалось начать звонок. Проверьте доступ к микрофону/камере.");
            await endCall(true);
        }
    }

    async function acceptIncomingCall() {
        if (!pendingOffer || !callId || !currentPeerId) return;
        try {
            await prepareMedia(currentMode);
            createPeerConnection();
            await peerConnection.setRemoteDescription(pendingOffer);
            await flushIce();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            $("incomingCallActions").style.display = "none";
            $("activeCallControls").style.display = "flex";
            setStatus("Соединение...");
            await sendSignal("answer", { description: peerConnection.localDescription?.toJSON() });
            pendingOffer = null;
        } catch (error) {
            console.error("Не удалось принять звонок:", error);
            alert("Не удалось принять звонок. Проверьте разрешение микрофона/камеры.");
            await rejectIncomingCall();
        }
    }

    async function rejectIncomingCall() {
        if (callId && currentPeerId) await sendSignal("reject");
        endCall(false);
    }

    async function endCall(notifyPeer) {
        if (notifyPeer && callId && currentPeerId && !callClosed) {
            callClosed = true;
            await sendSignal("hangup");
        }
        callClosed = true;
        resetTimer();
        if (peerConnection) {
            try { peerConnection.close(); } catch {}
        }
        peerConnection = null;
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        remoteStream = null;
        pendingOffer = null;
        queuedIceCandidates = [];
        callId = null;
        currentPeerId = null;
        currentRole = null;
        $("callOverlay")?.classList.remove("call-open");
        if ($("remoteCallVideo")) {
            $("remoteCallVideo").srcObject = null;
            $("remoteCallVideo").style.display = "none";
        }
        if ($("localCallVideo")) {
            $("localCallVideo").srcObject = null;
            $("localCallVideo").style.display = "none";
        }
        if ($("incomingCallActions")) $("incomingCallActions").style.display = "none";
        if ($("activeCallControls")) $("activeCallControls").style.display = "none";
    }

    function toggleMute() {
        const track = localStream?.getAudioTracks?.()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        $("muteCallButton").classList.toggle("active", !track.enabled);
        $("muteCallButton").textContent = track.enabled ? "🎙️" : "🔇";
    }

    async function toggleVideo() {
        if (!localStream || currentMode !== "video") return;
        const track = localStream.getVideoTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        $("videoCallButton").classList.toggle("active", !track.enabled);
        $("videoCallButton").textContent = track.enabled ? "📹" : "🚫";
    }

    async function toggleSpeaker() {
        const remoteVideo = $("remoteCallVideo");
        if (!remoteVideo) return;
        if ("setSinkId" in remoteVideo) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const output = devices.find(device => device.kind === "audiooutput");
                if (output) await remoteVideo.setSinkId(output.deviceId);
            } catch (error) {
                console.warn("Не удалось выбрать аудиовыход:", error);
            }
        }
        $("speakerCallButton").classList.toggle("active");
    }

    function updateCallButtonVisibility() {
        const button = $("callVideoButton");
        if (!button) return;
        const item = document.querySelector(`.chat-item[data-chat-id="${Number(currentChatId)}"]`);
        const privateChat = item?.classList.contains("private-chat");
        button.style.display = privateChat ? "inline-block" : "none";
    }

    async function openIncomingCallFromUrl() {
        const params = new URLSearchParams(location.search);
        const incomingCallId = params.get("call");
        const chatId = params.get("chat");
        if (!incomingCallId || !chatId || !currentUser?.id) return;

        currentChatId = Number(chatId);
        callId = incomingCallId;
        await subscribeSignals();

        const { data, error } = await window.supabaseClient
            .from("call_signals")
            .select("chat_id,call_id,sender_id,signal_type,payload,created_at")
            .eq("call_id", incomingCallId)
            .eq("recipient_id", currentUser.id)
            .eq("signal_type", "offer")
            .order("created_at", { ascending: false })
            .limit(1);
        if (!error && data?.[0]) await handleSignal(data[0]);
    }

    function init() {
        ensureCallUi();

        const header = document.querySelector(".chat-header-actions");
        if (header && !$("callVideoButton")) {
            const button = document.createElement("button");
            button.id = "callVideoButton";
            button.type = "button";
            button.title = "Звонок";
            button.textContent = "📞";
            button.addEventListener("click", async () => {
                const choice = window.confirm("Начать видеозвонок?\n\nОК — видео\nОтмена — обычный аудиозвонок");
                await startCall(choice ? "video" : "audio");
            });
            header.insertBefore(button, header.firstChild);
        }

        document.addEventListener("click", event => {
            if (event.target.closest?.(".chat-item")) {
                setTimeout(updateCallButtonVisibility, 300);
            }
        });

        void subscribeSignals();
        setTimeout(updateCallButtonVisibility, 700);
        setTimeout(() => void openIncomingCallFromUrl(), 1200);
    }

    window.startChatCall = startCall;
    window.endChatCall = endCall;
    window.updateChatCallButton = updateCallButtonVisibility;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
