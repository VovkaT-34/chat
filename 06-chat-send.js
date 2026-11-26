// ===============================
// Отправка сообщения
// ===============================
async function sendMessage(){
    const input=document.getElementById("messageInput");if(!input)return;const text=input.value.trim();if(!text||!currentChatId||!currentUser)return;
    if(!currentUsername||currentUsername==="Пользователь"){const r=await supabaseClient.from("profiles").select("username").eq("id",currentUser.id).single();if(!r.error&&r.data&&r.data.username)currentUsername=r.data.username;}
    let senderName=currentUsername;
    if(!senderName||senderName==="Пользователь"){const r=await supabaseClient.from("profiles").select("username").eq("id",currentUser.id).single();if(!r.error&&r.data&&r.data.username){senderName=r.data.username;currentUsername=r.data.username;}}
    const chatId=currentChatId,replyTo=replyMessageId,temporaryId="sending-"+Date.now(),box=document.getElementById("messages");let temporaryMessage=null;
    if(box){temporaryMessage=document.createElement("div");temporaryMessage.className="message";temporaryMessage.dataset.messageId=temporaryId;const temporaryHeader=document.createElement("div");const temporaryUser=document.createElement("span");temporaryUser.className="message-user";temporaryUser.textContent=String(senderName==null?"":senderName);temporaryHeader.appendChild(temporaryUser);const temporaryTime=document.createElement("span");temporaryTime.className="message-time";const temporaryNow=new Date();temporaryTime.textContent=temporaryNow.toLocaleDateString("ru-RU")+" "+temporaryNow.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});temporaryHeader.appendChild(temporaryTime);const temporaryStatus=document.createElement("span");temporaryStatus.className="message-status";temporaryStatus.style.cssText="margin-left:6px;font-size:13px;font-weight:bold;white-space:nowrap;color:#999999";temporaryStatus.title="Отправляется";temporaryStatus.textContent="⟳";temporaryHeader.appendChild(temporaryStatus);temporaryMessage.appendChild(temporaryHeader);const temporaryBody=document.createElement("div");temporaryBody.className="message-text";temporaryBody.textContent=text;temporaryMessage.appendChild(temporaryBody);box.appendChild(temporaryMessage);box.scrollTop=box.scrollHeight;}
    const result=await supabaseClient.from("messages").insert({chat_id:chatId,user_id:currentUser.id,text:text,reply_to:replyTo}).select("id,text,created_at,reply_to,expires_at,message_user_expirations(expires_at)").single();
    const data=result.data,error=result.error;
    if(error){console.log("Ошибка отправки сообщения:",error);if(temporaryMessage){const status=temporaryMessage.querySelector(".message-status");if(status){status.textContent="!";status.title="Ошибка отправки";status.style.color="#d32f2f";}}return;}
    if(temporaryMessage)temporaryMessage.remove();input.value="";
    let messageData=data;
    if(!Array.isArray(data.message_user_expirations)||data.message_user_expirations.length===0){
        const expiryResult=await supabaseClient.from("messages").select("id,user_id,text,created_at,reply_to,expires_at,message_user_expirations(expires_at)").eq("id",data.id).single();
        if(!expiryResult.error&&expiryResult.data)messageData=expiryResult.data;
    }
    const messageForRender={id:messageData.id,user_id:currentUser.id,text:messageData.text,created_at:messageData.created_at,reply_to:messageData.reply_to,expires_at:messageData.expires_at,message_user_expirations:messageData.message_user_expirations,profiles:{username:senderName},reply_message:messageData.reply_message};
    if(box){const div=renderMessage(messageForRender);if(div){box.appendChild(div);box.scrollTop=box.scrollHeight;}}
    const statusElement=document.querySelector('[data-status-message-id="'+data.id+'"]');if(statusElement)setMessageStatus(statusElement,"sent");const chatStatusElement=document.querySelector('[data-chat-status-id="'+chatId+'"]');if(chatStatusElement)setMessageStatus(chatStatusElement,"sent");
    const ownRead=await supabaseClient.from("user_chat_reads").upsert({user_id:currentUser.id,chat_id:chatId,last_read_message_id:data.id},{onConflict:"user_id,chat_id"});if(ownRead.error)console.log("Ошибка отметки собственного сообщения:",ownRead.error);
    if(typeof sendChatPushForMessage==="function")void sendChatPushForMessage(data.id);else if(window.supabaseClient&&window.supabaseClient.functions)void window.supabaseClient.functions.invoke("send-message-push",{body:{messageId:data.id}}).catch(function(error){console.warn("Web Push не отправлен:",error);});
    const refresh=function(){if(typeof updateMessageStatus==="function")void updateMessageStatus(data.id);if(typeof updateChatListMessageStatus==="function")void updateChatListMessageStatus(chatId);};setTimeout(refresh,1000);
    replyMessageId=null;const replyBox=document.getElementById("replyBox");if(replyBox)replyBox.style.display="none";input.placeholder="Введите сообщение...";if(typeof moveChatToTop==="function")moveChatToTop(chatId,data.created_at);
}
const sendButton=document.getElementById("sendButton");if(sendButton)sendButton.addEventListener("click",sendMessage);
const messageInput=document.getElementById("messageInput");if(messageInput){messageInput.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendMessage();}});messageInput.addEventListener("input",function(){sendTypingStatus();});}

