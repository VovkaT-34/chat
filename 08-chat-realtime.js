
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
// Автоматическое обновление
// статусов сообщений
// ===============================

let messageStatusTimer =
    null;


function startMessageStatusUpdates() {

    if (messageStatusTimer) {

        clearInterval(
            messageStatusTimer
        );

    }


    messageStatusTimer =
        setInterval(
            async () => {

                if (
                    !currentUser ||
                    !currentChatId
                ) {

                    return;

                }


                const messageElements =
                    document.querySelectorAll(
                        "#messages .message"
                    );


                for (
                    const messageElement
                    of messageElements
                ) {

                    const messageId =
                        Number(
                            messageElement.dataset.messageId
                        );


                    if (!messageId) {
                        continue;
                    }


                    const userId =
                        messageElement.dataset.userId;


                    if (
                        userId ===
                        currentUser.id
                    ) {

                        await updateMessageStatus(
                            messageId
                        );

                    }

                }


                await updateChatListMessageStatus(
                    currentChatId
                );

            },
            1500
        );

}



// ===============================
// Запускаем обновление статусов
// ===============================

startMessageStatusUpdates();

