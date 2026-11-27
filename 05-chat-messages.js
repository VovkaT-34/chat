// ===============================
// Загрузка сообщений
// ===============================
// ===============================
// Имена отправителей сообщений
// ===============================
const chatMessageSenderNameCache = new Map();
const chatMessageSenderNameRequests = new Map();

async function loadChatMessageSenderNames(chatId) {
    const key = String(Number(chatId) || 0);
    if (!key || key === "0") return new Map();
    if (chatMessageSenderNameCache.has(key)) return chatMessageSenderNameCache.get(key);
    if (chatMessageSenderNameRequests.has(key)) return chatMessageSenderNameRequests.get(key);

    const request = supabaseClient.rpc("get_chat_message_senders", { p_chat_id: Number(key) })
        .then(function (result) {
            if (result.error) throw result.error;
            const names = new Map();
            (result.data || []).forEach(function (sender) {
                if (sender && sender.user_id && sender.username) {
                    names.set(String(sender.user_id), String(sender.username));
                }
            });
            chatMessageSenderNameCache.set(key, names);
            return names;
        })
        .catch(function (error) {
            console.warn("Не удалось загрузить имена отправителей:", error);
            return new Map();
        })
        .finally(function () {
            chatMessageSenderNameRequests.delete(key);
        });

    chatMessageSenderNameRequests.set(key, request);
    return request;
}

async function hydrateMessageSenderNames(messages, chatId) {
    if (!Array.isArray(messages) || !messages.length) return messages;
    const names = await loadChatMessageSenderNames(chatId);
    messages.forEach(function (message) {
        if (!message) return;
        const name = names.get(String(message.user_id)) ||
            (currentUser && String(message.user_id) === String(currentUser.id) && currentUsername && currentUsername !== "Пользователь" ? currentUsername : "");
        if (name) {
            message.profiles = Object.assign({}, message.profiles || {}, { username: name });
        }
    });
    return messages;
}

function getMessageSenderName(message) {
    if (!message) return "Пользователь";
    if (message.profiles && message.profiles.username) return String(message.profiles.username);
    const names = chatMessageSenderNameCache.get(String(Number(currentChatId) || 0));
    const cachedName = names && names.get(String(message.user_id));
    if (cachedName) return cachedName;
    if (currentUser && String(message.user_id) === String(currentUser.id) && currentUsername && currentUsername !== "Пользователь") return String(currentUsername);
    return "Пользователь";
}


