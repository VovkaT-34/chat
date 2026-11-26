// Reliable first-touch navigation for the games list and every game page.
(function () {
    if (!document.getElementById("gameBackButtonStyle")) {
        var style = document.createElement("style");
        style.id = "gameBackButtonStyle";
        style.textContent = ".back{border:2px solid #fff0a0;border-radius:13px;padding:10px 16px;background:linear-gradient(145deg,#fff4ad 0%,#e9b83e 17%,#b87912 43%,#f7d66b 58%,#a8660b 82%,#f6d77a 100%);color:#fff;font-size:15px;font-weight:900;line-height:1.2;text-shadow:0 2px 2px #754000,0 -1px 1px rgba(255,255,255,.9);box-shadow:inset 0 3px 3px rgba(255,255,255,.8),inset 0 -6px 5px rgba(92,48,0,.48),0 5px 0 #70430b,0 8px 13px rgba(0,0,0,.48);cursor:pointer;touch-action:manipulation;transition:transform .08s ease,box-shadow .08s ease}.back:active{transform:translateY(3px);box-shadow:inset 0 2px 4px rgba(80,42,0,.45),0 2px 0 #70430b,0 4px 8px rgba(0,0,0,.4)}";
        document.head.appendChild(style);
    }

    document.querySelectorAll("button.back").forEach(function (button) {
        if (button.dataset.gameBack !== "chat") button.textContent = "← Назад";
    });

    document.addEventListener("pointerdown", function (event) {
        var button = event.target.closest && event.target.closest("button.back, button[data-game-back]");
        if (!button || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.navigationStarted === "true") return;
        button.dataset.navigationStarted = "true";
        window.location.assign(button.dataset.gameBack === "chat" ? "index.html" : (isKamenskyFolder() ? "../games.html" : "games.html"));
    }, true);
})();
