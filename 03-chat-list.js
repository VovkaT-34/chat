// ===============================
// Загрузка списка чатов
// ===============================

async function loadChats() {

    const chatList =
        document.getElementById("chatList");

    if (!chatList) return;

    chatList.innerHTML = "";


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


            await loadMessages();


            await updateUnreadCount(
                Number(chatId)
            );

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