function formatDisappearingEventDuration(seconds) {
    return ({
        30: "30 секунд", 300: "5 минут", 3600: "1 час",
        10800: "3 часа", 86400: "1 день", 259200: "3 дня", 604800: "7 дней"
    })[Number(seconds)] || "";
}
function getChatDisappearingEventTextColor() {
    var box = document.getElementById("messages");
    if (!box) return "#222";
    var background = window.getComputedStyle(box).backgroundColor || "";
    var channels = background.match(/\d+(?:\.\d+)?/g);
    if (!channels || channels.length < 3) return "#222";
    var brightness = Number(channels[0]) * 0.299 + Number(channels[1]) * 0.587 + Number(channels[2]) * 0.114;
    return brightness < 145 ? "#f5f5f5" : "#222";
}
function renderChatDisappearingEvent(event) {
    if (!event || !currentUser) return null;
    var duration = formatDisappearingEventDuration(event.duration_seconds);
    var ownEvent = String(event.actor_id || "") === String(currentUser.id);
    var enabled = event.enabled !== false;
    var action = enabled ? "установил" : "отключил";
    var text;
    if (ownEvent) {
        text = enabled
            ? "Вы установили исчезающие сообщения" + (event.mode === "all" ? " для всех" : "") + (duration ? " на " + duration : "")
            : "Вы отключили исчезающие сообщения" + (event.mode === "all" ? " для всех" : "");
    } else {
        var actor = String(event.actor_name || "Пользователь");
        if (event.actor_role_label && actor.toLowerCase().indexOf(String(event.actor_role_label).toLowerCase()) === -1) actor += " — " + String(event.actor_role_label);
        text = actor + " " + action + " исчезающие сообщения" + (duration ? " на " + duration : "");
    }
    var node = document.createElement("div");
    node.className = "chat-disappearing-event";
    node.dataset.disappearingEventId = String(event.id);
    node.dataset.createdAt = String(event.created_at || "");
    node.textContent = text;
    node.style.cssText = "display:block;max-width:90%;margin:9px auto;padding:3px 10px;color:" + getChatDisappearingEventTextColor() + ";font-size:13px;font-weight:600;line-height:1.4;text-align:center;opacity:.96;overflow-wrap:anywhere;pointer-events:none";
    return node;
}
function sortChatTimeline(box) {
    if (!box) return;
    var nodes = Array.prototype.slice.call(box.children).filter(function (node) {
        return node.classList.contains("message") || node.classList.contains("chat-disappearing-event") || node.classList.contains("unread-divider");
    });
    if (nodes.length < 2) return;
    nodes.sort(function (a, b) {
        var aTime = Date.parse(a.dataset.createdAt || "") || 0;
        var bTime = Date.parse(b.dataset.createdAt || "") || 0;
        if (aTime !== bTime) return aTime - bTime;
        var aPriority = a.classList.contains("chat-disappearing-event") ? 0 : (a.classList.contains("unread-divider") ? 1 : 2);
        var bPriority = b.classList.contains("chat-disappearing-event") ? 0 : (b.classList.contains("unread-divider") ? 1 : 2);
        return aPriority - bPriority;
    });
    var fragment = document.createDocumentFragment();
    nodes.forEach(function (node) { fragment.appendChild(node); });
    box.appendChild(fragment);
}
window.renderChatDisappearingEvent = renderChatDisappearingEvent;
window.sortChatTimeline = sortChatTimeline;

let messagesLoadToken = 0;
let olderMessagesLoading = false;
let olderMessagesDone = false;
let olderMessagesChatId = 0;

