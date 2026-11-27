// ===============================
// Realtime сообщений
// ===============================
const messageStatusCache = new Map();
let realtimeReconnectTimer = null;
let realtimeReconnectBusy = false;
let messageStatusRefreshBusy = false;
let incomingMessageSyncBusy = false;

async function isChatPushEnabledForCurrentUser(chatId){
    if(!currentUser||!supabaseClient)return false;
    try{
        const result=await supabaseClient.from("chat_notification_settings").select("push_enabled").eq("user_id",currentUser.id).eq("chat_id",Number(chatId)).maybeSingle();
        if(result.error){console.warn("Не удалось проверить настройку push-уведомлений:",result.error);return true;}
        return !result.data||result.data.push_enabled!==false;
    }catch(error){
        console.warn("Ошибка проверки push-настроек чата:",error);
        return true;
    }
}

async function markMutedChatMessagesDeliveredOnOpen(){
    if(document.hidden||!currentUser||!supabaseClient)return;
    try{
        const result=await supabaseClient.rpc("mark_muted_chat_messages_delivered");
        if(result.error)console.warn("Не удалось подтвердить доставку сообщений из чатов без push:",result.error);
    }catch(error){
        console.warn("Ошибка подтверждения доставки сообщений без push:",error);
    }
}

// ===============================
// Android FCM token
// ===============================
async function registerAndroidFcmToken(token) {
    if (!token || !currentUser || !supabaseClient) return;

    try {
        const result = await supabaseClient
            .from("android_push_tokens")
            .upsert(
                {
                    user_id: currentUser.id,
                    token: String(token),
                    platform: "android",
                    updated_at: new Date().toISOString()
                },
                { onConflict: "user_id,token" }
            );

        if (result.error) {
            console.warn("Не удалось сохранить FCM-токен Android:", result.error);
            return;
        }

    } catch (error) {
        console.warn("Ошибка регистрации FCM-токена Android:", error);
    }
}

window.addEventListener("androidfcmtoken", function (event) {
    const token = event && event.detail ? event.detail.token : null;
    if (token) void registerAndroidFcmToken(token);
});

