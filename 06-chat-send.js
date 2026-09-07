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
    const button=document.getElementById("voiceInputButton");
    const input=document.getElementById("messageInput");
    if(!button||!input)return;

    const VOSK_SCRIPT="https://cdn.jsdelivr.net/npm/vosk-browser@0.0.5/dist/vosk.js";
    const VOSK_MODEL="https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-ru-0.22.tar.gz";

    let model=null;
    let modelPromise=null;
    let recognizer=null;
    let mediaStream=null;
    let audioContext=null;
    let source=null;
    let recognizerNode=null;
    let silentGain=null;
    let running=false;
    let finalParts=[];
    let baseText="";

    function loadScript(){
        if(window.Vosk)return Promise.resolve();
        return new Promise(function(resolve,reject){
            const script=document.createElement("script");
            script.src=VOSK_SCRIPT;
            script.onload=resolve;
            script.onerror=function(){reject(new Error("Не удалось загрузить Vosk"));};
            document.head.appendChild(script);
        });
    }

    async function loadModel(){
        if(model)return model;
        if(!modelPromise){
            modelPromise=loadScript().then(function(){
                return Vosk.createModel(VOSK_MODEL);
            }).then(function(value){
                model=value;
                return value;
            }).catch(function(error){
                modelPromise=null;
                throw error;
            });
        }
        return modelPromise;
    }

    function setText(partial){
        const voiceText=finalParts.join(" ")+(partial?(finalParts.length?" ":"")+partial:"");
        input.value=(baseText?baseText+(voiceText?" ":""):"")+voiceText;
        input.dispatchEvent(new Event("input",{bubbles:true}));
    }

    function cleanup(){
        if(recognizerNode){
            recognizerNode.onaudioprocess=null;
            try{recognizerNode.disconnect();}catch(e){}
            recognizerNode=null;
        }
        if(silentGain){
            try{silentGain.disconnect();}catch(e){}
            silentGain=null;
        }
        if(source){
            try{source.disconnect();}catch(e){}
            source=null;
        }
        if(mediaStream){
            mediaStream.getTracks().forEach(function(track){track.stop();});
            mediaStream=null;
        }
        if(audioContext){
            try{audioContext.close();}catch(e){}
            audioContext=null;
        }
        if(recognizer){
            try{recognizer.remove();}catch(e){}
            recognizer=null;
        }
        running=false;
        button.disabled=false;
        button.title="Голосовой ввод завершён";
        button.setAttribute("aria-pressed","false");
    }

    async function startVoice(){
        if(running)return;
        try{
            button.disabled=true;
            baseText=input.value.trim();
            finalParts=[];

            const currentModel=await loadModel();
            mediaStream=await navigator.mediaDevices.getUserMedia({
                video:false,
                audio:{
                    echoCancellation:true,
                    noiseSuppression:true,
                    channelCount:1
                }
            });

            audioContext=new (window.AudioContext||window.webkitAudioContext)();
            if(audioContext.state==="suspended")await audioContext.resume();

            recognizer=new currentModel.KaldiRecognizer(audioContext.sampleRate);
            recognizer.on("result",function(message){
                const text=(message&&message.result&&message.result.text||"").trim();
                if(text){
                    finalParts.push(text);
                    setText("");
                }
            });
            recognizer.on("partialresult",function(message){
                const partial=(message&&message.result&&message.result.partial||"").trim();
                setText(partial);
            });

            source=audioContext.createMediaStreamSource(mediaStream);
            recognizerNode=audioContext.createScriptProcessor(4096,1,1);
            silentGain=audioContext.createGain();
            silentGain.gain.value=0;
            recognizerNode.onaudioprocess=function(event){
                if(!running||!recognizer)return;
                try{recognizer.acceptWaveform(event.inputBuffer);}catch(error){console.error("Vosk:",error);}
            };
            source.connect(recognizerNode);
            recognizerNode.connect(silentGain);
            silentGain.connect(audioContext.destination);

            running=true;
            button.disabled=false;
            button.title="Остановить голосовой ввод";
            button.setAttribute("aria-pressed","true");
        }catch(error){
            console.error("Голосовой ввод:",error);
            cleanup();
            alert("Не удалось запустить голосовой ввод.");
        }
    }

    function stopVoice(){
        if(!running)return;
        running=false;
        button.disabled=true;
        if(recognizer){
            try{recognizer.retrieveFinalResult();}catch(e){}
        }
        setTimeout(function(){cleanup();},250);
    }

    button.addEventListener("click",function(event){
        event.preventDefault();
        event.stopPropagation();
        button.blur();
        if(running)stopVoice();
        else startVoice();
    });
})();
