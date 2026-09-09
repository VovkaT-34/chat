// =========================================
// Порядок чатов по последней переписке
// =========================================
(function () {
    let channel = null;

    function moveFromMessage(message) {
        if (!message?.chat_id) return;

        if (typeof moveChatToTop === "function") {
            moveChatToTop(message.chat_id, message.created_at || new Date().toISOString());
            return;
        }

        if (typeof loadChats === "function") void loadChats();
    }

    function subscribe() {
        if (channel || !window.supabaseClient || !window.currentUser?.id) return;

        channel = window.supabaseClient
            .channel(`chat-order-${window.currentUser.id}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "messages"
            }, payload => moveFromMessage(payload?.new))
            .subscribe(status => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    channel = null;
                    setTimeout(subscribe, 2000);
                }
            });
    }

    if (window.supabaseClient?.auth?.onAuthStateChange) {
        window.supabaseClient.auth.onAuthStateChange(() => {
            channel = null;
            setTimeout(subscribe, 0);
        });
    }

    const wait = setInterval(() => {
        if (!window.currentUser?.id) return;
        clearInterval(wait);
        subscribe();
    }, 100);

    setTimeout(() => clearInterval(wait), 15000);
})();

// ===============================
// Игры и запрет системного копирования
// ===============================
(function () {
    function installNoSelection() {
        if (document.getElementById("chatNoSelectionStyle")) return;
        var style = document.createElement("style");
        style.id = "chatNoSelectionStyle";
        style.textContent = ".chat-item,.chat-item *,.chatActionMenu,#chatActionMenu{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}";
        document.head.appendChild(style);
    }

    function openGames() {
        window.location.href = "games.html";
    }

    document.addEventListener("click", function (event) {
        var coin = event.target.closest && event.target.closest(".coin-1c");
        if (coin) {
            event.preventDefault();
            event.stopPropagation();
            openGames();
        }
    }, true);

    document.addEventListener("contextmenu", function (event) {
        var chatItem = event.target.closest && event.target.closest(".chat-item");
        if (chatItem) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    document.addEventListener("keydown", function (event) {
        if (event.key.toLowerCase() !== "s") return;
        var target = event.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        event.preventDefault();
        openGames();
    });

    function replaceMessageMenu() {
        if (typeof window.showMessageActionMenu !== "function" || typeof window.toggleMessagePin !== "function") return;
        window.showMessageActionMenu = function (message, anchor) {
            var old = document.getElementById("messageActionMenu");
            if (old) old.remove();
            var menu = document.createElement("div");
            menu.id = "messageActionMenu";
            menu.style.cssText = "position:fixed;z-index:99999;min-width:190px;background:#000;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;font-size:15px;color:#fff;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;";
            menu.addEventListener("contextmenu", function (e) { e.preventDefault(); e.stopPropagation(); });
            function add(text, icon, handler) {
                var b = document.createElement("button");
                b.type = "button";
                b.innerHTML = icon + "<span>" + text + "</span>";
                b.style.cssText = "display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;";
                b.addEventListener("click", function (e) { e.stopPropagation(); handler(); });
                menu.appendChild(b);
            }
            var username = message.profiles && message.profiles.username ? message.profiles.username : "Пользователь";
            var text = message.text || "";
            add("Ответить", MESSAGE_ACTION_ICON_SVG.reply, function () { closeMessageActionMenu(); replyToMessage(message.id, username, text); });
            var pinned = !!getPinnedMessages()[String(message.id)];
            add(pinned ? "Открепить" : "Прикрепить", MESSAGE_ACTION_ICON_SVG.pin, function () { toggleMessagePin(message.id); });
            document.body.appendChild(menu);
            var r = anchor.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 205)) + "px";
            menu.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 130)) + "px";
            setTimeout(function () { document.addEventListener("click", closeMessageActionMenu, { once: true }); }, 0);
        };
    }

    installNoSelection();
    replaceMessageMenu();
    setTimeout(replaceMessageMenu, 0);
})();
