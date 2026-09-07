// ===============================
// Эмодзи в поле сообщения
// ===============================
(function () {
    "use strict";

    var emojiGroups = [
        { name: "Часто используемые", items: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 🫠 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾" },
        { name: "Жесты и люди", items: "👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 💋 🫦 👶 🧒 👦 👧 🧑 👱 👨 🧔 👨‍🦰 👨‍🦱 👨‍🦳 👨‍🦲 👩 👩‍🦰 👩‍🦱 👩‍🦳 👩‍🦲 🧓 👴 👵" },
        { name: "Сердца и эмоции", items: "❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 💕 💞 💓 💗 💖 💘 💝 💟 ❣️ 💌 💋 💯 💢 💥 💫 💦 💨 🕳️ 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤" },
        { name: "Животные", items: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪲 🐛 🦋 🐌 🐞 🐜 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦀 🦞 🦐 🐠 🐟 🐡 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦏 🦛 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐕‍🦺 🐈 🐈‍⬛ 🐓 🦃 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦦 🦥 🐿️ 🦔" },
        { name: "Еда", items: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🫕 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍪 🍩 🍫 🍬 🍭 ☕ 🍵 🧃 🥤 🧋 🍼" },
        { name: "Праздник и предметы", items: "🎉 🎊 🎈 🎁 🎀 🎂 🎄 🎃 🎆 🎇 🧨 ✨ ⭐ 🌟 💫 🔥 🌈 ☀️ 🌙 ⚡ ❄️ ☁️ ☔ ☃️ ⛄ 🏆 🥇 🥈 🥉 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🪀 🪁 🎮 🎲 🧩 🎯 🎸 🎹 🥁 🎺 🎻 🎤 🎧 📱 💻 🖥️ ⌨️ 🖱️ 📷 📺 📻 ⏰ 🔑 🔒 🔓 💡 📌 📎 ✂️ 📝 📚 📖 ✉️ 📧 📦 🚗 🚕 🚌 🚓 🚑 🚒 ✈️ 🚀 🚲 🛵 🏠 🏢 🏥 🏫" },
        { name: "Символы", items: "👍 👎 👌 ✌️ 🤞 🤟 ❤️ ✔️ ☑️ ❌ ❗ ❕ ❓ ❔ ‼️ ⁉️ ⚠️ 🚫 ⛔ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔶 🔷 🔺 🔻 ▶️ ◀️ 🔼 🔽 ⏩ ⏪ 🔀 🔁 🔂 🔄 🔃 ➕ ➖ ✖️ ➗ ♾️ 💲 💱 ©️ ®️ ™️ #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟" }
    ];

    function injectStyles() {
        if (document.getElementById("chatEmojiStyles")) return;
        var style = document.createElement("style");
        style.id = "chatEmojiStyles";
        style.textContent = `
            .emoji-picker-wrap{position:relative;display:flex;align-items:center;flex:0 0 auto}
            .emoji-button{width:46px;height:46px;min-width:46px;min-height:46px;border:1px solid #cbb9a7;border-radius:50%;background:rgba(255,255,255,.92);color:#5a4636;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;font-size:25px;line-height:1;box-shadow:0 3px 9px rgba(72,49,31,.08);transition:transform .16s ease,background .16s ease,box-shadow .16s ease}
            .emoji-button:hover{background:#fffaf3;transform:scale(1.05);box-shadow:0 5px 13px rgba(72,49,31,.14)}
            .emoji-button:active{transform:scale(.95)}
            .emoji-panel{position:absolute;left:0;bottom:46px;width:min(390px,calc(100vw - 30px));height:330px;background:rgba(255,251,245,.98);border:1px solid rgba(117,82,50,.18);border-radius:14px;box-shadow:0 10px 30px rgba(72,49,31,.2);z-index:1000;display:none;overflow:hidden;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
            .emoji-panel.open{display:flex;flex-direction:column}
            .emoji-categories{display:flex;gap:3px;padding:7px;border-bottom:1px solid #dfd1c2;overflow-x:auto;flex-shrink:0}
            .emoji-category{border:0;background:transparent;border-radius:8px;padding:5px 7px;font-size:16px;cursor:pointer;flex:0 0 auto}
            .emoji-category.active,.emoji-category:hover{background:#eadcc8}
            .emoji-title{padding:6px 10px 2px;color:#786a5e;font-size:11px;font-weight:700;flex-shrink:0}
            .emoji-grid{padding:6px 8px 10px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;overflow-y:auto}
            .emoji-item{border:0;background:transparent;border-radius:7px;padding:5px 1px;font-size:25px;line-height:1.15;cursor:pointer;text-align:center}
            .emoji-item:hover{background:#eadcc8}
            @media(max-width:700px){.send-box:has(.emoji-picker-wrap){overflow:visible!important}.emoji-button{width:44px;height:44px;min-width:44px;min-height:44px;font-size:24px}.emoji-panel{left:0;transform:none;bottom:44px;width:min(360px,calc(100vw - 20px));height:315px}.emoji-grid{grid-template-columns:repeat(8,1fr)}.emoji-item{font-size:24px}}
            @media(max-width:380px){.emoji-panel{left:-8px;transform:none;width:calc(100vw - 14px);height:300px;bottom:44px}.emoji-grid{grid-template-columns:repeat(7,1fr)}.emoji-item{font-size:23px}}
            @media(pointer:fine){.emoji-picker-wrap:hover .emoji-panel{display:flex;flex-direction:column}.emoji-picker-wrap:hover .emoji-button{background:#fffaf3}}
        `;
        document.head.appendChild(style);
    }

    function splitEmojis(text) {
        return Array.from(text).filter(function (item) { return item.trim() !== ""; });
    }

    function insertEmoji(input, emoji) {
        var start = input.selectionStart == null ? input.value.length : input.selectionStart;
        var end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        var cursor = start + emoji.length;
        var isMobile = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
        if (!isMobile) input.focus();
        input.setSelectionRange(cursor, cursor);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function buildPanel(input) {
        var wrap = document.createElement("div");
        wrap.className = "emoji-picker-wrap";

        var button = document.createElement("button");
        button.type = "button";
        button.className = "emoji-button";
        button.textContent = "😀";
        button.title = "Эмодзи";
        button.setAttribute("aria-label", "Эмодзи");

        var panel = document.createElement("div");
        panel.className = "emoji-panel";

        var categories = document.createElement("div");
        categories.className = "emoji-categories";
        var title = document.createElement("div");
        title.className = "emoji-title";
        var grid = document.createElement("div");
        grid.className = "emoji-grid";

        emojiGroups.forEach(function (group, index) {
            var categoryButton = document.createElement("button");
            categoryButton.type = "button";
            categoryButton.className = "emoji-category";
            categoryButton.textContent = splitEmojis(group.items)[0] || "•";
            categoryButton.title = group.name;
            categoryButton.addEventListener("click", function () {
                showGroup(index);
            });
            categories.appendChild(categoryButton);
        });

        function showGroup(index) {
            var group = emojiGroups[index];
            title.textContent = group.name;
            grid.replaceChildren();
            splitEmojis(group.items).forEach(function (emoji) {
                var emojiButton = document.createElement("button");
                emojiButton.type = "button";
                emojiButton.className = "emoji-item";
                emojiButton.textContent = emoji;
                emojiButton.title = emoji;
                emojiButton.addEventListener("mousedown", function (event) {
                    event.preventDefault();
                });
                emojiButton.addEventListener("click", function () {
                    insertEmoji(input, emoji);
                    if (window.matchMedia && window.matchMedia("(pointer:fine)").matches) return;
                });
                grid.appendChild(emojiButton);
            });
            Array.from(categories.children).forEach(function (node, i) {
                node.classList.toggle("active", i === index);
            });
        }

        panel.appendChild(categories);
        panel.appendChild(title);
        panel.appendChild(grid);
        wrap.appendChild(button);
        wrap.appendChild(panel);

        button.addEventListener("click", function (event) {
            event.stopPropagation();
            panel.classList.toggle("open");
            if (panel.classList.contains("open")) showGroup(0);
        });

        document.addEventListener("click", function (event) {
            if (!wrap.contains(event.target)) panel.classList.remove("open");
        });

        showGroup(0);
        return wrap;
    }

    function init() {
        var input = document.getElementById("messageInput");
        var sendBox = document.querySelector(".send-box");
        if (!input || !sendBox || document.getElementById("chatEmojiButton")) return;
        injectStyles();
        var wrap = buildPanel(input);
        wrap.id = "chatEmojiButton";
        sendBox.insertBefore(wrap, sendBox.firstElementChild);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
