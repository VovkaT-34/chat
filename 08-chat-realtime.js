// ===============================
// Realtime сообщений и статусов
// ===============================

const messageStatusCache = new Map();
let messageStatusRefreshTimer = null;
let messageDeliveriesChannel = null;
let messageReadsChannel = null;

// ===============================
// Безопасное применение статуса
// ===============================

function applyMessageStatus(statusElement, status) {
    if (!statusElement || !status) return;

    status = String(status).toLowerCase();
    if (status === "none") return;

    const order = { sent: 1, delivered: 2, read: 3 };
    const current = order[String(statusElement.dataset.messageStatus || "sent").toLowerCase()] || 1;
    const next = order[status] || 0;

    // Статус никогда не должен откатываться назад.
    if (next < current) return;

    statusElement.dataset.messageStatus = status;

    if (status === "read") {
        statusElement.textContent = "✓✓";
        statusElement.title = "Прочитано";
        statusElement.style.setProperty("color", "#00C853", "important");
    } else if (status === "delivered") {
        statusElement.textContent = "✓";
        statusElement.title = "Доставлено";
        statusElement.style.setProperty("color", "#00C853", "important");
    } else {
        statusElement.textContent = "✓";
        statusElement.title = "Отправлено";
        statusElement.style.setProperty("color", "#999999", "important");
    }
}

function cacheAndApplyMessageStatus(messageId, status) {
    const id = Number(messageId);
    if (!id || !status) return;

    const normalized = String(status).toLowerCase();
    if (normalized === "none") return;

    const order = { sent: 1, delivered: 2, read: 3 };
    const old = messageStatusCache.get(id);

    if ((order[normalized] || 0) < (order[old] || 0)) return;

    messageStatusCache.set(id, normalized);

    document.querySelectorAll(`[data-status-message-id="${id}"]`).forEach(element => {
        applyMessageStatus(element, normalized);
    });
}

// ===============================
// Основной Realtime сообщений
// ===============================

async function subscribeToMessages() {
    if (realtimeChannel) {
        await supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabaseClient
        .channel("messages-realtime")
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

                if (currentUser && newMessage.user_id !== currentUser.id) {
                    const { error } = await supabaseClient.rpc(
                        "mark_message_delivered",
                        { p_message_id: newMessage.id }
                    );

                    if (error) {
                        console.warn("Ошибка подтверждения доставки:", error);
                    }
                }

                if (Number(newMessage.chat_id) === Number(currentChatId)) {
                    if (currentUser && newMessage.user_id !== currentUser.id) {
                        await appendMessage(newMessage);
                    }
                } else if (currentUser && newMessage.user_id !== currentUser.id) {
                    playMessageSound(newMessage.chat_id);
                }

                if (currentUser && newMessage.user_id !== currentUser.id) {
                    await updateUnreadCount(newMessage.chat_id);
                }

                await updateChatListMessageStatus(newMessage.chat_id);

                // Новое сообщение делает личный/групповой чат самым свежим.
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
        .subscribe();

    // Каналы статусов подключаем только после успешной инициализации
    // пользователя. Раньше они создавались на уровне файла, ещё до startChat().
    subscribeToMessageDeliveries();
    subscribeToMessageReads();

    startMessageStatusRefresh();
}

// ===============================
// Проверка статусов наших сообщений
// ===============================

async function refreshOwnMessageStatuses() {
    if (!currentUser || !supabaseClient) return;

    const chatId = Number(currentChatId || window.currentChatId || 0);
    if (!chatId) return;

    // Проверяем только открытый чат. Не опрашиваем всю историю пользователя.
    const { data: messages, error } = await supabaseClient
        .from("messages")
        .select("id")
        .eq("user_id", currentUser.id)
        .eq("chat_id", chatId)
        .order("id", { ascending: false })
        .limit(20);

    if (error || !messages?.length) return;

    for (const message of messages) {
        const id = Number(message.id);
        if (!id) continue;

        // Если сообщение уже прочитано, дополнительный RPC не нужен.
        if (messageStatusCache.get(id) === "read") continue;

        const { data: status, error: statusError } = await supabaseClient.rpc(
            "get_message_status",
            { p_message_id: id }
        );

        if (!statusError && status) {
            cacheAndApplyMessageStatus(id, status);
        }
    }
}

function startMessageStatusRefresh() {
    if (messageStatusRefreshTimer) {
        clearInterval(messageStatusRefreshTimer);
    }

    // 500 мс давало чрезмерное количество запросов: до десятков RPC
    // в секунду на одном открытом чате. Для статусов достаточно 3 секунд;
    // Realtime при этом остаётся основным каналом обновления.
    messageStatusRefreshTimer = setInterval(() => {
        refreshOwnMessageStatuses().catch(error => {
            console.warn("Ошибка фоновой проверки статусов:", error);
        });
    }, 3000);
}

// ===============================
// Realtime доставки
// ===============================

function subscribeToMessageDeliveries() {
    if (messageDeliveriesChannel) {
        supabaseClient.removeChannel(messageDeliveriesChannel);
    }

    messageDeliveriesChannel = supabaseClient
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

// ===============================
// Realtime прочтения
// ===============================

function subscribeToMessageReads() {
    if (messageReadsChannel) {
        supabaseClient.removeChannel(messageReadsChannel);
    }

    messageReadsChannel = supabaseClient
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
                if (!readInfo || !currentUser) return;
                if (readInfo.user_id === currentUser.id) return;

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
