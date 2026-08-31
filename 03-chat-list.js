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


        const soundIcon =
            localStorage.getItem(
                `chatSound-${chatId}`
            ) !== "false"
                ? "🔊"
                : "🔇";


        div.innerHTML = `

            <span
                style="
                    min-width:0;
                    flex:1;
                    overflow-wrap:anywhere;
                "
            >
                ${icon} ${chatName}
            </span>


            <div
                style="
                    display:flex;
                    align-items:center;
                    justify-content:flex-end;
                    gap:6px;
                    margin-left:8px;
                    flex-shrink:0;
                    width:58px;
                    height:28px;
                "
            >

                <button
                    type="button"
                    data-sound-chat-id="${chatId}"
                    onclick="
                        event.stopPropagation();
                        toggleChatSound(${chatId});
                    "
                    style="
                        width:22px;
                        height:22px;
                        padding:0;
                        margin:0;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        border:none;
                        background:none;
                        font-size:12px;
                        line-height:1;
                        cursor:pointer;
                        flex-shrink:0;
                    "
                    title="Звук"
                >
                    ${soundIcon}
                </button>


                <span
                    id="count-${chatId}"
                    style="
                        width:28px;
                        height:28px;
                        padding:0;
                        margin:0;
                        display:none;
                        align-items:center;
                        justify-content:center;
                        box-sizing:border-box;
                        background:#ff9800;
                        color:white;
                        border-radius:50%;
                        font-size:14px;
                        font-weight:bold;
                        line-height:28px;
                        text-align:center;
                        flex-shrink:0;
                    "
                >
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


        // =================================
        // Обновляем состояние звука
        // =================================

        updateChatSoundButton(
            Number(chatId)
        );


        // =================================
        // Обновляем счётчик
        // =================================

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
            "Ошибка личных чатов:",
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
            "Ошибка групповых чатов:",
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
