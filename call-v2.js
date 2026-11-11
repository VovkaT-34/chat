// =========================================
// 1-to-1 WebRTC calls
// =========================================
(function () {
    "use strict";

    const ICE_SERVERS = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        ...(Array.isArray(window.CALL_TURN_SERVERS) ? window.CALL_TURN_SERVERS : [])
    ];
    let activeIceServers = ICE_SERVERS;

    async function loadTurnIceServers() {
        activeIceServers = ICE_SERVERS;
        if (!window.supabaseClient?.functions?.invoke) return false;
        try {
            const { data, error } = await window.supabaseClient.functions.invoke("get-turn-credentials");
            if (error) throw error;
            if (!Array.isArray(data?.iceServers) || !data.iceServers.length) throw new Error("TURN credentials are empty");
            activeIceServers = [...ICE_SERVERS, ...data.iceServers];
            return true;
        } catch (error) {
            console.warn("Не удалось получить временные TURN-данные; используем STUN:", error);
            return false;
        }
    }

    let channel = null;
    let pc = null;
    let localStream = null;
    let remoteStream = null;
    let callId = null;
    let peerId = null;
    let peerName = "Пользователь";
    let chatId = null;
    let mode = "audio";
    let role = null;
    let pendingOffer = null;
    let pendingIce = new Map();
    let timer = null;
    let callTimeout = null;
    let startedAt = 0;
    let makingOffer = false;
    let renegotiationBusy = false;
    let pageVisible = !document.hidden;
    let pendingNativeCallAction = null;
    let recoveringOffer = false;
    let handledIncomingCallIds = new Set();
    let mediaWarning = "";

    const $ = id => document.getElementById(id);

    function createCallId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }

        if (window.crypto && typeof window.crypto.getRandomValues === "function") {
            var bytes = new Uint8Array(16);
            window.crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 15) | 64;
            bytes[8] = (bytes[8] & 63) | 128;
            var hex = [];
            for (var i = 0; i < bytes.length; i++) {
                hex.push((bytes[i] + 256).toString(16).slice(1));
            }
            return hex[0] + hex[1] + hex[2] + hex[3] + "-" +
                hex[4] + hex[5] + "-" + hex[6] + hex[7] + "-" +
                hex[8] + hex[9] + "-" + hex[10] + hex[11] + hex[12] + hex[13] + hex[14] + hex[15];
        }

        return String(Date.now()) + "-" + String(Math.random()).slice(2) + "-" + String(Math.random()).slice(2);
    }

    function getActiveChatId() {
        const fromWindow = Number(window.currentChatId || 0);
        if (fromWindow > 0) return fromWindow;
        try {
            const fromGlobal = Number(currentChatId || 0);
            if (fromGlobal > 0) return fromGlobal;
        } catch {}
        const title = document.getElementById("chatTitle")?.textContent?.trim() || "";
        if (!title || title === "Выберите чат") return 0;
        const items = document.querySelectorAll("#chatList .chat-item");
        for (const item of items) {
            const name = item.querySelector(".chat-item-name")?.textContent?.trim() || "";
            if (name && (title === name || title.endsWith(name))) return Number(item.dataset.chatId || 0);
        }
        return 0;
    }

    function setActiveChatId(id) {
        const value = Number(id || 0);
        if (!value) return;
        window.currentChatId = value;
        try { currentChatId = value; } catch {}
    }

    function ensureUi() {
        if ($("chatCallV2")) return;
        const style = document.createElement("style");
        style.textContent = `
        #chatCallV2{position:fixed;inset:0;z-index:30000;background:rgba(10,8,7,.96);display:none;align-items:center;justify-content:center;padding:16px;color:#fff}
        #chatCallV2.open{display:flex}.cv2-card{width:min(560px,100%);height:min(760px,100%);background:linear-gradient(160deg,#211813,#523726);border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,.55)}
        .cv2-head{text-align:center;padding:25px 18px 14px}.cv2-name{font-size:22px;font-weight:800}.cv2-status{margin-top:7px;color:#eadbce;font-size:14px}
        .cv2-media{flex:1;min-height:230px;background:#0c0b0a;position:relative;display:flex;align-items:center;justify-content:center}.cv2-avatar{font-size:78px}.cv2-remote{display:none;width:100%;height:100%;object-fit:cover}.cv2-remote-audio{display:none}
        .cv2-local{display:none;position:absolute;right:14px;top:14px;width:115px;height:165px;object-fit:cover;border-radius:14px;background:#111;border:1px solid rgba(255,255,255,.3)}
        .cv2-incoming{display:none;justify-content:center;gap:18px;padding:20px}.cv2-incoming button{border:0;border-radius:999px;padding:14px 25px;font-weight:800;font-size:15px;cursor:pointer}.cv2-accept{background:#21ef62;color:#062b11}.cv2-reject{background:#e33d3d;color:#fff}
        .cv2-controls{display:none;justify-content:center;gap:14px;padding:20px;flex-wrap:wrap}.cv2-btn{width:54px;height:54px;border:0;border-radius:50%;background:#6c503d;color:#fff;font-size:22px;cursor:pointer}.cv2-btn.red{background:#e33d3d}.cv2-btn.green{background:#21ef62;color:#062b11}
        .chat-call-button{display:none!important;width:38px;height:38px;min-width:38px;padding:0;border:0;border-radius:50%;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.18);transition:transform .15s ease,filter .15s ease}.chat-call-button:hover{transform:scale(1.06);filter:brightness(1.08)}.chat-call-audio{background:#21ef62;color:#062b11}.chat-call-video{background:#7f1d1d;color:#fff}
        .call-icon-video{position:relative;width:18px;height:14px;border:2px solid currentColor;border-radius:3px;display:block}.call-icon-video:after{content:"";position:absolute;right:-8px;top:2px;border-left:7px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent}.call-icon-phone{display:block;margin:0 auto;transform:rotate(-18deg)}
        @media(max-width:700px){#chatCallV2{padding:0}.cv2-card{width:100%;height:100%;border-radius:0}.cv2-media{min-height:0}.chat-call-button{width:38px;height:38px;min-width:38px}}
        `;
        document.head.appendChild(style);
        const root = document.createElement("div");
        root.id = "chatCallV2";
        root.innerHTML = `
            <div class="cv2-card">
                <div class="cv2-head"><div class="cv2-name" id="cv2Name">Пользователь</div><div class="cv2-status" id="cv2Status">Подключение...</div></div>
                <div class="cv2-media"><div class="cv2-avatar" id="cv2Avatar">📞</div><video class="cv2-remote" id="cv2Remote" autoplay playsinline></video><audio class="cv2-remote-audio" id="cv2RemoteAudio" autoplay></audio><video class="cv2-local" id="cv2Local" autoplay playsinline muted></video></div>
                <div class="cv2-incoming" id="cv2Incoming"><button class="cv2-reject" id="cv2Reject">Отклонить</button><button class="cv2-accept" id="cv2Accept">Принять</button></div>
                <div class="cv2-controls" id="cv2Controls"><button class="cv2-btn" id="cv2Mute" title="Микрофон">🎙️</button><button class="cv2-btn" id="cv2VideoControl" title="Камера">📹</button><button class="cv2-btn" id="cv2Speaker" title="Динамик">🔊</button><button class="cv2-btn red" id="cv2Hangup" title="Завершить">📞</button></div>
            </div>`;
        document.body.appendChild(root);
        $("cv2Reject").onclick = () => void rejectIncoming();
        $("cv2Accept").onclick = () => void acceptIncoming();
        $("cv2Hangup").onclick = () => void end(true);
        $("cv2Mute").onclick = toggleMute;
        $("cv2VideoControl").onclick = () => void toggleVideo();
        $("cv2Speaker").onclick = () => void toggleSpeaker();
    }

    function setStatus(text) { if ($("cv2Status")) $("cv2Status").textContent = text; }
    function show(value) { ensureUi(); $("chatCallV2")?.classList.toggle("open", Boolean(value)); }
    function clearTimer() { if (timer) clearInterval(timer); timer = null; if (callTimeout) clearTimeout(callTimeout); callTimeout = null; startedAt = 0; }
    function startTimer() { clearTimer(); startedAt = Date.now(); timer = setInterval(() => { const seconds = Math.floor((Date.now() - startedAt) / 1000); const label=mode === "video" ? "Видеозвонок" : "Звонок"; setStatus(label+(mediaWarning ? " • " + mediaWarning : "")+" • "+String(Math.floor(seconds / 60)).padStart(2,"0")+":"+String(seconds % 60).padStart(2,"0")); }, 1000); }
    function armCallTimeout() { if (callTimeout) clearTimeout(callTimeout); callTimeout = setTimeout(() => { if (callId && role === "caller") { setStatus("Собеседник не ответил"); setTimeout(() => void end(false), 1200); } }, 45000); }

    async function send(type, payload = {}) {
        if (!callId || !chatId || !peerId || !window.currentUser?.id) return false;
        const { error } = await window.supabaseClient.from("call_signals").insert({ chat_id:Number(chatId), sender_id:window.currentUser.id, recipient_id:peerId, call_id:callId, signal_type:type, payload });
        if (error) { console.error("Ошибка сигнала звонка:", error); return false; }
        return true;
    }

    async function peerForChat(id) {
        const chat = Number(id || 0); if (!chat) return null;
        const { data, error } = await window.supabaseClient.rpc("get_private_chat_peer", { p_chat_id:chat });
        if (error) { console.error("Ошибка определения собеседника:", error); return null; }
        return data?.[0] || null;
    }

    async function resolveIncomingPeerName() {
        try {
            const peer = await peerForChat(chatId);
            const name = peer?.username || peer?.name;
            if (name) return String(name);
        } catch (error) { console.warn("Не удалось определить ник звонящего:", error); }
        return "Пользователь";
    }

    async function sendCallPush() {
        try { await window.supabaseClient.functions.invoke("send-call-push", { body:{chatId:Number(chatId),recipientId:peerId,callId,mode} }); }
        catch (error) { console.warn("Push звонка не отправлен:", error); }
    }

    function setRemoteMedia() {
        const video = $("cv2Remote"), audio = $("cv2RemoteAudio");
        if (!remoteStream) return;
        if (video) { video.srcObject=remoteStream; video.style.display=mode === "video" && remoteStream.getVideoTracks().length ? "block":"none"; void video.play().catch(()=>{}); }
        if (audio) { audio.srcObject=remoteStream; audio.volume=1; audio.muted=false; void audio.play().catch(()=>{}); }
        if ($("cv2Avatar")) $("cv2Avatar").style.display=mode === "video" && remoteStream.getVideoTracks().length ? "none":"block";
    }

    function attachTrackRecovery(track) {
        if (!track) return;
        track.onunmute=()=>{ setRemoteMedia(); if(pageVisible) void resumeRemoteAudio(); };
        track.onended=()=>setTimeout(()=>{ if(callId && pageVisible) void resumeRemoteAudio(); },250);
    }

    async function resumeRemoteAudio() {
        if (!remoteStream) return;
        setRemoteMedia();
        const audio=$("cv2RemoteAudio"), video=$("cv2Remote");
        try { if(audio && audio.paused) await audio.play(); } catch(error){ console.warn("Не удалось возобновить удалённый звук:",error); }
        try { if(video && mode === "video" && video.paused) await video.play(); } catch(error){ console.warn("Не удалось возобновить удалённое видео:",error); }
    }

    function updateVideoUi(enabled) {
        const button=$("cv2VideoControl");
        if (!button) return;
        button.textContent="📹";
        button.classList.toggle("green", Boolean(enabled));
        button.title=enabled ? "Выключить видео":"Включить видео";
        const localVideo=$("cv2Local");
        if(localVideo) localVideo.style.display=enabled ? "block":"none";
    }

    function describeMediaError(error) {
        const reasons = {
            NotAllowedError: "браузер или операционная система запретили доступ",
            NotFoundError: "устройство не найдено",
            NotReadableError: "браузер не смог запустить камеру",
            OverconstrainedError: "устройство не поддерживает запрошенные параметры",
            SecurityError: "доступ заблокирован настройками безопасности страницы",
            AbortError: "операция доступа к устройству была прервана",
            TypeError: "браузер отклонил параметры запроса к устройству"
        };
        const name = error?.name || "Error";
        const reason = reasons[name] || "ошибка доступа к устройству";
        const details = String(error?.message || "").trim();
        return name + ": " + reason + (details ? " — " + details : "");
    }

    async function requestVideoTrack() {
        if(!navigator.mediaDevices?.getUserMedia) throw new Error("Камера недоступна");
        let stream;
        try {
            stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30},facingMode:"user"}});
        } catch(error) {
            console.warn("Не удалось открыть камеру с рекомендуемыми параметрами, пробуем стандартный режим:",error);
            stream=await navigator.mediaDevices.getUserMedia({video:true});
        }
        const videoTrack=stream.getVideoTracks()[0];
        if(!videoTrack){stream.getTracks().forEach(track=>track.stop());throw new Error("Видеотрек не получен");}
        if(!localStream) localStream=new MediaStream();
        localStream.addTrack(videoTrack);
        if(pc && pc.connectionState !== "closed") {
            const sender=pc.getSenders().find(item=>item.track?.kind === "video");
            if(sender) await sender.replaceTrack(videoTrack);
            else pc.addTrack(videoTrack,localStream);
        }
        const localVideo=$("cv2Local");
        if(localVideo){localVideo.srcObject=localStream;localVideo.style.display="block";void localVideo.play().catch(()=>{});}
        videoTrack.onended=()=>updateVideoUi(false);
        return videoTrack;
    }

    async function sendVideoOffer() {
        if(!pc || !callId || renegotiationBusy) return;
        if(pc.signalingState !== "stable") return;
        renegotiationBusy=true; makingOffer=true;
        try {
            const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});
            await pc.setLocalDescription(offer);
            const ok=await send("video-offer",{description:pc.localDescription?.toJSON()});
            if(!ok) throw new Error("video-offer не записан");        } finally { makingOffer=false; renegotiationBusy=false; }
    }

    function buildPeer() {
        if(pc){try{pc.close();}catch{}}
        remoteStream=new MediaStream();
        pc=new RTCPeerConnection({iceServers:activeIceServers,iceCandidatePoolSize:4});
        pc.onicecandidate=event=>{if(event.candidate) void send("ice",{candidate:event.candidate.toJSON()});};
        pc.ontrack=event=>{if(!remoteStream.getTracks().some(track=>track.id===event.track.id)) remoteStream.addTrack(event.track);attachTrackRecovery(event.track);if(event.track.kind==="video"){mode="video";updateVideoUi(true);}setRemoteMedia();};
        pc.onconnectionstatechange=()=>{const state=pc?.connectionState;if(state==="connected"){if(callTimeout)clearTimeout(callTimeout);callTimeout=null;const label=mode==="video"?"Видеозвонок":"Звонок";setStatus(mediaWarning?label+" • "+mediaWarning:label);startTimer();void resumeRemoteAudio();}else if(state==="failed"){setStatus("Не удалось установить соединение");setTimeout(()=>void end(false),1500);}else if(state==="disconnected"){setStatus("Соединение потеряно");setTimeout(()=>{if(pc?.connectionState==="disconnected")void end(false);},3000);}};
        pc.oniceconnectionstatechange=()=>{if(pc?.iceConnectionState==="failed")setStatus("Не удалось соединиться через WebRTC");};
        pc.onnegotiationneeded=()=>{if(role==="caller"&&!makingOffer&&mode==="video")void sendVideoOffer();};
        localStream?.getTracks().forEach(track=>pc.addTrack(track,localStream));
    }

    async function getMedia() {
        if(!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia недоступен");
        const audioConstraints={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
        let audioStream=null;
        let videoStream=null;
        let videoError=null;

        // Получаем камеру отдельно: ошибка микрофона больше не маскируется под
        // ошибку камеры и не заставляет звонок переходить в аудиорежим.
        if(mode==="video") {
            try {
                videoStream=await navigator.mediaDevices.getUserMedia({
                    audio:false,
                    video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30},facingMode:"user"}
                });
            } catch(firstVideoError) {
                console.warn("Камера не открылась с рекомендуемыми параметрами; пробуем video:true:",firstVideoError);
                try {
                    videoStream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});
                } catch(secondVideoError) {
                    videoError=secondVideoError;
                    console.error("Не удалось получить видеопоток:",secondVideoError);
                }
            }
        }

        try {
            audioStream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints,video:false});
        } catch(audioError) {
            if(mode!=="video" || !videoStream) throw audioError;
            mediaWarning="микрофон не подключён: "+describeMediaError(audioError);
            console.error("Видео доступно, но микрофон не открылся:",audioError);
        }

        if(mode==="video" && !videoStream) {
            if(!audioStream) throw videoError || new Error("Не удалось получить камеру и микрофон");
            mode="audio";
            mediaWarning="камера не подключилась: "+describeMediaError(videoError);
            console.error("Продолжаем аудиозвонок без камеры:",videoError);
        }

        const tracks=[
            ...(audioStream?.getTracks?.()||[]),
            ...(videoStream?.getTracks?.()||[])
        ];
        if(!tracks.length) throw new Error("Браузер не вернул аудио- или видеотреки");
        localStream=new MediaStream(tracks);

        const video=$("cv2Local");
        const hasVideo=Boolean(videoStream?.getVideoTracks?.().length);
        if(video){
            video.srcObject=localStream;
            video.style.display=hasVideo?"block":"none";
            if(hasVideo)void video.play().catch(error=>console.warn("Не удалось показать локальное видео:",error));
        }
        updateVideoUi(hasVideo);
    }

    function candidateKey(candidate){
        return JSON.stringify([
            candidate?.candidate || "",
            candidate?.sdpMid || null,
            candidate?.sdpMLineIndex ?? null,
            candidate?.usernameFragment || null
        ]);
    }

    function rememberIce(signalCallId,candidate){
        if(!signalCallId||!candidate)return;
        if(!pendingIce.has(signalCallId))pendingIce.set(signalCallId,new Map());
        const candidates=pendingIce.get(signalCallId);
        candidates.set(candidateKey(candidate),candidate);
        while(candidates.size>64)candidates.delete(candidates.keys().next().value);
        while(pendingIce.size>8){
            const oldest=[...pendingIce.keys()].find(id=>id!==callId);
            if(!oldest)break;
            pendingIce.delete(oldest);
        }
    }

    async function addIce(signalCallId,candidate){
        if(!signalCallId||!candidate)return;
        if(pc&&signalCallId===callId&&pc.remoteDescription){
            try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}
            catch(error){console.warn("ICE:",error);}
            return;
        }
        rememberIce(signalCallId,candidate);
    }

    async function flushIce(){
        if(!pc||!callId)return;
        const candidates=pendingIce.get(callId);
        if(!candidates?.size)return;
        for(const candidate of candidates.values()){
            try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}
            catch(error){console.warn("ICE:",error);}
        }
        pendingIce.delete(callId);
    }

    async function handleVideoOffer(signal){
        if(!pc||signal.call_id!==callId||!signal.payload?.description)return;
        if(pc.signalingState!=="stable")return;
        try{
            await pc.setRemoteDescription(signal.payload.description);
            await flushIce();
            if(!localStream?.getVideoTracks?.().length) await requestVideoTrack();
            mode="video";
            updateVideoUi(true);
            const answer=await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await send("video-answer",{description:pc.localDescription?.toJSON()});
            setStatus("Видеозвонок");
        }catch(error){console.error("Ошибка переключения на видео:",error);setStatus("Не удалось включить видео");}
    }

    async function isOfferActive(signal) {
        const offerTime=Date.parse(signal?.created_at||"");
        if(!signal?.call_id||!Number.isFinite(offerTime)||Date.now()-offerTime>60000||offerTime-Date.now()>30000)return false;
        const {data,error}=await window.supabaseClient.from("call_signals")
            .select("signal_type,created_at")
            .eq("call_id",signal.call_id)
            .in("signal_type",["answer","hangup","reject"])
            .order("created_at",{ascending:false})
            .limit(1);
        if(error){
            console.warn("Не удалось проверить, завершён ли входящий вызов; отклоняем восстановление:",error);
            return false;
        }
        const terminalTime=Date.parse(data?.[0]?.created_at||"");
        return !Number.isFinite(terminalTime)||terminalTime<offerTime;
    }

    async function handleSignal(signal){
        if(!signal||!window.currentUser?.id||signal.recipient_id!==window.currentUser.id)return;
        if(signal.signal_type==="offer"){
            if(callId&&callId!==signal.call_id)return;
            if(callId===signal.call_id&&role==="callee")return;
            if(handledIncomingCallIds.has(signal.call_id))return;
            if(!(await isOfferActive(signal)))return;
            if(callId||handledIncomingCallIds.has(signal.call_id))return;
            handledIncomingCallIds.add(signal.call_id);
            while(handledIncomingCallIds.size>32)handledIncomingCallIds.delete(handledIncomingCallIds.values().next().value);
            mediaWarning="";callId=signal.call_id;chatId=Number(signal.chat_id);peerId=signal.sender_id;mode=signal.payload?.mode==="video"?"video":"audio";role="callee";pendingOffer=signal.payload?.description||null;setActiveChatId(chatId);
            peerName=await resolveIncomingPeerName();
            ensureUi();$("cv2Name").textContent=peerName;$("cv2Avatar").textContent=mode==="video"?"📹":"📞";$("cv2Incoming").style.display="flex";$("cv2Controls").style.display="none";$("cv2Remote").style.display="none";updateVideoUi(false);setStatus(mode==="video"?"Входящий видеозвонок":"Входящий звонок");show(true);processNativeCallAction();return;
        }
        if(signal.signal_type==="ice"){await addIce(signal.call_id,signal.payload?.candidate);return;}
        if(signal.call_id!==callId)return;
        if(signal.signal_type==="answer"&&pc){await pc.setRemoteDescription(signal.payload.description);await flushIce();}
        else if(signal.signal_type==="video-offer")await handleVideoOffer(signal);
        else if(signal.signal_type==="video-answer"&&pc){if(pc.signalingState!=="have-local-offer")return;await pc.setRemoteDescription(signal.payload.description);await flushIce();mode="video";updateVideoUi(true);setRemoteMedia();setStatus("Видеозвонок");}
        else if(signal.signal_type==="reject"){setStatus("Звонок отклонён");setTimeout(()=>void end(false),700);}
        else if(signal.signal_type==="hangup"){setStatus("Собеседник завершил звонок");setTimeout(()=>void end(false),700);}
    }

    async function subscribe(){
        if(channel||!window.supabaseClient||!window.currentUser?.id)return;
        channel=window.supabaseClient.channel(`call-v2-${window.currentUser.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:`recipient_id=eq.${window.currentUser.id}`},payload=>void handleSignal(payload.new)).subscribe(status=>{if(status==="SUBSCRIBED"){void recoverOffer();}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){channel=null;setTimeout(subscribe,2000);}});
    }

    async function recoverOffer(requestedCallIdOverride){
        if(!window.currentUser?.id||callId||recoveringOffer||!window.supabaseClient)return;
        recoveringOffer=true;
        try{
            const requestedCallId=requestedCallIdOverride||new URLSearchParams(window.location.search).get("call");
            let query=window.supabaseClient.from("call_signals").select("chat_id,sender_id,recipient_id,call_id,signal_type,payload,created_at").eq("recipient_id",window.currentUser.id).eq("signal_type","offer").gte("created_at",new Date(Date.now()-60000).toISOString()).order("created_at",{ascending:false});
            if(requestedCallId)query=query.eq("call_id",requestedCallId);
            const {data,error}=await query.limit(10);
            if(error){console.warn("Не удалось восстановить входящий вызов:",error);return;}
            for(const offer of data||[]){
                if(await isOfferActive(offer)){
                    await handleSignal(offer);
                    return;
                }
            }
        }finally{
            recoveringOffer=false;
        }
    }

    async function startCall(modeArg){
        if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert("Этот браузер не поддерживает звонки.");return;}
        const activeChatId=getActiveChatId();
        if(!window.currentUser?.id||!activeChatId){alert("Сначала откройте личный чат.");return;}
        setActiveChatId(activeChatId);const peer=await peerForChat(activeChatId);
        if(!peer?.user_id){alert("Звонки доступны только в личном чате один-на-один.");return;}
        await end(false);mediaWarning="";chatId=activeChatId;peerId=peer.user_id;peerName=peer.username||"Пользователь";mode=modeArg==="video"?"video":"audio";role="caller";callId=createCallId();
        try{
            ensureUi();$("cv2Name").textContent=peerName;$("cv2Avatar").textContent=mode==="video"?"📹":"📞";$("cv2Incoming").style.display="none";$("cv2Controls").style.display="flex";$("cv2Remote").style.display="none";updateVideoUi(mode==="video");setStatus("Вызов…");show(true);
            await getMedia();await loadTurnIceServers();buildPeer();
            const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:mode==="video"});makingOffer=true;await pc.setLocalDescription(offer);makingOffer=false;
            if(!await send("offer",{description:pc.localDescription?.toJSON(),mode,callerName:window.currentUsername||peerName||"Пользователь"}))throw new Error("offer не записан");
            setStatus(mediaWarning?"Вызов… • "+mediaWarning:"Вызов…");armCallTimeout();await sendCallPush();
        }catch(error){makingOffer=false;console.error("Ошибка начала звонка:",error);setStatus("Не удалось начать звонок: "+describeMediaError(error));setTimeout(()=>void end(false),3500);}
    }

    async function acceptIncoming(){
        if(!pendingOffer||!callId)return;
        mediaWarning="";
        try{
            $("cv2Incoming").style.display="none";$("cv2Controls").style.display="flex";setStatus("Соединение…");
            await getMedia();await loadTurnIceServers();buildPeer();await pc.setRemoteDescription(pendingOffer);await flushIce();
            const answer=await pc.createAnswer();await pc.setLocalDescription(answer);setStatus("Соединение…");if(!await send("answer",{description:pc.localDescription?.toJSON()}))throw new Error("Сигнал ответа не записан в Supabase");void resumeRemoteAudio();
        }catch(error){console.error("Ошибка принятия звонка:",error);setStatus("Не удалось принять звонок: "+describeMediaError(error));setTimeout(()=>void end(true),3500);}
    }

    function processNativeCallAction(){
        if(!pendingNativeCallAction||!callId||role!=="callee"||callId!==pendingNativeCallAction.callId||!pendingOffer||!document.getElementById("cv2Incoming"))return;
        const action=pendingNativeCallAction.action;
        pendingNativeCallAction=null;
        if(action==="answer")void acceptIncoming();
        else if(action==="reject")void rejectIncoming();
        else if(action==="open")show(true);
    }
    window.addEventListener("androidincomingcall",event=>{
        const detail=event?.detail||{};
        if(!detail.callId||!["answer","reject","open"].includes(detail.action))return;
        if(detail.action==="open"){void recoverOffer(String(detail.callId));return;}
        pendingNativeCallAction={action:detail.action,callId:String(detail.callId)};
        processNativeCallAction();
        if(pendingNativeCallAction)setTimeout(()=>{if(pendingNativeCallAction?.callId===String(detail.callId))void recoverOffer(String(detail.callId));},1200);
    });
    async function rejectIncoming(){await send("reject");await end(false);}
    async function end(notify){
        if(notify&&callId&&peerId)await send("hangup");
        try{if(callId&&window.AndroidNotifications?.cancelIncomingCallNotification)window.AndroidNotifications.cancelIncomingCallNotification(callId);}catch(error){console.warn("Не удалось закрыть системное уведомление звонка:",error);}
        clearTimer();try{pc?.close();}catch{}pc=null;localStream?.getTracks().forEach(track=>track.stop());localStream=null;remoteStream=null;pendingOffer=null;pendingIce.clear();callId=null;peerId=null;role=null;chatId=null;makingOffer=false;renegotiationBusy=false;
        if($("chatCallV2"))$("chatCallV2").classList.remove("open");if($("cv2Remote"))$("cv2Remote").srcObject=null;if($("cv2RemoteAudio"))$("cv2RemoteAudio").srcObject=null;if($("cv2Local"))$("cv2Local").srcObject=null;
    }

    function toggleMute(){const track=localStream?.getAudioTracks?.()[0];if(!track)return;track.enabled=!track.enabled;$("cv2Mute").textContent=track.enabled?"🎙️":"🔇";$("cv2Mute").classList.toggle("green",!track.enabled);}

    async function toggleVideo(){
        if(!callId||!pc||!localStream)return;
        const track=localStream.getVideoTracks?.()[0];
        if(track){track.enabled=!track.enabled;mode=track.enabled?"video":mode;updateVideoUi(track.enabled);return;}
        try{
            setStatus("Запрашиваем доступ к камере…");
            await requestVideoTrack();mode="video";updateVideoUi(true);setRemoteMedia();
            if(pc.signalingState==="stable") await sendVideoOffer(); else setStatus("Подготавливаем видео…");
        }catch(error){console.error("Ошибка включения камеры:",error);setStatus("Не удалось включить камеру: "+describeMediaError(error));updateVideoUi(false);}
    }

    async function toggleSpeaker(){
        const video=$("cv2Remote"),audio=$("cv2RemoteAudio"),target=mode==="video"?video:audio;
        if(target&&"setSinkId"in target){try{const devices=await navigator.mediaDevices.enumerateDevices();const outputs=devices.filter(device=>device.kind==="audiooutput"&&device.deviceId);if(outputs.length>1){const current=target.sinkId||"default";const next=outputs.find(device=>device.deviceId!==current)||outputs[0];await target.setSinkId(next.deviceId);}}catch(error){console.warn("Выбор динамика:",error);}}
        else console.info("Выбор аудиовыхода не поддерживается этим браузером; используется системный маршрут.");
        await resumeRemoteAudio();$("cv2Speaker")?.classList.toggle("green");
    }

    function updateChatCallButtonVisibility(){const id=getActiveChatId();const item=document.querySelector(`#chatList .chat-item[data-chat-id="${id}"]`);const isPrivate=item?.dataset.chatType==="private";const display=id>0&&isPrivate?"inline-flex":"none";[$("callAudioButton"),$("callVideoButton")].forEach(button=>{if(button)button.style.setProperty("display",display,"important");});}

    function addButtons(){const header=document.querySelector(".chat-header-actions");if(!header)return;if(!$('callAudioButton')){const audio=document.createElement("button");audio.id="callAudioButton";audio.type="button";audio.title="Аудиозвонок";audio.setAttribute("aria-label","Аудиозвонок");audio.className="chat-call-button chat-call-audio";audio.innerHTML='<svg class="call-icon-phone" width="20" height="20" viewBox="0 0 24 24"><path d="M7.1 2.6c1.05-.35 2.2.18 2.65 1.2l1.05 2.4c.4.9.15 1.95-.6 2.6l-1.25 1.05c1.15 2.35 3.05 4.25 5.4 5.4l1.05-1.25c.65-.75 1.7-1 2.6-.6l2.4 1.05c1.02.45 1.55 1.6 1.2 2.65l-.55 1.65c-.35 1.05-1.35 1.75-2.45 1.65C10.9 19.85 4.15 13.1 3.65 4.4c-.07-1.1.6-2.1 1.65-2.45 1.05-.35 2.2.18 2.65 1.2z" fill="currentColor"/></svg>';audio.addEventListener("click",()=>void startCall("audio"));header.appendChild(audio);}if(!$('callVideoButton')){const video=document.createElement("button");video.id="callVideoButton";video.type="button";video.title="Видеозвонок";video.setAttribute("aria-label","Видеозвонок");video.className="chat-call-button chat-call-video";video.innerHTML='<span class="call-icon-video"></span>';video.addEventListener("click",()=>void startCall("video"));header.appendChild(video);}updateChatCallButtonVisibility();}

    function handleVisibilityChange(){pageVisible=!document.hidden;if(pageVisible&&callId){void resumeRemoteAudio();const audioTracks=localStream?.getAudioTracks?.()||[];const endedAudio=audioTracks.find(track=>track.readyState==="ended");if(endedAudio&&navigator.mediaDevices?.getUserMedia)void recoverLocalAudio();}}
    async function recoverLocalAudio(){if(!pc||!localStream||!navigator.mediaDevices?.getUserMedia)return;try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const track=stream.getAudioTracks()[0];if(!track)return;const sender=pc.getSenders().find(item=>item.track?.kind==="audio");if(sender)await sender.replaceTrack(track);const old=localStream.getAudioTracks()[0];if(old&&old!==track)old.stop();localStream.addTrack(track);$("cv2Mute").textContent=track.enabled?"🎙️":"🔇";setStatus(mode==="video"?"Видеозвонок":"Звонок");}catch(error){console.warn("Не удалось восстановить микрофон после блокировки/возврата:",error);}}

    window.updateChatCallButtonVisibility=updateChatCallButtonVisibility;window.updateChatCallButton=updateChatCallButtonVisibility;window.startAudioCall=()=>void startCall("audio");window.startVideoCall=()=>void startCall("video");
    document.addEventListener("visibilitychange",handleVisibilityChange);window.addEventListener("pageshow",()=>{pageVisible=true;if(callId)void resumeRemoteAudio();});window.addEventListener("pagehide",()=>{pageVisible=false;});
    function boot(){ensureUi();addButtons();updateChatCallButtonVisibility();void subscribe();setTimeout(()=>void subscribe(),1500);setTimeout(()=>void recoverOffer(),700);}
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
    setInterval(()=>{addButtons();updateChatCallButtonVisibility();if(!channel&&window.currentUser?.id)void subscribe();},1000);
})();