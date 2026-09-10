// =========================================
// МЕНЮ ТРЁХ ТОЧЕК В ШАПКЕ ЧАТА
// Только создание меню. Выход из чата/группы сюда не переносится.
// =========================================

(function () {
    "use strict";

    function getHeaderActions() {
        return document.querySelector(".chat-header-actions");
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

        var title = type === "group" ? "Настройки группы" : "Настройки чата";

        var item = document.createElement("button");
        item.type = "button";
        item.textContent = title;
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
            closeMenu();
            console.log(title + ": интерфейс создан, обработчик настроек пока не подключается.");
        });

        menu.appendChild(item);
        document.body.appendChild(menu);

        var rect = button.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)) + "px";
        menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 60)) + "px";

        setTimeout(function () {
            document.addEventListener("click", closeMenu, { once: true });
        }, 0);
    }

    function ensureButton() {
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
