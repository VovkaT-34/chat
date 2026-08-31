// ===============================
// Загрузка списка чатов
// ===============================

async function loadChats() {

    const chatList =
        document.getElementById("chatList");

    if (!chatList) return;

    chatList.innerHTML = "Загрузка...";


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
                `[data-chat-id="${chatId}"]`
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


        const isPublicChat =
            extraClass === "";


        const soundIcon =
            isPublicChat
                ? (
                    localStorage.getItem(
                        `chatSound-${chatId}`
                    ) !== "false"
                        ? "🔊"
                        : "🔇"
                )
                : "";


        div.innerHTML = `

            <span
                style="
                    display:flex;
                    align-items:flex-start;
                    min-width:0;
                    flex:1;
                "
            >

                ${
                    isPublicChat
                    ?
                    `<span
                        class="chat-sound-toggle"
                        data-sound-chat-id="${chatId}"
                        title="Звук"
                        style="
                            font-size:12px;
                            line-height:14px;
                            margin-right:6px;
                            flex-shrink:0;
                            cursor:pointer;
                            position:relative;
                            top:-2px;
                        "
                    >
                        ${soundIcon}
                    </span>`
                    :
                    ""
                }

                <span
                    style="
                        min-width:0;
                        overflow-wrap:anywhere;
                    "
                >
                    ${icon} ${chatName}
                </span>

            </span>


            <div style="
                display:flex;
                align-items:center;
                gap:6px;
                margin-left:8px;
                flex-shrink:0;
            ">

                <button
                    type="button"
                    data-sound-chat-id="${chatId}"
                    onclick="event.stopPropagation(); toggleChatSound(${chatId})"
                    style="
                        border:none;
                        background:none;
                        padding:0;
                        margin:0;
                        font-size:12px;
                        line-height:1;
                        cursor:pointer;
                    "
                    title="Выключить звук"
                >
                    🔊
                </button>

                <span
                    id="count-${chatId}"
                    style="
                        background:#ff9800;
                        color:white;
                        border-radius:50%;
                        padding:3px 9px;
                        font-size:14px;
                        font-weight:bold;
                        display:none;
                    ">
                </span>

            </div>

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


        // =================================
        // Переключатель звука
        // =================================

        if (isPublicChat) {

            const soundButton =
                div.querySelector(
                    `[data-sound-chat-id="${chatId}"]`
                );


            if (soundButton) {

                soundButton.onclick =
                    event => {

                        event.stopPropagation();


                        const key =
                            `chatSound-${chatId}`;


                        const enabled =
                            localStorage.getItem(
                                key
                            ) !== "false";


                        localStorage.setItem(
                            key,
                            enabled
                                ? "false"
                                : "true"
                        );


                        soundButton.textContent =
                            enabled
                                ? "🔇"
                                : "🔊";

                    };

            }

        }


        updateUnreadCount(
            Number(chatId)
        );

    }


    // =================================
    // 1. Загружаем общие чаты
    // =================================

    const {
        data: publicChats,
        error: publicChatsError
    } = await supabaseClient
        .from("chats")
        .select("id,name,type")
        .eq("type", "public")
        .order("id");


    console.log(
        "ОБЩИЕ ЧАТЫ:",
        publicChats
    );


    console.log(
        "ОШИБКА ОБЩИХ ЧАТОВ:",
        publicChatsError
    );


    if (publicChatsError) {

        console.log(
            "Ошибка загрузки общих чатов:",
            publicChatsError
        );

        chatList.innerHTML =
            "Ошибка загрузки чатов.";

        return;

    }


    // =================================
    // Добавляем общие чаты
    // =================================

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
    // 2. Загружаем личные чаты
    // =================================

    const {
        data: privateChats,
        error: privateChatsError
    } = await supabaseClient.rpc(
        "get_my_private_chats"
    );


    console.log(
        "Личные чаты:",
        privateChats
    );


    console.log(
        "Ошибка личных чатов:",
        privateChatsError
    );


    if (privateChatsError) {

        console.log(
            "Ошибка загрузки личных чатов:",
            privateChatsError
        );

    }


    // =================================
    // Добавляем личные чаты
    // =================================

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
    // 3. Загружаем групповые чаты
    // =================================

    const {
        data: groupChats,
        error: groupChatsError
    } = await supabaseClient.rpc(
        "get_my_group_chats"
    );


    console.log(
        "ГРУППОВЫЕ ЧАТЫ:",
        groupChats
    );


    console.log(
        "ОШИБКА ГРУППОВЫХ ЧАТОВ:",
        groupChatsError
    );


    if (groupChatsError) {

        console.log(
            "Ошибка загрузки групповых чатов:",
            groupChatsError
        );

    }


    // =================================
    // Добавляем групповые чаты
    // =================================

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
