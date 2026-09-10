// =========================================
// ИСЧЕЗАЮЩИЕ СООБЩЕНИЯ
// Локальная настройка для Общего чата и групп (3+).
// Supabase сообщения не удаляются этим механизмом.
// =========================================

(function () {
    "use strict";

    var STORAGE_PREFIX = "chatDisappearing:";
    var OPTIONS = [
        { id: "1h", hours: 1, label: "1 час" },
        { id: "3h", hours: 3, label: "3 часа" },
        { id: "3d", hours: 72, label: "3 суток" },
        { id: "1w", hours: 168, label: "1 неделю" }
    ];
    var DEFAULT_ID = "1w";
    var timer = null;

    function isSupportedChat() {
        var id = Number(window.currentChatId || 0);
        if (!id) return false;
        var item = document.querySelector('.chat-item[data-chat-id="' + id + '"]');
        if (!item) return false;
        var type = item.dataset.chatType || "";
        return type === "public" || type === "group";
    }

    function storageKey(chatId) {
        var userId = window.currentUser && window.currentUser.id ? window.currentUser.id : "guest";
        return STORAGE_PREFIX + userId + ":" + Number(chatId || window.currentChatId || 0);
    }

    function getOption(id) {
        return OPTIONS.find(function (item) { return item.id === id; }) || OPTIONS.find(function (item) { return item.id === DEFAULT_ID; });
    }

    function loadId(chatId) {
        try {
            var saved = localStorage.getItem(storageKey(chatId));
            return getOption(saved || DEFAULT_ID).id;
        } catch (error) {
            return DEFAULT_ID;
        }
    }

    function saveId(chatId, id) {
        var option = getOption(id);
        try { localStorage.setItem(storageKey(chatId), option.id); } catch (error) {}
        return option;
    }

    function getHours(chatId) {
        return getOption(loadId(chatId)).hours;
    }

    function isExpired(message, chatId) {
        if (!isSupportedChat() && !chatId) return false;
        var created = Date.parse(message && message.created_at ? message.created_at : "");
        if (!created) return false;
        return Date.now() - created >= getHours(chatId) * 60 * 60 * 1000;
    }

    function removeExpiredDomMessages() {
        if (!isSupportedChat()) return;
        var box = document.getElementById("messages");
        if (!box) return;
        var hours = getHours();
        var cutoff = Date.now() - hours * 60 * 60 * 1000;
        box.querySelectorAll(".message[data-message-created-at]").forEach(function (node) {
            var created = Date.parse(node.getAttribute("data-message-created-at") || "");
            if (created && created <= cutoff) node.remove();
        });
    }

    function restartTimer() {
        if (timer) clearInterval(timer);
        timer = setInterval(removeExpiredDomMessages, 30000);
        removeExpiredDomMessages();
    }

    function refreshAfterChange() {
        removeExpiredDomMessages();
        restartTimer();
        if (typeof window.updateScrollToBottomButton === "function") window.updateScrollToBottomButton();
    }

    window.chatDisappearing = {
        options: OPTIONS,
        isSupportedChat: isSupportedChat,
        loadId: loadId,
        saveId: saveId,
        getHours: getHours,
        isExpired: isExpired,
        refresh: refreshAfterChange
    };

    restartTimer();
})();
