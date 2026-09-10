// =========================================
// УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ИЗ ГРУППЫ
// Администратор группы или глобальный администратор.
// Использует защищённый RPC remove_chat_member.
// =========================================

(function () {
    "use strict";

    var observer = null;
    var busy = false;
    var checking = false;

    function getChatId() {
        return Number(window.currentChatId || 0);
    }

    function getChatType() {
        var id = getChatId();
        if (!id) return null;
        var item = document.querySelector('.chat-item[data-chat-id="' + id + '"]');
        return item ? (item.dataset.chatType || null) : null;
    }

    async function getMembers(chatId) {
        var result = await window.supabaseClient.rpc("get_chat_members", { p_chat_id: chatId });
        if (result.error) throw result.error;
        return result.data || [];
    }

    async function isGlobalAdmin() {
        var user = window.currentUser;
        if (!user || !user.id) return false;
        var result = await window.supabaseClient.from("profiles").select("role,approved").eq("id", user.id).maybeSingle();
        return !result.error && result.data && result.data.approved === true && ["admin", "superadmin"].includes(result.data.role);
    }

    async function makeButton() {
        if (checking || document.getElementById("chatRemoveUserButton")) return;
        if (getChatType() !== "group") return;

        var list = document.getElementById("chatUsersList");
        if (!list || !list.querySelectorAll("button").length) return;

        checking = true;
        try {
            var members = await getMembers(getChatId());
            var currentId = String(window.currentUser && window.currentUser.id);
            var currentMember = members.find(function (member) {
                return String(member.user_id) === currentId;
            });
            var globalAdmin = await isGlobalAdmin();
            if (!globalAdmin && (!currentMember || currentMember.role !== "admin")) return;
            if (!document.getElementById("chatUsersList")) return;
            if (document.getElementById("chatRemoveUserButton")) return;

            var button = document.createElement("button");
            button.id = "chatRemoveUserButton";
            button.type = "button";
            button.textContent = "− Удалить пользователя";
            button.style.cssText = "display:flex;width:100%;margin-top:12px;padding:11px 14px;border:1px solid #5a4636;border-radius:9px;background:#5a4636;color:#fff;text-align:center;align-items:center;justify-content:center;font:inherit;font-weight:600;cursor:pointer;box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
            button.addEventListener("mouseenter", function () { button.style.background = "#6b5543"; });
            button.addEventListener("mouseleave", function () { button.style.background = "#5a4636"; });
            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                openRemoveDialog();
            });
            document.getElementById("chatUsersList").parentElement.appendChild(button);
        } catch (error) {
            console.error("Не удалось проверить права администратора:", error);
        } finally {
            checking = false;
        }
    }

    function overlay() {
        var root = document.createElement("div");
        root.id = "chatRemoveUserOverlay";
        root.style.cssText = "position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box";
        return root;
    }

    function openRemoveDialog() {
        if (document.getElementById("chatRemoveUserOverlay")) return;
        var chatId = getChatId();
        if (!chatId || getChatType() !== "group") return;

        var root = overlay();
        var box = document.createElement("div");
        box.style.cssText = "width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden";

        var head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:16px 18px 10px";
        var title = document.createElement("div");
        title.textContent = "Удалить пользователя";
        title.style.cssText = "font-size:19px;font-weight:700";
        var close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.style.cssText = "border:0;background:transparent;font-size:26px;cursor:pointer;padding:0 4px";
        close.addEventListener("click", function () { root.remove(); });
        head.appendChild(title); head.appendChild(close); box.appendChild(head);

        var status = document.createElement("div");
        status.textContent = "Загрузка пользователей…";
        status.style.cssText = "padding:10px 18px;color:#777;text-align:center";
        box.appendChild(status);

        var results = document.createElement("div");
        results.style.cssText = "overflow-y:auto;padding:0 8px 8px";
        box.appendChild(results);

        var footer = document.createElement("div");
        footer.style.cssText = "display:flex;padding:10px 14px 14px;border-top:1px solid #eee";
        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Отмена";
        cancel.style.cssText = "border:0;background:transparent;padding:9px 12px;font-size:15px;cursor:pointer";
        cancel.addEventListener("click", function () { root.remove(); });
        footer.appendChild(cancel); box.appendChild(footer);
        root.appendChild(box);
        document.body.appendChild(root);

        root.addEventListener("click", function (event) {
            if (event.target === root) root.remove();
        });

        getMembers(chatId).then(function (members) {
            if (!root.isConnected) return;
            results.innerHTML = "";
            var currentId = String(window.currentUser && window.currentUser.id);
            var removable = members.filter(function (member) {
                return String(member.user_id) !== currentId;
            });

            if (!removable.length) {
                status.textContent = "Нет пользователей, которых можно удалить.";
                return;
            }

            status.textContent = "Выберите пользователя";
            removable.forEach(function (member) {
                var item = document.createElement("button");
                item.type = "button";
                item.style.cssText = "width:100%;display:flex;align-items:center;text-align:left;border:0;background:transparent;padding:12px 10px;border-radius:10px;cursor:pointer;font-size:16px;touch-action:manipulation;-webkit-tap-highlight-color:transparent";

                var name = document.createElement("span");
                name.textContent = member.nickname || member.username;
                name.style.cssText = "font-weight:600";
                item.appendChild(name);

                var username = document.createElement("span");
                username.textContent = "  @" + member.username + (member.role === "admin" ? " · администратор" : "");
                username.style.cssText = "color:#777;font-size:13px;margin-left:6px";
                item.appendChild(username);

                item.addEventListener("mouseenter", function () { item.style.background = "#f1f1f1"; });
                item.addEventListener("mouseleave", function () { item.style.background = "transparent"; });
                item.addEventListener("click", function () {
                    if (busy) return;
                    if (!confirm("Удалить пользователя «" + (member.nickname || member.username) + "» из группы?")) return;
                    busy = true;
                    item.disabled = true;
                    window.supabaseClient.rpc("remove_chat_member", {
                        p_chat_id: chatId,
                        p_user_id: member.user_id
                    }).then(function (result) {
                        if (result.error) {
                            console.error("Не удалось удалить пользователя:", result.error);
                            alert(result.error.message || "Не удалось удалить пользователя.");
                            item.disabled = false;
                            busy = false;
                            return;
                        }
                        root.remove();
                        busy = false;
                        if (typeof window.openChatUsers === "function") window.openChatUsers();
                    });
                });
                results.appendChild(item);
            });
        }).catch(function (error) {
            console.error("Не удалось загрузить пользователей для удаления:", error);
            status.textContent = "Не удалось загрузить пользователей.";
        });
    }

    function refresh() {
        makeButton();
        var button = document.getElementById("chatRemoveUserButton");
        if (button && getChatType() !== "group") button.remove();
    }

    function start() {
        refresh();
        if (document.body) {
            observer = new MutationObserver(function () { refresh(); });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
