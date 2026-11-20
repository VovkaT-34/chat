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
        style.textContent = ".coin-1c{touch-action:manipulation}.coin-1c.coin-press{animation:coinGamesPress .3s ease-out both;transform-origin:center center}@keyframes coinGamesPress{0%,100%{scale:1}42%{scale:.625}}.coin-firework-layer{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:99999}.coin-firework-spark{position:absolute;left:0;top:0;width:7px;height:25px;border-radius:4px;background:linear-gradient(to top,#ff6500 0%,#ffb000 28%,#fff36a 65%,#fff 100%);box-shadow:0 0 12px 5px rgba(255,220,60,1),0 0 28px 12px rgba(255,145,0,.95),0 0 48px 18px rgba(255,230,90,.65);pointer-events:none;animation:coinSparkBurst .3s cubic-bezier(.12,.7,.3,1) forwards}@keyframes coinSparkBurst{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--angle)) translateY(0) scale(1.25)}100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--angle)) translateY(var(--travel)) scale(.18)}}";
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
        var coinRect = coin.getBoundingClientRect();
        var sparkLayer = document.createElement("div");
        sparkLayer.className = "coin-firework-layer";
        sparkLayer.style.left = (coinRect.left + coinRect.width / 2) + "px";
        sparkLayer.style.top = (coinRect.top + coinRect.height / 2) + "px";
        document.body.appendChild(sparkLayer);
        coin.classList.add("coin-press");
        for (var i = 0; i < 24; i++) {
            var spark = document.createElement("span");
            spark.className = "coin-firework-spark";
            spark.style.setProperty("--angle", (i * 22.5) + "deg");
            spark.style.setProperty("--travel", "-" + (195 + (i % 5) * 12) + "px");
            sparkLayer.appendChild(spark);
        }
        void coin.offsetWidth;
        setTimeout(function () { sparkLayer.remove(); }, 350);
        setTimeout(openGames, 400);
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
