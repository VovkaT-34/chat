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
    var originalThemeSettings = null;

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

    function closeDisappearingSettings() {
        var overlay = document.getElementById("chatDisappearingSettingsOverlay");
        if (overlay) overlay.remove();
    }

    function openDisappearingSettings() {
        closeDisappearingSettings();
        var overlay = document.createElement("div");
        overlay.id = "chatDisappearingSettingsOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box";

        var panel = document.createElement("div");
        panel.style.cssText = "width:min(420px,calc(100vw - 28px));background:#fff;color:#222;border-radius:16px;box-shadow:0 18px 55px rgba(0,0,0,.30);padding:18px;font-family:Arial,sans-serif;box-sizing:border-box;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";

        var title = document.createElement("h3");
        title.textContent = "Исчезающие сообщения";
        title.style.cssText = "margin:0 0 16px;font-size:20px";
        panel.appendChild(title);

        var grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:9px";
        var chatId = Number(window.currentChatId || 0);
        var current = loadId(chatId);
        OPTIONS.forEach(function (option) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = option.label;
            button.style.cssText = "border:1px solid #d5d5d5;background:#fff;color:#222;border-radius:10px;padding:11px 8px;cursor:pointer;font:700 14px Arial,sans-serif;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
            if (current === option.id) {
                button.style.background = "#8b5a3c";
                button.style.color = "#fff";
                button.style.borderColor = "#8b5a3c";
            }
            button.addEventListener("click", function () {
                saveId(chatId, option.id);
                grid.querySelectorAll("button").forEach(function (item) {
                    item.style.background = "#fff";
                    item.style.color = "#222";
                    item.style.borderColor = "#d5d5d5";
                });
                button.style.background = "#8b5a3c";
                button.style.color = "#fff";
                button.style.borderColor = "#8b5a3c";
                refreshAfterChange();
                if (typeof window.loadMessages === "function") void window.loadMessages();
            });
            grid.appendChild(button);
        });
        panel.appendChild(grid);

        var footer = document.createElement("div");
        footer.style.cssText = "display:flex;justify-content:flex-end;margin-top:18px";
        var closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.textContent = "Готово";
        closeButton.style.cssText = "border:0;background:#8b5a3c;color:#fff;padding:9px 15px;border-radius:9px;font-weight:700;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
        closeButton.addEventListener("click", closeDisappearingSettings);
        footer.appendChild(closeButton);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) { if (event.target === overlay) closeDisappearingSettings(); });
    }

    function closeSettingsChoice() {
        var overlay = document.getElementById("chatSettingsChoiceOverlay");
        if (overlay) overlay.remove();
    }

    function openSettingsChoice() {
        closeSettingsChoice();
        var overlay = document.createElement("div");
        overlay.id = "chatSettingsChoiceOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box";

        var panel = document.createElement("div");
        panel.style.cssText = "width:min(300px,calc(100vw - 28px));background:#000;color:#fff;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.35);padding:6px;font-family:Arial,sans-serif;box-sizing:border-box;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";

        function addChoice(text, handler) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = text;
            button.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:12px;border-radius:8px;cursor:pointer;font:inherit;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
            button.addEventListener("click", function (event) { event.stopPropagation(); closeSettingsChoice(); handler(); });
            panel.appendChild(button);
        }

        addChoice("Настройка темы", function () {
            if (typeof originalThemeSettings === "function") originalThemeSettings();
        });
        addChoice("Исчезающие сообщения", openDisappearingSettings);

        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) { if (event.target === overlay) closeSettingsChoice(); });
    }

    function wrapSettings() {
        if (typeof window.openChatSettings !== "function") return;
        if (!originalThemeSettings) originalThemeSettings = window.openChatSettings;
        if (window.__chatDisappearingSettingsWrapped) return;
        window.openChatSettings = function () {
            if (!isSupportedChat()) {
                originalThemeSettings();
                return;
            }
            openSettingsChoice();
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

    setTimeout(function () { wrapRender(); wrapSettings(); }, 0);
})();
