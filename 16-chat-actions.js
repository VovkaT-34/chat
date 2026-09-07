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

    async function leaveCurrentChat() {
        const chatId = Number(currentChatId);
        if (!chatId || isPublicChat(chatId)) return;

        if (!window.confirm("Выйти из этого чата?")) return;

        const { error } = await supabaseClient.rpc("leave_chat", {
            p_chat_id: chatId
        });

        if (error) {
            console.error("Ошибка выхода из чата:", error);
            alert("Не удалось выйти из чата.");
            return;
        }

        currentChatId = null;

        const messages = document.getElementById("messages");
        if (messages) messages.innerHTML = "";

        const chatTitle = document.getElementById("chatTitle");
        if (chatTitle) chatTitle.textContent = "Выберите чат";

        updateLeaveChatButton();

        await loadChats();
        await openDefaultPublicChat();
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
    window.updateLeaveChatButton = updateLeaveChatButton;

})();
