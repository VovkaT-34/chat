// ===============================
// Отрисовка сообщения
// ===============================

function renderMessage(message) {

    if (
        !message ||
        !currentUser
    ) {

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
        new Date(
            message.created_at
        );


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
        message.user_id ===
        currentUser.id
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
                title="Доставлено"
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
                    message
                    .reply_message
                    .profiles
                    ?.username ||
                    "Пользователь"
                }

                <br>

                ${
                    message
                    .reply_message
                    .text
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


    if (
        message.user_id ===
        currentUser.id
    ) {

        setTimeout(
            () => {

                updateMessageStatus(
                    message.id
                );

            },
            0
        );

    }


    return div;

}



// ===============================
// Обновление статуса сообщения
// ===============================

async function updateMessageStatus(messageId) {

    const statusElement =
        document.querySelector(
            `[data-status-message-id="${messageId}"]`
        );


    if (!statusElement) {

        return;

    }


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
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


    let status =
        data;


    if (
        Array.isArray(data)
    ) {

        status =
            data[0];

    }


    if (
        status &&
        typeof status === "object"
    ) {

        if (
            status.read === true ||
            status.is_read === true
        ) {

            status =
                "read";

        }

        else if (
            status.delivered === true ||
            status.is_delivered === true
        ) {

            status =
                "delivered";

        }

    }


    if (
        status === "read"
    ) {

        statusElement.textContent =
            "✓✓";

        statusElement.style.color =
            "#00c853";

        statusElement.title =
            "Прочитано";

        return;

    }


    if (
        status === "delivered"
    ) {

        statusElement.textContent =
            "✓";

        statusElement.style.color =
            "#999999";

        statusElement.title =
            "Доставлено";

        return;

    }


    statusElement.textContent =
        "✓";

    statusElement.style.color =
        "#999999";

    statusElement.title =
        "Доставлено";

}
