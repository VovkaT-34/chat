// =========================================
// МЕНЮ ТРЁХ ТОЧЕК В ШАПКЕ ЧАТА
// Только создание меню. Выход из чата/группы использует существующий рабочий механизм.
// =========================================

(function () {
    "use strict";

    function removeOldLeaveButton() {
        var button = document.getElementById("leaveChatButton");
        if (button) button.remove();
    }

    function getHeaderActions() {
        return document.querySelector(".chat-call-actions") ||
            document.querySelector(".chat-header-actions");
    }

    function getCurrentChatType() {
        var id = Number(window.currentChatId || 0);
        if (!id) return null;

        var item = document.querySelector('.chat-item[data-chat-id="' + id + '"]');
        return item ? (item.dataset.chatType || null) : null;
    }

    function closeMenu() {
        var menu = document.getElementById("chatHeaderMenu");
        if (menu) menu.remove();
    }

    function createMenuButton(text, handler) {
        var item = document.createElement("button");
        item.type = "button";
        item.textContent = text;
        item.setAttribute("role", "menuitem");
        item.style.cssText = [
            "display:block",
            "width:100%",
            "border:0",
            "background:none",
            "color:#fff",
            "text-align:left",
            "padding:11px 12px",
            "border-radius:8px",
            "cursor:pointer",
            "font:inherit"
        ].join(";");

        item.addEventListener("click", function (event) {
            event.stopPropagation();
            handler(event);
        });

        return item;
    }

    function showMenu(button) {
        closeMenu();

        var type = getCurrentChatType();
        if (type !== "private" && type !== "group") return;

        var menu = document.createElement("div");
        menu.id = "chatHeaderMenu";
        menu.setAttribute("role", "menu");
        menu.style.cssText = [
            "position:fixed",
            "z-index:100000",
            "min-width:210px",
            "background:#000",
            "border:1px solid #333",
            "border-radius:12px",
            "box-shadow:0 8px 28px rgba(0,0,0,.28)",
            "padding:6px",
            "font-size:15px",
            "color:#fff"
        ].join(";");

        var settingsTitle = type === "group" ? "Настройки группы" : "Настройки чата";
        var leaveTitle = type === "group" ? "Выйти из группы" : "Выйти из чата";

        var usersItem = createMenuButton("Пользователи", function () {
            closeMenu();
            if (typeof window.openChatUsers === "function") {
                window.openChatUsers();
            } else {
                console.error("Интерфейс пользователей не найден: window.openChatUsers");
            }
        });

        var settingsItem = createMenuButton(settingsTitle, function () {
            closeMenu();
            console.log(settingsTitle + ": интерфейс создан, обработчик настроек пока не подключается.");
        });

        var leaveItem = createMenuButton(leaveTitle, function () {
            closeMenu();
            if (typeof window.leaveCurrentChat === "function") {
                window.leaveCurrentChat();
            } else {
                console.error("Механизм выхода из чата не найден: window.leaveCurrentChat");
            }
        });

        menu.appendChild(usersItem);
        menu.appendChild(settingsItem);
        menu.appendChild(leaveItem);
        document.body.appendChild(menu);

        var rect = button.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)) + "px";
        menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 155)) + "px";

        setTimeout(function () {
            document.addEventListener("click", closeMenu, { once: true });
        }, 0);
    }

    function ensureButton() {
        removeOldLeaveButton();

        var actions = getHeaderActions();
        if (!actions) return;

        var existing = document.getElementById("chatHeaderMenuButton");
        if (existing) {
            var active = Number(window.currentChatId || 0) > 0 &&
                (getCurrentChatType() === "private" || getCurrentChatType() === "group");
            existing.style.display = active ? "inline-flex" : "none";
            return;
        }

        var button = document.createElement("button");
        button.id = "chatHeaderMenuButton";
        button.type = "button";
        button.title = "Меню чата";
        button.setAttribute("aria-label", "Меню чата");
        button.style.cssText = [
            "display:none",
            "width:42px",
            "height:42px",
            "min-width:42px",
            "min-height:42px",
            "padding:0",
            "border:1px solid rgba(255,255,255,.72)",
            "border-radius:50%",
            "background:#5b4638",
            "color:#fff",
            "align-items:center",
            "justify-content:center",
            "cursor:pointer",
            "font-size:23px",
            "line-height:1",
            "box-shadow:0 3px 10px rgba(35,25,18,.18)"
        ].join(";");
        button.textContent = "⋮";

        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            showMenu(button);
        });

        actions.appendChild(button);

        var active = Number(window.currentChatId || 0) > 0 &&
            (getCurrentChatType() === "private" || getCurrentChatType() === "group");
        button.style.display = active ? "inline-flex" : "none";
    }

    function refresh() {
        ensureButton();
    }

    window.refreshChatHeaderMenu = refresh;

    document.addEventListener("click", function () {
        setTimeout(refresh, 0);
    });

    var observer = new MutationObserver(function () {
        ensureButton();
    });

    function start() {
        ensureButton();
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
