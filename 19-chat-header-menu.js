// =========================================
// МЕНЮ ТРЁХ ТОЧЕК В ШАПКЕ ЧАТА
// Только создание меню. Выход из чата/группы использует существующий рабочий механизм.
// =========================================

(function () {
    "use strict";

    function getHeaderActions() { return document.querySelector(".chat-call-actions") || document.querySelector(".chat-header-actions"); }
    function getCurrentChatType() {
        var id = Number(window.currentChatId || 0); if (!id) return null;
        var item = document.querySelector('.chat-item[data-chat-id="' + id + '"]');
        return item ? (item.dataset.chatType || null) : null;
    }
    function closeMenu() { var menu = document.getElementById("chatHeaderMenu"); if (menu) menu.remove(); }
    function closeSettingsChoice() { var overlay = document.getElementById("chatSettingsChoiceOverlay"); if (overlay) overlay.remove(); }

    function openSettingsChoice() {
        closeSettingsChoice();
        var overlay = document.createElement("div");
        overlay.id = "chatSettingsChoiceOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box;pointer-events:auto";

        var panel = document.createElement("div");
        panel.style.cssText = "width:min(300px,calc(100vw - 28px));background:#000;color:#fff;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.45);padding:6px;font-family:Arial,sans-serif;box-sizing:border-box;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;pointer-events:auto";

        function addChoice(text, handler) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = text;
            button.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:12px;border-radius:8px;cursor:pointer;font:inherit;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;pointer-events:auto";
            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                closeSettingsChoice();
                handler();
            });
            panel.appendChild(button);
        }

        addChoice("Настройка темы", function () {
            if (typeof window.openChatSettings === "function") window.openChatSettings();
        });
        addChoice("Исчезающие сообщения", function () {
            if (typeof window.openChatDisappearingSettings === "function") window.openChatDisappearingSettings();
        });

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) { if (event.target === overlay) closeSettingsChoice(); });
    }

    function openSettingsFromMenu() {
        // Для всех типов чатов одинаково показываем сначала выбор настройки.
        // Поддержка исчезающих сообщений внутри самого окна остаётся прежней.
        openSettingsChoice();
    }

    function createMenuButton(text, handler) {
        var item = document.createElement("button"); item.type = "button"; item.textContent = text; item.setAttribute("role", "menuitem");
        item.style.cssText = ["display:block","width:100%","border:0","background:none","color:#fff","text-align:left","padding:11px 12px","border-radius:8px","cursor:pointer","font:inherit","user-select:none","-webkit-user-select:none","-webkit-touch-callout:none"].join(";");
        item.addEventListener("click", function (event) { event.stopPropagation(); handler(event); }); return item;
    }
    function showMenu(button) {
        closeMenu(); var type = getCurrentChatType();
        if (type !== "private" && type !== "group" && type !== "public") return;
        var menu = document.createElement("div"); menu.id = "chatHeaderMenu"; menu.setAttribute("role", "menu");
        menu.style.cssText = ["position:fixed","z-index:100000","min-width:210px","background:#000","border:1px solid #333","border-radius:12px","box-shadow:0 8px 28px rgba(0,0,0,.28)","padding:6px","font-size:15px","color:#fff","user-select:none","-webkit-user-select:none","-webkit-touch-callout:none"].join(";");
        var settingsTitle = type === "group" ? "Настройки группы" : "Настройки чата";
        var leaveTitle = type === "group" ? "Выйти из группы" : "Выйти из чата";
        if (type !== "public") {
            menu.appendChild(createMenuButton("Пользователи", function () { closeMenu(); if (typeof window.openChatUsers === "function") window.openChatUsers(); else console.error("Интерфейс пользователей не найден: window.openChatUsers"); }));
        }
        menu.appendChild(createMenuButton(settingsTitle, function () { closeMenu(); openSettingsFromMenu(); }));
        if (type !== "public") {
            menu.appendChild(createMenuButton(leaveTitle, function () { closeMenu(); if (typeof window.leaveCurrentChat === "function") window.leaveCurrentChat(); else console.error("Механизм выхода из чата не найден: window.leaveCurrentChat"); }));
        }
        document.body.appendChild(menu);
        var rect = button.getBoundingClientRect(), menuHeight = type === "public" ? 58 : 155;
        menu.style.left = Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)) + "px";
        menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 8)) + "px";
        setTimeout(function () { document.addEventListener("click", closeMenu, { once: true }); }, 0);
    }
    function ensureButton() {
        var actions = getHeaderActions(); if (!actions) return;
        var existing = document.getElementById("chatHeaderMenuButton");
        if (existing) {
            var currentType = getCurrentChatType();
            existing.style.display = Number(window.currentChatId || 0) > 0 && (currentType === "private" || currentType === "group" || currentType === "public") ? "inline-flex" : "none"; return;
        }
        var button = document.createElement("button"); button.id = "chatHeaderMenuButton"; button.type = "button"; button.title = "Меню чата"; button.setAttribute("aria-label", "Меню чата");
        button.style.cssText = ["display:none","width:42px","height:42px","min-width:42px","min-height:42px","padding:0","border:1px solid rgba(255,255,255,.72)","border-radius:50%","background:#5b4638","color:#fff","align-items:center","justify-content:center","cursor:pointer","font-size:23px","line-height:1","box-shadow:0 3px 10px rgba(35,25,18,.18)"].join(";");
        button.textContent = "⋮";
        button.addEventListener("click", function (event) { event.preventDefault(); event.stopPropagation(); showMenu(button); });
        actions.appendChild(button);
        var type = getCurrentChatType(); button.style.display = Number(window.currentChatId || 0) > 0 && (type === "private" || type === "group" || type === "public") ? "inline-flex" : "none";
    }
    function refresh() { ensureButton(); }
    window.refreshChatHeaderMenu = refresh;
    document.addEventListener("click", function () { setTimeout(refresh, 0); });
    var observer = new MutationObserver(function () { ensureButton(); });
    function start() { ensureButton(); if (document.body) observer.observe(document.body, { childList: true, subtree: true }); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
