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


    const username =
        prompt(
            "Введите имя пользователя, с которым хотите начать личный чат:"
        );


    if (!username) {
        return;
    }


    const searchText =
        username.trim();


    if (!searchText) {
        return;
    }


    const {
        data: users,
        error
    } = await supabaseClient.rpc(
        "search_users",
        {
            p_search: searchText
        }
    );


    if (error) {

        console.log(
            "Ошибка поиска пользователей:",
            error
        );

        alert(
            "Не удалось выполнить поиск пользователя."
        );

        return;

    }


    if (!users || users.length === 0) {

        alert(
            "Пользователь с таким именем не найден."
        );

        return;

    }


    if (users.length === 1) {

        await createNewPrivateChat(
            users[0]
        );

        return;

    }


    const names =
        users
            .map(
                user =>
                    user.username ||
                    "Пользователь"
            )
            .join("\n");


    const selectedUsername =
        prompt(
            "Найдено несколько пользователей:\n\n" +
            names +
            "\n\nВведите точное имя пользователя:"
        );


    if (!selectedUsername) {
        return;
    }


    const selectedUser =
        users.find(
            user =>
                (
                    user.username ||
                    ""
                ).toLowerCase() ===
                selectedUsername
                    .trim()
                    .toLowerCase()
        );


    if (!selectedUser) {

        alert(
            "Пользователь с таким именем не найден."
        );

        return;

    }


    await createNewPrivateChat(
        selectedUser
    );

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
