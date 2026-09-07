// ===============================
// Отправка сообщения
// ===============================
async function sendMessage(){
    const input=document.getElementById("messageInput");if(!input)return;const text=input.value.trim();if(!text||!currentChatId||!currentUser)return;
    if(!currentUsername||currentUsername==="Пользователь"){const r=await supabaseClient.from("profiles").select("username").eq("id",currentUser.id).single();if(!r.error&&r.data&&r.data.username)currentUsername=r.data.username;}
    let senderName=currentUsername;
    if(!senderName||senderName==="Пользователь"){const r=await supabaseClient.from("profiles").select("username").eq("id",currentUser.id).single();if(!r.error&&r.data&&r.data.username){senderName=r.data.username;currentUsername=r.data.username;}}
    const chatId=currentChatId,replyTo=replyMessageId,temporaryId="sending-"+Date.now(),box=document.getElementById("messages");let temporaryMessage=null;
    if(box){temporaryMessage=document.createElement("div");temporaryMessage.className="message";temporaryMessage.dataset.messageId=temporaryId;temporaryMessage.innerHTML='<div><span class="message-user">'+senderName+'</span><span class="message-time">'+new Date().toLocaleDateString("ru-RU")+' '+new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})+'</span><span class="message-status" style="margin-left:6px;font-size:13px;font-weight:bold;white-space:nowrap;color:#999999" title="Отправляется">⟳</span></div><div class="message-text">'+text+'</div>';box.appendChild(temporaryMessage);box.scrollTop=box.scrollHeight;}
    const result=await supabaseClient.from("messages").insert({chat_id:chatId,user_id:currentUser.id,text:text,reply_to:replyTo}).select(`id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`).single();
    const data=result.data,error=result.error;
    if(error){console.log("Ошибка отправки сообщения:",error);if(temporaryMessage){const status=temporaryMessage.querySelector(".message-status");if(status){status.textContent="!";status.title="Ошибка отправки";status.style.color="#d32f2f";}}return;}
    if(temporaryMessage)temporaryMessage.remove();input.value="";
    const messageForRender={id:data.id,user_id:currentUser.id,text:data.text,created_at:data.created_at,reply_to:data.reply_to,profiles:{username:senderName},reply_message:data.reply_message};
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
    const VOSK_SCRIPT="https://cdn.jsdelivr.net/npm/vosk-browser@0.0.5/dist/vosk.js";
    const FFLATE_SCRIPT="https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js";
    const VOICE_MODEL_CACHE="chat-vosk-models-v1";
    const VOSK_LANGUAGES={ru:{name:"Русский"},en:{name:"English"},cn:{name:"中文"}};
    button.type="button";
    let models={},modelPromises={},recognizer=null,mediaStream=null,audioContext=null,source=null,recognizerNode=null,silentGain=null,running=false,starting=false,finalParts=[],baseText="",startToken=0,scriptPromise=null,toolsPromise=null;
    function getLanguage(){const code=localStorage.getItem("chat-voice-language")||"ru";return VOSK_LANGUAGES[code]?code:"ru";}
    function isReady(code){return localStorage.getItem("chat-voice-language-ready-"+code)==="true";}
    function loadScript(){
        if(window.Vosk)return Promise.resolve();
        if(scriptPromise)return scriptPromise;
        scriptPromise=new Promise(function(resolve,reject){const script=document.createElement("script");script.src=VOSK_SCRIPT;script.onload=resolve;script.onerror=function(){reject(new Error("Не удалось загрузить движок голосового ввода"));};document.head.appendChild(script);}).catch(function(error){scriptPromise=null;throw error;});
        return scriptPromise;
    }
    function loadTools(){
        if(window.fflate)return Promise.resolve();
        if(toolsPromise)return toolsPromise;
        toolsPromise=new Promise(function(resolve,reject){const script=document.createElement("script");script.src=FFLATE_SCRIPT;script.onload=resolve;script.onerror=function(){reject(new Error("Не удалось загрузить архиватор голосовой модели"));};document.head.appendChild(script);}).catch(function(error){toolsPromise=null;throw error;});
        return toolsPromise;
    }
    function modelUrl(code){return "https://chat.local/voice-model/"+code+".tar.gz";}
    function zipToTarGz(zipBytes){
        const files=window.fflate.unzipSync(zipBytes),entries=Object.keys(files).filter(function(name){return !name.endsWith("/");});
        const encoder=new TextEncoder();let total=1024;entries.forEach(function(name){const size=files[name].length;total+=512+Math.ceil(size/512)*512;});
        const tar=new Uint8Array(total),view=new DataView(tar.buffer),put=function(text,offset,length){const bytes=encoder.encode(text);for(let i=0;i<Math.min(bytes.length,length);i++)view.setUint8(offset+i,bytes[i]);};
        let offset=0;
        entries.forEach(function(name){const data=files[name];put(name,offset,100);put("0000644",offset+100,8);put("0000000",offset+108,8);put("0000000",offset+116,8);put(data.length.toString(8).padStart(11,"0")+" ",offset+124,12);put("00000000000 ",offset+136,12);view.setUint8(offset+156,48);put("ustar\\0",offset+257,6);put("00",offset+263,2);for(let i=148;i<156;i++)view.setUint8(offset+i,32);let checksum=0;for(let i=0;i<512;i++)checksum+=view.getUint8(offset+i);put(checksum.toString(8).padStart(6,"0")+" ",offset+148,8);offset+=512;tar.set(data,offset);offset+=Math.ceil(data.length/512)*512;});
        return window.fflate.gzipSync(tar,{level:6});
    }
    async function getCachedArchive(code){
        if(!window.caches)throw new Error("Кэш моделей недоступен в этом браузере");
        const cache=await caches.open(VOICE_MODEL_CACHE),response=await cache.match(modelUrl(code));
        if(!response)return null;return new Uint8Array(await response.arrayBuffer());
    }
    async function loadModel(code){
        if(models[code])return Promise.resolve(models[code]);
        if(!modelPromises[code]){
            modelPromises[code]=(async function(){
                await loadScript();
                const archive=await getCachedArchive(code);
                if(!archive)throw new Error("Языковой пакет не найден в памяти браузера. Скачайте его в настройках.");
                const blobUrl=URL.createObjectURL(new Blob([archive],{type:"application/gzip"}));
                try{return await Vosk.createModel(blobUrl);}finally{URL.revokeObjectURL(blobUrl);}
            })().then(function(value){models[code]=value;return value;}).catch(function(error){delete modelPromises[code];throw error;});
        }
        return modelPromises[code];
    }
    function showLanguageChooser(){
        const old=document.getElementById("voiceLanguageChooser");if(old)old.remove();
        const overlay=document.createElement("div");overlay.id="voiceLanguageChooser";overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:14px";
        const box=document.createElement("div");box.style.cssText="width:min(430px,100%);background:#fff;border-radius:18px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:Arial,sans-serif;color:#30251e";
        const title=document.createElement("div");title.textContent="Нужен языковой пакет";title.style.cssText="font-size:18px;font-weight:700;margin-bottom:7px";
        const text=document.createElement("div");text.textContent="Выберите язык для офлайн-распознавания. Сначала его нужно скачать в настройках.";text.style.cssText="font-size:14px;color:#786e67;line-height:1.4;margin-bottom:14px";
        box.appendChild(title);box.appendChild(text);
        Object.keys(VOSK_LANGUAGES).forEach(function(code){const b=document.createElement("button");b.type="button";b.textContent=VOSK_LANGUAGES[code].name;b.style.cssText="display:block;width:100%;padding:12px;margin:7px 0;border:0;border-radius:10px;background:#6eae83;color:#fff;font-weight:700;font-size:15px;cursor:pointer";b.onclick=function(){localStorage.setItem("chat-voice-language",code);overlay.remove();location.href="settings.html#voice-language";};box.appendChild(b);});
        const settings=document.createElement("button");settings.type="button";settings.textContent="Открыть настройки";settings.style.cssText="display:block;width:100%;padding:11px;margin-top:9px;border:1px solid #d9cec5;border-radius:10px;background:#fff;color:#5d4637;font-weight:700;cursor:pointer";settings.onclick=function(){overlay.remove();location.href="settings.html#voice-language";};
        const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Отмена";cancel.style.cssText="display:block;width:100%;padding:9px;margin-top:4px;border:0;background:transparent;color:#786e67;cursor:pointer";cancel.onclick=function(){overlay.remove();};
        box.appendChild(settings);box.appendChild(cancel);overlay.appendChild(box);document.body.appendChild(overlay);
    }
    function setText(partial){const voiceText=finalParts.join(" ")+(partial?(finalParts.length?" ":"")+partial:"");input.value=(baseText?baseText+(voiceText?" ":""):"")+voiceText;input.dispatchEvent(new Event("input",{bubbles:true}));}
    function cleanup(){
        if(recognizerNode){recognizerNode.onaudioprocess=null;try{recognizerNode.disconnect();}catch(e){}recognizerNode=null;}
        if(silentGain){try{silentGain.disconnect();}catch(e){}silentGain=null;}
        if(source){try{source.disconnect();}catch(e){}source=null;}
        if(mediaStream){mediaStream.getTracks().forEach(function(track){track.stop();});mediaStream=null;}
        if(audioContext){try{audioContext.close();}catch(e){}audioContext=null;}
        if(recognizer){try{recognizer.remove();}catch(e){}recognizer=null;}
        running=false;starting=false;button.disabled=false;button.title="Голосовой ввод";button.setAttribute("aria-pressed","false");button.setAttribute("aria-busy","false");
    }
    async function startVoice(){
        if(running||starting)return;
        const token=++startToken;starting=true;input.blur();button.title="Подготовка голосового ввода…";button.setAttribute("aria-busy","true");baseText=input.value.trim();finalParts=[];
        const language=getLanguage();
        if(!isReady(language)){starting=false;button.setAttribute("aria-busy","false");showLanguageChooser();return;}
        try{
            const currentModel=await loadModel(language);
            if(token!==startToken||!starting)return cleanup();
            if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error("Микрофон недоступен в этом браузере");
            mediaStream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,channelCount:1,sampleRate:16000}});
            if(token!==startToken||!starting)return cleanup();
            audioContext=new (window.AudioContext||window.webkitAudioContext)({sampleRate:16000});
            if(audioContext.state==="suspended")await audioContext.resume();
            if(token!==startToken||!starting)return cleanup();
            recognizer=new currentModel.KaldiRecognizer(audioContext.sampleRate);
            recognizer.on("result",function(message){const text=(message&&message.result&&message.result.text||"").trim();if(text){finalParts.push(text);setText("");}});
            recognizer.on("partialresult",function(message){const partial=(message&&message.result&&message.result.partial||"").trim();setText(partial);});
            source=audioContext.createMediaStreamSource(mediaStream);
            recognizerNode=audioContext.createScriptProcessor(4096,1,1);silentGain=audioContext.createGain();silentGain.gain.value=0;
            recognizerNode.onaudioprocess=function(event){if(!running||!recognizer)return;try{recognizer.acceptWaveform(event.inputBuffer);}catch(error){console.error("Vosk:",error);}};
            source.connect(recognizerNode);recognizerNode.connect(silentGain);silentGain.connect(audioContext.destination);
            running=true;starting=false;localStorage.setItem("chat-voice-language",language);button.title="Остановить голосовой ввод";button.setAttribute("aria-pressed","true");button.setAttribute("aria-busy","false");
        }catch(error){console.error("Голосовой ввод:",error);cleanup();alert("Не удалось запустить голосовой ввод: "+(error&&error.message?error.message:"неизвестная ошибка"));}
    }
    function stopVoice(){
        if(!running&&!starting)return;
        ++startToken;running=false;starting=false;
        if(recognizer){try{recognizer.retrieveFinalResult();}catch(e){}}
        cleanup();
    }
    function activateVoice(event){event.preventDefault();event.stopPropagation();input.blur();if(running||starting)stopVoice();else startVoice();}
    button.addEventListener("pointerdown",function(event){event.preventDefault();event.stopPropagation();input.blur();});
    button.addEventListener("click",function(event){activateVoice(event);});
})();
