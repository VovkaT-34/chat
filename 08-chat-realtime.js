// ===============================
// Realtime сообщений
// ===============================

let messageStatusTimer = null;

// ===============================
// Обновление статусов своих сообщений
// ===============================

async function refreshOwnMessageStatuses() {

```
if (
    !currentUser ||
    !currentChatId
) {

    return;

}


const {
    data: messages,
    error
} = await supabaseClient

    .from("messages")

    .select("id")

    .eq(
        "chat_id",
        currentChatId
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


if (error) {

    console.log(
        "Ошибка загрузки статусов сообщений:",
        error
    );

    return;

}


for (
    const message of
    (messages || [])
) {

    await updateMessageStatus(
        message.id
    );

}
```

}

// ===============================
// Запуск автоматической проверки
// ===============================

function startMessageStatusUpdates() {

```
if (messageStatusTimer) {

    clearInterval(
        messageStatusTimer
    );

}


refreshOwnMessageStatuses();


messageStatusTimer =
    setInterval(
        () => {

            refreshOwnMessageStatuses();

        },
        2000
    );
```

}

// ===============================
// Realtime сообщений
// ===============================

async function subscribeToMessages() {

```
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
                // Подтверждаем доставку
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
                // Сообщение в текущем чате
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

                        await appendMessage(
                            newMessage
                        );

                    }

                }


                // =================================
                // Сообщение в другом чате
                // =================================

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


                // =================================
                // Обновляем счётчик
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


                // =================================
                // Проверяем статус своих сообщений
                // =================================

                if (
                    currentUser &&
                    newMessage.user_id !==
                    currentUser.id
                ) {

                    refreshOwnMessageStatuses();

                }

            }

        )

        .subscribe();


// =================================
// Запускаем автоматическое обновление
// =================================

startMessageStatusUpdates();
```

}
