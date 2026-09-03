// ===============================
// Загрузка сообщений
// ===============================
async function loadMessages() {
    if (!currentChatId || !currentUser) return;

    const chatIdAtLoad = Number(currentChatId);

    const {data:readInfo,error:readError}=await supabaseClient.from("user_chat_reads").select("last_read_message_id").eq("user_id",currentUser.id).eq("chat_id",chatIdAtLoad).maybeSingle();
    if(readError) console.log(readError);
    const lastReadId=Number(readInfo?.last_read_message_id||0);
    localLastReadMessageId=lastReadId;

    const {data,error}=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,profiles(username),reply_message:reply_to(text,profiles(username))`)
        .eq("chat_id",chatIdAtLoad).order("created_at");
    if(error){console.log(error);return;}

    const box=document.getElementById("messages");
    if(!box)return;
    box.innerHTML="";
    let unreadDividerAdded=false;
    (data||[]).forEach(message=>{
        let divider="";
        if(lastReadId&&message.id>lastReadId&&message.user_id!==currentUser.id&&!unreadDividerAdded){
            unreadDividerAdded=true;
            divider=`<div class="unread-divider">───────── Непрочитанные сообщения ─────────</div>`;
        }
        const div=renderMessage(message);
        if(!div)return;
        if(divider)div.insertAdjacentHTML("afterbegin",divider);
        box.appendChild(div);
    });

    // История тоже является фактом доставки: если Realtime-событие было
    // пропущено, клиент всё равно подтверждает получение сообщения.
    const incomingIds=(data||[])
        .filter(message=>message.user_id!==currentUser.id)
        .map(message=>Number(message.id))
        .filter(Boolean);

    for(const messageId of incomingIds){
        const {error:deliveryError}=await supabaseClient.rpc("mark_message_delivered",{p_message_id:messageId});
        if(deliveryError) console.log("Ошибка подтверждения доставки:",deliveryError);
    }

    // После загрузки чата currentChatId мог измениться только из-за быстрого
    // клика пользователя по другому чату. Не меняем состояние уже нового чата.
    if(Number(currentChatId)!==chatIdAtLoad)return;

    const unreadDivider=box.querySelector(".unread-divider");
    if(unreadDivider) unreadDivider.scrollIntoView({behavior:"instant",block:"start"});
    else box.scrollTop=box.scrollHeight;

    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
    const ownMessages=(data||[]).filter(m=>m.user_id===currentUser.id);
    const lastOwnMessage=ownMessages[ownMessages.length-1];
    if(lastOwnMessage)await updateMessageStatus(lastOwnMessage.id);

    // После отрисовки фиксируем прочитанным именно то, что пользователь
    // реально видит. Дальше 07-chat-read.js продолжает следить за scroll.
    if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();
}

// ===============================
// Добавление нового сообщения
// ===============================
async function appendMessage(message) {
    const box=document.getElementById("messages");
    if(!box)return;
    if(box.querySelector(`[data-message-id="${message.id}"]`))return;

    // Сразу фиксируем доставку на backend. Это не зависит от того,
    // успел ли сработать отдельный Realtime-канал доставки.
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
