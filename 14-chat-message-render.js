// ===============================
// Отрисовка сообщения
// ===============================

function renderMessage(message) {

    if (!message || !currentUser) {
        return null;
    }

    const div =
        document.createElement("div");

    div.className =
        "message";

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
        date.toLocaleDateString(
            "ru-RU"
        );

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
                data-message-status="sent"
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
// Порядок статусов
// ===============================

function getMessageStatusOrder(
    status
) {

    const order = {
        sent: 1,
        delivered: 2,
        read: 3
    };

    return order[status] || 0;
}

// ===============================
// Применение статуса
// ===============================

function setMessageStatus(
    statusElement,
    status
) {

    if (
        !statusElement ||
        !status
    ) {
        return;
    }

    const currentStatus =
        statusElement.dataset.messageStatus ||
        "sent";

    const currentOrder =
        getMessageStatusOrder(
            currentStatus
        );

    const newOrder =
        getMessageStatusOrder(
            status
        );

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

        status =
            data;
    }

    setMessageStatus(
        statusElement,
        status
    );
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

    // Берём именно последнее сообщение чата,
    // а не последнее сообщение текущего пользователя.
    // Иначе старое наше сообщение могло давать ✓✓,
    // когда после него уже пришло новое сообщение.
    const {
        data: messages,
        error
    } = await supabaseClient
        .from("messages")
        .select("id, user_id")
        .eq(
            "chat_id",
            chatId
        )
        .order(
            "id",
            {
                ascending: false
            }
        )
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

        return;

    }

    const lastMessage =
        messages[0];

    // Если последнее сообщение отправил другой
    // пользователь, наши галочки от старого сообщения
    // в строке чата больше не показываем.
    if (
        lastMessage.user_id !==
        currentUser.id
    ) {

        statusElement.textContent =
            "";

        statusElement.title =
            "";

        delete statusElement.dataset.messageStatus;

        return;
    }

    const {
        data: status,
        error: statusError
    } = await supabaseClient.rpc(
        "get_message_status",
        {
            p_message_id:
                lastMessage.id
        }
    );

    if (statusError) {

        console.log(
            "Ошибка получения статуса:",
            statusError
        );

        return;
    }

    // Это новый статус именно последнего сообщения.
    // Не переносим сюда состояние предыдущего сообщения.
    statusElement.dataset.messageStatus =
        "sent";

    setMessageStatus(
        statusElement,
        status
    );
}
