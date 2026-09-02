
// ===============================
// Отрисовка сообщения
// ===============================

function renderMessage(message) {

    if (!message || !currentUser) {
        return null;
    }

    const div =
        document.createElement("div");

    div.className = "message";

    div.dataset.messageId =
        message.id;

    div.dataset.userId =
        message.user_id;

    const username =
        message.profiles?.username ||
        "Пользователь";

    const date =
        new Date(message.created_at);

    const dateText =
        date.toLocaleDateString("ru-RU");

    const timeText =
        date.toLocaleTimeString(
            "ru-RU",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    const messageStatus =
        message.user_id === currentUser.id
            ?
            `
            <span
                class="message-status"
                data-status-message-id="${message.id}"
                style="
                    margin-left:6px;
                    font-size:13px;
                    font-weight:bold;
                    white-space:nowrap;
                    color:#999999;
                "
                title="Отправлено"
            >
                ✓
            </span>
            `
            :
            "";

    div.innerHTML = `

        <div>

            <span class="message-user">
                ${username}
            </span>

            <span class="message-time">
                ${dateText} ${timeText}
            </span>

            ${messageStatus}

        </div>

        ${
            message.reply_message
            ?
            `
            <div style="
                background:#eeeeee;
                padding:8px;
                border-left:4px solid #8E44AD;
                border-radius:6px;
                margin-bottom:8px;
                font-size:14px;
                overflow-wrap:anywhere;
                word-break:break-word;
            ">

                ↩ ${
                    message.reply_message
                    .profiles
                    ?.username ||
                    "Пользователь"
                }

                <br>

                ${
                    message.reply_message.text
                }

            </div>
            `
            :
            ""
        }

        <div class="message-text">
            ${message.text}
        </div>

        <button
            onclick='replyToMessage(
                ${message.id},
                ${JSON.stringify(username)},
                ${JSON.stringify(message.text)}
            )'
            style="
                margin-top:8px;
                padding:4px 10px;
                border:none;
                border-radius:8px;
                background:#8E44AD;
                color:white;
                cursor:pointer;
            "
        >
            ↩ Ответить
        </button>

    `;

    return div;
}



// ===============================
// Получение статуса сообщения
// ===============================

async function updateMessageStatus(
    messageId,
    status = null
) {

    const statusElement =
        document.querySelector(
            `[data-status-message-id="${messageId}"]`
        );

    if (!statusElement) {
        return;
    }


    // Если статус не передан —
    // получаем его из Supabase

    if (status === null) {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "get_message_status",
            {
                p_message_id:
                    messageId
            }
        );


        if (error) {

            console.log(
                "Ошибка получения статуса сообщения:",
                error
            );

            return;
        }


        status = data;
    }


    // ===============================
    // Отправлено
    // ===============================

    if (status === "sent") {

        statusElement.textContent =
            "✓";

        statusElement.title =
            "Отправлено";

        statusElement.style.color =
            "#999999";

        return;
    }


    // ===============================
    // Доставлено
    // ===============================

    if (status === "delivered") {

        statusElement.textContent =
            "✓✓";

        statusElement.title =
            "Доставлено";

        statusElement.style.color =
            "#999999";

        return;
    }


    // ===============================
    // Прочитано
    // ===============================

    if (status === "read") {

        statusElement.textContent =
            "✓✓";

        statusElement.title =
            "Прочитано";

        statusElement.style.color =
            "#2196F3";

        return;
    }

}



// ===============================
// Статус последнего сообщения
// в списке чатов
// ===============================

async function updateChatListMessageStatus(
    chatId
) {

    if (!currentUser) {
        return;
    }


    const statusElement =
        document.querySelector(
            `[data-chat-status-id="${chatId}"]`
        );


    if (!statusElement) {
        return;
    }


    const {
        data: messages,
        error
    } = await supabaseClient
        .from("messages")
        .select("id")
        .eq("chat_id", chatId)
        .eq("user_id", currentUser.id)
        .order("id", {
            ascending: false
        })
        .limit(1);


    if (error) {

        console.log(
            "Ошибка поиска последнего сообщения:",
            error
        );

        return;
    }


    if (
        !messages ||
        !messages.length
    ) {

        statusElement.textContent =
            "";

        return;
    }


    const messageId =
        messages[0].id;


    const {
        data: status,
        error: statusError
    } = await supabaseClient.rpc(
        "get_message_status",
        {
            p_message_id:
                messageId
        }
    );


    if (statusError) {

        console.log(
            "Ошибка получения статуса:",
            statusError
        );

        return;
    }


    if (status === "sent") {

        statusElement.textContent =
            "✓";

        statusElement.title =
            "Отправлено";

        statusElement.style.color =
            "#999999";

    }

    else if (
        status === "delivered"
    ) {

        statusElement.textContent =
            "✓✓";

        statusElement.title =
            "Доставлено";

        statusElement.style.color =
            "#999999";

    }

    else if (
        status === "read"
    ) {

        statusElement.textContent =
            "✓✓";

        statusElement.title =
            "Прочитано";

        statusElement.style.color =
            "#2196F3";

    }

    else {

        statusElement.textContent =
            "";

    }

}