// ===============================
// Realtime сообщений
// ===============================
async function subscribeToMessagesNow() {
    if (!supabaseClient || !currentUser) return;
    if(!document.hidden)await markMutedChatMessagesDeliveredOnOpen();

    if (realtimeChannel) {
        try {
            await supabaseClient.removeChannel(realtimeChannel);
        } catch (error) {
            console.warn("Не удалось удалить старый Realtime-канал:", error);
        }
        realtimeChannel = null;
    }

    const userId = currentUser.id;

    realtimeChannel = supabaseClient
        .channel("messages-realtime-" + userId + "-" + Date.now())
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "messages"
            },
            function (payload) {
                const deletedId = Number(payload && payload.old ? payload.old.id : 0);
                if (!deletedId) return;
                const messageElement = document.querySelector(
                    '.message[data-message-id="' + deletedId + '"]'
                );
                if (messageElement) messageElement.remove();
                if (typeof updatePinnedMessagesBar === "function") {
                    updatePinnedMessagesBar();
                }
            }
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },
            async function (payload) {
                try {
                    const newMessage = payload && payload.new ? payload.new : null;
                    if (!newMessage) return;

                    const isIncoming = !!(
                        currentUser &&
                        newMessage.user_id !== currentUser.id
                    );
                    const isCurrentChat =
                        Number(newMessage.chat_id) === Number(currentChatId);

                    const chatPushEnabled = isIncoming
                        ? await isChatPushEnabledForCurrentUser(newMessage.chat_id)
                        : true;

                    if (isIncoming && (chatPushEnabled || !document.hidden)) {
                        try {
                            const delivery = await supabaseClient.rpc(
                                "mark_message_delivered",
                                { p_message_id: newMessage.id }
                            );
                            if (delivery.error) {
                                console.log(
                                    "Ошибка подтверждения доставки:",
                                    delivery.error
                                );
                            }
                        } catch (error) {
                            console.warn("Ошибка доставки:", error);
                        }
                    }

                    if (isCurrentChat) {
                        if (isIncoming && typeof appendMessage === "function" && (chatPushEnabled || !document.hidden)) {
                            await appendMessage(newMessage);
                        }
                    } else if (
                        isIncoming &&
                        typeof playMessageSound === "function"
                    ) {
                        try {
                            playMessageSound(newMessage.chat_id);
                        } catch (error) {
                            console.warn("Ошибка звука:", error);
                        }
                    }

                    if (
                        isIncoming &&
                        chatPushEnabled &&
                        window.AndroidNotifications &&
                        typeof window.AndroidNotifications.showMessageNotification === "function" &&
                        (!isCurrentChat || document.hidden)
                    ) {
                        const senderName =
                            newMessage.profiles && newMessage.profiles.username
                                ? newMessage.profiles.username
                                : "Новое сообщение";
                        const body = newMessage.text || "Новое сообщение";

                        try {
                            window.AndroidNotifications.showMessageNotification(
                                senderName,
                                body
                            );
                        } catch (error) {
                            console.warn(
                                "Не удалось показать Android-уведомление:",
                                error
                            );
                        }
                    }

                    // Новое входящее сообщение в закрытом чате увеличивает
                    // уже показанный счётчик локально — отдельный RPC не нужен.
                    if (
                        isIncoming &&
                        !isCurrentChat &&
                        typeof incrementUnreadCount === "function"
                    ) {
                        incrementUnreadCount(newMessage.chat_id);
                    }

                    if (typeof window.moveChatToTop === "function") {
                        window.moveChatToTop(
                            newMessage.chat_id,
                            newMessage.created_at || new Date().toISOString()
                        );
                    }
                } catch (error) {
                    console.error(
                        "Ошибка обработки входящего сообщения:",
                        error
                    );
                }
            }
        )
        .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "chat_disappearing_events" },
            function (payload) {
                const event = payload && payload.new ? payload.new : null;
                if (!event || Number(event.chat_id) !== Number(currentChatId)) return;
                const box = document.getElementById("messages");
                if (!box || typeof window.renderChatDisappearingEvent !== "function") return;
                if (box.querySelector('[data-disappearing-event-id="' + Number(event.id) + '"]')) return;
                const node = window.renderChatDisappearingEvent(event);
                if (!node) return;
                box.appendChild(node);
                if (typeof window.sortChatTimeline === "function") window.sortChatTimeline(box);
            }
        )
        .subscribe(function (status, error) {
            console.log("Realtime сообщений:", status, error || "");

            if (status === "SUBSCRIBED") {
                realtimeReconnectBusy = false;
                if (realtimeReconnectTimer) {
                    clearTimeout(realtimeReconnectTimer);
                    realtimeReconnectTimer = null;
                }
                return;
            }

            if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
            ) {
                scheduleRealtimeReconnect();
            }
        });
}

let realtimeSubscribePromise = null;
let realtimeLastReconnectAt = 0;

async function subscribeToMessages() {
    if (realtimeSubscribePromise) return realtimeSubscribePromise;
    const pending = subscribeToMessagesNow();
    realtimeSubscribePromise = pending;
    try {
        return await pending;
    } finally {
        if (realtimeSubscribePromise === pending) realtimeSubscribePromise = null;
    }
}

function scheduleRealtimeReconnect() {
    if (realtimeReconnectBusy || realtimeReconnectTimer) return;

    realtimeReconnectBusy = true;

    realtimeReconnectTimer = setTimeout(async function () {
        realtimeReconnectTimer = null;
        realtimeReconnectBusy = false;

        if (currentUser && supabaseClient) {
            try {
                await subscribeToMessages();
            } catch (error) {
                console.warn("Ошибка переподключения:", error);
                scheduleRealtimeReconnect();
            }
        }
    }, 1000);
}

async function reconnectChatRealtime() {
    if (!currentUser || !supabaseClient || realtimeSubscribePromise) return;
    const now = Date.now();
    if (now - realtimeLastReconnectAt < 2000) return;
    realtimeLastReconnectAt = now;

    try {
        await subscribeToMessages();
    } catch (error) {
        console.warn("Ошибка восстановления Realtime сообщений:", error);
        scheduleRealtimeReconnect();
    }
}