(function(){
    const button=document.getElementById("voiceInputButton"),input=document.getElementById("messageInput");
    if(!button||!input)return;
    const TRANSFORMERS_SCRIPT="https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
    const VOICE_MODEL="Xenova/whisper-tiny";
    const LANGUAGES={ru:{name:"Русский",code:"russian"},en:{name:"English",code:"english"},cn:{name:"中文",code:"chinese"}};
    button.type="button";
    let transcriber=null,transcriberPromise=null,mediaStream=null,audioContext=null,source=null,processor=null,silentGain=null,running=false,starting=false,samples=[],baseText="",startToken=0,modulePromise=null;
    function getLanguage(){const selected=localStorage.getItem("chat-voice-language");return LANGUAGES[selected]?selected:"ru";}
    function setUi(text,busy){button.title=text;button.setAttribute("aria-busy",busy?"true":"false");}
    function showDownloadOverlay(){
        const old=document.getElementById("voiceLanguageChooser");if(old)old.remove();
        const overlay=document.createElement("div");overlay.id="voiceLanguageChooser";overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:14px";
        const box=document.createElement("div");box.style.cssText="width:min(430px,100%);background:#fff;border-radius:18px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:Arial,sans-serif;color:#30251e";
        const title=document.createElement("div");title.textContent="Голосовой ввод";title.style.cssText="font-size:18px;font-weight:700;margin-bottom:7px";
        const text=document.createElement("div");text.textContent="Распознавание работает прямо в браузере. Речь не отправляется на сервер.";text.style.cssText="font-size:14px;color:#786e67;line-height:1.4;margin-bottom:14px";
        box.appendChild(title);box.appendChild(text);
        Object.keys(LANGUAGES).forEach(function(code){const b=document.createElement("button");b.type="button";b.textContent=LANGUAGES[code].name;b.style.cssText="display:block;width:100%;padding:12px;margin:7px 0;border:0;border-radius:10px;background:#6eae83;color:#fff;font-weight:700;font-size:15px;cursor:pointer";b.onclick=function(){localStorage.setItem("chat-voice-language",code);overlay.remove();startVoice();};box.appendChild(b);});
        const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Отмена";cancel.style.cssText="display:block;width:100%;padding:9px;margin-top:4px;border:0;background:transparent;color:#786e67;cursor:pointer";cancel.onclick=function(){overlay.remove();};box.appendChild(cancel);overlay.appendChild(box);document.body.appendChild(overlay);
    }
    function loadTransformers(){
        if(window.__chatTransformers)return Promise.resolve(window.__chatTransformers);
        if(modulePromise)return modulePromise;
        modulePromise=import(TRANSFORMERS_SCRIPT).then(function(module){window.__chatTransformers=module;return module;}).catch(function(error){modulePromise=null;throw error;});
        return modulePromise;
    }
    async function loadTranscriber(overlay){
        if(transcriber)return transcriber;
        if(transcriberPromise)return transcriberPromise;
        transcriberPromise=(async function(){
            const module=await loadTransformers();
            if(module.env){module.env.useBrowserCache=true;module.env.useWasmCache=true;module.env.allowRemoteModels=true;module.env.logLevel=module.env.ERROR;}
            const options={dtype:"q8",progress_callback:function(progress){
                if(!overlay)return;
                let percent=0;
                if(progress&&typeof progress.progress==="number")percent=progress.progress;
                else if(progress&&progress.status==="ready")percent=100;
                const label=overlay.querySelector("[data-voice-download-text]"),bar=overlay.querySelector("[data-voice-download-progress]"),value=overlay.querySelector("[data-voice-download-percent]");
                if(label)label.textContent=progress&&progress.file_name?"Загрузка модели: "+progress.file_name:"Загрузка модели…";
                if(bar)bar.value=percent;
                if(value)value.textContent=Math.round(percent)+"%";
            }};
            if(navigator.gpu){options.device="webgpu";options.dtype="fp16";}else{options.device="wasm";options.dtype="q8";}
            try{return await module.pipeline("automatic-speech-recognition",VOICE_MODEL,options);}catch(error){
                if(options.device==="webgpu"){options.device="wasm";options.dtype="q8";return await module.pipeline("automatic-speech-recognition",VOICE_MODEL,options);}
                throw error;
            }
        })().then(function(value){transcriber=value;localStorage.setItem("chat-voice-model-ready","true");return value;}).catch(function(error){transcriberPromise=null;localStorage.removeItem("chat-voice-model-ready");throw error;});
        return transcriberPromise;
    }
    function createOverlay(){
        const old=document.getElementById("voiceLanguageChooser");if(old)old.remove();
        const overlay=document.createElement("div");overlay.id="voiceLanguageChooser";overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:14px";
        const box=document.createElement("div");box.style.cssText="width:min(430px,100%);background:#fff;border-radius:18px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:Arial,sans-serif;color:#30251e";
        const title=document.createElement("div");title.textContent="Подготовка голосового ввода";title.style.cssText="font-size:18px;font-weight:700;margin-bottom:7px";
        const text=document.createElement("div");text.textContent="Модель загружается один раз и затем хранится в кэше браузера.";text.style.cssText="font-size:14px;color:#786e67;line-height:1.4;margin-bottom:14px";
        const progress=document.createElement("div");progress.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#5d5048;margin-bottom:7px"><span data-voice-download-text>Загрузка модели…</span><span data-voice-download-percent>0%</span></div><progress data-voice-download-progress max="100" value="0" style="display:block;width:100%;height:9px"></progress>';
        const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Отмена";cancel.style.cssText="display:block;width:100%;padding:9px;margin-top:10px;border:0;background:transparent;color:#786e67;cursor:pointer";cancel.onclick=function(){overlay.remove();};
        box.appendChild(title);box.appendChild(text);box.appendChild(progress);box.appendChild(cancel);overlay.appendChild(box);document.body.appendChild(overlay);return overlay;
    }
    function downsample(data,inputRate,outputRate){if(inputRate===outputRate)return data;const ratio=inputRate/outputRate,length=Math.round(data.length/ratio),result=new Float32Array(length);for(let i=0;i<length;i++){const position=i*ratio,index=Math.floor(position),fraction=position-index;const a=data[index]||0,b=data[index+1]||a;result[i]=a+(b-a)*fraction;}return result;}
    function setText(text){input.value=(baseText?baseText+(text?" ":""):"")+text;input.dispatchEvent(new Event("input",{bubbles:true}));}
    function cleanup(){
        if(processor){processor.onaudioprocess=null;try{processor.disconnect();}catch(e){}processor=null;}
        if(silentGain){try{silentGain.disconnect();}catch(e){}silentGain=null;}
        if(source){try{source.disconnect();}catch(e){}source=null;}
        if(mediaStream){mediaStream.getTracks().forEach(function(track){track.stop();});mediaStream=null;}
        if(audioContext){try{audioContext.close();}catch(e){}audioContext=null;}
        samples=[];running=false;starting=false;button.disabled=false;setUi("Голосовой ввод",false);button.setAttribute("aria-pressed","false");
    }
    async function startVoice(){
        if(running||starting)return;
        const token=++startToken;starting=true;input.blur();baseText=input.value.trim();setUi("Подготовка голосового ввода…",true);
        const language=getLanguage();
        let overlay=null;
        try{
            if(!transcriber)overlay=createOverlay();
            const current=await loadTranscriber(overlay);
            if(overlay){overlay.remove();overlay=null;}
            if(token!==startToken||!starting)return cleanup();
            if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error("Микрофон недоступен в этом браузере");
            mediaStream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
            if(token!==startToken||!starting)return cleanup();
            audioContext=new (window.AudioContext||window.webkitAudioContext)();
            if(audioContext.state==="suspended")await audioContext.resume();
            source=audioContext.createMediaStreamSource(mediaStream);
            processor=audioContext.createScriptProcessor(4096,1,1);silentGain=audioContext.createGain();silentGain.gain.value=0;
            processor.onaudioprocess=function(event){if(!starting&&!running)return;const data=event.inputBuffer.getChannelData(0);samples.push(new Float32Array(data));};
            source.connect(processor);processor.connect(silentGain);silentGain.connect(audioContext.destination);
            running=true;starting=false;setUi("Остановить голосовой ввод",false);button.setAttribute("aria-pressed","true");localStorage.setItem("chat-voice-language",language);
        }catch(error){if(overlay)overlay.remove();console.error("Голосовой ввод:",error);cleanup();alert("Не удалось запустить голосовой ввод: "+(error&&error.message?error.message:"неизвестная ошибка"));}
    }
    async function stopVoice(){
        if(!running&&!starting)return;
        ++startToken;running=false;starting=false;
        const rate=audioContext?audioContext.sampleRate:16000;
        const total=samples.reduce(function(sum,part){return sum+part.length;},0);const joined=new Float32Array(total);let offset=0;samples.forEach(function(part){joined.set(part,offset);offset+=part.length;});
        cleanup();
        if(!joined.length)return;
        setUi("Распознавание…",true);button.disabled=true;
        try{const result=await transcriber(downsample(joined,rate,16000),{language:LANGUAGES[getLanguage()].code,task:"transcribe"});const text=(result&&result.text||"").trim();if(text)setText(text);}catch(error){console.error("Распознавание речи:",error);alert("Не удалось распознать речь: "+(error&&error.message?error.message:"неизвестная ошибка"));}finally{button.disabled=false;setUi("Голосовой ввод",false);button.setAttribute("aria-pressed","false");}
    }
    function activateVoice(event){event.preventDefault();event.stopPropagation();input.blur();if(running||starting)void stopVoice();else void startVoice();}
    button.addEventListener("pointerdown",function(event){event.preventDefault();event.stopPropagation();input.blur();});
    button.addEventListener("click",function(event){activateVoice(event);});
})();
