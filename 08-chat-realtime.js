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


                // Обновляем статус только
                // владельца сообщения.

                if (
                    message.user_id !==
                    currentUser.id
                ) {

                    return;

                }


                await updateMessageStatus(
                    messageId
                );


                if (
                    Number(message.chat_id) ===
                    Number(currentChatId)
                ) {

                    await updateChatListMessageStatus(
                        message.chat_id
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


                const chatId =
                    Number(
                        readInfo.chat_id
                    );


                if (!chatId) {
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
                    );


                if (
                    error ||
                    !ownMessages
                ) {

                    return;

                }


                for (
                    const message
                    of ownMessages
                ) {

                    await updateMessageStatus(
                        message.id
                    );

                }


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
