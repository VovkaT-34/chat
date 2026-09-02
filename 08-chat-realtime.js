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

                // =================================
                // Доставка самого сообщения
                // должна принадлежать другому
                // пользователю
                // =================================

                if (
                    delivery.user_id ===
                    currentUser.id
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

                // =================================
                // Нас интересуют только наши
                // сообщения
                // =================================

                if (
                    message.user_id !==
                    currentUser.id
                ) {

                    return;

                }

                // =================================
                // Доставлено
                // =================================

                const statusElement =
                    document.querySelector(
                        `[data-status-message-id="${messageId}"]`
                    );

                if (statusElement) {

                    const currentStatus =
                        statusElement.dataset.messageStatus ||
                        "sent";

                    if (
                        currentStatus !==
                        "read"
                    ) {

                        statusElement.dataset.messageStatus =
                            "delivered";

                        statusElement.textContent =
                            "✓";

                        statusElement.title =
                            "Доставлено";

                        statusElement.style.color =
                            "#00C853";

                    }

                }

                // =================================
                // Статус в списке чатов
                // =================================

                const chatStatusElement =
                    document.querySelector(
                        `[data-chat-status-id="${message.chat_id}"]`
                    );

                if (chatStatusElement) {

                    const currentStatus =
                        chatStatusElement.dataset.messageStatus ||
                        "sent";

                    if (
                        currentStatus !==
                        "read"
                    ) {

                        chatStatusElement.dataset.messageStatus =
                            "delivered";

                        chatStatusElement.textContent =
                            "✓";

                        chatStatusElement.title =
                            "Доставлено";

                        chatStatusElement.style.color =
                            "#00C853";

                    }

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

                // =================================
                // Собственное прочтение игнорируем
                // =================================

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

                // =================================
                // Получаем наши сообщения,
                // которые действительно находятся
                // до позиции прочтения
                // =================================

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

                // =================================
                // Только здесь ставим ✓✓
                // =================================

                ownMessages.forEach(
                    message => {

                        const statusElement =
                            document.querySelector(
                                `[data-status-message-id="${message.id}"]`
                            );

                        if (!statusElement) {
                            return;
                        }

                        const currentStatus =
                            statusElement.dataset.messageStatus ||
                            "sent";

                        if (
                            currentStatus ===
                            "read"
                        ) {

                            return;

                        }

                        statusElement.dataset.messageStatus =
                            "read";

                        statusElement.textContent =
                            "✓✓";

                        statusElement.title =
                            "Прочитано";

                        statusElement.style.color =
                            "#00C853";

                    }
                );

                // =================================
                // Список чатов
                // =================================

                const chatStatusElement =
                    document.querySelector(
                        `[data-chat-status-id="${chatId}"]`
                    );

                if (chatStatusElement) {

                    const currentStatus =
                        chatStatusElement.dataset.messageStatus ||
                        "sent";

                    if (
                        currentStatus !==
                        "read"
                    ) {

                        chatStatusElement.dataset.messageStatus =
                            "read";

                        chatStatusElement.textContent =
                            "✓✓";

                        chatStatusElement.title =
                            "Прочитано";

                        chatStatusElement.style.color =
                            "#00C853";

                    }

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
