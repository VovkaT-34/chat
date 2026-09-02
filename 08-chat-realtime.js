```js
// ===============================
// Realtime сообщений
// ===============================

async function subscribeToMessages() {

    if (realtimeChannel) {

        await supabaseClient
            .removeChannel(
                realtimeChannel
            );

    }

    realtimeChannel =
        supabaseClient
            .channel(
                "messages-realtime"
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages"
                },
                async payload => {

                    const newMessage =
                        payload.new;

                    if (!newMessage) {
                        return;
                    }

                    // ===============================
                    // Подтверждаем доставку
                    // ===============================

                    if (
                        currentUser &&
                        newMessage.user_id !==
                        currentUser.id
                    ) {

                        const {
                            error:
                                deliveryError
                        } =
                            await supabaseClient.rpc(
                                "mark_message_delivered",
                                {
                                    p_message_id:
                                        newMessage.id
                                }
                            );

                        if (deliveryError) {

                            console.log(
                                "Ошибка подтверждения доставки:",
                                deliveryError
                            );

                        }

                    }

                    // ===============================
                    // Текущий чат
                    // ===============================

                    if (
                        Number(newMessage.chat_id) ===
                        Number(currentChatId)
                    ) {

                        if (
                            currentUser &&
                            newMessage.user_id !==
                            currentUser.id
                        ) {

                            await appendMessage(
                                newMessage
                            );

                        }

                    }

                    // ===============================
                    // Другой чат
                    // ===============================

                    else {

                        if (
                            currentUser &&
                            newMessage.user_id !==
                            currentUser.id
                        ) {

                            playMessageSound(
                                newMessage.chat_id
                            );

                        }

                    }

                    // ===============================
                    // Непрочитанные
                    // ===============================

                    if (
                        currentUser &&
                        newMessage.user_id !==
                        currentUser.id
                    ) {

                        await updateUnreadCount(
                            newMessage.chat_id
                        );

                    }

                }
            )
            .subscribe();

}

// ===============================
// Безопасное применение статуса
// ===============================

function applyMessageStatus(
    statusElement,
    status
) {

    if (
        !statusElement ||
        !status
    ) {
        return;
    }

    const statusOrder = {
        sent: 1,
        delivered: 2,
        read: 3
    };

    const currentStatus =
        statusElement.dataset.messageStatus ||
        "sent";

    const currentOrder =
        statusOrder[currentStatus] ||
        1;

    const newOrder =
        statusOrder[status] ||
        0;

    if (
        newOrder <
        currentOrder
    ) {
        return;
    }

    statusElement.dataset.messageStatus =
        status;

    if (status === "sent") {

        statusElement.textContent =
            "✓";

        statusElement.title =
            "Отправлено";

        statusElement.style.color =
            "#999999";

        return;
    }

    if (status === "delivered") {

        statusElement.textContent =
            "✓";

        statusElement.title =
            "Доставлено";

        statusElement.style.color =
            "#00C853";

        return;
    }

    if (status === "read") {

        statusElement.textContent =
            "✓✓";

        statusElement.title =
            "Прочитано";

        statusElement.style.color =
            "#00C853";
    }
}

// ===============================
// Проверка статуса наших сообщений
// ===============================

async function refreshOwnMessageStatuses() {

    if (!currentUser) {
        return;
    }

    const {
        data: messages,
        error
    } = await supabaseClient
        .from("messages")
        .select(
            "id, chat_id"
        )
        .eq(
            "user_id",
            currentUser.id
        )
        .order(
            "id",
            {
                ascending: false
            }
        )
        .limit(50);

    if (
        error ||
        !messages ||
        !messages.length
    ) {
        return;
    }

    for (const message of messages) {

        const statusElement =
            document.querySelector(
                `[data-status-message-id="${message.id}"]`
            );

        const chatStatusElement =
            document.querySelector(
                `[data-chat-status-id="${message.chat_id}"]`
            );

        if (
            !statusElement &&
            !chatStatusElement
        ) {
            continue;
        }

        const {
            data: status,
            error: statusError
        } = await supabaseClient.rpc(
            "get_message_status",
            {
                p_message_id:
                    message.id
            }
        );

        if (
            statusError ||
            !status
        ) {
            continue;
        }

        if (statusElement) {

            applyMessageStatus(
                statusElement,
                status
            );

        }

        if (chatStatusElement) {

            const currentStatus =
                chatStatusElement.dataset.messageStatus ||
                "sent";

            const statusOrder = {
                sent: 1,
                delivered: 2,
                read: 3
            };

            const currentOrder =
                statusOrder[currentStatus] ||
                1;

            const newOrder =
                statusOrder[status] ||
                0;

            if (
                newOrder >=
                currentOrder
            ) {

                chatStatusElement.dataset.messageStatus =
                    status;

                if (
                    status === "sent"
                ) {

                    chatStatusElement.textContent =
                        "✓";

                    chatStatusElement.title =
                        "Отправлено";

                    chatStatusElement.style.color =
                        "#999999";

                }

                if (
                    status === "delivered"
                ) {

                    chatStatusElement.textContent =
                        "✓";

                    chatStatusElement.title =
                        "Доставлено";

                    chatStatusElement.style.color =
                        "#00C853";

                }

                if (
                    status === "read"
                ) {

                    chatStatusElement.textContent =
                        "✓✓";

                    chatStatusElement.title =
                        "Прочитано";

                    chatStatusElement.style.color =
                        "#00C853";

                }

            }

        }

    }

}

// ===============================
// Realtime доставки сообщений
// ===============================

function subscribeToMessageDeliveries() {

    supabaseClient
        .channel(
            "message-deliveries-realtime"
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "message_deliveries"
            },
            async payload => {

                const delivery =
                    payload.new;

                if (
                    !delivery ||
                    !currentUser
                ) {
                    return;
                }

                const messageId =
                    Number(
                        delivery.message_id
                    );

                if (!messageId) {
                    return;
                }

                const {
                    data: message,
                    error
                } = await supabaseClient
                    .from("messages")
                    .select(
                        "id, user_id, chat_id"
                    )
                    .eq(
                        "id",
                        messageId
                    )
                    .maybeSingle();

                if (
                    error ||
                    !message
                ) {
                    return;
                }

                if (
                    message.user_id !==
                    currentUser.id
                ) {
                    return;
                }

                const statusElement =
                    document.querySelector(
                        `[data-status-message-id="${messageId}"]`
                    );

                if (statusElement) {

                    applyMessageStatus(
                        statusElement,
                        "delivered"
                    );

                }

                const chatStatusElement =
                    document.querySelector(
                        `[data-chat-status-id="${message.chat_id}"]`
                    );

                if (chatStatusElement) {

                    applyMessageStatus(
                        chatStatusElement,
                        "delivered"
                    );

                }

            }
        )
        .subscribe();

}

// ===============================
// Realtime прочтения сообщений
// ===============================

function subscribeToMessageReads() {

    supabaseClient
        .channel(
            "user-chat-reads-realtime"
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "user_chat_reads"
            },
            async payload => {

                const readInfo =
                    payload.new;

                if (
                    !readInfo ||
                    !currentUser
                ) {
                    return;
                }

                if (
                    readInfo.user_id ===
                    currentUser.id
                ) {
                    return;
                }

                const chatId =
                    Number(
                        readInfo.chat_id
                    );

                const lastReadMessageId =
                    Number(
                        readInfo.last_read_message_id
                    );

                if (
                    !chatId ||
                    !lastReadMessageId
                ) {
                    return;
                }

                const {
                    data: ownMessages,
                    error
                } = await supabaseClient
                    .from("messages")
                    .select("id")
                    .eq(
                        "chat_id",
                        chatId
                    )
                    .eq(
                        "user_id",
                        currentUser.id
                    )
                    .lte(
                        "id",
                        lastReadMessageId
                    );

                if (
                    error ||
                    !ownMessages ||
                    !ownMessages.length
                ) {
                    return;
                }

                ownMessages.forEach(
                    message => {

                        const statusElement =
                            document.querySelector(
                                `[data-status-message-id="${message.id}"]`
                            );

                        if (!statusElement) {
                            return;
                        }

                        applyMessageStatus(
                            statusElement,
                            "read"
                        );

                    }
                );

                const chatStatusElement =
                    document.querySelector(
                        `[data-chat-status-id="${chatId}"]`
                    );

                if (chatStatusElement) {

                    applyMessageStatus(
                        chatStatusElement,
                        "read"
                    );

                }

            }
        )
        .subscribe();

}

// ===============================
// Запуск Realtime
// ===============================

subscribeToMessageDeliveries();
subscribeToMessageReads();


// ===============================
// Периодическая проверка статусов
// ===============================

setInterval(
    () => {

        refreshOwnMessageStatuses();

    },
    1000
);
```
