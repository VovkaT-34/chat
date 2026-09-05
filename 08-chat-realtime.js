// ===============================
// Realtime сообщений
// ===============================

const messageStatusCache = new Map();
let realtimeReconnectTimer = null;
let realtimeReconnectBusy = false;

async function subscribeToMessages() {
    if (!supabaseClient || !currentUser) return;

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
        .channel(`messages-realtime-${userId}-${Date.now()}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },
            async payload => {
                const newMessage = payload.new;
                if (!newMessage) return;

                const isIncoming = currentUser && newMessage.user_id !== currentUser.id;
                const isCurrentChat = Number(newMessage.chat_id) === Number(currentChatId);

                if (isIncoming) {
                    const { error } = await supabaseClient.rpc(
                        "mark_message_delivered",
                        { p_message_id: newMessage.id }
                    );
                    if (error) console.log("Ошибка подтверждения доставки:", error);
                }

                if (isCurrentChat) {
                    if (isIncoming) {
                        await appendMessage(newMessage);
                    }
                } else if (isIncoming) {
                    playMessageSound(newMessage.chat_id);
                }

                // The APK uses a native Android bridge because a plain Android
                // WebView is not the same notification environment as Chrome.
                // Only the APK has window.AndroidNotifications, so the normal
                // Chrome/GitHub Pages version remains unchanged.
                if (isIncoming && window.AndroidNotifications &&
                    typeof window.AndroidNotifications.showMessageNotification === "function" &&
                    (!isCurrentChat || document.hidden)) {
                    const senderName = newMessage.profiles && newMessage.profiles.username
                        ? newMessage.profiles.username
                        : "Новое сообщение";
                    const body = newMessage.text || "Новое сообщение";
                    try {
                        window.AndroidNotifications.showMessageNotification(senderName, body);
                    } catch (error) {
                        console.warn("Не удалось показать Android-уведомление:", error);
                    }
                }

                if (isIncoming) {
                    await updateUnreadCount(newMessage.chat_id);
                }

                await updateChatListMessageStatus(newMessage.chat_id);

                if (typeof window.moveChatToTop === "function") {
                    window.moveChatToTop(
                        newMessage.chat_id,
                        newMessage.created_at || new Date().toISOString()
                    );
                } else if (typeof updateChatOrder === "function") {
                    updateChatOrder(newMessage.chat_id);
                }
            }
        )
        .subscribe((status, error) => {
            if (status === "SUBSCRIBED") {
                realtimeReconnectBusy = false;
                if (realtimeReconnectTimer) {
                    clearTimeout(realtimeReconnectTimer);
                    realtimeReconnectTimer = null;
                }
                console.log("Realtime сообщений подключён");
                return;
            }

            if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
            ) {
                console.warn("Realtime сообщений отключён:", status, error || "");
                scheduleRealtimeReconnect();
            }
        });
}

function scheduleRealtimeReconnect() {
    if (realtimeReconnectBusy || realtimeReconnectTimer) return;
    realtimeReconnectBusy = true;

    realtimeReconnectTimer = setTimeout(async () => {
        realtimeReconnectTimer = null;
        realtimeReconnectBusy = false;

        if (currentUser && supabaseClient) {
            await subscribeToMessages();
        }
    }, 2000);
}

async function reconnectChatRealtime() {
    if (!currentUser || !supabaseClient) return;
    try {
        await subscribeToMessages();
    } catch (error) {
        console.warn("Ошибка восстановления Realtime сообщений:", error);
        scheduleRealtimeReconnect();
    }
}

function applyMessageStatus(statusElement, status) {
    if (!statusElement || !status) return;
    status = String(status).toLowerCase();
    if (status === "none") return;

    const order = { sent: 1, delivered: 2, read: 3 };
    const current = order[String(statusElement.dataset.messageStatus || "sent").toLowerCase()] || 1;
    const next = order[status] || 0;
    if (next < current) return;

    statusElement.dataset.messageStatus = status;
    if (status === "sent") {
        statusElement.textContent = "✓";
        statusElement.title = "Отправлено";
        statusElement.style.setProperty("color", "#999999", "important");
    } else if (status === "delivered") {
        statusElement.textContent = "✓";
        statusElement.title = "Доставлено";
        statusElement.style.setProperty("color", "#00C853", "important");
    } else if (status === "read") {
        statusElement.textContent = "✓✓";
        statusElement.title = "Прочитано";
        statusElement.style.setProperty("color", "#00C853", "important");
    }
}

function cacheAndApplyMessageStatus(messageId, status) {
    const id = Number(messageId);
    if (!id || !status || status === "none") return;

    const normalized = String(status).toLowerCase();
    const order = { sent: 1, delivered: 2, read: 3 };
    const old = messageStatusCache.get(id);
    if ((order[normalized] || 0) < (order[old] || 0)) return;
    messageStatusCache.set(id, normalized);

    document.querySelectorAll(`[data-status-message-id="${id}"]`).forEach(el => {
        applyMessageStatus(el, normalized);
    });
}

async function refreshOwnMessageStatuses() {
    if (!currentUser || !supabaseClient) return;

    const currentChat = Number(currentChatId || window.currentChatId || 0);
    let query = supabaseClient
        .from("messages")
        .select("id,chat_id")
        .eq("user_id", currentUser.id)
        .order("id", { ascending: false })
        .limit(30);

    if (currentChat > 0) query = query.eq("chat_id", currentChat);

    const { data: messages, error } = await query;
    if (error || !messages?.length) return;

    for (const message of messages) {
        const id = Number(message.id);
        if (!id) continue;

        const { data: status, error: statusError } = await supabaseClient.rpc(
            "get_message_status",
            { p_message_id: id }
        );

        if (!statusError && status) {
            cacheAndApplyMessageStatus(id, status);
        }
    }

    if (currentChat > 0) await updateChatListMessageStatus(currentChat);
}

function subscribeToMessageDeliveries() {
    supabaseClient
        .channel("message-deliveries-realtime")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "message_deliveries"
            },
            async payload => {
                const delivery = payload.new;
                if (!delivery || !currentUser) return;

                const messageId = Number(delivery.message_id);
                if (!messageId) return;

                const { data: message, error } = await supabaseClient
                    .from("messages")
                    .select("id,user_id,chat_id")
                    .eq("id", messageId)
                    .maybeSingle();

                if (error || !message || message.user_id !== currentUser.id) return;

                cacheAndApplyMessageStatus(messageId, "delivered");
                await updateChatListMessageStatus(message.chat_id);
            }
        )
        .subscribe();
}

function subscribeToMessageReads() {
    supabaseClient
        .channel("user-chat-reads-realtime")
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "user_chat_reads"
            },
            async payload => {
                const readInfo = payload.new;
                if (!readInfo || !currentUser || readInfo.user_id === currentUser.id) return;

                const chatId = Number(readInfo.chat_id);
                const lastReadId = Number(readInfo.last_read_message_id);
                if (!chatId || !lastReadId) return;

                const { data: ownMessages, error } = await supabaseClient
                    .from("messages")
                    .select("id")
                    .eq("chat_id", chatId)
                    .eq("user_id", currentUser.id)
                    .lte("id", lastReadId);

                if (!error) {
                    for (const message of ownMessages || []) {
                        cacheAndApplyMessageStatus(message.id, "read");
                    }
                }

                await updateChatListMessageStatus(chatId);
            }
        )
        .subscribe();
}

subscribeToMessageDeliveries();
subscribeToMessageReads();

let messageStatusRefreshBusy = false;
setInterval(async () => {
    if (messageStatusRefreshBusy) return;
    messageStatusRefreshBusy = true;
    try {
        await refreshOwnMessageStatuses();
    } finally {
        messageStatusRefreshBusy = false;
    }
}, 1000);

// Android WebView and mobile browsers can suspend the page/websocket when
// the app is backgrounded. Rejoin immediately when the page becomes active.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void reconnectChatRealtime();
});

window.addEventListener("online", () => {
    void reconnectChatRealtime();
});

window.addEventListener("androidresume", () => {
    void reconnectChatRealtime();
});
