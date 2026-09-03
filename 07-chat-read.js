// ===============================
// Определение последнего видимого сообщения
// ===============================
function getLastVisibleMessage() {
    const box = document.getElementById("messages");
    if (!box) return null;
    const messages = box.querySelectorAll(".message[data-message-id]");
    if (!messages.length) return null;
    const boxRect = box.getBoundingClientRect();
    let lastVisibleMessage = null;
    messages.forEach(message => {
        const rect = message.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        if (center >= boxRect.top && center <= boxRect.bottom) lastVisibleMessage = message;
    });
    return lastVisibleMessage ? Number(lastVisibleMessage.dataset.messageId) : null;
}

// ===============================
// Отметка сообщений как прочитанных
// ===============================
async function markChatAsRead() {
    if (!currentChatId || !currentUser) return;
    const visibleMessageId = getLastVisibleMessage();
    if (!visibleMessageId || visibleMessageId <= localLastReadMessageId) return;

    const { error } = await supabaseClient.rpc("mark_chat_read", {
        p_chat_id: Number(currentChatId),
        p_message_id: visibleMessageId
    });
    if (error) {
        console.log("Ошибка отметки прочтения:", error);
        return;
    }

    localLastReadMessageId = visibleMessageId;
    await updateUnreadCount(currentChatId);
}

function scheduleReadReceipt() {
    clearTimeout(readTimer);
    readTimer = setTimeout(() => { void markChatAsRead(); }, 120);
}

const messagesBox = document.getElementById("messages");
if (messagesBox) {
    messagesBox.addEventListener("scroll", scheduleReadReceipt, { passive: true });
    window.addEventListener("resize", scheduleReadReceipt);
}
window.markChatAsRead = markChatAsRead;
window.scheduleReadReceipt = scheduleReadReceipt;
