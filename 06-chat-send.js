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
    const VOSK_SCRIPT="https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
    const FFLATE_SCRIPT="https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js";
    const VOICE_MODEL_CACHE="chat-vosk-models-v4";
    const VOSK_LANGUAGES={ru:{name:"Русский",url:"https://raw.githubusercontent.com/kercre123/vosk-models/main/vosk-model-small-ru-0.22.zip"},en:{name:"English",url:"https://raw.githubusercontent.com/kercre123/vosk-models/main/vosk-model-small-en-us-0.15.zip"},cn:{name:"中文",url:"https://raw.githubusercontent.com/kercre123/vosk-models/main/vosk-model-small-cn-0.22.zip"}};
    button.type="button";
    let models={},modelPromises={},recognizer=null,mediaStream=null,audioContext=null,source=null,recognizerNode=null,silentGain=null,running=false,starting=false,finalParts=[],baseText="",startToken=0,scriptPromise=null,toolsPromise=null,downloadPromises={},voiceServiceWorkerPromise=null;
    function getLanguage(){const selected=localStorage.getItem("chat-voice-language");if(selected&&VOSK_LANGUAGES[selected]&&isReady(selected))return selected;const ready=Object.keys(VOSK_LANGUAGES).find(isReady);return ready||"ru";}
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
    function ensureVoiceServiceWorker(){
        if(voiceServiceWorkerPromise)return voiceServiceWorkerPromise;
        if(!(navigator.serviceWorker))return Promise.reject(new Error("Service Worker недоступен в этом браузере"));
        voiceServiceWorkerPromise=navigator.serviceWorker.register("./sw.js",{scope:"./"}).then(async function(){
            await navigator.serviceWorker.ready;
            if(!navigator.serviceWorker.controller){
                await new Promise(function(resolve){
                    var done=false;
                    function finish(){if(done)return;done=true;clearTimeout(timer);resolve();}
                    var timer=setTimeout(finish,3000);
                    navigator.serviceWorker.addEventListener("controllerchange",finish,{once:true});
                });
            }
        }).catch(function(error){voiceServiceWorkerPromise=null;throw error;});
        return voiceServiceWorkerPromise;
    }
    function modelUrl(code){return new URL("./voice-model/"+code+".tar.gz",window.location.href).href;}
    function oldModelUrl(code){return "https://chat.local/voice-model/"+code+".tar.gz";}
    function setDownloadUi(overlay,text,progress){const label=overlay.querySelector("[data-voice-download-text]"),bar=overlay.querySelector("[data-voice-download-progress]"),percent=overlay.querySelector("[data-voice-download-percent]");if(label)label.textContent=text;if(bar)bar.value=progress;if(percent)percent.textContent=Math.round(progress)+"%";}
    function writeTarHeader(view,offset,name,size){const encoder=new TextEncoder(),put=function(text,at,length){const bytes=encoder.encode(text);for(let i=0;i<Math.min(bytes.length,length);i++)view.setUint8(offset+at+i,bytes[i]);};put(name,0,100);put("0000644",100,8);put("0000000",108,8);put("0000000",116,8);put(size.toString(8).padStart(11,"0")+" ",124,12);put("00000000000 ",136,12);view.setUint8(offset+156,0);put("ustar\0",257,6);put("00",263,2);for(let i=148;i<156;i++)view.setUint8(offset+i,32);let checksum=0;for(let i=0;i<512;i++)checksum+=view.getUint8(offset+i);put(checksum.toString(8).padStart(6,"0")+"\0 ",148,8);}
    async function zipToTarGz(zipBytes,overlay,languageName){
        setDownloadUi(overlay,"Распаковка ZIP… 0%",0);
        await new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});
        const files=await new Promise(function(resolve,reject){window.fflate.unzip(zipBytes,function(error,result){if(error)reject(error);else resolve(result);});});
        setDownloadUi(overlay,"Распаковка ZIP… 50%",50);
        await new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});
        const rawEntries=Object.keys(files).filter(function(name){return !name.endsWith("/");}).map(function(name){return {name:name.replace(/\\/g,"/").replace(/^\.\//,""),data:files[name]};});
        const hasModelRoot=rawEntries.some(function(entry){return /^(am|conf|graph|ivector|rescore|rnnlm)\//.test(entry.name);});
        const root=hasModelRoot?"":(function(){const first=rawEntries[0]&&rawEntries[0].name.split("/")[0];return first&&rawEntries.every(function(entry){return entry.name.indexOf(first+"/")===0;})?first+"/":"";})();
        const entries=rawEntries.map(function(entry){return {name:"model/"+(root&&entry.name.indexOf(root)===0?entry.name.slice(root.length):entry.name),data:entry.data};}).filter(function(entry){return entry.name!=="model/";});
        let total=1024;entries.forEach(function(entry){total+=512+Math.ceil(entry.data.length/512)*512;});
        const tar=new Uint8Array(total),view=new DataView(tar.buffer);let offset=0;
        for(let i=0;i<entries.length;i++){
            const name=entries[i].name,data=entries[i].data;writeTarHeader(view,offset,name,data.length);offset+=512;tar.set(data,offset);offset+=Math.ceil(data.length/512)*512;
            setDownloadUi(overlay,"Подготовка модели… "+Math.round(50+30*((i+1)/entries.length))+"%",50+30*((i+1)/entries.length));
            if(i%4===3)await new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});
        }
        setDownloadUi(overlay,"Сборка модели… 80%",80);
        await new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});
        const archive=await new Promise(function(resolve,reject){window.fflate.gzip(tar,{level:6},function(error,result){if(error)reject(error);else resolve(result);});});
        setDownloadUi(overlay,"Сборка модели… 95%",95);
        return archive;
    }
    async function downloadArchive(code,overlay){const language=VOSK_LANGUAGES[code],response=await fetch(language.url,{cache:"no-store"});if(!response.ok||!response.body)throw new Error("Сервер вернул ошибку загрузки ("+response.status+")");const total=Number(response.headers.get("content-length"))||0,reader=response.body.getReader(),chunks=[];let loadedStart=0;while(true){const part=await reader.read();if(part.done)break;chunks.push(part.value);loadedStart+=part.value.length;const progress=total?Math.round(loadedStart/total*100):0;setDownloadUi(overlay,"Скачивание "+language.name+": "+(loadedStart/1048576).toFixed(1)+(total?" из "+(total/1048576).toFixed(1):"")+" МБ",progress);}const zip=new Uint8Array(loadedStart);let offset=0;chunks.forEach(function(chunk){zip.set(chunk,offset);offset+=chunk.length;});return zip;}
    async function cacheArchive(code,archive){const cache=await caches.open(VOICE_MODEL_CACHE);await cache.put(new Request(modelUrl(code)),new Response(archive,{headers:{"Content-Type":"application/gzip","Cache-Control":"no-store","Content-Length":String(archive.byteLength)}}));if(navigator.storage&&navigator.storage.persist){try{await navigator.storage.persist();}catch(e){}}
    }
    async function getCachedArchive(code){if(!window.caches)throw new Error("Кэш моделей недоступен в этом браузере");const cache=await caches.open(VOICE_MODEL_CACHE);let response=await cache.match(modelUrl(code));if(response)return response;response=await cache.match(oldModelUrl(code));if(response){await cache.put(new Request(modelUrl(code)),response.clone());return response;}return null;}
    async function createVoiceModel(code,overlay){
        if(overlay)setDownloadUi(overlay,"Загрузка модели в движок… 98%",98);
        await new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});
        return new Promise(function(resolve,reject){
            let settled=false;
            const model=new Vosk.Model(modelUrl(code));
            const timer=setTimeout(function(){
                if(settled)return;
                settled=true;
                try{model.terminate();}catch(e){}
                reject(new Error("Движок голосового ввода не завершил загрузку модели за 120 секунд"));
            },120000);
            model.on("load",function(message){
                if(settled)return;
                if(message&&message.result){settled=true;clearTimeout(timer);resolve(model);}
            });
            model.on("error",function(message){
                if(settled)return;
                settled=true;clearTimeout(timer);try{model.terminate();}catch(e){}
                reject(new Error(message&&message.error?message.error:"Движок не смог загрузить языковую модель"));
            });
        });
    }
    async function loadModel(code){if(models[code])return models[code];if(!modelPromises[code]){modelPromises[code]=(async function(){await loadScript();await ensureVoiceServiceWorker();const response=await getCachedArchive(code);if(!response)throw new Error("Языковой пакет не найден в памяти браузера. Скачайте его заново.");const model=await createVoiceModel(code,null);if(!model)throw new Error("Модель не создана");return model;})().then(function(value){models[code]=value;return value;}).catch(function(error){delete modelPromises[code];throw error;});}return modelPromises[code];}
    function createDownloadOverlay(){const old=document.getElementById("voiceLanguageChooser");if(old)old.remove();const overlay=document.createElement("div");overlay.id="voiceLanguageChooser";overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:14px";const box=document.createElement("div");box.style.cssText="width:min(430px,100%);background:#fff;border-radius:18px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:Arial,sans-serif;color:#30251e";const title=document.createElement("div");title.textContent="Нужен языковой пакет";title.style.cssText="font-size:18px;font-weight:700;margin-bottom:7px";const text=document.createElement("div");text.textContent="Выберите язык для офлайн-распознавания. Скачивание начнётся прямо здесь.";text.style.cssText="font-size:14px;color:#786e67;line-height:1.4;margin-bottom:14px";box.appendChild(title);box.appendChild(text);Object.keys(VOSK_LANGUAGES).forEach(function(code){const b=document.createElement("button");b.type="button";b.textContent=VOSK_LANGUAGES[code].name;b.style.cssText="display:block;width:100%;padding:12px;margin:7px 0;border:0;border-radius:10px;background:#6eae83;color:#fff;font-weight:700;font-size:15px;cursor:pointer";b.onclick=function(){void downloadFirstLanguage(code,overlay,b);};box.appendChild(b);});const settings=document.createElement("button");settings.type="button";settings.textContent="Открыть настройки";settings.style.cssText="display:block;width:100%;padding:11px;margin-top:9px;border:1px solid #d9cec5;border-radius:10px;background:#fff;color:#5d4637;font-weight:700;cursor:pointer";settings.onclick=function(){overlay.remove();location.href="settings.html#voice-language";};const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Отмена";cancel.style.cssText="display:block;width:100%;padding:9px;margin-top:4px;border:0;background:transparent;color:#786e67;cursor:pointer";cancel.onclick=function(){overlay.remove();};box.appendChild(settings);box.appendChild(cancel);overlay.appendChild(box);document.body.appendChild(overlay);return overlay;}
    async function downloadFirstLanguage(code,overlay,buttonElement){if(downloadPromises[code])return downloadPromises[code];Object.keys(VOSK_LANGUAGES).forEach(function(key){const el=overlay.querySelector('button[data-language="'+key+'"]');if(el)el.disabled=true;});if(buttonElement){buttonElement.disabled=true;buttonElement.textContent="Загрузка…";}const title=overlay.querySelector("div");if(title)title.textContent="Скачивание "+VOSK_LANGUAGES[code].name;const text=overlay.querySelector("div:nth-child(2)");if(text)text.textContent="Не закрывайте страницу до завершения загрузки.";const progress=document.createElement("div");progress.style.cssText="margin-top:14px";progress.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#5d5048;margin-bottom:7px"><span data-voice-download-text>Подготовка…</span><span data-voice-download-percent>0%</span></div><progress data-voice-download-progress max="100" value="0" style="display:block;width:100%;height:9px"></progress>';const box=overlay.querySelector("div");box.appendChild(progress);downloadPromises[code]=(async function(){try{await loadScript();await loadTools();await ensureVoiceServiceWorker();const zip=await downloadArchive(code,overlay);const archive=await zipToTarGz(zip,overlay,VOSK_LANGUAGES[code].name);await cacheArchive(code,archive);const cached=await getCachedArchive(code);if(!cached)throw new Error("Языковой пакет не найден в памяти браузера. Скачайте его заново.");const model=await createVoiceModel(code,overlay);models[code]=model;localStorage.setItem("chat-voice-language-ready-"+code,"true");localStorage.setItem("chat-voice-language",code);setDownloadUi(overlay,"Готово: "+VOSK_LANGUAGES[code].name+" установлен",100);setTimeout(function(){overlay.remove();},900);return true;}catch(error){console.error("Ошибка загрузки голосовой модели:",error);setDownloadUi(overlay,"Ошибка: "+(error&&error.message?error.message:"не удалось установить пакет"),0);if(buttonElement){buttonElement.disabled=false;buttonElement.textContent="Повторить";}return false;}finally{delete downloadPromises[code];}})();return downloadPromises[code];}
    function showLanguageChooser(){createDownloadOverlay();}
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