// ===============================
// Безопасное применение статуса
// ===============================
function applyMessageStatus(element, status, force) {
    if (!element || !status) return;

    status = String(status).toLowerCase();
    const order = { sent: 1, delivered: 2, read: 3 };
    const current =
        order[String(element.dataset.messageStatus || "sent").toLowerCase()] || 1;

    if (!force && (order[status] || 0) < current) return;

    element.dataset.messageStatus = status;

    if (status === "read") {
        element.textContent = "✓✓";
        element.title = "Прочитано";
        element.style.color = "#00C853";
    } else if (status === "delivered") {
        element.textContent = "✓";
        element.title = "Доставлено";
        element.style.color = "#00C853";
    } else {
        element.textContent = "✓";
        element.title = "Отправлено";
        element.style.color = "#999999";
    }
}

function cacheAndApplyMessageStatus(id, status, force) {
    id = Number(id);
    if (!id || !status) return;

    const order = { sent: 1, delivered: 2, read: 3 };
    const normalized = String(status).toLowerCase();
    const old = messageStatusCache.get(id);

    if (!force && (order[normalized] || 0) < (order[old] || 0)) return;

    messageStatusCache.set(id, normalized);

    document
        .querySelectorAll('[data-status-message-id="' + id + '"]')
        .forEach(function (element) {
            applyMessageStatus(element, normalized, force);
        });
}

async function refreshOwnMessageStatuses() {
    if (messageStatusRefreshBusy || !currentUser || !supabaseClient) return;
    const chatId = Number(currentChatId || 0);
    if (!chatId || typeof refreshChatMessageStatuses !== "function") return;
    const box = document.getElementById("messages");
    if (!box) return;
    const ids = Array.prototype.slice.call(
        box.querySelectorAll('.message[data-message-id][data-user-id="' + currentUser.id + '"]')
    ).map(function (el) { return Number(el.dataset.messageId); }).filter(Boolean);
    if (!ids.length) return;
    messageStatusRefreshBusy = true;
    try {
        await refreshChatMessageStatuses(chatId, ids);
    } finally {
        messageStatusRefreshBusy = false;
    }
}

// ===============================
// Резервная синхронизация входящих
// ===============================
async function syncCurrentChatMessages() {
    if (
        incomingMessageSyncBusy ||
        !currentUser ||
        !supabaseClient ||
        !currentChatId
    ) {
        return;
    }

    incomingMessageSyncBusy = true;

    try {
        const chatId = Number(currentChatId);

        const result = await supabaseClient
            .from("messages")
            .select(
                "id,user_id,text,created_at,reply_to,expires_at"
            )
            .eq("chat_id", chatId)
            .order("created_at", { ascending: false })
            .limit(5);

        if (result.error || !result.data) return;
        if (Number(currentChatId) !== chatId) return;

        const messages = result.data.slice().reverse();

        for (const message of messages) {
            if (message.user_id === currentUser.id) continue;

            const exists = document.querySelector(
                '[data-message-id="' + message.id + '"]'
            );

            if (!exists && typeof appendMessage === "function") {
                await appendMessage(message);
            }
        }
    } catch (error) {
        console.warn("Ошибка резервной синхронизации сообщений:", error);
    } finally {
        incomingMessageSyncBusy = false;
    }
}

// ===============================
// Realtime доставки сообщений
// ===============================
function subscribeToMessageDeliveries() {
    if (!supabaseClient) return;

    supabaseClient
        .channel("message-deliveries-realtime")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "message_deliveries"
            },
            async function (payload) {
                try {
                    const delivery = payload && payload.new ? payload.new : null;
                    if (!delivery || !currentUser) return;

                    const messageId = Number(delivery.message_id);
                    if (!messageId) return;

                    const result = await supabaseClient
                        .from("messages")
                        .select("id,user_id,chat_id")
                        .eq("id", messageId)
                        .maybeSingle();

                    if (
                        result.error ||
                        !result.data ||
                        result.data.user_id !== currentUser.id
                    ) {
                        return;
                    }

                    cacheAndApplyMessageStatus(messageId, "delivered");

                    if (typeof updateChatListMessageStatus === "function") {
                        await updateChatListMessageStatus(result.data.chat_id);
                    }
                } catch (error) {
                    console.warn("Ошибка доставки Realtime:", error);
                }
            }
        )
        .subscribe();
}

