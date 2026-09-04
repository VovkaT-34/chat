// ===============================
// Загрузка сообщений
// ===============================

let messagesLoadToken = 0;

async function loadMessages() {
    if (!currentChatId || !currentUser) return;

    const chatIdAtLoad = Number(currentChatId);
    const loadToken = ++messagesLoadToken;

    const {data:readInfo,error:readError}=await supabaseClient.from("user_chat_reads").select("last_read_message_id").eq("user_id",currentUser.id).eq("chat_id",chatIdAtLoad).maybeSingle();
    if(readError) console.log(readError);
    const lastReadId=Number(readInfo?.last_read_message_id||0);
    localLastReadMessageId=lastReadId;

    const {data,error}=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`)
        .eq("chat_id",chatIdAtLoad).order("created_at");
    if(error){console.log(error);return;}

    if(Number(currentChatId)!==chatIdAtLoad || loadToken!==messagesLoadToken)return;

    const box=document.getElementById("messages");
    if(!box)return;
    box.innerHTML="";

    let unreadDivider=null;
    let firstUnreadMessage=null;

    (data||[]).forEach(message=>{
        const isUnread=Number(message.id)>lastReadId && message.user_id!==currentUser.id;

        if(isUnread && !unreadDivider){
            unreadDivider=document.createElement("div");
            unreadDivider.className="unread-divider";
            unreadDivider.textContent="Непрочитанные сообщения";
            box.appendChild(unreadDivider);
        }

        const div=renderMessage(message);
        if(!div)return;
        box.appendChild(div);

        if(isUnread && !firstUnreadMessage)firstUnreadMessage=div;
    });

    // Позиционируем границу непрочитанных строго по центру viewport.
    // Поэтому при открытии чата видны сообщения и ДО, и ПОСЛЕ
    // надписи «Непрочитанные сообщения».
    const centerUnreadDivider=()=>{
        if(!unreadDivider)return;
        if(Number(currentChatId)!==chatIdAtLoad || loadToken!==messagesLoadToken)return;

        const boxRect=box.getBoundingClientRect();
        const dividerRect=unreadDivider.getBoundingClientRect();
        const dividerCenter=dividerRect.top + dividerRect.height / 2;
        const boxCenter=boxRect.top + box.clientHeight / 2;
        const delta=dividerCenter - boxCenter;

        if(Math.abs(delta)>0.5){
            box.scrollTop += delta;
        }
    };

    // Если есть непрочитанные — центрируем сам разделитель.
    // Если их нет — показываем самый низ истории.
    const positionChat=()=>{
        if(Number(currentChatId)!==chatIdAtLoad || loadToken!==messagesLoadToken)return;

        if(unreadDivider){
            centerUnreadDivider();
        }else if(typeof scrollMessagesToBottom === "function"){
            scrollMessagesToBottom("auto");
        }else{
            box.scrollTop=box.scrollHeight;
        }

        if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
    };

    positionChat();
    requestAnimationFrame(positionChat);
    setTimeout(positionChat,50);
    setTimeout(positionChat,150);
    setTimeout(positionChat,300);

    // Доставку старых входящих сообщений выполняем после позиционирования.
    // Это не меняет last_read_message_id.
    const incomingIds=(data||[])
        .filter(message=>message.user_id!==currentUser.id)
        .map(message=>Number(message.id))
        .filter(Boolean);

    if(incomingIds.length){
        void Promise.all(incomingIds.map(async messageId=>{
            const {error:deliveryError}=await supabaseClient.rpc("mark_message_delivered",{p_message_id:messageId});
            if(deliveryError) console.log("Ошибка подтверждения доставки:",deliveryError);
        }));
    }

    if(Number(currentChatId)!==chatIdAtLoad || loadToken!==messagesLoadToken)return;

    const ownMessages=(data||[]).filter(m=>m.user_id===currentUser.id);
    const lastOwnMessage=ownMessages[ownMessages.length-1];
    if(lastOwnMessage)await updateMessageStatus(lastOwnMessage.id);

    // При наличии непрочитанных сначала ставим viewport на их границу.
    // Затем scroll-событие вызывает markChatAsRead() и отмечает только
    // сообщения, реально попавшие в viewport.
    if(unreadDivider){
        requestAnimationFrame(()=>{
            if(Number(currentChatId)!==chatIdAtLoad || loadToken!==messagesLoadToken)return;
            centerUnreadDivider();
            if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();
        });
    }else if(typeof scheduleReadReceipt==="function"){
        scheduleReadReceipt();
    }
}

// ===============================
// Добавление нового сообщения
// ===============================
async function appendMessage(message) {
    const box=document.getElementById("messages");
    if(!box)return;
    if(box.querySelector(`[data-message-id="${message.id}"]`))return;

    if(currentUser && message.user_id!==currentUser.id){
        const {error:deliveryError}=await supabaseClient.rpc("mark_message_delivered",{p_message_id:Number(message.id)});
        if(deliveryError) console.log("Ошибка подтверждения доставки:",deliveryError);
    }

    const wasNearBottom=isMessagesBoxNearBottom();
    const previousScrollTop=box.scrollTop;
    const {data:fullMessage,error}=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`).eq("id",message.id).single();
    if(error||!fullMessage)return;
    if(box.querySelector(`[data-message-id="${fullMessage.id}"]`))return;

    const div=renderMessage(fullMessage);
    if(!div)return;
    box.appendChild(div);

    if(wasNearBottom)box.scrollTop=box.scrollHeight;
    else{
        box.scrollTop=previousScrollTop;
        requestAnimationFrame(()=>{box.scrollTop=previousScrollTop;if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();});
    }

    if(fullMessage.user_id===currentUser.id)await updateMessageStatus(fullMessage.id);
    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
    if(fullMessage.user_id!==currentUser.id&&Number(currentChatId)===Number(fullMessage.chat_id)){
        setTimeout(()=>{if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();},80);
    }
}
