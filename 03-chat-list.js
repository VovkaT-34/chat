// ===============================
// Загрузка списка чатов
// ===============================

async function loadChats() {

    const chatList =
        document.getElementById("chatList");

    if (!chatList) return;


    chatList.innerHTML = "";


    // =================================
    // Переход к полю сообщения на мобильном
    // =================================

    function focusMessageInputOnMobile() {

        const messageInput =
            document.getElementById("messageInput");

        const chatWindow =
            document.querySelector(".chat-window");

        if (!messageInput || !chatWindow) {
            return;
        }

        if (!window.matchMedia("(max-width: 700px)").matches) {
            return;
        }

        // Критически важно: первый focus выполняем сразу внутри
        // клика по чату. iOS/Android могут не открыть клавиатуру,
        // если focus выполняется только внутри setTimeout.
        try {
            messageInput.focus({
                preventScroll: true
            });

            const length = messageInput.value.length;
            messageInput.setSelectionRange(length, length);
        } catch (error) {
            // Некоторые браузеры могут ограничить установку курсора.
        }

        // После открытия клавиатуры viewport может изменить размер.
        // Поэтому дополнительно прокручиваем поле в видимую область.
        const scrollToInput = () => {

            try {
                messageInput.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest"
                });
            } catch (error) {
                // Ничего не делаем: focus уже выполнен.
            }

        };

        requestAnimationFrame(scrollToInput);
        setTimeout(scrollToInput, 150);
        setTimeout(scrollToInput, 400);
        setTimeout(scrollToInput, 700);

    }


    // =================================
    // Вспомогательная функция
    // =================================

    function addChatToList(
        chatId,
        chatName,
        icon = "",
        extraClass = ""
    ) {

        if (
            chatList.querySelector(
                '[data-chat-id="' + chatId + '"]'
            )
        ) {
            return;
        }


        const div =
            document.createElement("div");


        div.className =
            `chat-item ${extraClass}`;


        div.dataset.chatId =
            chatId;


        div.innerHTML = `

            <span class="chat-item-main">

                <span class="chat-item-icon">
                    ${icon}
                </span>

                <span
                    class="chat-item-name"
                    title="${chatName}"
                >
                    ${chatName}
                </span>

                <span
                    class="chat-message-status"
                    data-chat-status-id="${chatId}"
                    title=""
                ></span>

            </span>


            <span class="chat-item-actions">

                <span
                    class="chat-unread-badge-wrap"
                >

                    <span
                        id="count-${chatId}"
                        class="chat-unread-badge"
                    ></span>

                </span>


                <button
                    type="button"
                    class="chat-sound-button"
                    data-sound-chat-id="${chatId}"
                    onclick="event.stopPropagation(); toggleChatSound(${chatId})"
                    title="Звук"
                    aria-label="Звук"
                >
                    🔊
                </button>

            </span>

        `;


        div.onclick = async () => {

            currentChatId =
                Number(chatId);


            const chatTitle =
                document.getElementById(
                    "chatTitle"
                );


            if (chatTitle) {

                chatTitle.textContent =
                    icon
                        ? `${icon} ${chatName}`
                        : chatName;

            }

            // Сразу после физического клика по чату:
            // открываем поле ввода и запрашиваем клавиатуру.
            focusMessageInputOnMobile();


            await loadMessages();


            await updateUnreadCount(
                Number(chatId)
            );


            // После загрузки истории поле всё равно должно
            // оставаться активным и видимым над клавиатурой.
            focusMessageInputOnMobile();

        };


        chatList.appendChild(div);


        updateChatSoundButton(
            Number(chatId)
        );


        updateUnreadCount(
            Number(chatId)
        );


        updateChatListMessageStatus(
            Number(chatId)
        );

    }


    // =================================
    // 1. Общие чаты
    // =================================

    const {
        data: publicChats,
        error: publicChatsError
    } = await supabaseClient
        .from("chats")
        .select("id,name,type")
        .eq("type", "public")
        .order("id");


    if (publicChatsError) {

        console.error(
            "Ошибка загрузки общих чатов:",
            publicChatsError
        );

        chatList.innerHTML =
            "Не удалось загрузить чаты.";

        return;

    }


    (publicChats || []).forEach(
        chat => {

            addChatToList(
                chat.id,
                chat.name,
                "🌐",
                ""
            );

        }
    );


    // =================================
    // 2. Личные чаты
    // =================================

    const {
        data: privateChats,
        error: privateChatsError
    } = await supabaseClient.rpc(
        "get_my_private_chats"
    );


    if (privateChatsError) {

        console.error(
            "Ошибка загрузки личных чатов:",
            privateChatsError
        );

    }


    (privateChats || []).forEach(
        chat => {

            addChatToList(
                chat.chat_id,
                chat.chat_name || "Личный чат",
                "🔒",
                "private-chat"
            );

        }
    );


    // =================================
    // 3. Групповые чаты
    // =================================

    const {
        data: groupChats,
        error: groupChatsError
    } = await supabaseClient.rpc(
        "get_my_group_chats"
    );


    if (groupChatsError) {

        console.error(
            "Ошибка загрузки групповых чатов:",
            groupChatsError
        );

    }


    (groupChats || []).forEach(
        chat => {

            addChatToList(
                chat.chat_id,
                chat.chat_name || "Групповой чат",
                "👥",
                "group-chat"
            );

        }
    );

}