// ===============================
// Realtime прочтения сообщений
// ===============================
function subscribeToMessageReads() {
    if (!supabaseClient) return;

    supabaseClient
        .channel("user-chat-reads-realtime")
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "user_chat_reads"
            },
            async function (payload) {
                try {
                    const info = payload && payload.new ? payload.new : null;
                    if (!info || !currentUser || info.user_id === currentUser.id) {
                        return;
                    }

                    const chatId = Number(info.chat_id);
                    const lastReadId = Number(info.last_read_message_id);
                    if (!chatId || !lastReadId) return;

                    const result = await supabaseClient
                        .from("messages")
                        .select("id")
                        .eq("chat_id", chatId)
                        .eq("user_id", currentUser.id)
                        .lte("id", lastReadId);

                    if (!result.error) {
                        (result.data || []).forEach(function (message) {
                            cacheAndApplyMessageStatus(message.id, "read");
                        });

                        if (typeof updateChatListMessageStatus === "function") {
                            await updateChatListMessageStatus(chatId);
                        }
                    }
                } catch (error) {
                    console.warn("Ошибка прочтения Realtime:", error);
                }
            }
        )
        .subscribe();
}

subscribeToMessageDeliveries();
subscribeToMessageReads();

document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
        void reconnectChatRealtime();
        void syncCurrentChatMessages();
        void refreshOwnMessageStatuses();
    }
});

window.addEventListener("online", function () {
    void reconnectChatRealtime();
    void syncCurrentChatMessages();
    void refreshOwnMessageStatuses();
});

window.addEventListener("androidresume", function () {
    void reconnectChatRealtime();
    void syncCurrentChatMessages();
    void refreshOwnMessageStatuses();
});

// ===============================
// Отрисовка сообщений и интерфейс статусов
// ===============================

// ===============================
// Отрисовка сообщения
// ===============================
const chatReadBoundaryCache = new Map();
const MESSAGE_PIN_STORAGE_KEY = "message-pin-v1:";
const MESSAGE_ACTION_ICON_SVG = { reply:'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15 4 10l5-5"/><path d="M4 10h9a7 7 0 0 1 7 7v2"/></svg>', copy:'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0 2 2h3"/></svg>', pin:'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 4 6 0 1 6 3 3-5 1v6l-2-2-2 2v-6l-5-1 3-3 1-6Z"/></svg>' };

