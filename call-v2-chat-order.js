// =========================================
// Move chats to the top after calls
// =========================================
(function () {
    "use strict";

    if (window.__chatCallOrderInstalled) return;
    window.__chatCallOrderInstalled = true;

    let lastOpenState = false;
    let lastMovedChatId = 0;

    function currentChatId() {
        const id = Number(window.currentChatId || 0);
        if (id > 0) return id;
        try {
            const globalId = Number(currentChatId || 0);
            if (globalId > 0) return globalId;
        } catch {}
        return 0;
    }

    function moveCurrentChat() {
        const id = currentChatId();
        if (!id || typeof window.moveChatToTop !== "function") return;
        if (id === lastMovedChatId) return;

        const item = document.querySelector(`#chatList .chat-item[data-chat-id="${id}"]`);
        if (!item || item.dataset.chatType === "public") return;

        window.moveChatToTop(id, new Date().toISOString());
        lastMovedChatId = id;
    }

    function resetIfClosed() {
        const root = document.getElementById("chatCallV2");
        const incoming = document.getElementById("cv2Incoming");
        const controls = document.getElementById("cv2Controls");
        const open = Boolean(root?.classList.contains("open"));
        const activeCall = open && (Boolean(controls && getComputedStyle(controls).display !== "none") || Boolean(incoming && getComputedStyle(incoming).display !== "none"));

        if (activeCall && !lastOpenState) {
            lastMovedChatId = 0;
            moveCurrentChat();
        }

        if (!activeCall && lastOpenState) {
            lastMovedChatId = 0;
        }

        lastOpenState = activeCall;
    }

    setInterval(resetIfClosed, 250);
})();
