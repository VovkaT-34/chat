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
        return Math.ceil(seconds / 86400) + "д";
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
                var indicator = document.createElement("span");
                indicator.className = "chat-disappearing-countdown";
                indicator.style.cssText = "display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;margin-left:8px;border:1px solid rgba(255,255,255,.55);border-radius:50%;background:#111;color:#fff;font:700 10px Arial,sans-serif;box-sizing:border-box;white-space:nowrap";
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
        overlay.style.cssText = "position:fixed;inset:0;z-index:100004;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.68);box-sizing:border-box";
        var panel = document.createElement("div");
        panel.style.cssText = "width:min(430px,calc(100vw - 28px));max-height:min(82vh,680px);overflow-y:auto;background:#000;color:#fff;border:1px solid #444;border-radius:14px;box-shadow:0 18px 55px rgba(0,0,0,.45);padding:17px;font-family:Arial,sans-serif;box-sizing:border-box;user-select:none;-webkit-user-select:none";
        var title = document.createElement("h3");
        title.textContent = "Исчезающие сообщения";
        title.style.cssText = "margin:0 0 14px;font-size:20px;color:#fff";
        var explanation = document.createElement("div");
        explanation.textContent = "Настройка применяется только к новым сообщениям. Уже отправленные сообщения не меняются.";
        explanation.style.cssText = "margin-bottom:14px;color:#ddd;font-size:13px;line-height:1.45";
        var status = document.createElement("div");
        status.style.cssText = "min-height:20px;margin:10px 0;color:#ddd;font-size:13px;line-height:1.4";
        var sections = document.createElement("div");
        sections.style.cssText = "display:flex;flex-direction:column;gap:12px";
        var footer = document.createElement("div");
        footer.style.cssText = "display:flex;justify-content:space-between;gap:10px;margin-top:12px";
        function makeButton(label, background) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.style.cssText = "border:1px solid #666;border-radius:9px;background:" + background + ";color:#fff;padding:10px 13px;font:700 14px Arial,sans-serif;cursor:pointer";
            return button;
        }
        var backButton = makeButton("← Назад", "#171717");
        backButton.addEventListener("click", function () {
            closeDisappearingSettings();
            if (typeof onBack === "function") onBack();
        });
        var doneButton = makeButton("Готово", "#333");
        doneButton.addEventListener("click", function () {
            closeDisappearingSettings();
            if (typeof onClose === "function") onClose();
        });
        panel.appendChild(title);
        panel.appendChild(explanation);
        panel.appendChild(sections);
        panel.appendChild(status);
        footer.appendChild(backButton);
        footer.appendChild(doneButton);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        var closed = false;
        function closeFromBackdrop() {
            if (closed) return;
            closed = true;
            closeDisappearingSettings();
            if (typeof onClose === "function") onClose();
        }
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) closeFromBackdrop();
        });
        function renderSection(mode, label, enabled, duration) {
            var section = document.createElement("div");
            section.style.cssText = "padding:13px;border:1px solid #444;border-radius:11px;background:#101010";
            var heading = document.createElement("div");
            heading.textContent = label;
            heading.style.cssText = "margin-bottom:9px;color:#fff;font-size:16px;font-weight:700";
            var select = document.createElement("select");
            select.style.cssText = "width:100%;padding:10px;border:1px solid #555;border-radius:8px;background:#050505;color:#fff;font:14px Arial,sans-serif;box-sizing:border-box";
            OPTIONS.forEach(function (option) {
                var item = document.createElement("option");
                item.value = String(option.seconds);
                item.textContent = option.label;
                item.selected = option.seconds === Number(duration || DEFAULT_SECONDS);
                select.appendChild(item);
            });
            var action = makeButton(enabled ? "Выключить" : "Включить", enabled ? "#4b2727" : "#343434");
            action.style.marginTop = "10px";
            action.style.width = "100%";
            select.addEventListener("change", function () {
                save(mode, enabled, Number(select.value), action);
            });
            action.addEventListener("click", function () {
                save(mode, !enabled, Number(select.value), action);
            });
            var state = document.createElement("div");
            state.textContent = enabled ? "Включено" : "Выключено";
            state.style.cssText = "margin-top:8px;color:#ccc;font-size:12px";
            section.appendChild(heading);
            section.appendChild(select);
            section.appendChild(action);
            section.appendChild(state);
            sections.appendChild(section);
        }
        function save(mode, enabled, duration, action) {
            if (action.disabled) return;
            action.disabled = true;
            status.textContent = "Сохранение…";
            window.supabaseClient.rpc("set_chat_disappearing_settings", {
                p_chat_id: chatId,
                p_mode: mode,
                p_enabled: enabled,
                p_duration_seconds: duration
            }).then(function (result) {
                action.disabled = false;
                if (result.error) {
                    console.error("Ошибка настройки исчезающих сообщений:", result.error);
                    status.textContent = result.error.message || "Не удалось сохранить настройку.";
                    return;
                }
                status.textContent = "Сохранено. Настройка применяется к новым сообщениям.";
                loadSettings();
            }).catch(function (error) {
                action.disabled = false;
                status.textContent = error && error.message ? error.message : "Не удалось сохранить настройку.";
            });
        }
        function loadSettings() {
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
                sections.replaceChildren();
                renderSection("self", "Для себя", !!data.personal_enabled, data.personal_duration_seconds);
                if (data.can_manage_shared) {
                    renderSection("all", "Для всех", !!data.shared_enabled, data.shared_duration_seconds);
                }
                status.textContent = data.shared_enabled && !data.can_manage_shared
                    ? "Общий режим «Для всех» включён владельцем группы."
                    : "По умолчанию режим выключен, срок — одна неделя.";
            }).catch(function (error) {
                if (!closed) status.textContent = error && error.message ? error.message : "Не удалось загрузить настройки.";
            });
        }
        loadSettings();
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