function getPinnedMessages(){try{var raw=localStorage.getItem(MESSAGE_PIN_STORAGE_KEY+(currentUser&&currentUser.id?currentUser.id:"guest"));var parsed=raw?JSON.parse(raw):{};return parsed&&typeof parsed==="object"?parsed:{};}catch(error){return {};}}
function savePinnedMessages(map){try{localStorage.setItem(MESSAGE_PIN_STORAGE_KEY+(currentUser&&currentUser.id?currentUser.id:"guest"),JSON.stringify(map));}catch(error){}}
function applyPinnedMessageStyle(message,pinned){if(!message)return;if(pinned)message.classList.add("message-pinned");else message.classList.remove("message-pinned");}
function getPinnedMessageElements(){var box=document.getElementById("messages");if(!box)return [];var pins=getPinnedMessages();return Array.prototype.slice.call(box.querySelectorAll(".message[data-message-id]")).filter(function(message){return !!pins[String(message.dataset.messageId)];}).sort(function(a,b){return (Number(pins[String(b.dataset.messageId)])||0)-(Number(pins[String(a.dataset.messageId)])||0);});}
var pinnedMessagesBarUpdateScheduled=false;
function schedulePinnedMessagesBarUpdate(){if(pinnedMessagesBarUpdateScheduled)return;pinnedMessagesBarUpdateScheduled=true;setTimeout(function(){pinnedMessagesBarUpdateScheduled=false;updatePinnedMessagesBar();},0);}
function scrollToPinnedMessage(message){if(!message)return;var box=document.getElementById("messages");if(!box)return;var top=message.offsetTop-box.offsetTop-12;box.scrollTo({top:Math.max(0,top),behavior:"smooth"});}
function updatePinnedMessagesBar(){
    var box=document.getElementById("messages");
    if(!box)return;
    var pins=getPinnedMessageElements();
    var bar=document.getElementById("pinnedMessagesBar");
    if(!pins.length){
        if(bar)bar.remove();
        return;
    }
    if(!bar){
        bar=document.createElement("button");
        bar.id="pinnedMessagesBar";
        bar.type="button";
        bar.setAttribute("aria-label","Прикреплённое сообщение");
        bar.style.cssText="position:sticky;top:0;z-index:30;display:flex;align-items:center;width:calc(100% - 16px);min-height:52px;margin:4px 8px 12px;padding:8px 12px;border:2px solid rgba(78,128,92,.65);border-radius:14px;background:linear-gradient(135deg,rgba(224,240,218,.94),rgba(244,218,169,.92));color:#294832;text-align:left;cursor:pointer;box-shadow:0 3px 12px rgba(52,86,58,.16),inset 0 0 0 1px rgba(255,255,255,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:inherit;box-sizing:border-box;position:sticky;overflow:hidden;";
        bar.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();
            var currentPins=getPinnedMessageElements();
            if(!currentPins.length)return;
            var next=(Number(bar.dataset.pinnedIndex)||0)+1;
            if(next>=currentPins.length)next=0;
            bar.dataset.pinnedIndex=String(next);
            updatePinnedMessagesBar();
            scrollToPinnedMessage(currentPins[next]);
        });
    }
    var index=Number(bar.dataset.pinnedIndex)||0;
    if(index>=pins.length)index=0;
    bar.dataset.pinnedIndex=String(index);
    var current=pins[index];
    var text=current.querySelector(".message-text");
    var username=current.querySelector(".message-user");
    var preview=(text&&text.textContent||"").trim().replace(/\s+/g," ");
    if(preview.length>120)preview=preview.slice(0,117)+"...";
    bar.replaceChildren();
    var content=document.createElement("span");
    content.style.cssText="display:block;min-width:0;flex:1;overflow:hidden;";
    var label=document.createElement("span");
    label.textContent="📌 Прикреплено";
    label.style.cssText="display:block;font-size:11px;font-weight:700;color:#4f7b57;margin-bottom:2px;";
    var user=document.createElement("span");
    user.textContent=username?username.textContent:"Сообщение";
    user.style.cssText="display:block;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    var message=document.createElement("span");
    message.textContent=preview||"Прикреплённое сообщение";
    message.style.cssText="display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    var arrow=document.createElement("span");
    arrow.textContent="›";
    arrow.style.cssText="margin-left:10px;font-size:18px;opacity:.72;";
    content.appendChild(label);
    content.appendChild(user);
    content.appendChild(message);
    bar.appendChild(content);
    bar.appendChild(arrow);
    if(bar.parentElement!==box)box.insertBefore(bar,box.firstChild);
    else if(box.firstChild!==bar)box.insertBefore(bar,box.firstChild);
}
function toggleMessagePin(messageId){var map=getPinnedMessages(),key=String(messageId),pinned=!map[key];if(pinned)map[key]=Date.now();else delete map[key];savePinnedMessages(map);closeMessageActionMenu();var message=document.querySelector('.message[data-message-id="'+Number(messageId)+'"]');if(message)applyPinnedMessageStyle(message,pinned);updatePinnedMessagesBar();}
function closeMessageActionMenu(){var menu=document.getElementById("messageActionMenu");if(menu)menu.remove();}
function showMessageActionMenu(message,anchor){closeMessageActionMenu();var menu=document.createElement("div");menu.id="messageActionMenu";menu.style.cssText="position:fixed;z-index:99999;min-width:190px;background:#000;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;font-size:15px;color:#fff;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;";menu.addEventListener("contextmenu",function(e){e.preventDefault();e.stopPropagation();});menu.addEventListener("selectstart",function(e){e.preventDefault();e.stopPropagation();});function add(text,icon,handler){var b=document.createElement("button");b.type="button";b.innerHTML=icon+'<span>'+text+'</span>';b.style.cssText="display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;";b.addEventListener("contextmenu",function(e){e.preventDefault();e.stopPropagation();});b.addEventListener("click",function(e){e.stopPropagation();handler();});menu.appendChild(b);}var username=getMessageSenderName(message),text=message.text||"";add("Ответить",MESSAGE_ACTION_ICON_SVG.reply,function(){closeMessageActionMenu();replyToMessage(message.id,username,text);});add("Копировать",MESSAGE_ACTION_ICON_SVG.copy,async function(){try{await navigator.clipboard.writeText(text);}catch(error){var area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.focus();area.select();try{document.execCommand("copy");}catch(copyError){}area.remove();}closeMessageActionMenu();});var pinned=!!getPinnedMessages()[String(message.id)];add(pinned?"Открепить":"Прикрепить",MESSAGE_ACTION_ICON_SVG.pin,function(){toggleMessagePin(message.id);});if(currentUser&&message.user_id===currentUser.id){add("Удалить сообщение",'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',async function(){closeMessageActionMenu();if(!currentUser||message.user_id!==currentUser.id)return;if(!window.confirm("Удалить это сообщение для всех участников чата?"))return;try{var result=await supabaseClient.from("messages").delete().eq("id",message.id).eq("user_id",currentUser.id).select("id").maybeSingle();if(result.error)throw result.error;if(!result.data){alert("Сообщение не найдено или уже удалено.");return;}var el=document.querySelector('.message[data-message-id="'+Number(message.id)+'"]');if(el)el.remove();var pins=getPinnedMessages();delete pins[String(message.id)];savePinnedMessages(pins);updatePinnedMessagesBar();}catch(error){console.error("Ошибка удаления сообщения:",error);alert("Не удалось удалить сообщение. Проверьте подключение и права доступа.");}});}document.body.appendChild(menu);var r=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-205))+"px";menu.style.top=Math.max(8,Math.min(r.bottom+4,window.innerHeight-180))+"px";setTimeout(function(){document.addEventListener("click",closeMessageActionMenu,{once:true});},0);}

