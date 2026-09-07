// ===============================
// Отрисовка сообщения
// ===============================
const chatReadBoundaryCache = new Map();

function renderMessage(message){
    if(!message||!currentUser)return null;
    var div=document.createElement("div");div.className="message";div.dataset.messageId=message.id;div.dataset.userId=message.user_id;
    var username=message.profiles&&message.profiles.username?message.profiles.username:"Пользователь",date=new Date(message.created_at),dateText=date.toLocaleDateString("ru-RU"),timeText=date.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    var messageStatus=message.user_id===currentUser.id?'<span class="message-status" data-status-message-id="'+message.id+'" data-message-status="sent" style="margin-left:6px;font-size:13px;font-weight:bold;white-space:nowrap;color:#999999" title="Отправлено">✓</span>':"";
    var reply=message.reply_message?'<div style="background:#eeeeee;padding:8px;border-left:4px solid #8E44AD;border-radius:6px;margin-bottom:8px;font-size:14px;overflow-wrap:anywhere;word-break:break-word">↩ '+(message.reply_message.profiles&&message.reply_message.profiles.username?message.reply_message.profiles.username:"Пользователь")+'<br>'+(message.reply_message.text||"")+'</div>':"";
    div.innerHTML='<div><span class="message-user">'+username+'</span><span class="message-time">'+dateText+' '+timeText+'</span>'+messageStatus+'</div>'+reply+'<div class="message-text">'+(message.text||"")+'</div><button onclick=\'replyToMessage('+message.id+', '+JSON.stringify(username)+', '+JSON.stringify(message.text||"")+')\' style="margin-top:6px;padding:3px 8px;border:none;border-radius:7px;background:#9B7AC2;color:white;cursor:pointer;font-size:12px">↩ Ответить</button>';
    return div;
}
function getMessageStatusOrder(status){return {sent:1,delivered:2,read:3}[status]||0;}
function setMessageStatus(el,status){if(!el)return;status=String(status||"").toLowerCase();if(!status||status==="none")return;var current=String(el.dataset.messageStatus||"sent").toLowerCase(),currentOrder=getMessageStatusOrder(current),newOrder=getMessageStatusOrder(status);if(!newOrder||newOrder<currentOrder)return;el.dataset.messageStatus=status;if(status==="read"){el.textContent="✓✓";el.title="Прочитано";el.style.setProperty("color","#00C853","important");}else if(status==="delivered"){el.textContent="✓";el.title="Доставлено";el.style.setProperty("color","#00C853","important");}else{el.textContent="✓";el.title="Отправлено";el.style.setProperty("color","#999999","important");}}

async function refreshChatMessageStatuses(chatId,messageIds){
    if(!currentUser||!supabaseClient)return;
    var id=Number(chatId);if(!id)return;
    var ids=(messageIds||[]).map(Number).filter(Boolean);
    if(!ids.length)return;
    try{
        var readsResult=await supabaseClient.from("user_chat_reads").select("last_read_message_id").eq("chat_id",id).neq("user_id",currentUser.id);
        var readBoundary=0;
        if(!readsResult.error){(readsResult.data||[]).forEach(function(row){readBoundary=Math.max(readBoundary,Number(row.last_read_message_id)||0);});chatReadBoundaryCache.set(id,readBoundary);}
        var deliveryResult=await supabaseClient.from("message_deliveries").select("message_id").in("message_id",ids).neq("user_id",currentUser.id);
        var delivered=new Set();
        if(!deliveryResult.error)(deliveryResult.data||[]).forEach(function(row){delivered.add(Number(row.message_id));});
        ids.forEach(function(messageId){
            if(messageId<=readBoundary)cacheAndApplyMessageStatus(messageId,"read");
            else if(delivered.has(messageId))cacheAndApplyMessageStatus(messageId,"delivered");
        });
    }catch(error){console.warn("Ошибка массового обновления статусов:",error);}
}

async function updateMessageStatus(messageId,status){var id=Number(messageId);if(!id||!currentUser||!supabaseClient)return;var el=document.querySelector('[data-status-message-id="'+id+'"]');if(!el)return;if(status===undefined||status===null){var result=await supabaseClient.rpc("get_message_status",{p_message_id:id});if(result.error)return;status=result.data;}setMessageStatus(el,status);}
async function updateChatListMessageStatus(chatId){if(!currentUser||!supabaseClient)return;var id=Number(chatId);if(!id)return;var el=document.querySelector('[data-chat-status-id="'+id+'"]');if(!el)return;var result=await supabaseClient.from("messages").select("id,user_id").eq("chat_id",id).eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(1);if(result.error||!result.data||!result.data.length){el.textContent="";el.title="";delete el.dataset.messageStatus;return;}var last=result.data[0];var statusResult=await supabaseClient.rpc("get_message_status",{p_message_id:last.id});if(statusResult.error)return;el.dataset.messageStatus="sent";setMessageStatus(el,statusResult.data);}
