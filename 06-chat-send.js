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

    // =================================
    // Получаем имя пользователя
    // =================================

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

    const chatId =
        currentChatId;

    const replyTo =
        replyMessageId;

    // =================================
    // Временное сообщение
    // =================================

    const temporaryId =
        `sending-${Date.now()}`;

    const box =
        document.getElementById(
            "messages"
        );

    let temporaryMessage =
        null;

    if (box) {

        temporaryMessage =
            document.createElement(
                "div"
            );

        temporaryMessage.className =
            "message";

        temporaryMessage.dataset.messageId =
            temporaryId;

        temporaryMessage.innerHTML = `

            <div>

                <span class="message-user">
                    ${senderName}
                </span>

                <span class="message-time">
                    ${new Date().toLocaleDateString(
                        "ru-RU"
                    )}
                    ${new Date().toLocaleTimeString(
                        "ru-RU",
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    )}
                </span>

                <span
                    class="message-status"
                    style="
                        margin-left:6px;
                        font-size:13px;
                        font-weight:bold;
                        white-space:nowrap;
                        color:#999999;
                    "
                    title="Отправляется"
                >
                    ⟳
                </span>

            </div>

            <div class="message-text">
                ${text}
            </div>

        `;

        box.appendChild(
            temporaryMessage
        );

        box.scrollTop =
            box.scrollHeight;

    }

    // =================================
    // Записываем сообщение
    // =================================

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

    // =================================
    // Ошибка
    // =================================

    if (error) {

        console.log(
            "Ошибка отправки сообщения:",
            error
        );

        if (temporaryMessage) {

            const status =
                temporaryMessage.querySelector(
                    ".message-status"
                );

            if (status) {

                status.textContent =
                    "!";

                status.title =
                    "Ошибка отправки";

                status.style.color =
                    "#d32f2f";

            }

        }

        return;

    }

    // =================================
    // Успешно отправлено
    // =================================

    if (temporaryMessage) {

        temporaryMessage.remove();

    }

    input.value = "";

    // =================================
    // Настоящее сообщение
    // ВАЖНО: сначала рисуем его как
    // отправленное (серая ✓), и только
    // после этого фиксируем собственное
    // прочтение. Это не даёт Realtime
    // прочтения обогнать отображение.
    // =================================

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

    if (box) {

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

    // =================================
    // После успешной отправки:
    // только серая галочка
    // =================================

    const statusElement =
        document.querySelector(
            `[data-status-message-id="${data.id}"]`
        );

    if (statusElement) {

        statusElement.dataset.messageStatus =
            "sent";

        statusElement.textContent =
            "✓";

        statusElement.title =
            "Отправлено";

        statusElement.style.color =
            "#999999";

    }

    // =================================
    // Статус в списке чатов
    // =================================

    const chatStatusElement =
        document.querySelector(
            `[data-chat-status-id="${chatId}"]`
        );

    if (chatStatusElement) {

        chatStatusElement.dataset.messageStatus =
            "sent";

        chatStatusElement.textContent =
            "✓";

        chatStatusElement.title =
            "Отправлено";

        chatStatusElement.style.color =
            "#999999";

    }

    // =================================
    // Считаем своё сообщение прочитанным
    // для собственного клиента.
    // Выполняется ПОСЛЕ отображения серой ✓.
    // =================================

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
// Enter для отправки
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
