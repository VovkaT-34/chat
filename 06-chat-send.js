// ===============================
// Отправка сообщения
// ===============================

async function sendMessage() {

    const input =
        document.getElementById(
            "messageInput"
        );


    if (!input) return;


    const text =
        input.value.trim();


    if (
        !text ||
        !currentChatId ||
        !currentUser
    ) {

        return;

    }


    // Если имя пользователя ещё не загрузилось,
    // получаем его непосредственно перед отправкой.

    if (
        !currentUsername ||
        currentUsername === "Пользователь"
    ) {

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", currentUser.id)
            .single();


        if (
            !profileError &&
            profile?.username
        ) {

            currentUsername =
                profile.username;

        }

    }


    let senderName =
        currentUsername;


    if (
        !senderName ||
        senderName === "Пользователь"
    ) {

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", currentUser.id)
            .single();


        if (
            !profileError &&
            profile?.username
        ) {

            senderName =
                profile.username;

            currentUsername =
                profile.username;

        }

    }


    console.log(
        "Имя перед отправкой:",
        senderName
    );


    const chatId =
        currentChatId;


    const replyTo =
        replyMessageId;


    const {
        data,
        error
    } = await supabaseClient

        .from("messages")

        .insert({

            chat_id:
                chatId,

            user_id:
                currentUser.id,

            text:
                text,

            reply_to:
                replyTo

        })

        .select(`

            id,
            text,
            created_at,
            reply_to,

            profiles (
                username
            ),

            reply_message:reply_to (
                text,

                profiles (
                    username
                )
            )

        `)

        .single();


    if (error) {

        console.log(
            "Ошибка отправки сообщения:",
            error
        );

        return;

    }


    // Очищаем поле сразу после успешной отправки.

    input.value = "";


    // Собственное отправленное сообщение
    // сразу считаем прочитанным.

    const {
        error: ownReadError
    } = await supabaseClient

        .from("user_chat_reads")

        .upsert(

            {

                user_id:
                    currentUser.id,

                chat_id:
                    chatId,

                last_read_message_id:
                    data.id

            },

            {

                onConflict:
                    "user_id,chat_id"

            }

        );


    if (ownReadError) {

        console.log(
            "Ошибка отметки собственного сообщения:",
            ownReadError
        );

    }


    replyMessageId =
        null;


    const replyBox =
        document.getElementById(
            "replyBox"
        );


    if (replyBox) {

        replyBox.style.display =
            "none";

    }


    input.placeholder =
        "Введите сообщение...";


    // =================================
    // Сразу добавляем своё сообщение
    // через общий рендерер 14-го файла
    // =================================

    const box =
        document.getElementById(
            "messages"
        );


    if (
        box &&
        data
    ) {

        const messageForRender = {

            id:
                data.id,

            user_id:
                currentUser.id,

            text:
                data.text,

            created_at:
                data.created_at,

            reply_to:
                data.reply_to,

            profiles: {

                username:
                    senderName

            },

            reply_message:
                data.reply_message

        };


        const div =
            renderMessage(
                messageForRender
            );


        if (div) {

            box.appendChild(
                div
            );


            box.scrollTop =
                box.scrollHeight;

        }

    }


    // Если Realtime сработает —
    // он обновит чат самостоятельно.
    //
    // Поэтому здесь специально
    // НЕ вызываем loadMessages().

}



// ===============================
// Кнопка отправки
// ===============================

const sendButton =
    document.getElementById(
        "sendButton"
    );


if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );

}



// ===============================
// Enter для отправки сообщения
// ===============================

const messageInput =
    document.getElementById(
        "messageInput"
    );


if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();

            }

        }
    );

}



// ===============================
// Статус "печатает..."
// ===============================

if (messageInput) {

    messageInput.addEventListener(
        "input",
        () => {

            sendTypingStatus();

        }
    );

}
