// =========================================
// ГРУППОВОЙ ЧАТ — ЖИВОЙ ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// =========================================

window.openNewGroupChatDialog = async function () {

    if (!currentUser) {
        alert("Пользователь не авторизован.");
        return;
    }

    const groupName = prompt("Введите название группового чата:");

    if (!groupName) return;

    const name = groupName.trim();

    if (!name) return;

    const overlay = document.createElement("div");
    overlay.id = "groupChatSearchOverlay";
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
    title.textContent = "Участники группового чата";
    title.style.cssText = `
        padding: 16px 18px 10px;
        font-size: 19px;
        font-weight: 700;
    `;

    const inputWrap = document.createElement("div");
    inputWrap.style.cssText = `
        padding: 0 14px 8px;
    `;

    const selected = document.createElement("div");
    selected.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0 0 8px;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "Имя или @ID; выберите нужного пользователя";
    input.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border: 1px solid #ccc;
        border-radius: 10px;
        font-size: 16px;
        outline: none;
    `;

    inputWrap.appendChild(selected);
    inputWrap.appendChild(input);

    const results = document.createElement("div");
    results.style.cssText = `
        overflow-y: auto;
        padding: 0 8px 8px;
    `;

    const status = document.createElement("div");
    status.style.cssText = `
        padding: 10px 10px 12px;
        color: #777;
        font-size: 14px;
        text-align: center;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
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

    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.textContent = "Создать группу";
    createButton.disabled = true;
    createButton.style.cssText = `
        border: 0;
        background: #5a4636;
        color: #fff;
        padding: 10px 14px;
        border-radius: 9px;
        font-size: 15px;
        cursor: pointer;
    `;

    footer.appendChild(cancelButton);
    footer.appendChild(createButton);
    dialog.appendChild(title);
    dialog.appendChild(inputWrap);
    dialog.appendChild(results);
    dialog.appendChild(status);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const selectedUsers = [];
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

    function updateCreateButton() {
        createButton.disabled = selectedUsers.length < 2;
        createButton.style.opacity = createButton.disabled ? ".55" : "1";
        createButton.style.cursor = createButton.disabled ? "default" : "pointer";
    }

    function renderSelected() {
        selected.innerHTML = "";

        selectedUsers.forEach(function (user) {
            const chip = document.createElement("span");
            chip.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 5px;
                max-width: 100%;
                padding: 6px 8px 6px 10px;
                background: #eee;
                border-radius: 999px;
                font-size: 14px;
            `;

            const name = document.createElement("span");
            name.textContent = (user.username || "Пользователь") + " · @" + (user.public_id || "ID не назначен");
            name.style.cssText = "max-width:250px;overflow-wrap:anywhere;white-space:normal;line-height:1.3;";

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.textContent = "×";
            removeButton.setAttribute("aria-label", "Удалить " + (user.username || "пользователя"));
            removeButton.style.cssText = `
                border: 0;
                background: transparent;
                padding: 0 2px;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                color: #666;
            `;

            removeButton.addEventListener("click", function () {
                const index = selectedUsers.findIndex(function (item) {
                    return item.id === user.id;
                });

                if (index !== -1) {
                    selectedUsers.splice(index, 1);
                    renderSelected();
                    updateCreateButton();
                }
            });

            chip.appendChild(name);
            chip.appendChild(removeButton);
            selected.appendChild(chip);
        });

        updateCreateButton();
    }

    function getSearchText() {
        const parts = input.value.split(",");
        return parts[parts.length - 1].trim();
    }

    function addUser(user) {
        if (!user || !user.id) return;

        if (user.id === currentUser.id) {
            setStatus("Нельзя добавить самого себя");
            return;
        }

        if (selectedUsers.some(function (item) {
            return item.id === user.id;
        })) {
            input.value = "";
            clearResults();
            setStatus("");
            return;
        }

        selectedUsers.push(user);
        renderSelected();
        input.value = "";
        clearResults();
        setStatus("Введите следующего пользователя");
        input.focus();
    }

    function renderUsers(users) {
        clearResults();

        const availableUsers = (users || []).filter(function (user) {
            return user.id !== currentUser.id && !selectedUsers.some(function (item) {
                return item.id === user.id;
            });
        });

        if (availableUsers.length === 0) {
            setStatus("Пользователь не найден");
            return;
        }

        setStatus("");

        availableUsers.forEach(function (user) {
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

            row.style.cssText += "min-height:58px;gap:10px;";

            const identity = document.createElement("span");
            identity.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;flex:1;white-space:normal;";

            const name = document.createElement("span");
            name.textContent = user.username || "Пользователь";
            name.style.cssText = "font-size:16px;font-weight:600;line-height:1.25;";

            const publicId = document.createElement("span");
            publicId.textContent = "@" + (user.public_id || "ID не назначен");
            publicId.style.cssText = "font-size:13px;color:#666;line-height:1.25;";

            identity.appendChild(name);
            identity.appendChild(publicId);
            row.appendChild(identity);
            row.setAttribute("aria-label", (user.username || "Пользователь") + ", @" + (user.public_id || "ID не назначен"));

            row.addEventListener("mouseenter", function () {
                row.style.background = "#f1f1f1";
            });

            row.addEventListener("mouseleave", function () {
                row.style.background = "transparent";
            });

            row.addEventListener("click", function () {
                addUser(user);
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
        const searchText = getSearchText();

        if (timer) clearTimeout(timer);
        requestNumber++;
        clearResults();

        if (!searchText) {
            setStatus(selectedUsers.length >= 2
                ? "Можно создать группу"
                : "Введите имя следующего пользователя");
            return;
        }

        timer = setTimeout(function () {
            searchUsers(searchText);
        }, 180);
    }

    async function createGroup() {
        if (selectedUsers.length < 2) {
            alert("Для группового чата необходимо добавить минимум двух других пользователей.");
            return;
        }

        createButton.disabled = true;
        setStatus("Создание группы...");

        const userIds = selectedUsers.map(function (user) {
            return user.id;
        });

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
            console.log("Ошибка создания группового чата:", groupError);
            createButton.disabled = false;
            setStatus("Не удалось создать групповой чат");
            alert("Не удалось создать групповой чат.");
            return;
        }

        if (!chatId) {
            createButton.disabled = false;
            setStatus("Не удалось получить ID группового чата");
            alert("Не удалось получить ID группового чата.");
            return;
        }

        console.log("Групповой чат создан:", chatId);
        closeDialog();

        await loadChats();

        currentChatId = Number(chatId);

        const chatTitle = document.getElementById("chatTitle");

        if (chatTitle) {
            chatTitle.textContent = name;
        }

        await loadMessages();
        await updateUnreadCount(currentChatId);
    }

    input.addEventListener("input", scheduleSearch);

    input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeDialog();
        }
    });

    cancelButton.addEventListener("click", closeDialog);
    createButton.addEventListener("click", createGroup);

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
    setStatus("Введите имя пользователя");
};
