// =========================================
// НОВЫЙ ЧАТ — МЕНЮ
// =========================================

const newChatButton =
    document.getElementById("newChatButton");

const newChatMenu =
    document.getElementById("newChatMenu");

const newPrivateChatMenuButton =
    document.getElementById("newPrivateChatMenuButton");

const newGroupChatMenuButton =
    document.getElementById("newGroupChatMenuButton");


// Прикрепление слева от динамика в списке чатов.
const chatListActionStyle = document.createElement("style");
chatListActionStyle.textContent = `
    .chat-item-actions .chat-pin-indicator { order: 1; }
    .chat-item-actions .chat-sound-button { order: 2; }
`;
document.head.appendChild(chatListActionStyle);


// =========================================
// ОТКРЫТИЕ / ЗАКРЫТИЕ МЕНЮ
// =========================================

if (newChatButton && newChatMenu) {

    newChatButton.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            newChatMenu.style.display =
                newChatMenu.style.display === "block"
                    ? "none"
                    : "block";

        }
    );

}


// Закрываем меню при клике вне него

document.addEventListener(
    "click",
    function () {

        if (newChatMenu) {

            newChatMenu.style.display =
                "none";

        }

    }
);


// =========================================
// ЛИЧНЫЙ ЧАТ
// =========================================

if (newPrivateChatMenuButton) {

    newPrivateChatMenuButton.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            if (newChatMenu) {

                newChatMenu.style.display =
                    "none";

            }

            openNewPrivateChatDialog();

        }
    );

}


// =========================================
// ГРУППОВОЙ ЧАТ
// =========================================

if (newGroupChatMenuButton) {

    newGroupChatMenuButton.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            if (newChatMenu) {

                newChatMenu.style.display =
                    "none";

            }

            openNewGroupChatDialog();

        }
    );

}


// =========================================
// СОЗДАНИЕ ЛИЧНОГО ЧАТА
// =========================================

async function openNewPrivateChatDialog() {

    if (!currentUser) {

        alert(
            "Пользователь не авторизован."
        );

        return;

    }


    const overlay = document.createElement("div");
    overlay.id = "privateChatSearchOverlay";
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 10vh 16px 24px;
        background: rgba(0,0,0,.55);
        box-sizing: border-box;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
        width: min(460px, 100%);
        max-height: min(70vh, 560px);
        display: flex;
        flex-direction: column;
        background: #fff;
        color: #222;
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.28);
        overflow: hidden;
    `;

    const title = document.createElement("div");
    title.textContent = "Новый личный чат";
    title.style.cssText = `
        padding: 16px 18px 10px;
        font-size: 19px;
        font-weight: 700;
    `;

    const inputWrap = document.createElement("div");
    inputWrap.style.cssText = `
        padding: 0 14px 12px;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "Имя или @уникальный ID";
    input.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border: 1px solid #ccc;
        border-radius: 10px;
        font-size: 16px;
        outline: none;
    `;

    inputWrap.appendChild(input);

    const results = document.createElement("div");
    results.style.cssText = `
        overflow-y: auto;
        padding: 0 8px 8px;
    `;

    const status = document.createElement("div");
    status.style.cssText = `
        padding: 12px 10px 16px;
        color: #777;
        font-size: 14px;
        text-align: center;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        padding: 10px 14px 14px;
        border-top: 1px solid #eee;
    `;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Отмена";
    cancelButton.style.cssText = `
        border: 0;
        background: transparent;
        padding: 9px 12px;
        font-size: 15px;
        cursor: pointer;
    `;

    footer.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(inputWrap);
    dialog.appendChild(results);
    dialog.appendChild(status);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let closed = false;
    let timer = null;
    let requestNumber = 0;

    function closeDialog() {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        overlay.remove();
    }

    function setStatus(text) {
        status.textContent = text || "";
        status.style.display = text ? "block" : "none";
    }

    function clearResults() {
        results.innerHTML = "";
    }

    function renderUsers(users) {
        clearResults();

        if (!users || users.length === 0) {
            setStatus("Пользователь не найден");
            return;
        }

        setStatus("");

        users.forEach(function (user) {
            const row = document.createElement("button");
            row.type = "button";
            row.style.cssText = `
                width: 100%;
                display: flex;
                align-items: center;
                text-align: left;
                border: 0;
                background: transparent;
                padding: 11px 10px;
                border-radius: 10px;
                cursor: pointer;
                font-size: 16px;
            `;

            const name = document.createElement("span");
            name.textContent = (user.username || "Пользователь") + "  @" + (user.public_id || "");
            name.style.cssText = `
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;

            row.appendChild(name);
            row.addEventListener("mouseenter", function () {
                row.style.background = "#f1f1f1";
            });
            row.addEventListener("mouseleave", function () {
                row.style.background = "transparent";
            });

            row.addEventListener("click", async function () {
                if (closed) return;
                closeDialog();
                await createNewPrivateChat(user);
            });

            results.appendChild(row);
        });
    }

    async function searchUsers(searchText) {
        const requestId = ++requestNumber;

        clearResults();
        setStatus("Поиск...");

        const { data: users, error } = await supabaseClient.rpc(
            "search_users",
            {
                p_search: searchText
            }
        );

        if (closed || requestId !== requestNumber) return;

        if (error) {
            console.log("Ошибка поиска пользователей:", error);
            setStatus("Не удалось выполнить поиск");
            return;
        }

        renderUsers(users || []);
    }

    function scheduleSearch() {
        const searchText = input.value.trim();

        if (timer) clearTimeout(timer);
        requestNumber++;
        clearResults();

        if (!searchText) {
            setStatus("Начните вводить имя пользователя");
            return;
        }

        if (searchText.length < 1) {
            setStatus("Введите имя пользователя");
            return;
        }

        timer = setTimeout(function () {
            searchUsers(searchText);
        }, 180);
    }

    input.addEventListener("input", scheduleSearch);

    input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeDialog();
        }
    });

    cancelButton.addEventListener("click", closeDialog);

    overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
            closeDialog();
        }
    });

    document.addEventListener("keydown", function onDialogKeydown(event) {
        if (!closed && event.key === "Escape") {
            closeDialog();
        }
        if (closed) {
            document.removeEventListener("keydown", onDialogKeydown);
        }
    });

    input.focus();
    setStatus("Начните вводить имя пользователя");
}