async function loadMessages(){
    if(!currentChatId||!currentUser)return;
    const chatIdAtLoad=Number(currentChatId),loadToken=++messagesLoadToken;
    const box=document.getElementById("messages");if(!box)return;
    box.replaceChildren();
    const loading=document.createElement("div");
    loading.className="messages-loading";
    loading.textContent="Загрузка сообщений…";
    loading.style.cssText="padding:18px;text-align:center;color:var(--chat-message-text,#777)";
    box.appendChild(loading);
    if(typeof window.applyChatAppearance==="function")window.applyChatAppearance();
    olderMessagesLoading=false;
    olderMessagesDone=false;
    olderMessagesChatId=chatIdAtLoad;
    const eventsQuery = window.chatDisappearing && window.chatDisappearing.isSupportedChat(chatIdAtLoad)
        ? supabaseClient.rpc("get_chat_disappearing_events", { p_chat_id: chatIdAtLoad })
        : Promise.resolve({ data: [], error: null });
    const [readResult,result,eventsResult]=await Promise.all([
        supabaseClient.from("user_chat_reads").select("last_read_message_id").eq("user_id",currentUser.id).eq("chat_id",chatIdAtLoad).maybeSingle(),
        supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,expires_at,message_user_expirations(expires_at)`).eq("chat_id",chatIdAtLoad).order("id",{ascending:false}).limit(10),
        eventsQuery
    ]);
    if(readResult.error)console.log(readResult.error);
    if(eventsResult.error)console.warn("Не удалось загрузить системные события исчезающих сообщений:",eventsResult.error);
    const readInfo=readResult.data;
    const lastReadId=readInfo&&readInfo.last_read_message_id?Number(readInfo.last_read_message_id):0;
    localLastReadMessageId=lastReadId;
    let data=result.data||[],error=result.error;
    if(error){console.error("Ошибка загрузки сообщений:",error);box.replaceChildren();const failed=document.createElement("div");failed.className="messages-loading";failed.textContent="Не удалось загрузить сообщения. Попробуйте открыть чат ещё раз.";failed.style.cssText="padding:18px;text-align:center;color:var(--chat-message-text,#777)";box.appendChild(failed);return;}
    if(data.length<10)olderMessagesDone=true;
    if(lastReadId>0&&data.length){const oldestRecentId=Number(data[data.length-1].id);if(oldestRecentId>lastReadId){const unreadResult=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,expires_at,message_user_expirations(expires_at)`).eq("chat_id",chatIdAtLoad).gt("id",lastReadId).order("id",{ascending:true});if(unreadResult.error)console.log(unreadResult.error);else data=data.concat(unreadResult.data||[]);}}
    const unique={};data.forEach(function(message){unique[Number(message.id)]=message;});
    const loadedData=Object.keys(unique).map(function(id){return unique[id];}).sort(function(a,b){return Number(a.id)-Number(b.id);});
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    await hydrateMessageSenderNames(loadedData,chatIdAtLoad);
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    let unreadDivider=null,lastUnreadMessage=null;
    const timeline=[];
    loadedData.forEach(function(message){timeline.push({type:"message",value:message,time:Date.parse(message.created_at)||0});});
    (eventsResult.data||[]).forEach(function(event){timeline.push({type:"event",value:event,time:Date.parse(event.created_at)||0});});
    timeline.sort(function(a,b){if(a.time!==b.time)return a.time-b.time;if(a.type===b.type)return 0;return a.type==="event"?-1:1;});
    const fragment=document.createDocumentFragment();
    timeline.forEach(function(entry){
        if(entry.type==="event"){
            var eventNode=renderChatDisappearingEvent(entry.value);
            if(eventNode)fragment.appendChild(eventNode);
            return;
        }
        var message=entry.value,div=renderMessage(message);
        if(!div)return;
        var isUnread=Number(message.id)>lastReadId&&message.user_id!==currentUser.id;
        if(isUnread&&!unreadDivider){
            unreadDivider=document.createElement("div");
            unreadDivider.className="unread-divider";
            unreadDivider.dataset.createdAt=String(message.created_at||"");
            unreadDivider.textContent="Непрочитанные сообщения";
            fragment.appendChild(unreadDivider);
        }
        fragment.appendChild(div);
        if(isUnread)lastUnreadMessage=div;
    });
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    box.querySelectorAll("[data-message-id]").forEach(function(existing){
        var id=existing.getAttribute("data-message-id");
        if(id&&!fragment.querySelector('[data-message-id="'+id+'"]'))fragment.appendChild(existing);
    });
    box.querySelectorAll(".chat-disappearing-event").forEach(function(existing){
        var id=existing.getAttribute("data-disappearing-event-id");
        if(id&&!fragment.querySelector('[data-disappearing-event-id="'+id+'"]'))fragment.appendChild(existing);
    });
    box.replaceChildren(fragment);
    sortChatTimeline(box);
    const centerLastUnreadMessage=function(){var target=lastUnreadMessage||unreadDivider;if(!target)return;if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;var br=box.getBoundingClientRect(),tr=target.getBoundingClientRect(),delta=(tr.top+tr.height/2)-(br.top+box.clientHeight/2);if(Math.abs(delta)>0.5)box.scrollTop+=delta;};
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    if(unreadDivider){centerLastUnreadMessage();}else if(typeof scrollMessagesToBottom==="function"){scrollMessagesToBottom();}else{box.scrollTop=box.scrollHeight;}
    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
    const incomingIds=loadedData.filter(function(m){return m.user_id!==currentUser.id;}).map(function(m){return Number(m.id);}).filter(Boolean);
    if(incomingIds.length){void Promise.all(incomingIds.map(async function(id){try{const r=await supabaseClient.rpc("mark_message_delivered",{p_message_id:id});if(r.error)console.log("Ошибка подтверждения доставки:",r.error);}catch(error){console.warn("Ошибка доставки:",error);}}));}
    if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;
    const own=loadedData.filter(function(m){return m.user_id===currentUser.id;});if(own.length&&typeof refreshChatMessageStatuses==="function"){await refreshChatMessageStatuses(chatIdAtLoad,own.map(function(message){return Number(message.id);}));}if(typeof updateChatListMessageStatus==="function")await updateChatListMessageStatus(chatIdAtLoad);
    if(unreadDivider){if(Number(currentChatId)!==chatIdAtLoad||loadToken!==messagesLoadToken)return;centerLastUnreadMessage();if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();}else if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();
}

