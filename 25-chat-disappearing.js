// =========================================
// ИСЧЕЗАЮЩИЕ СООБЩЕНИЯ
// Локальная настройка для Общего чата и групп (3+).
// Supabase сообщения этим механизмом не удаляются.
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

    function getCurrentChatItem() {
        var id = Number(window.currentChatId || 0);
        if (!id) return null;
        return document.querySelector('.chat-item[data-chat-id="' + id + '"]');
    }

    function isSupportedChat(chatId) {
        var item = chatId ? document.querySelector('.chat-item[data-chat-id="' + Number(chatId) + '"]') : getCurrentChatItem();
        if (!item) return false;
        var type = item.dataset.chatType || "";
        if (type === "group") return true;
        if (type === "public") {
            var name = item.querySelector(".chat-item-name");
            return !!name && name.textContent.trim() === "Общий чат";
        }
        return false;
    }

    function storageKey(chatId) {
        var userId = window.currentUser && window.currentUser.id ? window.currentUser.id : "guest";
        return STORAGE_PREFIX + userId + ":" + Number(chatId || window.currentChatId || 0);
    }

    function getOption(id) {
        return OPTIONS.find(function (item) { return item.id === id; }) || OPTIONS.find(function (item) { return item.id === DEFAULT_ID; });
    }

    function loadId(chatId) {
        try { return getOption(localStorage.getItem(storageKey(chatId)) || DEFAULT_ID).id; }
        catch (error) { return DEFAULT_ID; }
    }

    function saveId(chatId, id) {
        var option = getOption(id);
        try { localStorage.setItem(storageKey(chatId), option.id); } catch (error) {}
        return option;
    }

    function getHours(chatId) { return getOption(loadId(chatId)).hours; }

    function isExpired(message, chatId) {
        if (!isSupportedChat(chatId)) return false;
        var created = Date.parse(message && message.created_at ? message.created_at : "");
        return !!created && Date.now() - created >= getHours(chatId) * 60 * 60 * 1000;
    }

    function removeExpiredDomMessages() {
        if (!isSupportedChat()) return;
        var box = document.getElementById("messages");
        if (!box) return;
        var cutoff = Date.now() - getHours() * 60 * 60 * 1000;
        box.querySelectorAll(".message[data-message-created-at]").forEach(function (node) {
            var created = Date.parse(node.getAttribute("data-message-created-at") || "");
            if (created && created <= cutoff) node.remove();
        });
        if (typeof window.updatePinnedMessagesBar === "function") window.updatePinnedMessagesBar();
    }

    function restartTimer() {
        if (timer) clearInterval(timer);
        timer = setInterval(removeExpiredDomMessages, 30000);
        removeExpiredDomMessages();
    }

    function refreshAfterChange() {
        restartTimer();
        if (typeof window.updateScrollToBottomButton === "function") window.updateScrollToBottomButton();
    }

    function wrapRender() {
        if (typeof window.renderMessage !== "function" || window.__chatDisappearingRenderWrapped) return;
        var originalRenderMessage = window.renderMessage;
        window.renderMessage = function (message) {
            if (isExpired(message)) return null;
            var element = originalRenderMessage(message);
            if (element && message && message.created_at) element.setAttribute("data-message-created-at", message.created_at);
            return element;
        };
        window.__chatDisappearingRenderWrapped = true;
    }

    function addDisappearingSection(panel) {
        if (!panel || panel.querySelector(".chat-disappearing-section")) return;
        var section = document.createElement("div");
        section.className = "chat-theme-section chat-disappearing-section";
        var title = document.createElement("div");
        title.className = "chat-theme-section-title";
        title.textContent = "Исчезающие сообщения";
        section.appendChild(title);

        var grid = document.createElement("div");
        grid.className = "chat-text-grid";
        var chatId = Number(window.currentChatId || 0);
        var current = loadId(chatId);
        OPTIONS.forEach(function (option) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-text-option" + (current === option.id ? " selected" : "");
            button.textContent = option.label;
            button.addEventListener("click", function () {
                saveId(chatId, option.id);
                grid.querySelectorAll(".chat-text-option").forEach(function (item) { item.classList.remove("selected"); });
                button.classList.add("selected");
                refreshAfterChange();
                if (typeof window.loadMessages === "function") void window.loadMessages();
            });
            grid.appendChild(button);
        });
        section.appendChild(grid);
        panel.insertBefore(section, panel.querySelector(".chat-theme-footer"));
    }

    // Не заменяем окно настроек целиком: добавляем в него отдельный выбор таймера.
    function wrapSettings() {
        if (typeof window.openChatSettings !== "function" || window.__chatDisappearingSettingsWrapped) return;
        var originalOpenSettings = window.openChatSettings;
        window.openChatSettings = function () {
            originalOpenSettings();
            if (!isSupportedChat()) return;
            var panel = document.querySelector(".chat-theme-settings");
            addDisappearingSection(panel);
        };
        window.__chatDisappearingSettingsWrapped = true;
    }

    function init() {
        wrapRender();
        wrapSettings();
        restartTimer();
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

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();

    // 24-chat-themes.js загружается раньше этого файла, поэтому обёртка гарантированно ставится после него.
    setTimeout(function () { wrapRender(); wrapSettings(); }, 0);
})();
