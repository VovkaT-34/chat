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

    let unreadDivider=null;

    (data||[]).forEach(message=>{
        if(!unreadDivider && Number(message.id)>lastReadId && message.user_id!==currentUser.id){
            unreadDivider=document.createElement("div");
            unreadDivider.className="unread-divider";
            unreadDivider.textContent="Непрочитанные сообщения";
            box.appendChild(unreadDivider);
        }

        const div=renderMessage(message);
        if(!div)return;
        box.appendChild(div);
    });

    const incomingIds=(data||[])
        .filter(message=>message.user_id!==currentUser.id)
        .map(message=>Number(message.id))
        .filter(Boolean);

    for(const messageId of incomingIds){
        const {error:deliveryError}=await supabaseClient.rpc("mark_message_delivered",{p_message_id:messageId});
        if(deliveryError) console.log("Ошибка подтверждения доставки:",deliveryError);
    }

    if(Number(currentChatId)!==chatIdAtLoad)return;

    // Возвращаем viewport к границе прочитанных/непрочитанных.
    // Разделитель находится отдельно перед первым непрочитанным сообщением,
    // поэтому история выше него не исчезает и позиция не прыгает в начало.
    if(unreadDivider){
        const positionUnreadBoundary=()=>{
            if(Number(currentChatId)!==chatIdAtLoad)return;
            const targetTop=Math.max(0,unreadDivider.offsetTop-12);
            box.scrollTop=targetTop;
            if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
        };
        requestAnimationFrame(positionUnreadBoundary);
        setTimeout(positionUnreadBoundary,50);
        setTimeout(positionUnreadBoundary,150);
    }else{
        box.scrollTop=box.scrollHeight;
    }

    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
    const ownMessages=(data||[]).filter(m=>m.user_id===currentUser.id);
    const lastOwnMessage=ownMessages[ownMessages.length-1];
    if(lastOwnMessage)await updateMessageStatus(lastOwnMessage.id);

    if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();
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
