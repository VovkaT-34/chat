// =========================================
// ТЕМЫ ЧАТА И ЦВЕТ ТЕКСТА
// Только CSS + localStorage. Supabase не используется.
// =========================================

(function () {
    "use strict";

    var STORAGE_PREFIX = "chatAppearance:";
    var DEFAULTS = { theme: "classic", text: "#111111" };

    var THEMES = [
        {
            id: "classic",
            name: "Classic",
            preview: "linear-gradient(135deg,#eadcc8,#f4eadc)",
            vars: {
                bg: "#eadcc8",
                pattern: "radial-gradient(circle at 18px 18px,rgba(255,255,255,.28) 0 2px,transparent 2.5px),radial-gradient(circle at 70px 42px,transparent 0 8px,rgba(116,82,54,.09) 8.5px 10px,transparent 10.5px),radial-gradient(circle at 118px 76px,rgba(255,255,255,.22) 0 1.5px,transparent 2px),radial-gradient(circle at 42px 88px,transparent 0 6px,rgba(116,82,54,.07) 6.5px 8px,transparent 8.5px)",
                size: "150px 120px,180px 150px,130px 110px,210px 170px",
                bubble: "rgba(255,250,243,.88)",
                border: "rgba(117,82,50,.09)",
                shadow: "rgba(76,53,35,.06)"
            }
        },
        {
            id: "gold-shine",
            name: "Gold Shine",
            preview: "linear-gradient(135deg,#8a641e,#f7d774,#fff3bd,#b17a1f)",
            vars: {
                bg: "#d9bd70",
                pattern: "radial-gradient(circle at 20% 30%,rgba(255,255,255,.34) 0 2px,transparent 3px),linear-gradient(115deg,rgba(255,255,255,.10),rgba(255,255,255,.42),rgba(255,255,255,.08),rgba(112,70,0,.08))",
                size: "95px 95px,220px 220px",
                bubble: "rgba(255,249,225,.94)",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "royal-violet",
            name: "Royal Violet",
            preview: "linear-gradient(135deg,#34204e,#74519a,#d6b76a)",
            vars: {
                bg: "#57406f",
                pattern: "radial-gradient(circle at 22px 22px,rgba(255,255,255,.12) 0 2px,transparent 2.5px),linear-gradient(135deg,rgba(255,255,255,.07),rgba(48,24,75,.16))",
                size: "120px 100px,100% 100%",
                bubble: "rgba(250,245,255,.94)",
                border: "rgba(226,204,255,.26)",
                shadow: "rgba(35,18,54,.18)"
            }
        },
        {
            id: "midnight-gold",
            name: "Midnight Gold",
            preview: "linear-gradient(135deg,#151b29,#27334b,#c49a42)",
            vars: {
                bg: "#202a3d",
                pattern: "radial-gradient(circle at 25px 25px,rgba(255,218,130,.13) 0 1.5px,transparent 2px),linear-gradient(145deg,rgba(255,255,255,.04),rgba(0,0,0,.12))",
                size: "115px 95px,100% 100%",
                bubble: "rgba(241,239,232,.96)",
                border: "rgba(255,214,125,.22)",
                shadow: "rgba(0,0,0,.22)"
            }
        },
        {
            id: "aqua-pearl",
            name: "Aqua Pearl",
            preview: "linear-gradient(135deg,#8acfd0,#e7fbf5,#86b9c8)",
            vars: {
                bg: "#bfe5e1",
                pattern: "radial-gradient(circle at 20px 20px,rgba(255,255,255,.46) 0 2px,transparent 2.5px),radial-gradient(circle at 82px 55px,rgba(70,145,157,.10) 0 2px,transparent 2.5px),linear-gradient(135deg,rgba(255,255,255,.22),rgba(66,155,165,.08))",
                size: "110px 90px,140px 120px,100% 100%",
                bubble: "rgba(246,253,251,.95)",
                border: "rgba(51,132,145,.16)",
                shadow: "rgba(35,105,117,.10)"
            }
        }
        ,
        {
            id: "aurora",
            name: "Северное сияние",
            preview: "linear-gradient(135deg,#102f3b,#287c78,#8bc9ad)",
            vars: {
                bg: "#244f55",
                pattern: "radial-gradient(ellipse at 18% 22%,rgba(150,255,218,.20),transparent 42%),radial-gradient(ellipse at 82% 76%,rgba(111,177,255,.18),transparent 45%),linear-gradient(135deg,rgba(255,255,255,.05),rgba(8,35,48,.12))",
                size: "100% 100%,100% 100%,100% 100%",
                bubble: "rgba(239,251,245,.96)",
                border: "rgba(179,239,216,.34)",
                shadow: "rgba(5,35,42,.20)"
            }
        },
        {
            id: "sakura",
            name: "Сакура",
            preview: "linear-gradient(135deg,#f6c9d5,#fff0e9,#d99bad)",
            vars: {
                bg: "#f1d5dc",
                pattern: "radial-gradient(circle at 22px 24px,rgba(255,255,255,.60) 0 3px,transparent 3.5px),radial-gradient(circle at 78px 68px,rgba(190,102,132,.13) 0 7px,transparent 7.5px),linear-gradient(135deg,rgba(255,255,255,.24),rgba(210,139,160,.08))",
                size: "110px 100px,145px 130px,100% 100%",
                bubble: "rgba(255,250,248,.97)",
                border: "rgba(174,104,128,.17)",
                shadow: "rgba(112,62,79,.10)"
            }
        },
        {
            id: "ocean",
            name: "Глубокий океан",
            preview: "linear-gradient(135deg,#12344b,#26718a,#83c4cf)",
            vars: {
                bg: "#316d7d",
                pattern: "radial-gradient(ellipse at 15% 25%,rgba(180,235,245,.18),transparent 38%),radial-gradient(ellipse at 85% 80%,rgba(9,48,79,.20),transparent 42%),repeating-linear-gradient(155deg,transparent 0 34px,rgba(255,255,255,.045) 35px 36px)",
                size: "100% 100%,100% 100%,180px 150px",
                bubble: "rgba(239,249,252,.97)",
                border: "rgba(151,218,231,.30)",
                shadow: "rgba(8,38,55,.20)"
            }
        },
        {
            id: "lavender-mist",
            name: "Лавандовый туман",
            preview: "linear-gradient(135deg,#b8a9df,#eee7fa,#c5c8ef)",
            vars: {
                bg: "#d2c8e8",
                pattern: "radial-gradient(circle at 20% 25%,rgba(255,255,255,.48),transparent 34%),radial-gradient(circle at 80% 75%,rgba(117,99,169,.13),transparent 38%),linear-gradient(125deg,rgba(255,255,255,.20),rgba(135,119,184,.08))",
                size: "100% 100%,100% 100%,100% 100%",
                bubble: "rgba(250,248,255,.97)",
                border: "rgba(123,103,166,.18)",
                shadow: "rgba(74,57,111,.12)"
            }
        },
        {
            id: "mint-garden",
            name: "Мятный сад",
            preview: "linear-gradient(135deg,#9bcdb8,#e5f5e9,#7eb9a2)",
            vars: {
                bg: "#c2e0d1",
                pattern: "radial-gradient(circle at 25px 25px,rgba(255,255,255,.50) 0 2px,transparent 2.5px),radial-gradient(ellipse at 80% 70%,rgba(58,133,99,.12),transparent 42%),linear-gradient(135deg,rgba(255,255,255,.18),rgba(70,145,107,.06))",
                size: "120px 110px,100% 100%,100% 100%",
                bubble: "rgba(247,253,248,.97)",
                border: "rgba(70,137,102,.17)",
                shadow: "rgba(40,91,66,.11)"
            }
        },
        {
            id: "coral-sunset",
            name: "Коралловый закат",
            preview: "linear-gradient(135deg,#e58c79,#f4c19c,#f6dfb8)",
            vars: {
                bg: "#e9b49d",
                pattern: "radial-gradient(ellipse at 20% 18%,rgba(255,245,218,.38),transparent 38%),radial-gradient(ellipse at 85% 82%,rgba(177,78,79,.15),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.12),rgba(157,72,65,.07))",
                size: "100% 100%,100% 100%,100% 100%",
                bubble: "rgba(255,249,240,.97)",
                border: "rgba(166,91,74,.19)",
                shadow: "rgba(112,57,48,.12)"
            }
        }
    ];

    var TEXT_COLORS = [
        ["Чёрный", "#111111"],
        ["Графитовый", "#30343b"],
        ["Тёмно-синий", "#183b63"],
        ["Тёмно-зелёный", "#24533b"],
        ["Тёмно-коричневый", "#543522"],
        ["Бордовый", "#6b1f2b"],
        ["Тёмно-фиолетовый", "#4a285f"],
        ["Тёмно-красный", "#8b1e1e"]
    ];

    function storageKey() {
        var id = window.currentUser && window.currentUser.id ? window.currentUser.id : "guest";
        return STORAGE_PREFIX + id;
    }

    function loadSettings() {
        try {
            var raw = localStorage.getItem(storageKey());
            if (!raw) return Object.assign({}, DEFAULTS);
            var saved = JSON.parse(raw);
            return {
                theme: THEMES.some(function (t) { return t.id === saved.theme; }) ? saved.theme : DEFAULTS.theme,
                text: TEXT_COLORS.some(function (c) { return c[1] === saved.text; }) ? saved.text : DEFAULTS.text
            };
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(storageKey(), JSON.stringify(settings));
    }

    function applyTheme(themeId, textColor) {
        var box = document.getElementById("messages");
        if (!box) return;
        var theme = THEMES.find(function (t) { return t.id === themeId; }) || THEMES[0];
        box.style.setProperty("--chat-theme-bg", theme.vars.bg);
        box.style.setProperty("--chat-theme-pattern", theme.vars.pattern);
        box.style.setProperty("--chat-theme-size", theme.vars.size);
        box.style.setProperty("--chat-message-bg", theme.vars.bubble);
        box.style.setProperty("--chat-message-border", theme.vars.border);
        box.style.setProperty("--chat-message-shadow", theme.vars.shadow);
        box.style.setProperty("--chat-message-text", textColor || DEFAULTS.text);
        box.dataset.chatTheme = theme.id;
    }

    function injectCSS() {
        if (document.getElementById("chatThemesCSS")) return;
        var style = document.createElement("style");
        style.id = "chatThemesCSS";
        style.textContent = `
#messages[data-chat-theme]{background-color:var(--chat-theme-bg)!important;background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;transition:background-color .28s ease,background-image .28s ease}
#messages[data-chat-theme] .message{background:var(--chat-message-bg)!important;border-color:var(--chat-message-border)!important;box-shadow:0 2px 8px var(--chat-message-shadow)!important}
#messages[data-chat-theme] .message-text{color:var(--chat-message-text)!important}
.chat-theme-settings{width:min(520px,calc(100vw - 28px));max-height:min(82vh,720px);overflow:auto;background:#fff;color:#222;border-radius:16px;box-shadow:0 18px 55px rgba(0,0,0,.30);padding:18px;font-family:Arial,sans-serif}
.chat-theme-settings h3{margin:0 0 14px;font-size:20px}.chat-theme-section{margin-top:16px}.chat-theme-section-title{font-weight:700;margin-bottom:9px}.chat-theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.chat-theme-option{border:2px solid #ddd;background:#fafafa;border-radius:11px;padding:8px;text-align:left;cursor:pointer;font:inherit}.chat-theme-option.selected{border-color:#8b5a3c;box-shadow:0 0 0 2px rgba(139,90,60,.12)}.chat-theme-preview{height:52px;border-radius:8px;margin-bottom:6px;border:1px solid rgba(0,0,0,.10)}.chat-theme-name{font-size:14px;font-weight:700}.chat-text-grid{display:flex;flex-wrap:wrap;gap:7px}.chat-text-option{border:1px solid #d5d5d5;background:#fff;border-radius:9px;padding:8px 10px;cursor:pointer;font:13px Arial,sans-serif}.chat-text-option.selected{border-color:#8b5a3c;box-shadow:0 0 0 2px rgba(139,90,60,.10)}.chat-text-dot{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:-2px;margin-right:5px;border:1px solid rgba(0,0,0,.16)}.chat-theme-footer{display:flex;justify-content:flex-end;margin-top:18px}.chat-theme-close{border:0;background:#8b5a3c;color:#fff;padding:9px 15px;border-radius:9px;font-weight:700;cursor:pointer}
@media(max-width:520px){.chat-theme-grid{grid-template-columns:1fr}.chat-theme-settings{padding:15px}}
`;
        document.head.appendChild(style);
    }

    function closeSettings() {
        var overlay = document.getElementById("chatThemeSettingsOverlay");
        if (overlay) overlay.remove();
    }

    function openSettings() {
        closeSettings();
        injectCSS();

        var settings = loadSettings();
        var overlay = document.createElement("div");
        overlay.id = "chatThemeSettingsOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box";

        var panel = document.createElement("div");
        panel.className = "chat-theme-settings";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");

        var title = document.createElement("h3");
        title.textContent = "Настройки оформления";
        panel.appendChild(title);

        var themeSection = document.createElement("div");
        themeSection.className = "chat-theme-section";
        var themeTitle = document.createElement("div");
        themeTitle.className = "chat-theme-section-title";
        themeTitle.textContent = "Тема сообщений";
        themeSection.appendChild(themeTitle);

        var themeGrid = document.createElement("div");
        themeGrid.className = "chat-theme-grid";
        THEMES.forEach(function (theme) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-theme-option" + (settings.theme === theme.id ? " selected" : "");
            var preview = document.createElement("div");
            preview.className = "chat-theme-preview";
            preview.style.background = theme.preview;
            var name = document.createElement("div");
            name.className = "chat-theme-name";
            name.textContent = theme.name;
            button.appendChild(preview);
            button.appendChild(name);
            button.addEventListener("click", function () {
                settings.theme = theme.id;
                saveSettings(settings);
                applyTheme(settings.theme, settings.text);
                themeGrid.querySelectorAll(".chat-theme-option").forEach(function (item) { item.classList.remove("selected"); });
                button.classList.add("selected");
            });
            themeGrid.appendChild(button);
        });
        themeSection.appendChild(themeGrid);
        panel.appendChild(themeSection);

        var textSection = document.createElement("div");
        textSection.className = "chat-theme-section";
        var textTitle = document.createElement("div");
        textTitle.className = "chat-theme-section-title";
        textTitle.textContent = "Цвет текста сообщений";
        textSection.appendChild(textTitle);

        var textGrid = document.createElement("div");
        textGrid.className = "chat-text-grid";
        TEXT_COLORS.forEach(function (color) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-text-option" + (settings.text === color[1] ? " selected" : "");
            button.innerHTML = '<span class="chat-text-dot" style="background:' + color[1] + '"></span>' + color[0];
            button.addEventListener("click", function () {
                settings.text = color[1];
                saveSettings(settings);
                applyTheme(settings.theme, settings.text);
                textGrid.querySelectorAll(".chat-text-option").forEach(function (item) { item.classList.remove("selected"); });
                button.classList.add("selected");
            });
            textGrid.appendChild(button);
        });
        textSection.appendChild(textGrid);
        panel.appendChild(textSection);

        var footer = document.createElement("div");
        footer.className = "chat-theme-footer";
        var closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "chat-theme-close";
        closeButton.textContent = "Готово";
        closeButton.addEventListener("click", closeSettings);
        footer.appendChild(closeButton);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) { if (event.target === overlay) closeSettings(); });
        document.addEventListener("keydown", function onKey(event) {
            if (event.key === "Escape") closeSettings();
            if (!document.getElementById("chatThemeSettingsOverlay")) document.removeEventListener("keydown", onKey);
        });

        applyTheme(settings.theme, settings.text);
    }

    function applySaved() {
        var settings = loadSettings();
        applyTheme(settings.theme, settings.text);
    }

    window.openChatSettings = openSettings;
    window.applyChatAppearance = applySaved;

    injectCSS();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySaved, { once: true });
    } else {
        applySaved();
    }

    document.addEventListener("click", function () {
        setTimeout(applySaved, 0);
    });
})();
