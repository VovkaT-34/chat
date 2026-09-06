// ===============================
// Загрузка сообщений
// ===============================
let messagesLoadToken = 0;
let olderMessagesLoading = false;
let olderMessagesDone = false;
let olderMessagesChatId = 0;

async function loadMessages(){
    if(!currentChatId||!currentUser)return;
    const chatIdAtLoad=Number(currentChatId),loadToken=++messagesLoadToken;
    olderMessagesLoading=false;
    olderMessagesDone=false;
    olderMessagesChatId=chatIdAtLoad;
    const readResult=await supabaseClient.from("user_chat_reads").select("last_read_message_id").eq("user_id",currentUser.id).eq("chat_id",chatIdAtLoad).maybeSingle();
    if(readResult.error)console.log(readResult.error);
    const readInfo=readResult.data;
    const lastReadId=readInfo&&readInfo.last_read_message_id?Number(readInfo.last_read_message_id):0;
    localLastReadMessageId=lastReadId;
    const result=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`).eq("chat_id",chatIdAtLoad).order("id",{ascending:false}).limit(30);
    let data=result.data||[],error=result.error;
    if(error){console.log(error);return;}
    if(data.length<30)olderMessagesDone=true;
    if(lastReadId>0&&data.length){const oldestRecentId=Number(data[data.length-1].id);if(oldestRecentId>lastReadId){const unreadResult=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`).eq("chat_id",chatIdAtLoad).gt("id",lastReadId).order("id",{ascending:true});if(unreadResult.error)console.log(unreadResult.error);else data=data.concat(unreadResult.data||[]);}}
    const unique={};data.forEach(function(message){unique[Number(message.id)]=message;});
    const loadedData=Object.keys(unique).map(function(id){return unique[id];}).sort(function(a,b){return Number(a.id)-Number(b.id);});
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    const box=document.getElementById("messages");if(!box)return;box.innerHTML="";
    let unreadDivider=null,firstUnreadMessage=null;
    loadedData.forEach(function(message){var isUnread=Number(message.id)>lastReadId&&message.user_id!==currentUser.id;if(isUnread&&!unreadDivider){unreadDivider=document.createElement("div");unreadDivider.className="unread-divider";unreadDivider.textContent="Непрочитанные сообщения";box.appendChild(unreadDivider);}var div=renderMessage(message);if(!div)return;box.appendChild(div);if(isUnread&&!firstUnreadMessage)firstUnreadMessage=div;});
    const centerUnreadDivider=function(){if(!unreadDivider)return;if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;var br=box.getBoundingClientRect(),dr=unreadDivider.getBoundingClientRect(),delta=(dr.top+dr.height/2)-(br.top+box.clientHeight/2);if(Math.abs(delta)>0.5)box.scrollTop+=delta;};
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    if(unreadDivider){centerUnreadDivider();}else if(typeof scrollMessagesToBottom==="function"){scrollMessagesToBottom();}else{box.scrollTop=box.scrollHeight;}
    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
    const incomingIds=loadedData.filter(function(m){return m.user_id!==currentUser.id;}).map(function(m){return Number(m.id);}).filter(Boolean);
    if(incomingIds.length){void Promise.all(incomingIds.map(async function(id){try{const r=await supabaseClient.rpc("mark_message_delivered",{p_message_id:id});if(r.error)console.log("Ошибка подтверждения доставки:",r.error);}catch(error){console.warn("Ошибка доставки:",error);}}));}
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    const own=loadedData.filter(function(m){return m.user_id===currentUser.id;}),lastOwn=own[own.length-1];if(lastOwn)await updateMessageStatus(lastOwn.id);
    if(unreadDivider){if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;centerUnreadDivider();if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();}else if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();
}

async function loadOlderMessages(){
    const box=document.getElementById("messages");if(!box||!currentChatId||olderMessagesLoading||olderMessagesDone)return;
    const chatIdAtLoad=Number(currentChatId);if(olderMessagesChatId!==chatIdAtLoad)return;
    const firstMessage=box.querySelector("[data-message-id]");if(!firstMessage)return;
    const oldestId=Number(firstMessage.getAttribute("data-message-id"));if(!oldestId)return;
    olderMessagesLoading=true;
    const beforeHeight=box.scrollHeight;
    const result=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`).eq("chat_id",chatIdAtLoad).lt("id",oldestId).order("id",{ascending:false}).limit(30);
    olderMessagesLoading=false;
    if(result.error){console.log(result.error);return;}
    const older=(result.data||[]).reverse();
    if(older.length<30)olderMessagesDone=true;
    if(Number(currentChatId)!==chatIdAtLoad||olderMessagesChatId!==chatIdAtLoad)return;
    const fragment=document.createDocumentFragment();
    older.forEach(function(message){if(box.querySelector('[data-message-id="'+message.id+'"]'))return;const div=renderMessage(message);if(div)fragment.appendChild(div);});
    box.insertBefore(fragment,box.firstChild);
    box.scrollTop+=box.scrollHeight-beforeHeight;
    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
}

if(!window.__olderMessagesScrollHandler){
    window.__olderMessagesScrollHandler=true;
    document.addEventListener("scroll",function(event){const box=event.target;if(!box||box.id!=="messages")return;if(box.scrollTop<=80)void loadOlderMessages();},true);
}

async function appendMessage(message){
    const box=document.getElementById("messages");if(!box||!message)return;if(box.querySelector('[data-message-id="'+message.id+'"]'))return;
    try{if(currentUser&&message.user_id!==currentUser.id){const delivery=await supabaseClient.rpc("mark_message_delivered",{p_message_id:Number(message.id)});if(delivery.error)console.log("Ошибка подтверждения доставки:",delivery.error);}}catch(error){console.warn("Ошибка подтверждения доставки:",error);}
    const wasNearBottom=isMessagesBoxNearBottom(),previousScrollTop=box.scrollTop;
    const result=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`).eq("id",message.id).single();
    const fullMessage=result.data,error=result.error;if(error||!fullMessage)return;if(box.querySelector('[data-message-id="'+fullMessage.id+'"]'))return;
    const div=renderMessage(fullMessage);if(!div)return;box.appendChild(div);
    if(wasNearBottom)box.scrollTop=box.scrollHeight;else{box.scrollTop=previousScrollTop;requestAnimationFrame(function(){box.scrollTop=previousScrollTop;if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();});}
    if(fullMessage.user_id===currentUser.id)await updateMessageStatus(fullMessage.id);if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();if(fullMessage.user_id!==currentUser.id&&Number(currentChatId)===Number(fullMessage.chat_id))setTimeout(function(){if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();},80);
}
