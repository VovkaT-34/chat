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

    function installCoinEffect() {
        if (document.getElementById("coinGamesEffectStyle")) return;
        var style = document.createElement("style");
        style.id = "coinGamesEffectStyle";
        style.textContent = ".coin-1c{touch-action:manipulation}.coin-1c.coin-press{animation:coinGamesPress .2s ease-out both;transform-origin:center center}@keyframes coinGamesPress{0%{transform:translate(-50%,-50%) scale(.64)}42%{transform:translate(-50%,-50%) scale(.50)}100%{transform:translate(-50%,-50%) scale(.64)}}.coin-firework-spark{position:absolute;left:50%;top:50%;width:3px;height:13px;border-radius:3px;background:linear-gradient(to top,#ff8c00,#fff7a8 70%,#fff);box-shadow:0 0 5px 2px rgba(255,220,90,.9),0 0 12px rgba(255,145,0,.75);pointer-events:none;z-index:20;animation:coinSparkBurst .2s cubic-bezier(.12,.7,.3,1) forwards}@keyframes coinSparkBurst{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--angle)) translateY(0) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--angle)) translateY(var(--travel)) scale(.12)}}";
        document.head.appendChild(style);
    }

    installCoinEffect();

    document.addEventListener("pointerdown", function (event) {
        var coin = event.target.closest && event.target.closest(".coin-1c");
        if (!coin || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        event.stopPropagation();
        if (coin.dataset.openingGames === "true") return;
        coin.dataset.openingGames = "true";
        coin.classList.add("coin-press");
        for (var i = 0; i < 16; i++) {
            var spark = document.createElement("span");
            spark.className = "coin-firework-spark";
            spark.style.setProperty("--angle", (i * 22.5) + "deg");
            spark.style.setProperty("--travel", "-" + (155 + (i % 4) * 9) + "px");
            coin.appendChild(spark);
        }
        setTimeout(openGames, 220);
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
