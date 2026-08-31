
// ===============================
// Определение последнего видимого сообщения
// ===============================

function getLastVisibleMessage() {

    const box =
        document.getElementById(
            "messages"
        );


    if (!box) {
        return null;
    }


    const messages =
        box.querySelectorAll(
            ".message[data-message-id]"
        );


    if (!messages.length) {
        return null;
    }


    const boxRect =
        box.getBoundingClientRect();


    let lastVisibleMessage =
        null;


    messages.forEach(message => {

        const rect =
            message.getBoundingClientRect();


        // Сообщение считается просмотренным,
        // если его середина находится внутри
        // видимой области контейнера.

        const messageCenter =
            rect.top +
            rect.height / 2;


        if (
            messageCenter >= boxRect.top &&
            messageCenter <= boxRect.bottom
        ) {

            lastVisibleMessage =
                message;

        }

    });


    if (!lastVisibleMessage) {
        return null;
    }


    return Number(
        lastVisibleMessage.dataset.messageId
    );

}



// ===============================
// Отметка сообщений как прочитанных
// ===============================

async function markChatAsRead() {

    if (
        !currentChatId ||
        !currentUser
    ) {

        return;

    }


    const visibleMessageId =
        getLastVisibleMessage();


    if (!visibleMessageId) {

        return;

    }


    // Никогда не двигаем отметку прочтения назад.

    if (
        visibleMessageId <=
        localLastReadMessageId
    ) {

        return;

    }


    const {
        error: upsertError
    } = await supabaseClient

        .from("user_chat_reads")

        .upsert(

            {

                user_id:
                    currentUser.id,

                chat_id:
                    currentChatId,

                last_read_message_id:
                    visibleMessageId

            },

            {

                onConflict:
                    "user_id,chat_id"

            }

        );


    if (upsertError) {

        console.log(
            "Ошибка отметки прочтения:",
            upsertError
        );

        return;

    }


    // Локально сразу запоминаем новое
    // последнее прочитанное сообщение.

    localLastReadMessageId =
        visibleMessageId;


    // После успешного сохранения
    // обновляем счётчик.

    await updateUnreadCount(
        currentChatId
    );

}



// ===============================
// Отслеживание прокрутки сообщений
// ===============================

const messagesBox =
    document.getElementById(
        "messages"
    );


if (messagesBox) {

    messagesBox.addEventListener(
        "scroll",
        () => {

            clearTimeout(
                readTimer
            );


            readTimer =
                setTimeout(
                    () => {

                        markChatAsRead();

                    },
                    150
                );

        }
    );

}

