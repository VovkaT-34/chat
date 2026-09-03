// =========================================
// 1-to-1 WebRTC calls — v2
// =========================================
(function () {
    const ICE_SERVERS = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
    ];

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
    let pendingIce = [];
    let callStartedAt = 0;
    let timer = null;

    const $ = id => document.getElementById(id);

    function ui() {
        if ($("chatCallV2")) return;
        const style = document.createElement("style");
        style.textContent = `
            #chatCallV2{position:fixed;inset:0;z-index:30000;background:rgba(10,8,7,.95);display:none;align-items:center;justify-content:center;padding:16px;color:#fff}
            #chatCallV2.open{display:flex}
            .cv2-card{width:min(520px,100%);height:min(720px,100%);background:linear-gradient(160deg,#211813,#523726);border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,.55)}
            .cv2-head{text-align:center;padding:24px 18px 12px}.cv2-name{font-size:22px;font-weight:800}.cv2-status{margin-top:7px;color:#eadbce;font-size:14px}
            .cv2-media{flex:1;min-height:220px;background:#0c0b0a;position:relative;display:flex;align-items:center;justify-content:center}.cv2-avatar{font-size:76px}.cv2-remote{display:none;width:100%;height:100%;object-fit:cover}.cv2-local{display:none;position:absolute;right:14px;top:14px;width:115px;height:165px;object-fit:cover;border-radius:14px;background:#111;border:1px solid rgba(255,255,255,.3)}
            .cv2-controls{display:none;justify-content:center;gap:14px;padding:20px;flex-wrap:wrap}.cv2-btn{width:54px;height:54px;border:0;border-radius:50%;background:#6c503d;color:#fff;font-size:22px;cursor:pointer}.cv2-btn.green{background:#21ef62;color:#062b11}.cv2-btn.red{background:#e33d3d;color:#fff}
            .cv2-incoming{display:none;justify-content:center;gap:18px;padding:20px}.cv2-incoming button{border:0;border-radius:999px;padding:14px 25px;font-weight:800;font-size:15px;cursor:pointer}.cv2-accept{background:#21ef62;color:#062b11}.cv2-reject{background:#e33d3d;color:#fff}
            @media(max-width:700px){#chatCallV2{padding:0}.cv2-card{width:100%;height:100%;border-radius:0}.cv2-media{min-height:0}}
        `;
        document.head.appendChild(style);
        const root = document.createElement("div");
        root.id = "chatCallV2";
        root.innerHTML = `
            <div class="cv2-card">
                <div class="cv2-head"><div class="cv2-name" id="cv2Name">Пользователь</div><div class="cv2-status" id="cv2Status">Подключение...</div></div>
                <div class="cv2-media"><div class="cv2-avatar" id="cv2Avatar">📞</div><video class="cv2-remote" id="cv2Remote" autoplay playsinline></video><video class="cv2-local" id="cv2Local" autoplay playsinline muted></video></div>
                <div class="cv2-incoming" id="cv2Incoming"><button class="cv2-reject" id="cv2Reject">Отклонить</button><button class="cv2-accept" id="cv2Accept">Принять</button></div>
                <div class="cv2-controls" id="cv2Controls"><button class="cv2-btn" id="cv2Mute">🎙️</button><button class="cv2-btn" id="cv2Video">📹</button><button class="cv2-btn" id="cv2Speaker">🔊</button><button class="cv2-btn red" id="cv2Hangup">📞</button></div>
            </div>`;
        document.body.appendChild(root);
        $("cv2Reject").onclick = () => rejectIncoming();
        $("cv2Accept").onclick = () => acceptIncoming();
        $("cv2Hangup").onclick = () => end(true);
        $("cv2Mute").onclick = toggleMute;
        $("cv2Video").onclick = toggleVideo;
        $("cv2Speaker").onclick = toggleSpeaker;
    }

    function status(text) { if ($("cv2Status")) $("cv2Status").textContent = text; }
    function visible(v) { ui(); $("chatCallV2")?.classList.toggle("open", v); }
    function resetTimer() { if (timer) clearInterval(timer); timer = null; callStartedAt = 0; }
    function startTimer() { resetTimer(); callStartedAt = Date.now(); timer = setInterval(() => { const s=Math.floor((Date.now()-callStartedAt)/1000); status(`${mode === "video" ? "Видеозвонок" : "Звонок"} • ${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`); },1000); }

    async function send(type, payload={}) {
        if (!callId || !chatId || !peerId || !window.supabaseClient || !window.currentUser?.id) return;
        const { error } = await window.supabaseClient.from("call_signals").insert({
            chat_id: Number(chatId), sender_id: window.currentUser.id, recipient_id: peerId, call_id: callId, signal_type: type, payload
        });
        if (error) console.error("Ошибка сигнала звонка:", error);
    }

    async function peerForChat() {
        const { data, error } = await window.supabaseClient.rpc("get_private_chat_peer", { p_chat_id: Number(currentChatId) });
        if (error) { console.error("Ошибка определения собеседника:", error); return null; }
        return data?.[0] || null;
    }

    async function pushCall() {
        try {
            await window.supabaseClient.functions.invoke("send-call-push", { body:{ chatId:Number(chatId), recipientId:peerId, callId, mode } });
        } catch (error) { console.warn("Push звонка не отправлен:", error); }
    }

    function buildPeer() {
        if (pc) pc.close();
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pendingIce = [];
        pc.onicecandidate = e => { if (e.candidate) void send("ice", { candidate:e.candidate.toJSON() }); };
        pc.onicecandidateerror = e => console.warn("ICE error:", e.url, e.errorCode, e.errorText);
        pc.ontrack = e => {
            if (!remoteStream) remoteStream = new MediaStream();
            if (!remoteStream.getTracks().some(t => t.id === e.track.id)) remoteStream.addTrack(e.track);
            const video=$("cv2Remote"); if(video){video.srcObject=remoteStream;video.style.display=mode==="video"?"block":"none";}
            $("cv2Avatar").style.display=mode==="video"?"none":"block";
        };
        pc.onconnectionstatechange = () => {
            const s=pc?.connectionState;
            if(s==="connected"){status(mode==="video"?"Видеозвонок":"Звонок");startTimer();}
            if(s==="failed"){status("Не удалось установить соединение");setTimeout(()=>end(false),1200);}
            if(s==="disconnected"){status("Соединение потеряно");setTimeout(()=>end(false),1800);}
        };
        localStream?.getTracks().forEach(t => pc.addTrack(t, localStream));
        return pc;
    }

    async function media() {
        localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==="video"});
        const v=$("cv2Local"); if(v){v.srcObject=localStream;v.style.display=mode==="video"?"block":"none";}
    }

    async function addIce(c) {
        if(!pc||!c)return;
        if(pc.remoteDescription){try{await pc.addIceCandidate(c);}catch(e){console.warn("ICE:",e);}}
        else pendingIce.push(c);
    }
    async function flushIce(){for(const c of pendingIce.splice(0)){try{await pc.addIceCandidate(c);}catch{}}}

    async function handleSignal(s) {
        if(!s||!window.currentUser?.id||s.recipient_id!==window.currentUser.id)return;
        if(s.signal_type==="offer"){
            if(callId&&callId!==s.call_id)return;
            if(callId===s.call_id&&role==="callee")return;
            callId=s.call_id;chatId=Number(s.chat_id);peerId=s.sender_id;peerName=s.payload?.callerName||"Пользователь";mode=s.payload?.mode==="video"?"video":"audio";role="callee";pendingOffer=s.payload?.description||null;
            ui();$("cv2Name").textContent=peerName;$("cv2Avatar").textContent=mode==="video"?"📹":"📞";$("cv2Incoming").style.display="flex";$("cv2Controls").style.display="none";status(mode==="video"?"Входящий видеозвонок":"Входящий звонок");visible(true);return;
        }
        if(s.call_id!==callId)return;
        if(s.signal_type==="answer"&&pc){await pc.setRemoteDescription(s.payload.description);await flushIce();return;}
        if(s.signal_type==="ice"){await addIce(s.payload?.candidate);return;}
        if(s.signal_type==="reject"){status("Звонок отклонён");setTimeout(()=>end(false),700);return;}
        if(s.signal_type==="hangup"){status("Собеседник завершил звонок");setTimeout(()=>end(false),700);}
    }

    async function subscribe() {
        if(channel||!window.supabaseClient||!window.currentUser?.id)return;
        channel=window.supabaseClient.channel(`call-v2-${window.currentUser.id}`)
            .on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:`recipient_id=eq.${window.currentUser.id}`},p=>void handleSignal(p.new))
            .subscribe(s=>console.log("Call signaling:",s));
    }

    async function start(modeArg="audio") {
        if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert("Этот браузер не поддерживает звонки.");return;}
        if(!window.currentUser?.id||!currentChatId)return;
        const peer=await peerForChat();
        if(!peer?.user_id){alert("Звонки доступны только в личном чате один-на-один.");return;}
        await subscribe(); end(false);
        chatId=Number(currentChatId);peerId=peer.user_id;peerName=peer.username||"Пользователь";mode=modeArg==="video"?"video":"audio";role="caller";callId=crypto.randomUUID();
        try{
            await media();buildPeer();const offer=await pc.createOffer();await pc.setLocalDescription(offer);
            ui();$("cv2Name").textContent=peerName;$("cv2Avatar").textContent=mode==="video"?"📹":"📞";$("cv2Incoming").style.display="none";$("cv2Controls").style.display="flex";status("Вызов...");visible(true);
            await send("offer",{description:pc.localDescription?.toJSON(),mode,callerName:window.currentUser.username||window.currentUser.email||"Пользователь"});
            await pushCall();
        }catch(e){console.error("Ошибка начала звонка:",e);alert("Не удалось начать звонок. Проверьте разрешение на микрофон/камеру.");end(false);}
    }

    async function acceptIncoming(){
        if(!pendingOffer)return;
        try{
            $("cv2Incoming").style.display="none";$("cv2Controls").style.display="flex";await media();buildPeer();await pc.setRemoteDescription(pendingOffer);await flushIce();const answer=await pc.createAnswer();await pc.setLocalDescription(answer);status("Соединение...");await send("answer",{description:pc.localDescription?.toJSON()});
        }catch(e){console.error("Ошибка принятия звонка:",e);status("Не удалось принять звонок");setTimeout(()=>end(true),1200);}
    }
    async function rejectIncoming(){await send("reject");end(false);}
    async function end(notify){
        if(notify&&callId&&peerId)await send("hangup");
        resetTimer();try{pc?.close();}catch{};pc=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;remoteStream=null;pendingOffer=null;pendingIce=[];callId=null;peerId=null;role=null;$("chatCallV2")?.classList.remove("open");if($("cv2Remote"))$("cv2Remote").srcObject=null;if($("cv2Local"))$("cv2Local").srcObject=null;
    }
    function toggleMute(){const t=localStream?.getAudioTracks?.()[0];if(!t)return;t.enabled=!t.enabled;$("cv2Mute").textContent=t.enabled?"🎙️":"🔇";$("cv2Mute").classList.toggle("green",!t.enabled);}
    function toggleVideo(){const t=localStream?.getVideoTracks?.()[0];if(!t)return;t.enabled=!t.enabled;$("cv2Video").textContent=t.enabled?"📹":"🚫";$("cv2Video").classList.toggle("green",!t.enabled);}
    async function toggleSpeaker(){const v=$("cv2Remote");if(v&&"setSinkId"in v){try{const d=(await navigator.mediaDevices.enumerateDevices()).find(x=>x.kind==="audiooutput");if(d)await v.setSinkId(d.deviceId);}catch{}}$("cv2Speaker")?.classList.toggle("green");}

    function addButton(){
        const header=document.querySelector(".chat-header-actions");if(!header||$("callVideoButton"))return;
        const b=document.createElement("button");b.id="callVideoButton";b.type="button";b.title="Позвонить";b.textContent="📞";b.style.display="none";b.addEventListener("click",async()=>{const video=window.confirm("Начать видеозвонок?\n\nОК — видео\nОтмена — аудиозвонок");await start(video?"video":"audio");});header.insertBefore(b,header.firstChild);
    }
    function updateButton(){const b=$("callVideoButton");if(!b)return;const item=document.querySelector(`.chat-item[data-chat-id="${Number(currentChatId)}"]`);b.style.display=item?.classList.contains("private-chat")?"inline-flex":"none";}

    function init(){ui();addButton();subscribe();document.addEventListener("click",e=>{if(e.target.closest?.(".chat-item"))setTimeout(updateButton,100);});setTimeout(updateButton,500);if(window.supabaseClient?.auth?.onAuthStateChange)window.supabaseClient.auth.onAuthStateChange(()=>setTimeout(subscribe,0));}
    window.startChatCall=start;window.endChatCall=end;window.updateChatCallButton=updateButton;
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
