
// ===============================
// Звук нового сообщения
// ===============================

function playMessageSound() {

    const sound =
        document.getElementById(
            "messageSound"
        );


    if (!sound) {
        return;
    }


    sound.currentTime = 0;


    sound.play()

        .catch(
            error => {

                console.log(
                    "Звук не воспроизведён:",
                    error
                );

            }
        );

}


// ===============================
// Получение количества непрочитанных
// ===============================

async function getUnreadCount(chatId) {

    if (!currentUser) {
        return 0;
    }


    const {
        data,
        error
    } = await supabaseClient.rpc(

        "get_unread_messages_count",

        {

            p_user_id:
                currentUser.id,

            p_chat_id:
                chatId

        }

    );


    if (error) {

        console.log(
            "Ошибка получения непрочитанных:",
            error
        );

        return 0;

    }


    return Number(data) || 0;

}



// ===============================
// Обновление счётчика
// ===============================

async function updateUnreadCount(chatId) {

    if (!currentUser) {
        return;
    }


    clearTimeout(
        unreadCountTimers[chatId]
    );


    unreadCountTimers[chatId] =
        setTimeout(
            async () => {

                const count =
                    await getUnreadCount(
                        chatId
                    );


                const badge =
                    document.getElementById(
                        `count-${chatId}`
                    );


                if (!badge) {
                    return;
                }


                if (count > 0) {

                    badge.textContent =
                        count;

                    badge.style.display =
                        "inline-block";

                }

                else {

                    badge.textContent =
                        "";

                    badge.style.display =
                        "none";

                }

            },
            100
        );

}

