// ===============================
// Realtime сообщений
// ===============================
async function subscribeToMessages() {
    if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);

    realtimeChannel = supabaseClient.channel("messages-realtime")
        .on("postgres_changes", {event:"INSERT", schema:"public", table:"messages"}, async payload => {
            const newMessage = payload.new;
            if (!newMessage) return;

            if (currentUser && newMessage.user_id !== currentUser.id) {
                const {error} = await supabaseClient.rpc("mark_message_delivered", {p_message_id:newMessage.id});
                if (error) console.log("Ошибка подтверждения доставки:", error);
            }

            if (Number(newMessage.chat_id) === Number(currentChatId)) {
                if (currentUser && newMessage.user_id !== currentUser.id) await appendMessage(newMessage);
            } else if (currentUser && newMessage.user_id !== currentUser.id) {
                playMessageSound(newMessage.chat_id);
            }

            if (currentUser && newMessage.user_id !== currentUser.id) {
                await updateUnreadCount(newMessage.chat_id);
            }
            await updateChatListMessageStatus(newMessage.chat_id);
            if (typeof updateChatOrder === "function") updateChatOrder(newMessage.chat_id);
        })
        .subscribe();
}

// ===============================
// Безопасное применение статуса
// ===============================
function applyMessageStatus(statusElement, status) {
    if (!statusElement || !status) return;
    const order = {sent:1, delivered:2, read:3};
    const current = order[statusElement.dataset.messageStatus || "sent"] || 1;
    const next = order[status] || 0;
    if (next < current) return;

    statusElement.dataset.messageStatus = status;
    if (status === "sent") {
        statusElement.textContent = "✓";
        statusElement.title = "Отправлено";
        statusElement.style.color = "#999999";
    } else if (status === "delivered") {
        statusElement.textContent = "✓";
        statusElement.title = "Доставлено";
        statusElement.style.color = "#00C853";
    } else if (status === "read") {
        statusElement.textContent = "✓✓";
        statusElement.title = "Прочитано";
        statusElement.style.color = "#00C853";
    }
}

async function refreshOwnMessageStatuses() {
    if (!currentUser) return;
    const elements = Array.from(document.querySelectorAll("[data-status-message-id]"));
    for (const el of elements) {
        const messageId = Number(el.dataset.statusMessageId);
        if (!messageId) continue;
        const {data, error} = await supabaseClient.rpc("get_message_status", {p_message_id:messageId});
        if (!error && data) applyMessageStatus(el, data);
    }

    const chatIds = new Set();
    document.querySelectorAll(".message[data-message-id]").forEach(el => {
        const parent = el.closest?.("#messages");
        if (parent && currentChatId) chatIds.add(Number(currentChatId));
    });
    for (const chatId of chatIds) await updateChatListMessageStatus(chatId);
}

// ===============================
// Realtime доставки сообщений
// ===============================
function subscribeToMessageDeliveries() {
    supabaseClient.channel("message-deliveries-realtime")
        .on("postgres_changes", {event:"*", schema:"public", table:"message_deliveries"}, async payload => {
            const delivery = payload.new;
            if (!delivery || !currentUser) return;
            const messageId = Number(delivery.message_id);
            if (!messageId) return;

            const {data:message, error} = await supabaseClient.from("messages")
                .select("id,user_id,chat_id").eq("id",messageId).maybeSingle();
            if (error || !message || message.user_id !== currentUser.id) return;

            const el = document.querySelector(`[data-status-message-id="${messageId}"]`);
            if (el) applyMessageStatus(el,"delivered");
            await updateChatListMessageStatus(message.chat_id);
        })
        .subscribe();
}

// ===============================
// Realtime прочтения сообщений
// ===============================
function subscribeToMessageReads() {
    supabaseClient.channel("user-chat-reads-realtime")
        .on("postgres_changes", {event:"*", schema:"public", table:"user_chat_reads"}, async payload => {
            const readInfo = payload.new;
            if (!readInfo || !currentUser || readInfo.user_id === currentUser.id) return;

            const chatId = Number(readInfo.chat_id);
            const lastReadId = Number(readInfo.last_read_message_id);
            if (!chatId || !lastReadId) return;

            // Обновляем только наши сообщения, которые действительно
            // находятся до последней прочитанной позиции собеседника.
            const {data:ownMessages, error} = await supabaseClient.from("messages")
                .select("id").eq("chat_id",chatId).eq("user_id",currentUser.id).lte("id",lastReadId);
            if (!error) {
                for (const message of ownMessages || []) {
                    const el = document.querySelector(`[data-status-message-id="${message.id}"]`);
                    if (el) applyMessageStatus(el,"read");
                }
            }
            await updateChatListMessageStatus(chatId);
        })
        .subscribe();
}

subscribeToMessageDeliveries();
subscribeToMessageReads();

// Надёжный fallback: даже если конкретный браузер задержал Realtime,
// статус на экране всё равно синхронизируется с backend.
setInterval(() => { void refreshOwnMessageStatuses(); }, 1000);
