// ===============================
// Подпись общих чатов
// ===============================
(function () {
    "use strict";

    var STYLE_ID = "public-chat-label-style";
    var LABEL = "(для всех)";

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = ".public-chat-for-all{display:block;margin-top:2px;font-size:12px;font-weight:400;line-height:1.15;opacity:.68;white-space:nowrap}.superadmin-unjoined-group{opacity:.5!important}";
        document.head.appendChild(style);
    }

    function applyLabels() {
        var list = document.getElementById("chatList");
        if (!list) return;
        ensureStyle();

        list.querySelectorAll('.chat-item[data-chat-type="public"] .chat-item-name').forEach(function (name) {
            if (name.querySelector(".public-chat-for-all")) return;
            var label = document.createElement("span");
            label.className = "public-chat-for-all";
            label.textContent = LABEL;
            name.appendChild(label);
        });
    }

    function start() {
        applyLabels();
        var list = document.getElementById("chatList");
        if (!list || !window.MutationObserver) return;
        var observer = new MutationObserver(applyLabels);
        observer.observe(list, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();

// ===============================
// Суперадминистратор: все группы
// ===============================
(function () {
    "use strict";

    var hooked = false;
    var busy = false;

    async function isSuperadmin() {
        var u = window.currentUser;
        if (!u || !u.id || !window.supabaseClient) return false;
        var r = await window.supabaseClient.from("profiles").select("role,approved").eq("id", u.id).maybeSingle();
        return !r.error && r.data && r.data.approved === true && r.data.role === "superadmin";
    }

    function getItem(id) {
        return document.querySelector('.chat-item[data-chat-id="' + Number(id) + '"]');
    }

    function addExternalGroup(c) {
        var list = document.getElementById("chatList");
        if (!list || getItem(c.chat_id)) return;
        var div = document.createElement("div");
        div.className = "chat-item group-chat superadmin-unjoined-group";
        div.dataset.chatId = c.chat_id;
        div.dataset.chatType = "group";
        div.dataset.superadminGroup = "true";
        div.dataset.lastActivity = c.last_message_at || "";
        div.innerHTML = '<span class="chat-item-main"><span class="chat-item-icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M14 19.5a4 4 0 0 1 6.5-2.9"/></svg></span><span class="chat-item-name" title="' + String(c.chat_name || "Групповой чат").replace(/"/g, "&quot;") + '">' + String(c.chat_name || "Групповой чат").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '<span style="display:block;margin-top:2px;font-size:12px;opacity:.7">(вы не участник)</span></span><span class="chat-item-actions"></span></span>';
        div.addEventListener("click", async function () {
            if (document.getElementById("chatActionMenu")) return;
            window.currentChatId = Number(c.chat_id);
            document.querySelectorAll(".chat-item.active").forEach(function (x) { x.classList.remove("active"); });
            div.classList.add("active");
            var title = document.getElementById("chatTitle");
            if (title) title.textContent = c.chat_name || "Групповой чат";
            if (typeof window.updateCallButtonsForChat === "function") window.updateCallButtonsForChat(c.chat_id, "group");
            if (typeof window.openMobileChatView === "function") window.openMobileChatView();
            if (typeof window.loadMessages === "function") await window.loadMessages();
            if (typeof window.updateUnreadCount === "function") await window.updateUnreadCount(Number(c.chat_id));
        });
        list.appendChild(div);
    }

    function moveExternalGroupsToEnd() {
        var list = document.getElementById("chatList");
        if (!list) return;
        Array.prototype.slice.call(list.querySelectorAll('.chat-item[data-superadmin-group="true"]')).forEach(function (item) { list.appendChild(item); });
    }

    async function loadAllGroups() {
        if (!(await isSuperadmin())) return;
        var r = await window.supabaseClient.rpc("get_my_group_chats");
        if (r.error) { console.error("Не удалось загрузить все группы:", r.error); return; }
        (r.data || []).forEach(function (c) { if (!c.is_member) addExternalGroup(c); });
        moveExternalGroupsToEnd();
        ensureSuperadminRemoveButton();
    }

    function ensureSuperadminRemoveButton() {
        if (hooked) return;
        if (typeof window.showChatActionMenu !== "function") return;
        var original = window.showChatActionMenu;
        hooked = true;
        window.showChatActionMenu = async function (chatId, anchor) {
            var sa = await isSuperadmin();
            var item = getItem(chatId);
            var isGroup = item && item.dataset.chatType === "group";
            if (!sa || !isGroup) { original(chatId, anchor); return; }
            var menu = document.getElementById("chatActionMenu");
            if (menu) menu.remove();
            menu = document.createElement("div");
            menu.id = "chatActionMenu";
            menu.style.cssText = "position:fixed;z-index:99999;min-width:205px;background:#000;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;font-size:15px;color:#fff";
            var b = document.createElement("button");
            b.type = "button"; b.textContent = "Удалить группу";
            b.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit";
            b.addEventListener("click", async function (e) {
                e.stopPropagation();
                if (busy) return;
                if (!confirm("Удалить группу «" + (item.querySelector(".chat-item-name") ? item.querySelector(".chat-item-name").textContent.replace(/\(вы не участник\)/, "").trim() : "") + "» полностью?")) return;
                busy = true;
                var r = await window.supabaseClient.rpc("delete_group_chat", { p_chat_id: Number(chatId) });
                busy = false;
                menu.remove();
                if (r.error) { alert(r.error.message || "Не удалось удалить группу."); return; }
                item.remove();
                if (Number(window.currentChatId) === Number(chatId)) {
                    window.currentChatId = 0;
                    var title = document.getElementById("chatTitle");
                    if (title) title.textContent = "Выберите чат";
                }
                if (typeof window.loadChats === "function") window.loadChats();
            });
            menu.appendChild(b);
            document.body.appendChild(menu);
            var rct = anchor.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(rct.left, window.innerWidth - 220)) + "px";
            menu.style.top = Math.max(8, Math.min(rct.bottom + 4, window.innerHeight - 70)) + "px";
            setTimeout(function () { document.addEventListener("click", function () { if (menu) menu.remove(); }, { once: true }); }, 0);
        };
    }

    function ensureSuperadminRemoveButton() {
        if (!document.getElementById("chatUsersOverlay")) return;
        var typeItem = getItem(window.currentChatId);
        if (!typeItem || typeItem.dataset.chatType !== "group") return;
        isSuperadmin().then(function (sa) {
            if (!sa || document.getElementById("chatRemoveUserButton")) return;
            var list = document.getElementById("chatUsersList");
            if (!list || !list.parentElement) return;
            var button = document.createElement("button");
            button.id = "chatRemoveUserButton";
            button.type = "button";
            button.textContent = "− Удалить пользователя";
            button.style.cssText = "display:flex;width:100%;margin-top:12px;padding:11px 14px;border:1px solid #5a4636;border-radius:9px;background:#5a4636;color:#fff;text-align:center;align-items:center;justify-content:center;font:inherit;font-weight:600;cursor:pointer;box-sizing:border-box";
            button.onclick = function () { if (typeof window.openChatUsers === "function") { var old = document.getElementById("chatUsersOverlay"); if (old) old.remove(); if (typeof window.openChatUsers === "function") window.openChatUsers(); } };
            list.parentElement.appendChild(button);
        });
    }

    function watch() {
        loadAllGroups();
        var body = document.body;
        if (body && window.MutationObserver) {
            var obs = new MutationObserver(function () {
                loadAllGroups();
                ensureSuperadminRemoveButton();
            });
            obs.observe(body, { childList: true, subtree: true });
        }
        setInterval(function () { loadAllGroups(); }, 2500);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once: true });
    else watch();
})();
