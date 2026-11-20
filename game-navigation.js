// Reliable first-touch navigation for the games list and every game page.
(function () {
    document.addEventListener("pointerdown", function (event) {
        var button = event.target.closest && event.target.closest("button.back, button[data-game-back]");
        if (!button || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.navigationStarted === "true") return;
        button.dataset.navigationStarted = "true";
        window.location.assign(button.dataset.gameBack === "chat" ? "index.html" : "games.html");
    }, true);
})();
