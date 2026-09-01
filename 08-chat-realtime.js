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


                    // =================================
                    // Подтверждаем доставку сообщения
                    // =================================

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


                    // =================================
                    // Новое сообщение в открытом чате
                    // =================================

                    if (
                        Number(newMessage.chat_id) ===
                        Number(currentChatId)
                    ) {

                        if (
                            currentUser &&
                            newMessage.user_id !==
                            currentUser.id
                        ) {

                            appendMessage(
                                newMessage
                            );

                            markChatAsRead();

                        }

                    }


                    // =================================
                    // Сообщение в другом чате
                    // =================================

                    else {

                        // Свой звук не воспроизводим.

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


                    // =================================
                    // Обновляем счётчик конкретного чата
                    // =================================

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
