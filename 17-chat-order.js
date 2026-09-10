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

    installNoSelection();
})();
