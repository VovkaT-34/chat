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
            id: "classic-original",
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
            id: "gold-shine-original",
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
            id: "royal-violet-original",
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
            id: "midnight-gold-original",
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
            id: "aqua-pearl-original",
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
        },
        {
            id: "aurora",
            name: "Северное сияние Iris",
            preview: "linear-gradient(125deg,#073e4d,#32c79a,#4d9df2,#b36bdb,#b4edbd)",
            vars: {
                bg: "#244f55",
                pattern: "radial-gradient(ellipse at 12% 18%,rgba(71,235,176,.72),transparent 48%),radial-gradient(ellipse at 82% 22%,rgba(75,166,255,.66),transparent 46%),radial-gradient(ellipse at 65% 88%,rgba(194,91,226,.54),transparent 48%),linear-gradient(135deg,rgba(7,47,69,.32),rgba(14,112,103,.30))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#effff7,#d9fff0,#e2f4ff,#f7eaff)",
                border: "rgba(179,239,216,.34)",
                shadow: "rgba(5,35,42,.20)"
            }
        },
        {
            id: "sakura",
            name: "Сакура Iris",
            preview: "linear-gradient(125deg,#f49cbd,#fff0d9,#d9a4f0,#f6c6b0,#e7a0c0)",
            vars: {
                bg: "#f1d5dc",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(255,160,192,.76),transparent 46%),radial-gradient(ellipse at 82% 24%,rgba(255,218,160,.72),transparent 45%),radial-gradient(ellipse at 62% 88%,rgba(195,135,224,.50),transparent 48%),linear-gradient(135deg,rgba(255,255,255,.30),rgba(210,108,151,.22))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fff5f8,#ffe5ed,#fff1dc,#f5eaff)",
                border: "rgba(174,104,128,.17)",
                shadow: "rgba(112,62,79,.10)"
            }
        },
        {
            id: "ocean",
            name: "Глубокий океан Iris",
            preview: "linear-gradient(125deg,#07506b,#27c4c1,#4a9be8,#9be5c7,#176d91)",
            vars: {
                bg: "#316d7d",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(38,202,205,.68),transparent 46%),radial-gradient(ellipse at 82% 24%,rgba(54,140,235,.66),transparent 46%),radial-gradient(ellipse at 62% 88%,rgba(115,221,191,.54),transparent 48%),repeating-linear-gradient(155deg,transparent 0 34px,rgba(255,255,255,.14) 35px 37px)",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#edffff,#d9f8ff,#e3efff,#e0fff4)",
                border: "rgba(151,218,231,.30)",
                shadow: "rgba(8,38,55,.20)"
            }
        },
        {
            id: "lavender-mist",
            name: "Лавандовый туман Iris",
            preview: "linear-gradient(125deg,#a57be7,#d7b8ff,#86b9f4,#f0b4dc,#b4a7ef)",
            vars: {
                bg: "#d2c8e8",
                pattern: "radial-gradient(ellipse at 14% 20%,rgba(190,127,255,.68),transparent 46%),radial-gradient(ellipse at 82% 25%,rgba(116,167,255,.62),transparent 46%),radial-gradient(ellipse at 60% 88%,rgba(255,157,208,.58),transparent 48%),linear-gradient(125deg,rgba(255,255,255,.34),rgba(135,119,184,.20))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fbf4ff,#eee4ff,#e7f0ff,#fff0f7)",
                border: "rgba(123,103,166,.18)",
                shadow: "rgba(74,57,111,.12)"
            }
        },
        {
            id: "mint-garden",
            name: "Мятный сад Iris",
            preview: "linear-gradient(125deg,#62c88f,#c5f1d1,#8bd9e5,#e1e99a,#69bda6)",
            vars: {
                bg: "#c2e0d1",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(90,205,145,.68),transparent 46%),radial-gradient(ellipse at 82% 25%,rgba(118,207,226,.62),transparent 46%),radial-gradient(ellipse at 60% 88%,rgba(220,231,120,.54),transparent 48%),linear-gradient(135deg,rgba(255,255,255,.30),rgba(70,145,107,.18))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#f2fff6,#ddf9e8,#e2fbff,#f9ffe5)",
                border: "rgba(70,137,102,.17)",
                shadow: "rgba(40,91,66,.11)"
            }
        },
        {
            id: "coral-sunset",
            name: "Коралловый закат Iris",
            preview: "linear-gradient(125deg,#ed786e,#ffc16e,#f7a6a8,#c98bd5,#f4d18b)",
            vars: {
                bg: "#e9b49d",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(255,119,112,.72),transparent 46%),radial-gradient(ellipse at 82% 22%,rgba(255,190,92,.74),transparent 46%),radial-gradient(ellipse at 60% 88%,rgba(207,107,157,.56),transparent 48%),linear-gradient(145deg,rgba(255,244,202,.34),rgba(157,72,65,.18))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fff4e9,#ffe2d5,#fff0d9,#fce7f3)",
                border: "rgba(166,91,74,.19)",
                shadow: "rgba(112,57,48,.12)"
            }
        },
        {
            id: "gold-shine",
            name: "Gold Shine Iris",
            preview: "linear-gradient(125deg,#fff0a8,#f4bd45,#fff7cf,#d99a2d,#ffe9a0)",
            vars: {
                bg: "#d9bd70",
                pattern: "radial-gradient(ellipse at 18% 22%,rgba(255,255,255,.48),transparent 38%),radial-gradient(ellipse at 82% 28%,rgba(255,190,55,.38),transparent 42%),radial-gradient(ellipse at 60% 88%,rgba(255,245,180,.48),transparent 44%),linear-gradient(125deg,rgba(255,244,176,.30),rgba(193,119,25,.20),rgba(255,226,122,.32))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,rgba(255,250,220,.98),rgba(255,226,151,.96),rgba(255,248,211,.98),rgba(255,218,132,.96))",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "royal-violet",
            name: "Royal Violet Iris",
            preview: "linear-gradient(125deg,#51306f,#d36bb5,#648ee5,#e4b86a,#8a62bd)",
            vars: {
                bg: "#57406f",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(255,104,190,.62),transparent 46%),radial-gradient(ellipse at 82% 22%,rgba(90,190,255,.56),transparent 44%),radial-gradient(ellipse at 72% 88%,rgba(255,205,92,.48),transparent 48%),linear-gradient(135deg,rgba(116,68,180,.46),rgba(43,28,88,.28))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fff0fb,#f0e8ff,#e5f1ff,#fff0e2)",
                border: "rgba(226,204,255,.26)",
                shadow: "rgba(35,18,54,.18)"
            }
        },
        {
            id: "midnight-gold",
            name: "Midnight Gold Iris",
            preview: "linear-gradient(125deg,#172b4d,#3b7eaa,#ad78bd,#d0a34b,#243047)",
            vars: {
                bg: "#202a3d",
                pattern: "radial-gradient(ellipse at 18% 20%,rgba(44,145,220,.62),transparent 45%),radial-gradient(ellipse at 82% 30%,rgba(210,151,67,.52),transparent 42%),radial-gradient(ellipse at 55% 92%,rgba(179,105,198,.42),transparent 48%),linear-gradient(135deg,rgba(14,28,53,.38),rgba(63,46,78,.30))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#f4f5f8,#e5eff9,#f5e8d5,#e9e4f5)",
                border: "rgba(255,214,125,.22)",
                shadow: "rgba(0,0,0,.22)"
            }
        },
        {
            id: "aqua-pearl",
            name: "Aqua Pearl Iris",
            preview: "linear-gradient(125deg,#38bdb1,#d5fff0,#70b9e9,#c4f2dc,#4f9cae)",
            vars: {
                bg: "#bfe5e1",
                pattern: "radial-gradient(ellipse at 15% 20%,rgba(57,205,190,.62),transparent 48%),radial-gradient(ellipse at 82% 28%,rgba(91,174,235,.56),transparent 46%),radial-gradient(ellipse at 58% 90%,rgba(179,237,211,.72),transparent 48%),linear-gradient(135deg,rgba(255,255,255,.28),rgba(66,155,165,.20))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#f2fffb,#d9fff1,#e2f5ff,#f5ffed)",
                border: "rgba(51,132,145,.16)",
                shadow: "rgba(35,105,117,.10)"
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
@keyframes chatThemeIridescence{0%{background-position:0% 50%,100% 0%,0% 100%,50% 50%}50%{background-position:100% 50%,0% 100%,100% 0%,50% 50%}100%{background-position:0% 50%,100% 0%,0% 100%,50% 50%}}
@keyframes chatBubbleIridescence{0%{background-position:0% 50%}100%{background-position:100% 50%}}
#messages[data-chat-theme]{background-color:var(--chat-theme-bg)!important;background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;background-position:0% 50%,100% 0%,0% 100%,50% 50%;animation:chatThemeIridescence 34s ease-in-out infinite;transition:background-color .28s ease}
#messages[data-chat-theme] .message{background:var(--chat-message-bg)!important;background-size:240% 240%!important;animation:chatBubbleIridescence 18s ease-in-out infinite alternate;border-color:var(--chat-message-border)!important;box-shadow:0 2px 8px var(--chat-message-shadow)!important}
#messages[data-chat-theme] .message-text{color:var(--chat-message-text)!important}
@media(prefers-reduced-motion:reduce){#messages[data-chat-theme],#messages[data-chat-theme] .message{animation:none!important}}
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
