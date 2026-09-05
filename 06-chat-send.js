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
    const refresh=function(){if(typeof updateMessageStatus==="function")void updateMessageStatus(data.id);if(typeof updateChatListMessageStatus==="function")void updateChatListMessageStatus(chatId);};setTimeout(refresh,250);setTimeout(refresh,1000);setTimeout(refresh,2500);
    replyMessageId=null;const replyBox=document.getElementById("replyBox");if(replyBox)replyBox.style.display="none";input.placeholder="Введите сообщение...";if(typeof moveChatToTop==="function")moveChatToTop(chatId,data.created_at);
}
const sendButton=document.getElementById("sendButton");if(sendButton)sendButton.addEventListener("click",sendMessage);
const messageInput=document.getElementById("messageInput");if(messageInput){messageInput.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendMessage();}});messageInput.addEventListener("input",function(){sendTypingStatus();});}
