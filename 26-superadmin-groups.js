// ===============================
// Суперадминистратор: участники групп
// ===============================
(function () {
    "use strict";

    function isSA() {
        var u = window.currentUser;
        if (!u || !u.id || !window.supabaseClient) return Promise.resolve(false);
        return window.supabaseClient.from("profiles").select("role,approved").eq("id", u.id).maybeSingle().then(function (r) {
            return !r.error && r.data && r.data.approved === true && r.data.role === "superadmin";
        });
    }
    function members(chatId) { return window.supabaseClient.rpc("get_chat_members", { p_chat_id: chatId }).then(function (r) { if (r.error) throw r.error; return r.data || []; }); }
    function root() { return document.getElementById("chatUsersOverlay"); }
    function addButton(text, handler) {
        var list = document.getElementById("chatUsersList");
        if (!list || !list.parentElement || document.getElementById("sa-" + (text.indexOf("Добавить") >= 0 ? "add" : "remove"))) return;
        var b = document.createElement("button"); b.id = "sa-" + (text.indexOf("Добавить") >= 0 ? "add" : "remove"); b.type = "button"; b.textContent = text;
        b.style.cssText = "display:flex;width:100%;margin-top:12px;padding:11px 14px;border:1px solid #5a4636;border-radius:9px;background:#5a4636;color:#fff;text-align:center;align-items:center;justify-content:center;font:inherit;font-weight:600;cursor:pointer;box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
        b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); handler(); };
        list.parentElement.appendChild(b);
    }
    async function showAdd(chatId) {
        var r = root(); if (!r) return;
        r.innerHTML = "";
        var box = document.createElement("div"); box.style.cssText = "width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;overflow:hidden";
        var title = document.createElement("div"); title.textContent = "Добавить пользователя"; title.style.cssText = "padding:16px 18px 10px;font-size:19px;font-weight:700"; box.appendChild(title);
        var input = document.createElement("input"); input.placeholder = "Введите имя пользователя"; input.autocomplete = "off"; input.style.cssText = "margin:0 14px 8px;padding:12px 14px;border:1px solid #ccc;border-radius:10px;font-size:16px;box-sizing:border-box"; box.appendChild(input);
        var results = document.createElement("div"); results.style.cssText = "overflow-y:auto;padding:0 8px 8px"; box.appendChild(results);
        var status = document.createElement("div"); status.textContent = "Введите имя пользователя"; status.style.cssText = "padding:10px;color:#777;text-align:center"; box.appendChild(status);
        var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Отмена"; cancel.style.cssText = "border:0;background:transparent;padding:10px 14px;text-align:left;font-size:15px;cursor:pointer"; cancel.onclick = window.openChatUsers; box.appendChild(cancel);
        var ms = await members(chatId).catch(function () { return []; }); var ids = ms.map(function (m) { return String(m.user_id); }); var timer = null;
        input.oninput = function () { clearTimeout(timer); timer = setTimeout(async function () {
            var q = input.value.trim(); results.innerHTML = ""; if (!q) { status.textContent = "Введите имя пользователя"; return; }
            status.textContent = "Поиск…"; var r = await window.supabaseClient.rpc("search_users", { p_search: q }); if (r.error) { status.textContent = "Не удалось выполнить поиск"; return; }
            var users = (r.data || []).filter(function (u) { return !ids.includes(String(u.id)) && String(u.id) !== String(window.currentUser.id); });
            if (!users.length) { status.textContent = "Пользователь не найден"; return; } status.textContent = "";
            users.forEach(function (u) { var b = document.createElement("button"); b.type = "button"; b.textContent = u.username; b.style.cssText = "display:block;width:100%;border:0;background:transparent;text-align:left;padding:11px 10px;border-radius:10px;font-size:16px;cursor:pointer"; b.onclick = async function () { b.disabled = true; var x = await window.supabaseClient.rpc("add_chat_member", { p_chat_id: chatId, p_user_id: u.id }); if (x.error) { alert(x.error.message || "Не удалось добавить пользователя."); b.disabled = false; return; } if (window.openChatUsers) window.openChatUsers(); }; results.appendChild(b); });
        }, 180); };
        r.appendChild(box); input.focus();
    }
    async function showRemove(chatId) {
        var r = root(); if (!r) return; r.innerHTML = "";
        var box = document.createElement("div"); box.style.cssText = "width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;overflow:hidden";
        var title = document.createElement("div"); title.textContent = "Удалить пользователя"; title.style.cssText = "padding:16px 18px 10px;font-size:19px;font-weight:700"; box.appendChild(title);
        var results = document.createElement("div"); results.style.cssText = "overflow-y:auto;padding:0 8px 8px"; box.appendChild(results);
        var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Отмена"; cancel.style.cssText = "border:0;background:transparent;padding:10px 14px;text-align:left;font-size:15px;cursor:pointer"; cancel.onclick = window.openChatUsers; box.appendChild(cancel); r.appendChild(box);
        var ms = await members(chatId); var me = String(window.currentUser.id);
        ms.filter(function (m) { return String(m.user_id) !== me; }).forEach(function (m) { var b = document.createElement("button"); b.type = "button"; b.textContent = (m.nickname || m.username) + "  @" + m.username; b.style.cssText = "display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px 10px;border-radius:10px;font-size:16px;cursor:pointer"; b.onclick = async function () { if (!confirm("Удалить пользователя «" + (m.nickname || m.username) + "» из группы?")) return; var x = await window.supabaseClient.rpc("remove_chat_member", { p_chat_id: chatId, p_user_id: m.user_id }); if (x.error) { alert(x.error.message || "Не удалось удалить пользователя."); return; } window.openChatUsers(); }; results.appendChild(b); });
    }
    async function refresh() {
        if (!(await isSA())) return;
        var item = document.querySelector('.chat-item[data-chat-id="' + Number(window.currentChatId || 0) + '"]');
        if (!item || item.dataset.chatType !== "group" || !root()) return;
        addButton("＋ Добавить пользователя", function () { showAdd(Number(window.currentChatId)); });
        addButton("− Удалить пользователя", function () { showRemove(Number(window.currentChatId)); });
    }
    function start() { refresh(); if (document.body && window.MutationObserver) new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true }); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
