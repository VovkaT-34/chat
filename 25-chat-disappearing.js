// =========================================
// ИСЧЕЗАЮЩИЕ СООБЩЕНИЯ
// Серверные настройки для личных и групповых чатов.
// Общие чаты не используют этот механизм.
// =========================================
(function () {
    "use strict";
    var OPTIONS = [
        { id: "30s", seconds: 30, label: "30 секунд" },
        { id: "5m", seconds: 300, label: "5 минут" },
        { id: "1h", seconds: 3600, label: "1 час" },
        { id: "3h", seconds: 10800, label: "3 часа" },
        { id: "1d", seconds: 86400, label: "1 сутки" },
        { id: "3d", seconds: 259200, label: "3 суток" },
        { id: "1w", seconds: 604800, label: "1 неделю" }
    ];
    var DEFAULT_SECONDS = 604800;
    var timer = null;

    function getChatItem(chatId) {
        var id = Number(chatId || window.currentChatId || 0);
        return id ? document.querySelector('.chat-item[data-chat-id="' + id + '"]') : null;
    }
    function isSupportedChat(chatId) {
        var item = getChatItem(chatId);
        var type = item && item.dataset ? item.dataset.chatType : "";
        return type === "private" || type === "group";
    }
    function getExpiry(message) {
        if (!message) return 0;
        var values = [];
        var shared = Date.parse(message.expires_at || "");
        if (shared) values.push(shared);
        var personal = message.message_user_expirations;
        if (personal && !Array.isArray(personal)) personal = [personal];
        (personal || []).forEach(function (row) {
            var value = Date.parse(row && row.expires_at ? row.expires_at : "");
            if (value) values.push(value);
        });
        return values.length ? Math.min.apply(Math, values) : 0;
    }
    function formatRemaining(milliseconds) {
        var seconds = Math.max(0, Math.ceil(milliseconds / 1000));
        if (seconds < 60) return seconds + "с";
        if (seconds < 3600) return Math.ceil(seconds / 60) + "м";
        if (seconds < 86400) return Math.ceil(seconds / 3600) + "ч";
        var days = Math.ceil(seconds / 86400);
        return days + (days === 1 ? " день" : " дн");
    }
    function updateCountdowns() {
        var box = document.getElementById("messages");
        if (!box) return;
        box.querySelectorAll(".message[data-message-expires-at]").forEach(function (node) {
            var expires = Date.parse(node.getAttribute("data-message-expires-at") || "");
            if (!expires) return;
            var remaining = expires - Date.now();
            if (remaining <= 0) {
                node.remove();
                return;
            }
            var indicator = node.querySelector(".chat-disappearing-countdown");
            if (indicator) {
                indicator.textContent = formatRemaining(remaining);
                indicator.title = "Сообщение исчезнет через " + indicator.textContent;
                indicator.setAttribute("aria-label", indicator.title);
            }
        });
        if (typeof window.updatePinnedMessagesBar === "function") window.updatePinnedMessagesBar();
    }
    function wrapRender() {
        if (typeof window.renderMessage !== "function" || window.__chatDisappearingRenderWrapped) return;
        var originalRenderMessage = window.renderMessage;
        window.renderMessage = function (message) {
            var expires = getExpiry(message);
            if (expires && expires <= Date.now()) return null;
            var element = originalRenderMessage(message);
            if (!element || !expires) return element;
            element.setAttribute("data-message-expires-at", new Date(expires).toISOString());
            var header = element.firstElementChild;
            if (header) {
                header.style.position = "relative";
                header.style.paddingRight = "56px";
                var indicator = document.createElement("span");
                indicator.className = "chat-disappearing-countdown";
                indicator.style.cssText = "position:absolute;top:0;right:0;display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:20px;padding:0 8px;margin:0;border:1px solid #39264f;border-radius:999px;background:#170d26;color:#f7f4ff;font:700 10px Arial,sans-serif;box-sizing:border-box;white-space:nowrap";
                indicator.textContent = formatRemaining(expires - Date.now());
                indicator.title = "Сообщение исчезнет через " + indicator.textContent;
                indicator.setAttribute("aria-label", indicator.title);
                header.appendChild(indicator);
            }
            return element;
        };
        window.__chatDisappearingRenderWrapped = true;
    }
    function closeDisappearingSettings() {
        var overlay = document.getElementById("chatDisappearingSettingsOverlay");
        if (overlay) overlay.remove();
    }
    function openDisappearingSettings(onBack, onClose) {
        var chatId = Number(window.currentChatId || 0);
        if (!chatId || !isSupportedChat(chatId) || !window.supabaseClient) return;
        closeDisappearingSettings();

        var overlay = document.createElement("div");
        overlay.id = "chatDisappearingSettingsOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100004;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box";
        var panel = document.createElement("div");
        panel.style.cssText = "width:min(300px,calc(100vw - 28px));max-height:min(82vh,680px);overflow-y:auto;background:#000;color:#fff;border:1px solid #333;border-radius:12px;padding:6px;font-family:Arial,sans-serif;box-sizing:border-box;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
        var content = document.createElement("div");
        var status = document.createElement("div");
        status.style.cssText = "margin:0 12px;color:#ddd;font-size:12px;line-height:1.4";
        var footer = document.createElement("div");
        footer.style.cssText = "display:none;justify-content:space-between;gap:10px;margin:8px 6px 4px";
        function makeButton(label) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.style.cssText = "display:block;min-width:90px;border:0;background:none;color:#fff;text-align:center;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
            return button;
        }
        var backButton = makeButton("Назад");
        var doneButton = makeButton("Готово");
        panel.appendChild(content);
        panel.appendChild(status);
        footer.appendChild(backButton);
        footer.appendChild(doneButton);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        var closed = false;
        var stage = "mode";
        var selectedMode = "self";
        var selectedDuration = DEFAULT_SECONDS;
        var chatItem = getChatItem(chatId);
        var isGroupChat = !!(chatItem && chatItem.dataset && chatItem.dataset.chatType === "group");
        var canManageShared = !isGroupChat;
        var personalDuration = DEFAULT_SECONDS;
        var sharedDuration = DEFAULT_SECONDS;
        var saving = false;
        if (!isGroupChat) renderMode();

        function closeAndReturn(callback) {
            if (closed) return;
            closed = true;
            closeDisappearingSettings();
            if (typeof callback === "function") callback();
        }
        backButton.addEventListener("click", function () {
            if (saving) return;
            if (stage === "timer") {
                renderMode();
            } else {
                closeAndReturn(onBack);
            }
        });
        doneButton.addEventListener("click", function () {
            if (saving || stage !== "timer") return;
            saving = true;
            doneButton.disabled = true;
            status.textContent = "Сохранение…";
            window.supabaseClient.rpc("set_chat_disappearing_settings", {
                p_chat_id: chatId,
                p_mode: selectedMode,
                p_enabled: true,
                p_duration_seconds: selectedDuration
            }).then(function (result) {
                if (closed) return;
                saving = false;
                doneButton.disabled = false;
                if (result.error) {
                    console.error("Ошибка настройки исчезающих сообщений:", result.error);
                    status.textContent = result.error.message || "Не удалось сохранить настройку.";
                    return;
                }
                closeAndReturn(onClose);
            }).catch(function (error) {
                if (closed) return;
                saving = false;
                doneButton.disabled = false;
                status.textContent = error && error.message ? error.message : "Не удалось сохранить настройку.";
            });
        });
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay && !saving) closeAndReturn(onClose);
        });

        function makeChoice(label, callback) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                callback();
            });
            return button;
        }
        function renderMode() {
            stage = "mode";
            status.textContent = "";
            content.replaceChildren();
            content.appendChild(makeChoice("Для себя", function () {
                selectedMode = "self";
                selectedDuration = personalDuration;
                renderTimer();
            }));
            if (canManageShared) {
                content.appendChild(makeChoice("Для всех", function () {
                    selectedMode = "all";
                    selectedDuration = sharedDuration;
                    renderTimer();
                }));
            }
            content.appendChild(backButton);
            footer.style.display = "none";
        }
        function renderTimer() {
            stage = "timer";
            status.textContent = "";
            content.replaceChildren();
            OPTIONS.forEach(function (option) {
                var button = document.createElement("button");
                button.type = "button";
                button.textContent = option.label + (option.seconds === selectedDuration ? "  ✓" : "");
                button.style.cssText = "display:block;width:100%;padding:11px 12px;border:0;border-radius:8px;background:" + (option.seconds === selectedDuration ? "#242424" : "none") + ";color:#fff;text-align:left;font:inherit;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none";
                button.addEventListener("click", function () {
                    selectedDuration = option.seconds;
                    renderTimer();
                });
                content.appendChild(button);
            });
            footer.insertBefore(backButton, doneButton);
            footer.style.display = "flex";
        }

        window.supabaseClient.rpc("get_chat_disappearing_settings", { p_chat_id: chatId }).then(function (result) {
            if (closed) return;
            if (result.error) {
                console.error("Ошибка загрузки настроек исчезающих сообщений:", result.error);
                status.textContent = result.error.message || "Не удалось загрузить настройки.";
                return;
            }
            var data = Array.isArray(result.data) ? result.data[0] : result.data;
            if (!data) {
                status.textContent = "Настройки не найдены.";
                return;
            }
            canManageShared = !isGroupChat || !!data.can_manage_shared;
            personalDuration = Number(data.personal_duration_seconds) || DEFAULT_SECONDS;
            sharedDuration = Number(data.shared_duration_seconds) || DEFAULT_SECONDS;
            renderMode();
        }).catch(function (error) {
            if (!closed) status.textContent = error && error.message ? error.message : "Не удалось загрузить настройки.";
        });
    }
    window.openChatDisappearingSettings = openDisappearingSettings;
    window.chatDisappearing = {
        options: OPTIONS,
        isSupportedChat: isSupportedChat,
        getExpiry: getExpiry,
        isExpired: function (message) {
            var expires = getExpiry(message);
            return !!expires && expires <= Date.now();
        },
        refresh: updateCountdowns
    };
    function init() {
        wrapRender();
        if (timer) clearInterval(timer);
        timer = setInterval(updateCountdowns, 1000);
        updateCountdowns();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) updateCountdowns();
    });
    setTimeout(wrapRender, 0);
})();