// =========================================
// СОЗДАНИЕ ЛИЧНОГО ЧАТА
// =========================================

async function createNewPrivateChat(
    user
) {

    const {
        data: chatId,
        error
    } = await supabaseClient.rpc(
        "create_private_chat",
        {
            p_other_user_id:
                user.id
        }
    );


    if (error) {

        console.log(
            "Ошибка создания личного чата:",
            error
        );

        alert(
            "Не удалось создать личный чат."
        );

        return;

    }


    if (!chatId) {

        alert(
            "Не удалось получить ID личного чата."
        );

        return;

    }


    console.log(
        "Личный чат создан:",
        chatId
    );


    // Если чат ранее был скрыт из списка, возвращаем его при повторном создании.
    const hiddenChats =
        readChatMenuMap(CHAT_MENU_HIDDEN_KEY);

    delete hiddenChats[String(chatId)];

    writeChatMenuMap(
        CHAT_MENU_HIDDEN_KEY,
        hiddenChats
    );


    await loadChats();


    currentChatId =
        Number(chatId);


    const chatTitle =
        document.getElementById(
            "chatTitle"
        );


    if (chatTitle) {

        chatTitle.textContent =
            user.username ||
            "Пользователь";

    }


    await loadMessages();


    await updateUnreadCount(
        currentChatId
    );

}


// =========================================
// ГРУППОВОЙ ЧАТ
// =========================================

async function openNewGroupChatDialog() {

    if (!currentUser) {

        alert(
            "Пользователь не авторизован."
        );

        return;

    }


    const groupName =
        prompt(
            "Введите название группового чата:"
        );


    if (!groupName) {
        return;
    }


    const name =
        groupName.trim();


    if (!name) {
        return;
    }


    const usersText =
        prompt(
            "Введите имена пользователей через запятую:\n\n" +
            "Например:\n" +
            "user1, user2, user3"
        );


    if (!usersText) {
        return;
    }


    const usernames =
        usersText
            .split(",")
            .map(
                username =>
                    username.trim()
            )
            .filter(Boolean);


    if (usernames.length < 2) {

        alert(
            "Для группового чата необходимо добавить минимум двух других пользователей."
        );

        return;

    }


    const userIds = [];


    for (
        const username of usernames
    ) {

        const {
            data: users,
            error
        } = await supabaseClient.rpc(
            "search_users",
            {
                p_search: username
            }
        );


        if (error) {

            console.log(
                "Ошибка поиска пользователя:",
                error
            );

            alert(
                "Ошибка поиска пользователя: " +
                username
            );

            return;

        }


        if (!users || users.length === 0) {

            alert(
                "Пользователь не найден: " +
                username
            );

            return;

        }


        const exactUser =
            users.find(
                user =>
                    (
                        user.username ||
                        ""
                    ).toLowerCase() ===
                    username.toLowerCase()
            );


        if (!exactUser) {

            alert(
                "Не найдено точное имя пользователя: " +
                username
            );

            return;

        }


        if (
            exactUser.id ===
            currentUser.id
        ) {

            continue;

        }


        if (
            !userIds.includes(
                exactUser.id
            )
        ) {

            userIds.push(
                exactUser.id
            );

        }

    }


    if (userIds.length < 2) {

        alert(
            "В группе должно быть минимум два других пользователя."
        );

        return;

    }


    const {
        data: chatId,
        error: groupError
    } = await supabaseClient.rpc(
        "create_group_chat",
        {
            p_name: name,
            p_user_ids: userIds
        }
    );


    if (groupError) {

        console.log(
            "Ошибка создания группового чата:",
            groupError
        );

        alert(
            "Не удалось создать групповой чат."
        );

        return;

    }


    if (!chatId) {

        alert(
            "Не удалось получить ID группового чата."
        );

        return;

    }


    console.log(
        "Групповой чат создан:",
        chatId
    );


    await loadChats();


    currentChatId =
        Number(chatId);


    const chatTitle =
        document.getElementById(
            "chatTitle"
        );


    if (chatTitle) {

        chatTitle.textContent =
            name;

    }


    await loadMessages();


    await updateUnreadCount(
        currentChatId
    );

}
