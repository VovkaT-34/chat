// =========================================
// ПОЛЬЗОВАТЕЛИ ЧАТА / НИКИ
// Список участников, профиль пользователя и локальные ники.
// =========================================

(function () {
    "use strict";

    function getChatType() {
        var id = Number(window.currentChatId || 0);
        if (!id) return null;
        var item = document.querySelector('.chat-item[data-chat-id="' + id + '"]');
        return item ? (item.dataset.chatType || null) : null;
    }

    function closeUsers() {
        var root = document.getElementById("chatUsersOverlay");
        if (root) root.remove();
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function baseOverlay() {
        var root = document.createElement("div");
        root.id = "chatUsersOverlay";
        root.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:100001",
            "background:rgba(0,0,0,.55)",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "padding:16px",
            "box-sizing:border-box"
        ].join(";");

        root.addEventListener("click", function (event) {
            if (event.target === root) closeUsers();
        });

        return root;
    }

    function panel(title) {
        var box = document.createElement("div");
        box.style.cssText = [
            "width:min(440px,100%)",
            "max-height:min(720px,92vh)",
            "overflow:auto",
            "background:#111",
            "color:#fff",
            "border:1px solid #333",
            "border-radius:16px",
            "box-shadow:0 12px 40px rgba(0,0,0,.4)",
            "padding:16px",
            "box-sizing:border-box"
        ].join(";");

        var head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px";

        var h = document.createElement("div");
        h.textContent = title;
        h.style.cssText = "font-size:20px;font-weight:700";

        var close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.setAttribute("aria-label", "Закрыть");
        close.style.cssText = "width:36px;height:36px;border:0;border-radius:50%;background:#2b2b2b;color:#fff;font-size:25px;cursor:pointer;line-height:1";
        close.addEventListener("click", closeUsers);

        head.appendChild(h);
        head.appendChild(close);
        box.appendChild(head);
        return box;
    }

    function row(member, onClick) {
        var button = document.createElement("button");
        button.type = "button";
        button.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:12px 8px;border-radius:10px;cursor:pointer";
        button.addEventListener("mouseenter", function () { button.style.background = "#222"; });
        button.addEventListener("mouseleave", function () { button.style.background = "none"; });

        var shown = member.nickname || member.username;
        var extra = member.nickname ? " (" + member.username + ")" : "";
        button.innerHTML = "<div style=\"font-weight:600\">" + escapeHtml(shown) + "</div>" +
            "<div style=\"font-size:13px;color:#aaa;margin-top:3px\">@" + escapeHtml(member.username) +
            (member.role === "admin" ? " · администратор" : "") + "</div>";
        if (extra) {
            button.firstChild.title = member.username;
        }
        button.addEventListener("click", function () { onClick(member); });
        return button;
    }

    async function loadMembers(chatId) {
        var result = await window.supabaseClient.rpc("get_chat_members", { p_chat_id: chatId });
        if (result.error) throw result.error;
        return result.data || [];
    }

    function renderMembers(members, type, box) {
        var list = document.createElement("div");
        list.id = "chatUsersList";

        if (!members.length) {
            var empty = document.createElement("div");
            empty.textContent = "Пользователи не найдены.";
            empty.style.cssText = "padding:20px 8px;color:#aaa;text-align:center";
            list.appendChild(empty);
        } else {
            members.forEach(function (member) {
                list.appendChild(row(member, function () {
                    showUserProfile(member, type);
                }));
            });
        }

        box.appendChild(list);

        if (type === "group" && members.length && members[0].is_admin) {
            var add = document.createElement("button");
            add.type = "button";
            add.textContent = "＋ Добавить пользователя";
            add.style.cssText = "display:block;width:100%;margin-top:10px;padding:12px 8px;border:0;border-top:1px solid #333;background:none;color:#fff;text-align:left;font:inherit;cursor:pointer";
            add.addEventListener("click", function () {
                showAddUser(chatId);
            });
            box.appendChild(add);
        }
    }

    async function showMembers() {
        var chatId = Number(window.currentChatId || 0);
        var type = getChatType();
        if (!chatId || (type !== "private" && type !== "group")) return;

        closeUsers();
        var root = baseOverlay();
        var box = panel("Пользователи");
        var loading = document.createElement("div");
        loading.textContent = "Загрузка…";
        loading.style.cssText = "padding:20px 8px;color:#aaa;text-align:center";
        box.appendChild(loading);
        root.appendChild(box);
        document.body.appendChild(root);

        try {
            var members = await loadMembers(chatId);
            if (!document.getElementById("chatUsersOverlay")) return;
            loading.remove();
            renderMembers(members, type, box);
        } catch (error) {
            console.error("Не удалось загрузить пользователей чата:", error);
            loading.textContent = "Не удалось загрузить пользователей.";
        }
    }

    function showUserProfile(member, type) {
        var root = document.getElementById("chatUsersOverlay");
        if (!root) return;
        root.innerHTML = "";

        var box = panel("Профиль пользователя");
        var shown = document.createElement("div");
        shown.innerHTML = "<div style=\"font-size:22px;font-weight:700\">" + escapeHtml(member.nickname || member.username) + "</div>" +
            "<div style=\"color:#aaa;margin-top:5px\">@" + escapeHtml(member.username) + "</div>";
        box.appendChild(shown);

        var self = window.currentUser && String(window.currentUser.id) === String(member.user_id);
        var action = document.createElement("button");
        action.type = "button";
        action.textContent = self ? "Изменить свой ник" : "Изменить ник пользователя";
        action.style.cssText = "display:block;width:100%;margin-top:20px;padding:12px;border:1px solid #444;border-radius:10px;background:#222;color:#fff;font:inherit;cursor:pointer";
        action.addEventListener("click", function () {
            if (self) editOwnUsername(member);
            else editLocalNickname(member);
        });
        box.appendChild(action);

        var back = document.createElement("button");
        back.type = "button";
        back.textContent = "← Назад к пользователям";
        back.style.cssText = "display:block;width:100%;margin-top:8px;padding:10px;border:0;background:none;color:#aaa;font:inherit;cursor:pointer";
        back.addEventListener("click", showMembers);
        box.appendChild(back);

        root.appendChild(box);
    }

    async function editLocalNickname(member) {
        var value = window.prompt("Ник для вас:", member.nickname || member.username);
        if (value === null) return;
        value = value.trim();
        if (!value) return;

        var payload = {
            owner_user_id: window.currentUser.id,
            target_user_id: member.user_id,
            nickname: value
        };

        var result = await window.supabaseClient
            .from("contact_nicknames")
            .upsert(payload, { onConflict: "owner_user_id,target_user_id" });

        if (result.error) {
            console.error("Не удалось сохранить ник:", result.error);
            alert("Не удалось сохранить ник.");
            return;
        }
        await showMembers();
    }

    async function editOwnUsername(member) {
        var value = window.prompt("Ваш ник:", member.username);
        if (value === null) return;
        value = value.trim();
        if (!value || value === member.username) return;

        var result = await window.supabaseClient.rpc("update_my_username", { p_username: value });
        if (result.error) {
            console.error("Не удалось изменить свой ник:", result.error);
            alert("Не удалось изменить ник.");
            return;
        }

        if (window.currentUser) window.currentUser.username = value;
        await showMembers();
        if (typeof window.loadChats === "function") await window.loadChats();
    }

    function showAddUser(chatId) {
        var root = document.getElementById("chatUsersOverlay");
        if (!root) return;
        root.innerHTML = "";

        var box = panel("Добавить пользователя");
        var input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Введите имя пользователя";
        input.autocomplete = "off";
        input.style.cssText = "width:100%;box-sizing:border-box;padding:12px;border:1px solid #444;border-radius:10px;background:#1a1a1a;color:#fff;font:inherit";
        box.appendChild(input);

        var results = document.createElement("div");
        results.style.cssText = "margin-top:8px";
        box.appendChild(results);

        var back = document.createElement("button");
        back.type = "button";
        back.textContent = "← Назад";
        back.style.cssText = "display:block;width:100%;margin-top:8px;padding:10px;border:0;background:none;color:#aaa;font:inherit;cursor:pointer";
        back.addEventListener("click", showMembers);
        box.appendChild(back);
        root.appendChild(box);

        var timer = null;
        var requestNo = 0;

        async function search() {
            var q = input.value.trim();
            results.innerHTML = "";
            if (q.length < 1) return;

            var request = ++requestNo;
            var result = await window.supabaseClient.rpc("search_users", { p_search: q });
            if (request !== requestNo) return;
            if (result.error) return;

            (result.data || []).forEach(function (user) {
                var item = document.createElement("button");
                item.type = "button";
                item.textContent = user.username;
                item.style.cssText = "display:block;width:100%;padding:11px 8px;border:0;border-radius:9px;background:none;color:#fff;text-align:left;font:inherit;cursor:pointer";
                item.addEventListener("click", async function () {
                    var addResult = await window.supabaseClient.rpc("add_chat_member", {
                        p_chat_id: chatId,
                        p_user_id: user.id
                    });
                    if (addResult.error) {
                        console.error("Не удалось добавить пользователя:", addResult.error);
                        alert(addResult.error.message || "Не удалось добавить пользователя.");
                        return;
                    }
                    await showMembers();
                });
                results.appendChild(item);
            });
        }

        input.addEventListener("input", function () {
            clearTimeout(timer);
            timer = setTimeout(search, 180);
        });
        input.focus();
    }

    window.openChatUsers = showMembers;
})();