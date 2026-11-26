// ===============================
// Действия чата: выход и стартовый чат
// ===============================

(function () {

    // Единая шапка на Windows, Android и iPhone.
    // Две строки имеют фиксированную структуру, поэтому при быстром
    // переключении между личным, групповым и общим чатом ничего не прыгает.
    const headerStyle = document.createElement("style");
    headerStyle.id = "stable-chat-header-style";
    headerStyle.textContent = `
        .chat-window > div:first-child {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            grid-template-areas:
                "main main"
                "title calls" !important;
            align-items: center !important;
            column-gap: 8px !important;
            row-gap: 7px !important;
            width: 100% !important;
            min-width: 0 !important;
        }

        .chat-window > div:first-child > h2#chatTitle {
            grid-area: title !important;
            min-width: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
            text-align: left !important;
            line-height: 1.25 !important;
            font-size: 18px !important;
        }

        .chat-header-actions {
            display: contents !important;
        }

        .chat-header-main-actions {
            grid-area: main !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 32px !important;
            display: flex !important;
            justify-content: flex-end !important;
            align-items: center !important;
            gap: 6px !important;
            flex-wrap: nowrap !important;
        }

        .chat-call-actions {
            grid-area: calls !important;
            width: auto !important;
            min-width: 0 !important;
            min-height: 46px !important;
            display: flex !important;
            justify-content: flex-end !important;
            align-items: center !important;
            gap: 10px !important;
            flex-wrap: nowrap !important;
            transform: translateY(-23px) !important;
        }

        .chat-call-actions .chat-call-button,
        .chat-header-actions .chat-call-button {
            flex: 0 0 46px !important;
            width: 46px !important;
            height: 46px !important;
            min-width: 46px !important;
            min-height: 46px !important;
        }

        @media (max-width: 380px) {
            .chat-window > div:first-child {
                column-gap: 6px !important;
                row-gap: 6px !important;
            }
            .chat-window > div:first-child > h2#chatTitle {
                font-size: 17px !important;
            }
            .chat-call-actions {
                gap: 8px !important;
            }
            .chat-call-actions .chat-call-button,
            .chat-header-actions .chat-call-button {
                flex-basis: 44px !important;
                width: 44px !important;
                height: 44px !important;
                min-width: 44px !important;
                min-height: 44px !important;
            }
        }
    `;
    if (!document.getElementById("stable-chat-header-style")) {
        document.head.appendChild(headerStyle);
    }

    function getChatItem(chatId) {
        const chatList = document.getElementById("chatList");
        if (!chatList) return null;
        return chatList.querySelector(`[data-chat-id="${chatId}"]`);
    }

    function isPublicChat(chatId) {
        const item = getChatItem(chatId);
        if (!item) return true;
        return !item.classList.contains("private-chat") &&
               !item.classList.contains("group-chat");
    }

    function updateLeaveChatButton() {
        const button = document.getElementById("leaveChatButton");
        if (!button) return;

        if (!currentChatId || isPublicChat(currentChatId)) {
            button.style.display = "none";
            return;
        }

        button.style.display = "inline-block";
    }

    async function isCurrentGroupOwner(chatId) {
        const item = getChatItem(chatId);
        if (!item || !item.classList.contains("group-chat") || !window.currentUser) return false;
        try {
            const result = await supabaseClient.from("chats").select("created_by,is_group").eq("id", Number(chatId)).maybeSingle();
            return !result.error && result.data && result.data.is_group === true &&
                String(result.data.created_by) === String(window.currentUser.id);
        } catch (error) {
            console.warn("Не удалось проверить владельца группы:", error);
            return false;
        }
    }

    async function finishLeaveChat(chatId, transferToUserId) {
        const result = await supabaseClient.rpc("leave_chat", {
            p_chat_id: Number(chatId),
            p_transfer_to_user_id: transferToUserId || null
        });
        if (result.error) throw result.error;

        if (Number(currentChatId) === Number(chatId)) {
            currentChatId = null;
            const messages = document.getElementById("messages");
            if (messages) messages.replaceChildren();
            const chatTitle = document.getElementById("chatTitle");
            if (chatTitle) chatTitle.textContent = "Выберите чат";
            updateLeaveChatButton();
        }

        await loadChats();
        if (!currentChatId) await openDefaultPublicChat();
    }

    function openGroupOwnerTransferDialog(chatId) {
        const root = document.createElement("div");
        root.id = "groupOwnerTransferOverlay";
        root.style.cssText = "position:fixed;inset:0;z-index:100006;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.68);box-sizing:border-box";
        const box = document.createElement("div");
        box.style.cssText = "width:min(440px,100%);max-height:min(78vh,620px);display:flex;flex-direction:column;background:#000;color:#fff;border:1px solid #444;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden";
        const title = document.createElement("div");
        title.textContent = "Передать администратора";
        title.style.cssText = "padding:17px 18px 10px;font-size:19px;font-weight:700";
        const note = document.createElement("div");
        note.textContent = "Перед выходом выберите участника, которому передадутся права владельца группы.";
        note.style.cssText = "padding:0 18px 12px;color:#ddd;font-size:13px;line-height:1.4";
        const status = document.createElement("div");
        status.textContent = "Загрузка участников…";
        status.style.cssText = "padding:12px 18px;color:#ddd;font-size:14px;text-align:center";
        const list = document.createElement("div");
        list.style.cssText = "overflow-y:auto;padding:0 10px 10px";
        const footer = document.createElement("div");
        footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;padding:12px 14px;border-top:1px solid #444";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Отмена";
        cancel.style.cssText = "border:1px solid #555;border-radius:8px;background:#171717;color:#fff;padding:10px 13px;font-size:14px;cursor:pointer";
        const submit = document.createElement("button");
        submit.type = "button";
        submit.textContent = "Передать и выйти";
        submit.disabled = true;
        submit.style.cssText = "border:1px solid #777;border-radius:8px;background:#333;color:#fff;padding:10px 13px;font-size:14px;font-weight:700;cursor:pointer;opacity:.55";
        footer.appendChild(cancel);
        footer.appendChild(submit);
        box.appendChild(title);
        box.appendChild(note);
        box.appendChild(status);
        box.appendChild(list);
        box.appendChild(footer);
        root.appendChild(box);
        document.body.appendChild(root);

        let selectedUserId = null;
        let busy = false;
        function close() { if (!busy) root.remove(); }
        cancel.addEventListener("click", close);
        root.addEventListener("click", function (event) { if (event.target === root) close(); });

        supabaseClient.rpc("get_chat_members", { p_chat_id: Number(chatId) }).then(function (result) {
            if (!root.isConnected) return;
            if (result.error) {
                status.textContent = result.error.message || "Не удалось загрузить участников.";
                return;
            }
            const currentId = String(window.currentUser && window.currentUser.id);
            const members = (result.data || []).filter(function (member) {
                return String(member.user_id) !== currentId;
            });
            list.replaceChildren();
            if (!members.length) {
                status.textContent = "В группе нет другого участника. Чтобы завершить её, используйте «Удалить группу».";
                return;
            }
            status.textContent = "В группе " + (members.length + 1) + " участников. Выберите нового владельца:";
            members.forEach(function (member) {
                const row = document.createElement("button");
                row.type = "button";
                row.setAttribute("aria-pressed", "false");
                row.style.cssText = "display:flex;width:100%;align-items:center;gap:10px;margin:3px 0;padding:12px;border:1px solid #444;border-radius:9px;background:#101010;color:#fff;text-align:left;font:14px Arial,sans-serif;cursor:pointer";
                const name = document.createElement("span");
                name.textContent = (member.nickname || member.username || "Пользователь") + "  @" + (member.username || "");
                name.style.cssText = "flex:1;min-width:0;overflow-wrap:anywhere";
                const marker = document.createElement("span");
                marker.textContent = "○";
                marker.style.cssText = "font-size:19px";
                row.appendChild(name);
                row.appendChild(marker);
                row.addEventListener("click", function () {
                    selectedUserId = member.user_id;
                    list.querySelectorAll("button").forEach(function (button) {
                        button.style.borderColor = "#444";
                        button.style.background = "#101010";
                        button.setAttribute("aria-pressed", "false");
                        if (button.lastElementChild) button.lastElementChild.textContent = "○";
                    });
                    row.style.borderColor = "#fff";
                    row.style.background = "#242424";
                    row.setAttribute("aria-pressed", "true");
                    marker.textContent = "●";
                    submit.disabled = false;
                    submit.style.opacity = "1";
                });
                list.appendChild(row);
            });
        }).catch(function (error) {
            status.textContent = error && error.message ? error.message : "Не удалось загрузить участников.";
        });

        submit.addEventListener("click", async function () {
            if (busy || !selectedUserId) return;
            busy = true;
            submit.disabled = true;
            status.textContent = "Передача управления и выход из группы…";
            try {
                await finishLeaveChat(chatId, selectedUserId);
                root.remove();
            } catch (error) {
                busy = false;
                submit.disabled = false;
                status.textContent = error && error.message ? error.message : "Не удалось передать управление.";
            }
        });
    }

    async function leaveChatById(chatId) {
        chatId = Number(chatId);
        if (!chatId || isPublicChat(chatId)) return;
        const item = getChatItem(chatId);
        const isGroup = !!(item && item.classList.contains("group-chat"));
        const isOwner = isGroup && await isCurrentGroupOwner(chatId);
        if (isOwner) {
            openGroupOwnerTransferDialog(chatId);
            return;
        }
        if (!window.confirm(isGroup ? "Выйти из группы?" : "Выйти из этого чата?")) return;
        try {
            await finishLeaveChat(chatId, null);
        } catch (error) {
            console.error("Ошибка выхода из чата:", error);
            alert(error && error.message ? error.message : "Не удалось выйти из чата.");
        }
    }

    async function deleteGroupChat(chatId) {
        chatId = Number(chatId);
        if (!chatId || !await isCurrentGroupOwner(chatId)) return;
        if (!window.confirm("Вы точно хотите удалить группу? Все сообщения и участники этой группы будут удалены.")) return;
        try {
            const result = await supabaseClient.rpc("delete_group_chat", { p_chat_id: chatId });
            if (result.error) throw result.error;
            if (Number(currentChatId) === chatId) {
                currentChatId = null;
                const messages = document.getElementById("messages");
                if (messages) messages.replaceChildren();
                const chatTitle = document.getElementById("chatTitle");
                if (chatTitle) chatTitle.textContent = "Выберите чат";
                updateLeaveChatButton();
            }
            await loadChats();
            if (!currentChatId) await openDefaultPublicChat();
        } catch (error) {
            console.error("Ошибка удаления группы:", error);
            alert(error && error.message ? error.message : "Не удалось удалить группу.");
        }
    }

    async function leaveCurrentChat() {
        await leaveChatById(Number(currentChatId || 0));
    }

    function sortChats() {
        // 03-chat-list.js уже содержит правильную сортировку по lastActivity
        // и восстановление порядка после перезагрузки. Старый сортировщик
        // по ID здесь её ломал, поэтому всегда используем единый механизм.
        if (typeof window.sortChatListItems === "function") {
            window.sortChatListItems();
            return;
        }

        const chatList = document.getElementById("chatList");
        if (!chatList) return;

        const items = Array.from(chatList.querySelectorAll(".chat-item"));
        items.forEach(item => chatList.appendChild(item));
    }

    async function openDefaultPublicChat() {
        const chatList = document.getElementById("chatList");
        if (!chatList) return;

        const publicItems = Array.from(
            chatList.querySelectorAll(".chat-item")
        ).filter(item =>
            !item.classList.contains("private-chat") &&
            !item.classList.contains("group-chat")
        );

        if (!publicItems.length) {
            updateLeaveChatButton();
            return;
        }

        publicItems.sort(
            (a, b) => Number(a.dataset.chatId) - Number(b.dataset.chatId)
        );

        const defaultItem = publicItems[0];
        if (!defaultItem) return;

        if (Number(currentChatId) === Number(defaultItem.dataset.chatId)) {
            updateLeaveChatButton();
            return;
        }

        defaultItem.click();
        updateLeaveChatButton();
    }

    const originalLoadChats = window.loadChats;

    if (typeof originalLoadChats === "function") {
        window.loadChats = async function () {
            const result = await originalLoadChats();
            sortChats();
            updateLeaveChatButton();
            return result;
        };
    }

    document.addEventListener("click", event => {
        const chatItem = event.target.closest?.(".chat-item");
        if (!chatItem) return;

        requestAnimationFrame(updateLeaveChatButton);
        setTimeout(updateLeaveChatButton, 250);
    });

    const button = document.getElementById("leaveChatButton");
    if (button) button.addEventListener("click", leaveCurrentChat);

    const waitForChatList = setInterval(() => {
        const chatList = document.getElementById("chatList");
        if (!chatList || !chatList.querySelector(".chat-item")) return;

        clearInterval(waitForChatList);
        sortChats();
        openDefaultPublicChat();
    }, 50);

    setTimeout(() => clearInterval(waitForChatList), 10000);

    window.leaveCurrentChat = leaveCurrentChat;
    window.leaveChatById = leaveChatById;
    window.deleteGroupChat = deleteGroupChat;
    window.isCurrentGroupOwner = isCurrentGroupOwner;
    window.updateLeaveChatButton = updateLeaveChatButton;

})();
