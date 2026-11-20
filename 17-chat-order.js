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
        style.textContent = ".coin-1c{touch-action:manipulation}.coin-1c.coin-press{animation:coinGamesPress .3s ease-out both;transform-origin:center center}@keyframes coinGamesPress{0%,100%{scale:1}42%{scale:.625}}.coin-firework-layer{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:99999}.coin-rocket{position:absolute;left:0;top:0;width:10px;height:10px;pointer-events:none;animation:coinRocketFly .32s cubic-bezier(.12,.72,.2,1) both}.coin-rocket:before{content:\"\";position:absolute;left:3px;top:4px;width:4px;height:58px;border-radius:50%;background:linear-gradient(to top,transparent 0%,var(--rocket-color) 48%,#fff 100%);box-shadow:0 0 12px 4px var(--rocket-color);opacity:.98}.coin-rocket:after{content:\"\";position:absolute;left:1px;top:0;width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 8px 4px #fff,0 0 18px 8px var(--rocket-color),0 0 30px 12px var(--rocket-color)}@keyframes coinRocketFly{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--angle)) translateY(0) scale(.8)}72%,100%{opacity:1;transform:translate(-50%,-50%) rotate(var(--angle)) translateY(var(--travel)) scale(1.15)}}.coin-rocket-burst{position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:50%;background:var(--rocket-color);box-shadow:0 0 9px 4px var(--rocket-color),0 0 18px 7px #fff;animation:coinRocketBurst .12s .205s ease-out both}@keyframes coinRocketBurst{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--burst-angle)) translateY(0) scale(1.5)}100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--burst-angle)) translateY(var(--burst-distance)) scale(.12)}}.coin-rocket-flash{position:absolute;left:50%;top:50%;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 14px 7px var(--rocket-color),0 0 28px 12px var(--rocket-color);animation:coinRocketFlash .16s .19s ease-out both}@keyframes coinRocketFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(.2)}100%{opacity:0;transform:translate(-50%,-50%) scale(4.5)}}";
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
        var rocketColors = ["#fff36a", "#54eaff", "#ff62d5", "#ff9b35", "#a8ff68"];
        for (var i = 0; i < 10; i++) {
            var rocket = document.createElement("span");
            rocket.className = "coin-rocket";
            rocket.style.setProperty("--angle", (i * 36) + "deg");
            rocket.style.setProperty("--travel", "-" + (145 + (i % 4) * 16) + "px");
            rocket.style.setProperty("--rocket-color", rocketColors[i % rocketColors.length]);
            for (var j = 0; j < 8; j++) {
                var fragment = document.createElement("span");
                fragment.className = "coin-rocket-burst";
                fragment.style.setProperty("--rocket-color", rocketColors[i % rocketColors.length]);
                fragment.style.setProperty("--burst-angle", (j * 45 + (i % 3) * 12) + "deg");
                fragment.style.setProperty("--burst-distance", "-" + (24 + (j % 3) * 10) + "px");
                rocket.appendChild(fragment);
            }
            var flash = document.createElement("span");
            flash.className = "coin-rocket-flash";
            flash.style.setProperty("--rocket-color", rocketColors[i % rocketColors.length]);
            rocket.appendChild(flash);
            sparkLayer.appendChild(rocket);
        }
        void coin.offsetWidth;
        setTimeout(function () { sparkLayer.remove(); }, 370);
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