function renderMessage(message){
    if(!message||!currentUser)return null;
    var div=document.createElement("div");
    div.className="message";
    div.dataset.messageId=message.id;
    div.dataset.userId=message.user_id;
    div.dataset.createdAt=String(message.created_at||"");
    div.style.setProperty("-webkit-user-select","none");
    div.style.setProperty("user-select","none");
    div.style.setProperty("-webkit-touch-callout","none");
    var username=getMessageSenderName(message);
    var date=new Date(message.created_at);
    var header=document.createElement("div");
    var user=document.createElement("span");
    user.className="message-user";
    user.textContent=String(username);
    header.appendChild(user);
    var time=document.createElement("span");
    time.className="message-time";
    time.textContent=date.toLocaleDateString("ru-RU")+" "+date.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    header.appendChild(time);
    if(message.user_id===currentUser.id){
        var status=document.createElement("span");
        status.className="message-status";
        status.dataset.statusMessageId=String(message.id);
        status.dataset.messageStatus="sent";
        status.style.cssText="margin-left:6px;font-size:13px;font-weight:bold;white-space:nowrap;color:#999999";
        status.title="Отправлено";
        status.textContent="✓";
        header.appendChild(status);
    }
    div.appendChild(header);
    if(message.reply_message){
        var reply=document.createElement("div");
        reply.style.cssText="background:#eeeeee;padding:8px;border-left:4px solid #8E44AD;border-radius:6px;margin-bottom:8px;font-size:14px;overflow-wrap:anywhere;word-break:break-word";
        var replyUsername=getMessageSenderName(message.reply_message);
        reply.appendChild(document.createTextNode("↩ "+String(replyUsername)));
        reply.appendChild(document.createElement("br"));
        reply.appendChild(document.createTextNode(String(message.reply_message.text||"")));
        div.appendChild(reply);
    }
    var body=document.createElement("div");
    body.className="message-text";
    body.textContent=String(message.text||"");
    div.appendChild(body);
    var replyButton=document.createElement("button");
    replyButton.type="button";
    replyButton.textContent="↩ Ответить";
    replyButton.style.cssText="margin-top:6px;padding:3px 8px;border:none;border-radius:7px;background:#9B7AC2;color:white;cursor:pointer;font-size:12px";
    replyButton.addEventListener("click",function(event){
        event.preventDefault();
        event.stopPropagation();
        replyToMessage(message.id,username,String(message.text||""));
    });
    div.appendChild(replyButton);
    var pinned=!!getPinnedMessages()[String(message.id)];
    applyPinnedMessageStyle(div,pinned);
    schedulePinnedMessagesBarUpdate();
    var longPressTimer=null,longPressTriggered=false;
    function cancelLongPress(){if(longPressTimer!==null){clearTimeout(longPressTimer);longPressTimer=null;}}
    function startLongPress(event){if(event.pointerType==="mouse")return;longPressTriggered=false;cancelLongPress();longPressTimer=setTimeout(function(){longPressTimer=null;longPressTriggered=true;showMessageActionMenu(message,div);},500);}
    function finishLongPress(){cancelLongPress();}
    div.addEventListener("pointerdown",startLongPress,{passive:true});
    div.addEventListener("pointerup",finishLongPress);
    div.addEventListener("pointercancel",finishLongPress);
    div.addEventListener("contextmenu",function(event){event.preventDefault();event.stopPropagation();cancelLongPress();showMessageActionMenu(message,div);});
    div.addEventListener("click",function(event){if(longPressTriggered){longPressTriggered=false;event.preventDefault();event.stopPropagation();}});
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
            if(messageId<=readBoundary)cacheAndApplyMessageStatus(messageId,"read",!readsResult.error);
            else if(delivered.has(messageId))cacheAndApplyMessageStatus(messageId,"delivered",!readsResult.error&&!deliveryResult.error);
            else if(!readsResult.error&&!deliveryResult.error)cacheAndApplyMessageStatus(messageId,"sent",true);
        });
    }catch(error){console.warn("Ошибка массового обновления статусов:",error);}
}

