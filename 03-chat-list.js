// ===============================
// Загрузка списка чатов
// ===============================

function sortChatListItems() {
    const chatList = document.getElementById("chatList");
    if (!chatList) return;

    const items = [...chatList.querySelectorAll(".chat-item")];
    items.sort((a, b) => {
        const typeA = a.dataset.chatType || "public";
        const typeB = b.dataset.chatType || "public";
        const rank = { private: 0, group: 1, public: 2 };

        if ((rank[typeA] ?? 2) !== (rank[typeB] ?? 2)) {
            return (rank[typeA] ?? 2) - (rank[typeB] ?? 2);
        }

        if (typeA === "public") {
            return Number(a.dataset.chatId) - Number(b.dataset.chatId);
        }

        const timeA = Date.parse(a.dataset.lastActivity || "") || 0;
        const timeB = Date.parse(b.dataset.lastActivity || "") || 0;
        if (timeA !== timeB) return timeB - timeA;
        return Number(b.dataset.chatId) - Number(a.dataset.chatId);
    });

    items.forEach(item => chatList.appendChild(item));
}

function moveChatToTop(chatId, lastActivity = new Date().toISOString()) {
    const item = document.querySelector(`.chat-item[data-chat-id="${Number(chatId)}"]`);
    if (!item) return;

    const type = item.dataset.chatType || "public";
    if (type === "public") return;

    item.dataset.lastActivity = lastActivity;
    sortChatListItems();
}

window.sortChatListItems = sortChatListItems;
window.moveChatToTop = moveChatToTop;

async function loadChats() {
    const chatList = document.getElementById("chatList");
    if (!chatList) return;

    const selectedChatId = Number(window.currentChatId || 0);
    chatList.innerHTML = "";

    function focusMessageInputOnMobile() {
        const messageInput = document.getElementById("messageInput");
        const chatWindow = document.querySelector(".chat-window");
        if (!messageInput || !chatWindow) return;
        if (!window.matchMedia("(max-width: 700px)").matches) return;

        const lockedScrollX = window.scrollX || window.pageXOffset || 0;
        try {
            messageInput.focus({ preventScroll: true });
            const length = messageInput.value.length;
            messageInput.setSelectionRange(length, length);
        } catch {}

        const keepInputVisible = () => {
            try {
                const rect = messageInput.getBoundingClientRect();
                const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const bottomPadding = 24;
                if (rect.bottom > viewportHeight - bottomPadding) {
                    window.scrollBy({ top: rect.bottom - (viewportHeight - bottomPadding), behavior: "smooth" });
                }
                if (rect.top < 10) {
                    window.scrollBy({ top: rect.top - 10, behavior: "smooth" });
                }
            } catch {}
            if (Math.abs((window.scrollX || window.pageXOffset || 0) - lockedScrollX) > 0) {
                window.scrollTo(lockedScrollX, window.scrollY);
            }
        };

        requestAnimationFrame(keepInputVisible);
        setTimeout(keepInputVisible, 150);
        setTimeout(keepInputVisible, 400);
        setTimeout(keepInputVisible, 700);
    }

    function addChatToList(chatId, chatName, icon = "", extraClass = "", chatType = "public", lastActivity = null) {
        if (chatList.querySelector(`[data-chat-id="${chatId}"]`)) return;

        const div = document.createElement("div");
        div.className = `chat-item ${extraClass}`;
        div.dataset.chatId = chatId;
        div.dataset.chatType = chatType;
        div.dataset.lastActivity = lastActivity || "";

        div.innerHTML = `
            <span class="chat-item-main">
                <span class="chat-item-icon">${icon}</span>
                <span class="chat-item-name" title="${chatName}">${chatName}</span>
                <span class="chat-message-status" data-chat-status-id="${chatId}" title=""></span>
            </span>
            <span class="chat-item-actions">
                <span class="chat-unread-badge-wrap">
                    <span id="count-${chatId}" class="chat-unread-badge"></span>
                </span>
                <button type="button" class="chat-sound-button" data-sound-chat-id="${chatId}"
                    onclick="event.stopPropagation(); toggleChatSound(${chatId})" title="Звук" aria-label="Звук">🔊</button>
            </span>
        `;

        div.onclick = async () => {
            currentChatId = Number(chatId);
            const chatTitle = document.getElementById("chatTitle");
            if (chatTitle) chatTitle.textContent = icon ? `${icon} ${chatName}` : chatName;

            focusMessageInputOnMobile();
            await loadMessages();
            await updateUnreadCount(Number(chatId));
            focusMessageInputOnMobile();

            if (typeof updateChatCallButtonVisibility === "function") {
                setTimeout(updateChatCallButtonVisibility, 50);
            }
            if (typeof updateChatCallButton === "function") {
                setTimeout(updateChatCallButton, 50);
            }
        };

        chatList.appendChild(div);
        updateChatSoundButton(Number(chatId));
        updateUnreadCount(Number(chatId));
        updateChatListMessageStatus(Number(chatId));
    }

    const { data: privateChats, error: privateChatsError } = await supabaseClient.rpc("get_my_private_chats");
    if (privateChatsError) console.error("Ошибка загрузки личных чатов:", privateChatsError);

    (privateChats || []).forEach(chat => {
        addChatToList(chat.chat_id, chat.chat_name || "Личный чат", "🔒", "private-chat", "private", chat.last_message_at);
    });

    const { data: groupChats, error: groupChatsError } = await supabaseClient.rpc("get_my_group_chats");
    if (groupChatsError) console.error("Ошибка загрузки групповых чатов:", groupChatsError);

    (groupChats || []).forEach(chat => {
        addChatToList(chat.chat_id, chat.chat_name || "Групповой чат", "👥", "group-chat", "group", chat.last_message_at);
    });

    const { data: publicChats, error: publicChatsError } = await supabaseClient
        .from("chats")
        .select("id,name,type")
        .eq("type", "public")
        .order("id", { ascending: true });

    if (publicChatsError) {
        console.error("Ошибка загрузки общих чатов:", publicChatsError);
        return;
    }

    (publicChats || []).forEach(chat => {
        addChatToList(chat.id, chat.name, "🌐", "", "public", null);
    });

    sortChatListItems();

    if (selectedChatId) {
        const selected = chatList.querySelector(`[data-chat-id="${selectedChatId}"]`);
        selected?.classList.add("active");
    }
}
