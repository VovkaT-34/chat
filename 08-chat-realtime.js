// ===============================
// Realtime сообщений
// ===============================
const messageStatusCache = new Map();
let realtimeReconnectTimer = null;
let realtimeReconnectBusy = false;
let messageStatusRefreshBusy = false;

async function subscribeToMessages() {
    if (!supabaseClient || !currentUser) return;
    if (realtimeChannel) {
        try { await supabaseClient.removeChannel(realtimeChannel); }
        catch (error) { console.warn("Не удалось удалить старый Realtime-канал:", error); }
        realtimeChannel = null;
    }
    const userId = currentUser.id;
    realtimeChannel = supabaseClient.channel("messages-realtime-" + userId + "-" + Date.now())
        .on("postgres_changes", { event:"INSERT", schema:"public", table:"messages" }, async function(payload) {
            try {
                const newMessage = payload && payload.new ? payload.new : null;
                if (!newMessage) return;
                const isIncoming = !!(currentUser && newMessage.user_id !== currentUser.id);
                const isCurrentChat = Number(newMessage.chat_id) === Number(currentChatId);
                if (isIncoming) {
                    try {
                        const delivery = await supabaseClient.rpc("mark_message_delivered", { p_message_id:newMessage.id });
                        if (delivery.error) console.log("Ошибка подтверждения доставки:", delivery.error);
                    } catch (error) { console.warn("Ошибка доставки:", error); }
                }
                if (isCurrentChat) {
                    if (isIncoming) await appendMessage(newMessage);
                } else if (isIncoming && typeof playMessageSound === "function") {
                    try { playMessageSound(newMessage.chat_id); } catch (error) { console.warn("Ошибка звука:", error); }
                }
                if (isIncoming && window.AndroidNotifications && typeof window.AndroidNotifications.showMessageNotification === "function" && (!isCurrentChat || document.hidden)) {
                    const senderName = newMessage.profiles && newMessage.profiles.username ? newMessage.profiles.username : "Новое сообщение";
                    const body = newMessage.text || "Новое сообщение";
                    try { window.AndroidNotifications.showMessageNotification(senderName, body); }
                    catch (error) { console.warn("Не удалось показать Android-уведомление:", error); }
                }
                if (isIncoming && typeof updateUnreadCount === "function") {
                    try { await updateUnreadCount(newMessage.chat_id); } catch (error) { console.warn("Ошибка счётчика:", error); }
                }
                if (typeof window.moveChatToTop === "function") window.moveChatToTop(newMessage.chat_id, newMessage.created_at || new Date().toISOString());
            } catch (error) {
                console.error("Ошибка обработки входящего сообщения:", error);
            }
        })
        .subscribe(function(status, error) {
            if (status === "SUBSCRIBED") {
                realtimeReconnectBusy = false;
                if (realtimeReconnectTimer) { clearTimeout(realtimeReconnectTimer); realtimeReconnectTimer = null; }
                return;
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") scheduleRealtimeReconnect();
        });
}

function scheduleRealtimeReconnect() {
    if (realtimeReconnectBusy || realtimeReconnectTimer) return;
    realtimeReconnectBusy = true;
    realtimeReconnectTimer = setTimeout(async function() {
        realtimeReconnectTimer = null;
        realtimeReconnectBusy = false;
        if (currentUser && supabaseClient) {
            try { await subscribeToMessages(); } catch (error) { console.warn("Ошибка переподключения:", error); scheduleRealtimeReconnect(); }
        }
    }, 2000);
}

async function reconnectChatRealtime() {
    if (!currentUser || !supabaseClient) return;
    try { await subscribeToMessages(); } catch (error) { scheduleRealtimeReconnect(); }
}

function applyMessageStatus(element, status) {
    if (!element || !status) return;
    status = String(status).toLowerCase();
    const order = { sent:1, delivered:2, read:3 };
    const current = order[String(element.dataset.messageStatus || "sent").toLowerCase()] || 1;
    if ((order[status] || 0) < current) return;
    element.dataset.messageStatus = status;
    if (status === "read") { element.textContent="✓✓"; element.title="Прочитано"; element.style.color="#00C853"; }
    else if (status === "delivered") { element.textContent="✓"; element.title="Доставлено"; element.style.color="#00C853"; }
    else { element.textContent="✓"; element.title="Отправлено"; element.style.color="#999999"; }
}

function cacheAndApplyMessageStatus(id, status) {
    id = Number(id); if (!id || !status) return;
    const order = { sent:1, delivered:2, read:3 }, normalized = String(status).toLowerCase(), old = messageStatusCache.get(id);
    if ((order[normalized] || 0) < (order[old] || 0)) return;
    messageStatusCache.set(id, normalized);
    document.querySelectorAll('[data-status-message-id="' + id + '"]').forEach(function(el) { applyMessageStatus(el, normalized); });
}

async function refreshOwnMessageStatuses() {
    if (!currentUser || !supabaseClient) return;
    let query = supabaseClient.from("messages").select("id,chat_id").eq("user_id", currentUser.id).order("id", { ascending:false }).limit(10);
    const currentChat = Number(currentChatId || 0);
    if (currentChat > 0) query = query.eq("chat_id", currentChat);
    const result = await query;
    if (result.error || !result.data || !result.data.length) return;
    for (const message of result.data) {
        try { const status = await supabaseClient.rpc("get_message_status", { p_message_id:Number(message.id) }); if (!status.error) cacheAndApplyMessageStatus(message.id, status.data); }
        catch (error) { console.warn("Ошибка статуса:", error); }
    }
}

function subscribeToMessageDeliveries() {
    if (!supabaseClient) return;
    supabaseClient.channel("message-deliveries-realtime").on("postgres_changes", { event:"INSERT", schema:"public", table:"message_deliveries" }, async function(payload) {
        try {
            const delivery = payload && payload.new ? payload.new : null;
            if (!delivery || !currentUser) return;
            const messageId = Number(delivery.message_id); if (!messageId) return;
            const result = await supabaseClient.from("messages").select("id,user_id").eq("id",messageId).maybeSingle();
            if (result.error || !result.data || result.data.user_id !== currentUser.id) return;
            cacheAndApplyMessageStatus(messageId, "delivered");
        } catch (error) { console.warn("Ошибка доставки Realtime:", error); }
    }).subscribe();
}

function subscribeToMessageReads() {
    if (!supabaseClient) return;
    supabaseClient.channel("user-chat-reads-realtime").on("postgres_changes", { event:"*", schema:"public", table:"user_chat_reads" }, async function(payload) {
        try {
            const info = payload && payload.new ? payload.new : null;
            if (!info || !currentUser || info.user_id === currentUser.id) return;
            const chatId = Number(info.chat_id), lastReadId = Number(info.last_read_message_id);
            if (!chatId || !lastReadId) return;
            const result = await supabaseClient.from("messages").select("id").eq("chat_id",chatId).eq("user_id",currentUser.id).lte("id",lastReadId);
            if (!result.error) (result.data || []).forEach(function(message) { cacheAndApplyMessageStatus(message.id,"read"); });
        } catch (error) { console.warn("Ошибка прочтения Realtime:", error); }
    }).subscribe();
}

subscribeToMessageDeliveries();
subscribeToMessageReads();
setInterval(async function() {
    if (messageStatusRefreshBusy) return;
    messageStatusRefreshBusy = true;
    try { await refreshOwnMessageStatuses(); } catch (error) { console.warn("Ошибка обновления статусов:", error); }
    messageStatusRefreshBusy = false;
}, 5000);

document.addEventListener("visibilitychange", function() { if (!document.hidden) void reconnectChatRealtime(); });
window.addEventListener("online", function() { void reconnectChatRealtime(); });
window.addEventListener("androidresume", function() { void reconnectChatRealtime(); });