async function updateMessageStatus(messageId,status){var id=Number(messageId);if(!id||!currentUser||!supabaseClient)return;var el=document.querySelector('[data-status-message-id="'+id+'"]');if(!el)return;if(status===undefined||status===null){status=messageStatusCache&&messageStatusCache.get?messageStatusCache.get(id):null;if(!status)return;}setMessageStatus(el,status);}
async function updateChatListMessageStatus(chatId){
    if(!currentUser||!supabaseClient)return;
    var id=Number(chatId);if(!id)return;
    var el=document.querySelector('[data-chat-status-id="'+id+'"]');if(!el)return;
    var latest=null;
    if(Number(currentChatId)===id){
        var box=document.getElementById("messages");
        latest=box?Array.prototype.slice.call(box.querySelectorAll('.message[data-message-id][data-user-id="'+currentUser.id+'"]')).sort(function(a,b){
            return Number(b.dataset.messageId)-Number(a.dataset.messageId);
        })[0]:null;
    }
    var messageId=latest?Number(latest.dataset.messageId):0;
    if(!messageId){
        try{
            var result=await supabaseClient.from("messages").select("id").eq("chat_id",id).eq("user_id",currentUser.id).order("id",{ascending:false}).limit(1).maybeSingle();
            if(!result.error&&result.data)messageId=Number(result.data.id)||0;
        }catch(error){return;}
    }
    if(!messageId)return;
    var status=messageStatusCache&&messageStatusCache.get?messageStatusCache.get(messageId):null;
    var readBoundary=Number(chatReadBoundaryCache&&chatReadBoundaryCache.get?chatReadBoundaryCache.get(id):0);
    if(readBoundary&&messageId<=readBoundary){
        status="read";
        if(messageStatusCache&&messageStatusCache.set)messageStatusCache.set(messageId,status);
    }
    if(!status&&typeof refreshChatMessageStatuses==="function"){
        await refreshChatMessageStatuses(id,[messageId]);
        status=messageStatusCache&&messageStatusCache.get?messageStatusCache.get(messageId):null;
    }
    if(!status){
        status="sent";
        if(messageStatusCache&&messageStatusCache.set)messageStatusCache.set(messageId,status);
    }
    el.dataset.messageStatus=status;
    setMessageStatus(el,status);
}
