// =========================================
// СУПЕРАДМИНИСТРАТОР: ВСЕ ГРУППЫ И УЧАСТНИКИ
// =========================================
(function () {
    "use strict";

    var menuHooked = false;
    var refreshBusy = false;

    function isSA() {
        var u = window.currentUser;
        if (!u || !u.id || !window.supabaseClient) return Promise.resolve(false);
        return window.supabaseClient.from("profiles").select("role,approved").eq("id", u.id).maybeSingle().then(function (r) {
            return !r.error && r.data && r.data.approved === true && r.data.role === "superadmin";
        });
    }

    function getItem(id) {
        return document.querySelector('.chat-item[data-chat-id="' + Number(id) + '"]');
    }

    function getMembers(chatId) {
        return window.supabaseClient.rpc("get_chat_members", { p_chat_id: chatId }).then(function (r) {
            if (r.error) throw r.error;
            return r.data || [];
        });
    }

    function addExternalGroup(c) {
        var list = document.getElementById("chatList");
        if (!list || getItem(c.chat_id)) return;
        var name = String(c.chat_name || "Групповой чат");
        var div = document.createElement("div");
        div.className = "chat-item group-chat superadmin-unjoined-group";
        div.dataset.chatId = c.chat_id;
        div.dataset.chatType = "group";
        div.dataset.superadminGroup = "true";
        div.dataset.lastActivity = c.last_message_at || "";
        div.innerHTML = '<span class="chat-item-main"><span class="chat-item-icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M14 19.5a4 4 0 0 1 6.5-2.9"/></svg></span><span class="chat-item-name"></span><span class="chat-message-status" data-chat-status-id="' + c.chat_id + '"></span></span><span class="chat-item-actions"></span>';
        div.querySelector(".chat-item-name").textContent = name;
        var label = document.createElement("span");
        label.style.cssText = "display:block;margin-top:2px;font-size:12px;opacity:.7";
        label.textContent = "(вы не участник)";
        div.querySelector(".chat-item-name").appendChild(label);

        var timer = null, longPress = false;
        div.addEventListener("pointerdown", function (e) {
            if (e.pointerType === "mouse") return;
            longPress = false;
            clearTimeout(timer);
            timer = setTimeout(function () {
                longPress = true;
                if (typeof window.showChatActionMenu === "function") window.showChatActionMenu(c.chat_id, div);
            }, 500);
        }, { passive: true });
        div.addEventListener("pointerup", function () { clearTimeout(timer); });
        div.addEventListener("pointercancel", function () { clearTimeout(timer); });
        div.addEventListener("contextmenu", function (e) {
            e.preventDefault(); e.stopPropagation();
            if (typeof window.showChatActionMenu === "function") window.showChatActionMenu(c.chat_id, div);
        });
        div.addEventListener("click", async function () {
            if (longPress) { longPress = false; return; }
            if (document.getElementById("chatActionMenu")) return;
            window.currentChatId = Number(c.chat_id);
            document.querySelectorAll(".chat-item.active").forEach(function (x) { x.classList.remove("active"); });
            div.classList.add("active");
            var title = document.getElementById("chatTitle");
            if (title) title.textContent = name;
            if (typeof window.openMobileChatView === "function") window.openMobileChatView();
            if (typeof window.loadMessages === "function") await window.loadMessages();
            if (typeof window.updateUnreadCount === "function") await window.updateUnreadCount(Number(c.chat_id));
        });
        list.appendChild(div);
    }

    async function loadAllGroups() {
        if (refreshBusy) return;
        refreshBusy = true;
        try {
            if (!(await isSA())) return;
            var r = await window.supabaseClient.rpc("get_my_group_chats");
            if (r.error) throw r.error;
            (r.data || []).forEach(function (c) {
                if (!c.is_member) addExternalGroup(c);
            });
            var list = document.getElementById("chatList");
            if (list) Array.prototype.slice.call(list.querySelectorAll('.chat-item[data-superadmin-group="true"]')).forEach(function (x) { list.appendChild(x); });
        } catch (e) {
            console.error("Не удалось загрузить группы суперадминистратору:", e);
        } finally {
            refreshBusy = false;
        }
    }

    function hookDeleteMenu() {
        if (menuHooked || typeof window.showChatActionMenu !== "function") return;
        var original = window.showChatActionMenu;
        window.showChatActionMenu = async function (chatId, anchor) {
            var sa = await isSA();
            var item = getItem(chatId);
            if (!sa || !item || item.dataset.chatType !== "group") {
                original(chatId, anchor);
                return;
            }
            var old = document.getElementById("chatActionMenu");
            if (old) old.remove();
            var menu = document.createElement("div");
            menu.id = "chatActionMenu";
            menu.style.cssText = "position:fixed;z-index:99999;min-width:205px;background:#000;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;font-size:15px;color:#fff";
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = "Удалить группу";
            button.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit";
            button.onclick = async function (e) {
                e.stopPropagation();
                var groupName = item.querySelector(".chat-item-name") ? item.querySelector(".chat-item-name").firstChild.textContent : "группу";
                if (!confirm("Удалить группу «" + groupName + "» полностью?")) return;
                button.disabled = true;
                var r = await window.supabaseClient.rpc("delete_group_chat", { p_chat_id: Number(chatId) });
                if (r.error) {
                    alert(r.error.message || "Не удалось удалить группу.");
                    button.disabled = false;
                    return;
                }
                menu.remove();
                if (Number(window.currentChatId) === Number(chatId)) {
                    window.currentChatId = 0;
                    var title = document.getElementById("chatTitle");
                    if (title) title.textContent = "Выберите чат";
                }
                if (typeof window.loadChats === "function") window.loadChats();
            };
            menu.appendChild(button);
            document.body.appendChild(menu);
            var rect = anchor.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 220)) + "px";
            menu.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 75)) + "px";
            setTimeout(function () { document.addEventListener("click", function () { if (menu) menu.remove(); }, { once: true }); }, 0);
        };
        menuHooked = true;
    }

    function usersRoot() { return document.getElementById("chatUsersOverlay"); }

    function addControl(text, id, handler) {
        var list = document.getElementById("chatUsersList");
        if (!list || !list.parentElement || document.getElementById(id)) return;
        var b = document.createElement("button");
        b.id = id; b.type = "button"; b.textContent = text;
        b.style.cssText = "display:flex;width:100%;margin-top:12px;padding:11px 14px;border:1px solid #5a4636;border-radius:9px;background:#5a4636;color:#fff;text-align:center;align-items:center;justify-content:center;font:inherit;font-weight:600;cursor:pointer;box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
        b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); handler(); };
        list.parentElement.appendChild(b);
    }

    async function openAdd(chatId) {
        var root = usersRoot(); if (!root) return;
        root.innerHTML = "";
        var box = document.createElement("div"); box.style.cssText = "width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;overflow:hidden";
        var title = document.createElement("div"); title.textContent = "Добавить пользователя"; title.style.cssText = "padding:16px 18px 10px;font-size:19px;font-weight:700"; box.appendChild(title);
        var input = document.createElement("input"); input.placeholder = "Введите имя пользователя"; input.autocomplete = "off"; input.style.cssText = "margin:0 14px 8px;padding:12px 14px;border:1px solid #ccc;border-radius:10px;font-size:16px;box-sizing:border-box"; box.appendChild(input);
        var results = document.createElement("div"); results.style.cssText = "overflow-y:auto;padding:0 8px 8px"; box.appendChild(results);
        var status = document.createElement("div"); status.textContent = "Введите имя пользователя"; status.style.cssText = "padding:10px;color:#777;text-align:center"; box.appendChild(status);
        var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Отмена"; cancel.style.cssText = "border:0;background:transparent;padding:10px 14px;text-align:left;font-size:15px;cursor:pointer"; cancel.onclick = window.openChatUsers; box.appendChild(cancel);
        var ms = await getMembers(chatId).catch(function () { return []; });
        var ids = ms.map(function (m) { return String(m.user_id); });
        var timer = null;
        input.oninput = function () {
            clearTimeout(timer);
            timer = setTimeout(async function () {
                var q = input.value.trim(); results.innerHTML = "";
                if (!q) { status.textContent = "Введите имя пользователя"; return; }
                status.textContent = "Поиск…";
                var r = await window.supabaseClient.rpc("search_users", { p_search: q });
                if (r.error) { status.textContent = "Не удалось выполнить поиск"; return; }
                var users = (r.data || []).filter(function (u) { return !ids.includes(String(u.id)) && String(u.id) !== String(window.currentUser.id); });
                if (!users.length) { status.textContent = "Пользователь не найден"; return; }
                status.textContent = "";
                users.forEach(function (u) {
                    var b = document.createElement("button"); b.type = "button"; b.textContent = u.username;
                    b.style.cssText = "display:block;width:100%;border:0;background:transparent;text-align:left;padding:11px 10px;border-radius:10px;font-size:16px;cursor:pointer";
                    b.onclick = async function () {
                        b.disabled = true;
                        var x = await window.supabaseClient.rpc("add_chat_member", { p_chat_id: chatId, p_user_id: u.id });
                        if (x.error) { alert(x.error.message || "Не удалось добавить пользователя."); b.disabled = false; return; }
                        window.openChatUsers();
                    };
                    results.appendChild(b);
                });
            }, 180);
        };
        root.appendChild(box); input.focus();
    }

    async function openRemove(chatId) {
        var root = usersRoot(); if (!root) return;
        root.innerHTML = "";
        var box = document.createElement("div"); box.style.cssText = "width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;overflow:hidden";
        var title = document.createElement("div"); title.textContent = "Удалить пользователя"; title.style.cssText = "padding:16px 18px 10px;font-size:19px;font-weight:700"; box.appendChild(title);
        var results = document.createElement("div"); results.style.cssText = "overflow-y:auto;padding:0 8px 8px"; box.appendChild(results);
        var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Отмена"; cancel.style.cssText = "border:0;background:transparent;padding:10px 14px;text-align:left;font-size:15px;cursor:pointer"; cancel.onclick = window.openChatUsers; box.appendChild(cancel); root.appendChild(box);
        var ms = await getMembers(chatId); var me = String(window.currentUser.id);
        ms.filter(function (m) { return String(m.user_id) !== me; }).forEach(function (m) {
            var b = document.createElement("button"); b.type = "button"; b.textContent = (m.nickname || m.username) + "  @" + m.username;
            b.style.cssText = "display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px 10px;border-radius:10px;font-size:16px;cursor:pointer";
            b.onclick = async function () {
                if (!confirm("Удалить пользователя «" + (m.nickname || m.username) + "» из группы?")) return;
                var x = await window.supabaseClient.rpc("remove_chat_member", { p_chat_id: chatId, p_user_id: m.user_id });
                if (x.error) { alert(x.error.message || "Не удалось удалить пользователя."); return; }
                window.openChatUsers();
            };
            results.appendChild(b);
        });
    }

    async function refreshControls() {
        if (!(await isSA())) return;
        var item = getItem(window.currentChatId || 0);
        if (!item || item.dataset.chatType !== "group" || !usersRoot()) return;
        addControl("＋ Добавить пользователя", "sa-add-user-button", function () { openAdd(Number(window.currentChatId)); });
        addControl("− Удалить пользователя", "sa-remove-user-button", function () { openRemove(Number(window.currentChatId)); });
    }

    function start() {
        setTimeout(function () { hookDeleteMenu(); loadAllGroups(); refreshControls(); }, 400);
        if (document.body && window.MutationObserver) {
            new MutationObserver(function () {
                hookDeleteMenu();
                loadAllGroups();
                refreshControls();
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();
