// ===============================
// Загрузка сообщений
// ===============================

async function loadMessages() {

    if (
        !currentChatId ||
        !currentUser
    ) {

        return;

    }


    const {
        data: readInfo,
        error: readError
    } = await supabaseClient

        .from("user_chat_reads")

        .select(
            "last_read_message_id"
        )

        .eq(
            "user_id",
            currentUser.id
        )

        .eq(
            "chat_id",
            currentChatId
        )

        .maybeSingle();


    if (readError) {

        console.log(readError);

    }


    const lastReadId =
        Number(
            readInfo?.last_read_message_id || 0
        );


    localLastReadMessageId =
        lastReadId;


    // =================================
    // Проверяем, есть ли непрочитанные
    // сообщения после последнего
    // прочитанного.
    // =================================

    const {
        data: unreadCheck,
        error: unreadCheckError
    } = await supabaseClient

        .from("messages")

        .select(
            "id"
        )

        .eq(
            "chat_id",
            currentChatId
        )

        .gt(
            "id",
            lastReadId
        )

        .neq(
            "user_id",
            currentUser.id
        )

        .order(
            "id",
            {
                ascending: true
            }
        )

        .limit(1);


    if (unreadCheckError) {

        console.log(
            "Ошибка проверки непрочитанных:",
            unreadCheckError
        );

        return;

    }


    const hasUnread =
        Array.isArray(unreadCheck) &&
        unreadCheck.length > 0;


    // =================================
    // Загружаем только необходимое
    // =================================

    let query =
        supabaseClient

            .from("messages")

            .select(`

                id,
                user_id,
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

            .eq(
                "chat_id",
                currentChatId
            );


    if (hasUnread) {

        // Загружаем только непрочитанные.

        query =
            query

                .gt(
                    "id",
                    lastReadId
                )

                .order(
                    "created_at",
                    {
                        ascending: true
                    }
                );

    }

    else {

        // Все старые сообщения уже прочитаны.
        // Поэтому загружаем только последнее.

        query =
            query

                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )

                .limit(1);

    }


    const {
        data,
        error
    } = await query;


    if (error) {

        console.log(
            "Ошибка загрузки сообщений:",
            error
        );

        return;

    }


    if (!Array.isArray(data)) {

        return;

    }


    // При запросе последнего сообщения
    // оно пришло в обратном порядке.

    if (!hasUnread) {

        data.reverse();

    }


    const box =
        document.getElementById(
            "messages"
        );


    if (!box) {

        return;

    }


    box.innerHTML = "";


    // =================================
    // Добавляем сообщения
    // =================================

    let unreadDividerAdded =
        false;


    data.forEach(message => {

        let unreadDivider = "";


        if (
            hasUnread &&
            message.user_id !== currentUser.id &&
            !unreadDividerAdded
        ) {

            unreadDividerAdded = true;


            unreadDivider = `

                <div class="unread-divider">

                    ───────── Непрочитанные сообщения ─────────

                </div>

            `;

        }


        const div =
            renderMessage(
                message
            );


        if (!div) {

            return;

        }


        if (unreadDivider) {

            div.insertAdjacentHTML(
                "afterbegin",
                unreadDivider
            );

        }


        box.appendChild(
            div
        );

    });


    // =================================
    // Позиция после загрузки
    // =================================

    const divider =
        box.querySelector(
            ".unread-divider"
        );


    if (divider) {

        divider.scrollIntoView({

            behavior: "instant",

            block: "start"

        });

    }

    else {

        box.scrollTop =
            box.scrollHeight;

    }


    // =================================
    // Проверяем статус последнего
    // загруженного собственного
    // сообщения
    // =================================

    const ownMessages =
        data.filter(
            message =>
                message.user_id ===
                currentUser.id
        );


    const lastOwnMessage =
        ownMessages[
            ownMessages.length - 1
        ];


    if (lastOwnMessage) {

        updateMessageStatus(
            lastOwnMessage.id
        );

    }

}



// ===============================
// Обновление статуса сообщения
// ===============================

async function updateMessageStatus(
    messageId
) {

    if (
        !currentUser ||
        !messageId
    ) {

        return;

    }


    const status =
        document.querySelector(
            `[data-status-message-id="${messageId}"]`
        );


    if (!status) {

        return;

    }


    // =================================
    // Проверяем доставку
    // =================================

    const {
        data: deliveryData,
        error: deliveryError
    } = await supabaseClient

        .from("message_deliveries")

        .select(
            "id"
        )

        .eq(
            "message_id",
            messageId
        )

        .neq(
            "user_id",
            currentUser.id
        )

        .limit(1);


    if (deliveryError) {

        console.log(
            "Ошибка проверки доставки:",
            deliveryError
        );

        return;

    }


    const delivered =
        Array.isArray(deliveryData) &&
        deliveryData.length > 0;


    if (delivered) {

        status.textContent =
            "✓";

        status.style.color =
            "#39a852";

        status.title =
            "Доставлено";

    }

    else {

        status.textContent =
            "✓";

        status.style.color =
            "#999999";

        status.title =
            "Отправлено";

    }

}



// ===============================
// Добавление нового сообщения
// ===============================

async function appendMessage(message) {

    const box =
        document.getElementById(
            "messages"
        );


    if (!box) {

        return;

    }


    // Не добавляем сообщение второй раз.

    if (
        box.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {

        return;

    }


    // =================================
    // Получаем полное сообщение
    // =================================

    const {
        data: fullMessage,
        error
    } = await supabaseClient

        .from("messages")

        .select(`

            id,
            user_id,
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

        .eq(
            "id",
            message.id
        )

        .single();


    if (error) {

        console.log(
            "Ошибка загрузки полного сообщения:",
            error
        );

        return;

    }


    if (!fullMessage) {

        return;

    }


    // =================================
    // Отрисовываем через 14-й файл
    // =================================

    const div =
        renderMessage(
            fullMessage
        );


    if (!div) {

        return;

    }


    box.appendChild(
        div
    );


// =================================
// Сохраняем позицию пользователя
// =================================

const wasNearBottom =
    isMessagesBoxNearBottom();


if (wasNearBottom) {

    box.scrollTop =
        box.scrollHeight;

}


// =================================
// Обновляем кнопку перехода вниз
// =================================

updateScrollToBottomButton();


    // =================================
    // Если сообщение наше —
    // проверяем его статус
    // =================================

    if (
        fullMessage.user_id ===
        currentUser.id
    ) {

        updateMessageStatus(
            fullMessage.id
        );

    }

}
