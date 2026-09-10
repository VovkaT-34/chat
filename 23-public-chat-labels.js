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
        style.textContent = ".public-chat-for-all{display:block;margin-top:2px;font-size:12px;font-weight:400;line-height:1.15;opacity:.68;white-space:nowrap}";
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
