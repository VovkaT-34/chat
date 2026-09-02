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

                    // ===============================
                    // Статус в списке чатов
                    // ===============================
                    // После нового сообщения обязательно
                    // пересчитываем статус по самому последнему
                    // сообщению чата. Если новое сообщение чужое,
                    // старые наши ✓/✓✓ больше не переносятся сюда.

                    await updateChatListMessageStatus(
                        newMessage.chat_id
                    );

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

    // Статусы строк списка чатов обновляем только через
    // updateChatListMessageStatus(). Эта функция сначала
    // проверяет, какое сообщение действительно является
    // последним в чате, и не использует старое наше сообщение,
    // если после него уже пришло новое чужое.
    const chatIds = new Set();

    for (const message of messages) {

        const statusElement =
            document.querySelector(
                `[data-status-message-id="${message.id}"]`
            );

        if (statusElement) {

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
                !statusError &&
                status
            ) {

                applyMessageStatus(
                    statusElement,
                    status
                );

            }

        }

        chatIds.add(
            Number(message.chat_id)
        );

    }

    for (const chatId of chatIds) {

        if (chatId) {

            await updateChatListMessageStatus(
                chatId
            );

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

                // Пересчитываем строку чата по фактически
                // последнему сообщению, а не напрямую по
                // доставленному сообщению. Само сообщение
                // уровня чата не трогаем иначе.
                await updateChatListMessageStatus(
                    message.chat_id
                );

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

                // Статус в списке чатов определяем заново по
                // последнему сообщению чата. Поэтому прочтение
                // старого сообщения не сможет превратить строку
                // чата в ✓✓, если последним уже является другое
                // сообщение.
                await updateChatListMessageStatus(
                    chatId
                );

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
