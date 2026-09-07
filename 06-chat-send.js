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
    if(typeof sendChatPushForMessage==="function")void sendChatPushForMessage(data.id);
    const refresh=function(){if(typeof updateMessageStatus==="function")void updateMessageStatus(data.id);if(typeof updateChatListMessageStatus==="function")void updateChatListMessageStatus(chatId);};setTimeout(refresh,1000);
    replyMessageId=null;const replyBox=document.getElementById("replyBox");if(replyBox)replyBox.style.display="none";input.placeholder="Введите сообщение...";if(typeof moveChatToTop==="function")moveChatToTop(chatId,data.created_at);
}
const sendButton=document.getElementById("sendButton");if(sendButton)sendButton.addEventListener("click",sendMessage);
const messageInput=document.getElementById("messageInput");if(messageInput){messageInput.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendMessage();}});messageInput.addEventListener("input",function(){sendTypingStatus();});}

(function(){
    const button=document.getElementById("voiceInputButton"),input=document.getElementById("messageInput");
    if(!button||!input)return;
    const VOSK_SCRIPT="https://cdn.jsdelivr.net/npm/vosk-browser@0.0.5/dist/vosk.js";
    const VOSK_LANGUAGES={ru:{name:"Русский",url:"https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-ru-0.22.tar.gz"},en:{name:"English",url:"https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-en-us-0.15.tar.gz"},cn:{name:"中文",url:"https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-cn-0.22.tar.gz"}};
    button.type="button";
    let models={},modelPromises={},recognizer=null,mediaStream=null,audioContext=null,source=null,recognizerNode=null,silentGain=null,running=false,starting=false,cancelRequested=false,finalParts=[],baseText="";
    function getLanguage(){const code=localStorage.getItem("chat-voice-language")||"ru";return VOSK_LANGUAGES[code]?code:"ru";}
    function loadScript(){
        if(window.Vosk)return Promise.resolve();
        return new Promise(function(resolve,reject){const script=document.createElement("script");script.src=VOSK_SCRIPT;script.onload=resolve;script.onerror=function(){reject(new Error("Не удалось загрузить движок голосового ввода"));};document.head.appendChild(script);});
    }
    async function loadModel(code){
        if(models[code])return models[code];
        if(!modelPromises[code]){
            modelPromises[code]=loadScript().then(function(){return Vosk.createModel(VOSK_LANGUAGES[code].url);}).then(function(value){models[code]=value;localStorage.setItem("chat-voice-language-ready-"+code,"true");return value;}).catch(function(error){delete modelPromises[code];throw error;});
        }
        return modelPromises[code];
    }
    function setText(partial){const voiceText=finalParts.join(" ")+(partial?(finalParts.length?" ":"")+partial:"");input.value=(baseText?baseText+(voiceText?" ":""):"")+voiceText;input.dispatchEvent(new Event("input",{bubbles:true}));}
    function cleanup(){
        if(recognizerNode){recognizerNode.onaudioprocess=null;try{recognizerNode.disconnect();}catch(e){}recognizerNode=null;}
        if(silentGain){try{silentGain.disconnect();}catch(e){}silentGain=null;}
        if(source){try{source.disconnect();}catch(e){}source=null;}
        if(mediaStream){mediaStream.getTracks().forEach(function(track){track.stop();});mediaStream=null;}
        if(audioContext){try{audioContext.close();}catch(e){}audioContext=null;}
        if(recognizer){try{recognizer.remove();}catch(e){}recognizer=null;}
        running=false;starting=false;cancelRequested=false;button.disabled=false;button.title="Голосовой ввод";button.setAttribute("aria-pressed","false");button.setAttribute("aria-busy","false");
    }
    async function startVoice(){
        if(running||starting)return;
        starting=true;cancelRequested=false;input.blur();button.title="Загрузка языка…";button.setAttribute("aria-busy","true");baseText=input.value.trim();finalParts=[];
        const language=getLanguage();
        try{
            const currentModel=await loadModel(language);
            if(cancelRequested){cleanup();return;}
            if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error("Микрофон недоступен в этом браузере");
            mediaStream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,channelCount:1,sampleRate:16000}});
            if(cancelRequested){cleanup();return;}
            audioContext=new (window.AudioContext||window.webkitAudioContext)({sampleRate:16000});
            if(audioContext.state==="suspended")await audioContext.resume();
            recognizer=new currentModel.KaldiRecognizer(audioContext.sampleRate);
            recognizer.on("result",function(message){const text=(message&&message.result&&message.result.text||"").trim();if(text){finalParts.push(text);setText("");}});
            recognizer.on("partialresult",function(message){const partial=(message&&message.result&&message.result.partial||"").trim();setText(partial);});
            source=audioContext.createMediaStreamSource(mediaStream);
            recognizerNode=audioContext.createScriptProcessor(4096,1,1);silentGain=audioContext.createGain();silentGain.gain.value=0;
            recognizerNode.onaudioprocess=function(event){if(!running||!recognizer)return;try{recognizer.acceptWaveform(event.inputBuffer);}catch(error){console.error("Vosk:",error);}};
            source.connect(recognizerNode);recognizerNode.connect(silentGain);silentGain.connect(audioContext.destination);
            running=true;starting=false;localStorage.setItem("chat-voice-language",language);button.title="Остановить голосовой ввод";button.setAttribute("aria-pressed","true");button.setAttribute("aria-busy","false");
        }catch(error){console.error("Голосовой ввод:",error);cleanup();if(!cancelRequested)alert("Не удалось запустить голосовой ввод: "+(error&&error.message?error.message:"неизвестная ошибка"));}
    }
    function stopVoice(){
        if(!running&&!starting)return;
        cancelRequested=true;running=false;
        if(recognizer){try{recognizer.retrieveFinalResult();}catch(e){}}
        cleanup();
    }
    function activateVoice(event){event.preventDefault();event.stopPropagation();input.blur();if(running||starting)stopVoice();else startVoice();}
    let ignoreNextClick=false;
    button.addEventListener("pointerdown",function(event){event.preventDefault();event.stopPropagation();ignoreNextClick=true;setTimeout(function(){ignoreNextClick=false;},500);});
    button.addEventListener("click",function(event){if(ignoreNextClick){event.preventDefault();event.stopPropagation();ignoreNextClick=false;return;}activateVoice(event);});
})();
