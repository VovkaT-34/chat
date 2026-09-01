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


    const {
        data,
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
            "chat_id",
            currentChatId
        )

        .order(
            "created_at"
        );


    if (error) {

        console.log(error);

        return;

    }


    const box =
        document.getElementById(
            "messages"
        );


    if (!box) {

        return;

    }


    box.innerHTML = "";


    let unreadDividerAdded =
        false;


    data.forEach(message => {

        let unreadDivider = "";


        if (
            lastReadId &&
            message.id > lastReadId &&
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
    // Переход к непрочитанным
    // только после первоначальной загрузки
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
    // Обновляем статус последнего
    // собственного сообщения
    // =================================

    const ownMessages =
        (data || []).filter(
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


    // =================================
    // Не добавляем сообщение повторно
    // =================================

    if (
        box.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {

        return;

    }


    // =================================
    // Запоминаем положение пользователя
    // =================================

    const wasNearBottom =
        isMessagesBoxNearBottom();


    const previousScrollTop =
        box.scrollTop;


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
    // Если пользователь был внизу —
    // остаёмся внизу
    // =================================

    if (wasNearBottom) {

        box.scrollTop =
            box.scrollHeight;

    }

    else {

        // =================================
        // Пользователь НЕ был внизу.
        //
        // Никакого перехода вниз.
        // Никакого сдвига позиции.
        // Возвращаем ровно прежнее положение.
        // =================================

        box.scrollTop =
            previousScrollTop;


        requestAnimationFrame(
            () => {

                box.scrollTop =
                    previousScrollTop;

            }
        );

    }


    // =================================
    // Если сообщение наше —
    // обновляем только его статус
    // =================================

    if (
        fullMessage.user_id ===
        currentUser.id
    ) {

        updateMessageStatus(
            fullMessage.id
        );

    }


    // =================================
    // Обновляем стрелку
    // =================================

    if (
        typeof updateScrollToBottomButton ===
        "function"
    ) {

        updateScrollToBottomButton();

    }

}
