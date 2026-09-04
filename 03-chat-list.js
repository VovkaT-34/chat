// ===============================
// Загрузка списка чатов
// ===============================

const CHAT_ACTIVITY_STORAGE_PREFIX = "chat-last-activity-v1:";

const CHAT_ICON_SVG = {
    private: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>',
    group: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M14 19.5a4 4 0 0 1 6.5-2.9"/></svg>',
    public: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    soundOn: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10"/></svg>',
    soundOff: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 10 4 4M21 10l-4 4"/></svg>'
};

function getChatIcon(chatType) {
    return CHAT_ICON_SVG[chatType] || CHAT_ICON_SVG.public;
}

function getChatActivityStorageKey() {
    return `${CHAT_ACTIVITY_STORAGE_PREFIX}${window.currentUser?.id || "guest"}`;
}

function readPersistedChatActivities() {
    try {
        const raw = localStorage.getItem(getChatActivityStorageKey());
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writePersistedChatActivities(activities) {
    try { localStorage.setItem(getChatActivityStorageKey(), JSON.stringify(activities)); } catch {}
}

function rememberChatActivity(chatId, lastActivity) {
    const id = Number(chatId);
    if (!id || !lastActivity) return;
    const activities = readPersistedChatActivities();
    const previousTime = Date.parse(activities[id] || "") || 0;
    const nextTime = Date.parse(lastActivity || "") || 0;
    if (nextTime >= previousTime) { activities[id] = lastActivity; writePersistedChatActivities(activities); }
}

function getEffectiveChatActivity(chatId, serverActivity) {
    const activities = readPersistedChatActivities();
    const localActivity = activities[Number(chatId)] || "";
    const serverTime = Date.parse(serverActivity || "") || 0;
    const localTime = Date.parse(localActivity || "") || 0;
    return localTime > serverTime ? localActivity : (serverActivity || localActivity || "");
}

function updateCallButtonsForChat(chatId, chatType) {
    const audio = document.getElementById("callAudioButton");
    const video = document.getElementById("callVideoButton");
    if (!audio || !video) return;
    const visible = Number(chatId) > 0 && String(chatType || "") === "private";
    const display = visible ? "inline-flex" : "none";
    audio.style.setProperty("display", display, "important");
    video.style.setProperty("display", display, "important");
}

function sortChatListItems() {
    const chatList = document.getElementById("chatList");
    if (!chatList) return;
    const items = [...chatList.querySelectorAll(".chat-item")];
    items.sort((a, b) => {
        const typeA = a.dataset.chatType || "public";
        const typeB = b.dataset.chatType || "public";
        const rank = { private: 0, group: 0, public: 1 };
        if ((rank[typeA] ?? 1) !== (rank[typeB] ?? 1)) return (rank[typeA] ?? 1) - (rank[typeB] ?? 1);
        if (typeA === "public") return Number(a.dataset.chatId) - Number(b.dataset.chatId);
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
    const effectiveActivity = getEffectiveChatActivity(chatId, lastActivity);
    item.dataset.lastActivity = effectiveActivity;
    rememberChatActivity(chatId, effectiveActivity);
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
        try { messageInput.focus({ preventScroll: true }); const length = messageInput.value.length; messageInput.setSelectionRange(length, length); } catch {}
        const keepInputVisible = () => {
            try {
                const rect = messageInput.getBoundingClientRect();
                const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const bottomPadding = 24;
                if (rect.bottom > viewportHeight - bottomPadding) window.scrollBy({ top: rect.bottom - (viewportHeight - bottomPadding), behavior: "smooth" });
                if (rect.top < 10) window.scrollBy({ top: rect.top - 10, behavior: "smooth" });
            } catch {}
            if (Math.abs((window.scrollX || window.pageXOffset || 0) - lockedScrollX) > 0) window.scrollTo(lockedScrollX, window.scrollY);
        };
        requestAnimationFrame(keepInputVisible); setTimeout(keepInputVisible, 150); setTimeout(keepInputVisible, 400); setTimeout(keepInputVisible, 700);
    }

    function addChatToList(chatId, chatName, icon = "", extraClass = "", chatType = "public", lastActivity = null) {
        if (chatList.querySelector(`[data-chat-id="${chatId}"]`)) return;
        const effectiveActivity = getEffectiveChatActivity(chatId, lastActivity);
        const div = document.createElement("div");
        div.className = `chat-item ${extraClass}`;
        div.dataset.chatId = chatId;
        div.dataset.chatType = chatType;
        div.dataset.lastActivity = effectiveActivity;
        if (effectiveActivity) rememberChatActivity(chatId, effectiveActivity);
        div.innerHTML = `
            <span class="chat-item-main">
                <span class="chat-item-icon">${icon || getChatIcon(chatType)}</span>
                <span class="chat-item-name" title="${chatName}">${chatName}</span>
                <span class="chat-message-status" data-chat-status-id="${chatId}" title=""></span>
            </span>
            <span class="chat-item-actions">
                <span class="chat-unread-badge-wrap"><span id="count-${chatId}" class="chat-unread-badge"></span></span>
                <button type="button" class="chat-sound-button" data-sound-chat-id="${chatId}" onclick="event.stopPropagation(); toggleChatSound(${chatId})" title="Звук" aria-label="Звук">${CHAT_ICON_SVG.soundOn}</button>
            </span>`;
        div.onclick = async () => {
            currentChatId = Number(chatId);
            const chatTitle = document.getElementById("chatTitle");
            if (chatTitle) chatTitle.textContent = chatName;
            updateCallButtonsForChat(chatId, chatType);
            focusMessageInputOnMobile();
            await loadMessages();
            await updateUnreadCount(Number(chatId));
            focusMessageInputOnMobile();
            updateCallButtonsForChat(chatId, chatType);
            if (typeof updateChatCallButtonVisibility === "function") setTimeout(updateChatCallButtonVisibility, 50);
            if (typeof updateChatCallButton === "function") setTimeout(updateChatCallButton, 50);
        };
        chatList.appendChild(div);
        updateChatSoundButton(Number(chatId));
        updateUnreadCount(Number(chatId));
        updateChatListMessageStatus(Number(chatId));
    }

    const { data: privateChats, error: privateChatsError } = await supabaseClient.rpc("get_my_private_chats");
    if (privateChatsError) console.error("Ошибка загрузки личных чатов:", privateChatsError);
    (privateChats || []).forEach(chat => addChatToList(chat.chat_id, chat.chat_name || "Личный чат", getChatIcon("private"), "private-chat", "private", chat.last_message_at));

    const { data: groupChats, error: groupChatsError } = await supabaseClient.rpc("get_my_group_chats");
    if (groupChatsError) console.error("Ошибка загрузки групповых чатов:", groupChatsError);
    (groupChats || []).forEach(chat => addChatToList(chat.chat_id, chat.chat_name || "Групповой чат", getChatIcon("group"), "group-chat", "group", chat.last_message_at));

    const { data: publicChats, error: publicChatsError } = await supabaseClient.from("chats").select("id,name,type").eq("type", "public").order("id", { ascending: true });
    if (publicChatsError) { console.error("Ошибка загрузки общих чатов:", publicChatsError); return; }
    (publicChats || []).forEach(chat => addChatToList(chat.id, chat.name, getChatIcon("public"), "", "public", null));

    sortChatListItems();
    if (selectedChatId) {
        const selected = chatList.querySelector(`[data-chat-id="${selectedChatId}"]`);
        selected?.classList.add("active");
        if (selected) updateCallButtonsForChat(selected.dataset.chatId, selected.dataset.chatType);
    } else updateCallButtonsForChat(0, "public");
}