async function loadOlderMessages(){
    const box=document.getElementById("messages");if(!box||!currentChatId||olderMessagesLoading||olderMessagesDone)return;
    const chatIdAtLoad=Number(currentChatId);if(olderMessagesChatId!==chatIdAtLoad)return;
    const firstMessage=box.querySelector("[data-message-id]");if(!firstMessage)return;
    const oldestId=Number(firstMessage.getAttribute("data-message-id"));if(!oldestId)return;
    olderMessagesLoading=true;
    const beforeHeight=box.scrollHeight;
    const result=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,expires_at,message_user_expirations(expires_at)`).eq("chat_id",chatIdAtLoad).lt("id",oldestId).order("id",{ascending:false}).limit(5);
    olderMessagesLoading=false;
    if(result.error){console.log(result.error);return;}
    const older=(result.data||[]).reverse();
    if(older.length<5)olderMessagesDone=true;
    if(Number(currentChatId)!==chatIdAtLoad||olderMessagesChatId!==chatIdAtLoad)return;
    await hydrateMessageSenderNames(older,chatIdAtLoad);
    if(Number(currentChatId)!==chatIdAtLoad||olderMessagesChatId!==chatIdAtLoad)return;
    const fragment=document.createDocumentFragment();
    older.forEach(function(message){if(box.querySelector('[data-message-id="'+message.id+'"]'))return;const div=renderMessage(message);if(div)fragment.appendChild(div);});
    box.insertBefore(fragment,box.firstChild);
    sortChatTimeline(box);
    box.scrollTop+=box.scrollHeight-beforeHeight;
    if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
}

if(!window.__olderMessagesScrollHandler){
    window.__olderMessagesScrollHandler=true;
    document.addEventListener("scroll",function(event){const box=event.target;if(!box||box.id!=="messages")return;if(box.scrollTop<=80)void loadOlderMessages();},true);
}

async function appendMessage(message){
    const chatIdAtStart=Number(currentChatId);
    if(!chatIdAtStart||(message.chat_id&&Number(message.chat_id)!==chatIdAtStart))return;
    const box=document.getElementById("messages");if(!box||!message)return;if(box.querySelector('[data-message-id="'+message.id+'"]'))return;
    try{if(currentUser&&message.user_id!==currentUser.id){const delivery=await supabaseClient.rpc("mark_message_delivered",{p_message_id:Number(message.id)});if(delivery.error)console.log("Ошибка подтверждения доставки:",delivery.error);}}catch(error){console.warn("Ошибка подтверждения доставки:",error);}
    if(Number(currentChatId)!==chatIdAtStart)return;
    const wasNearBottom=isMessagesBoxNearBottom(),previousScrollTop=box.scrollTop;
    const result=await supabaseClient.from("messages").select(`id,user_id,text,created_at,reply_to,expires_at,message_user_expirations(expires_at)`).eq("id",message.id).single();
    const fullMessage=result.data,error=result.error;if(error||!fullMessage||Number(currentChatId)!==chatIdAtStart)return;if(box.querySelector('[data-message-id="'+fullMessage.id+'"]'))return;
    await hydrateMessageSenderNames([fullMessage],chatIdAtStart);
    if(Number(currentChatId)!==chatIdAtStart)return;
    const div=renderMessage(fullMessage);if(!div)return;box.appendChild(div);sortChatTimeline(box);
    if(wasNearBottom)box.scrollTop=box.scrollHeight;else{box.scrollTop=previousScrollTop;requestAnimationFrame(function(){box.scrollTop=previousScrollTop;if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();});}
    if(fullMessage.user_id===currentUser.id)await updateMessageStatus(fullMessage.id);if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();if(fullMessage.user_id!==currentUser.id&&Number(currentChatId)===Number(fullMessage.chat_id))setTimeout(function(){if(typeof scheduleReadReceipt==="function")scheduleReadReceipt();},80);
}
