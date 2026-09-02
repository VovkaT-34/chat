// ===============================
// Действия чата: выход и стартовый чат
// ===============================

(function () {

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
        const chatList = document.getElementById("chatList");
        if (!chatList) return;

        const items = Array.from(chatList.querySelectorAll(".chat-item"));

        items.sort((a, b) => {
            const aPublic = !a.classList.contains("private-chat") &&
                            !a.classList.contains("group-chat");
            const bPublic = !b.classList.contains("private-chat") &&
                            !b.classList.contains("group-chat");

            if (aPublic !== bPublic) return aPublic ? 1 : -1;

            return Number(a.dataset.chatId) - Number(b.dataset.chatId);
        });

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
