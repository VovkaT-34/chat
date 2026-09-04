// ===============================
// Навигация по сообщениям
// ===============================

function getMessagesBox() {
    return document.getElementById("messages");
}

// При открытии уже прочитанного чата всегда показываем конец истории.
// Используем не только scrollHeight, но и последний элемент сообщения:
// это надёжнее после динамической отрисовки и изменения высоты DOM.
function scrollMessagesToBottom(behavior = "auto") {
    const box = getMessagesBox();
    if (!box) return;

    const move = () => {
        const lastMessage = box.querySelector(".message:last-of-type");

        if (lastMessage) {
            try {
                lastMessage.scrollIntoView({
                    behavior,
                    block: "end",
                    inline: "nearest"
                });
            } catch {
                box.scrollTop = box.scrollHeight;
            }
        }

        box.scrollTop = box.scrollHeight;
        updateScrollToBottomButton();
    };

    move();
    requestAnimationFrame(move);
    setTimeout(move, 50);
    setTimeout(move, 150);
    setTimeout(move, 300);
}

window.scrollMessagesToBottom = scrollMessagesToBottom;

// ===============================
// Проверка положения прокрутки
// ===============================

function isMessagesBoxNearBottom() {
    const box = getMessagesBox();
    if (!box) return true;

    const distanceFromBottom =
        box.scrollHeight - box.scrollTop - box.clientHeight;

    return distanceFromBottom <= 50;
}

// ===============================
// Создание кнопки перехода вниз
// ===============================

function createScrollToBottomButton() {
    let button = document.getElementById("scrollToBottomButton");
    if (button) return button;

    const messagesContainer = getMessagesBox();
    if (!messagesContainer) return null;

    const chatWindow = messagesContainer.parentElement;
    if (!chatWindow) return null;

    button = document.createElement("button");
    button.id = "scrollToBottomButton";
    button.type = "button";
    button.setAttribute("aria-label", "Перейти к последним сообщениям");
    button.title = "Перейти к последним сообщениям";
    button.innerHTML = "↓";

    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        scrollMessagesToBottom("smooth");

        setTimeout(() => {
            if (typeof markChatAsRead === "function") markChatAsRead();
            updateScrollToBottomButton();
        }, 500);
    });

    chatWindow.appendChild(button);
    return button;
}

// ===============================
// Обновление кнопки
// ===============================

function updateScrollToBottomButton() {
    const button = createScrollToBottomButton();
    if (!button) return;

    if (isMessagesBoxNearBottom()) {
        button.classList.remove("scroll-to-bottom-visible");
    } else {
        button.classList.add("scroll-to-bottom-visible");
    }
}

// ===============================
// Инициализация навигации
// ===============================

function initMessagesScrollNavigation() {
    const box = getMessagesBox();
    if (!box) return;

    // Браузер не должен сам сохранять старую позицию при полной
    // перерисовке истории чата.
    box.style.overflowAnchor = "none";

    createScrollToBottomButton();

    box.addEventListener("scroll", () => {
        updateScrollToBottomButton();
    }, { passive: true });

    updateScrollToBottomButton();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMessagesScrollNavigation);
} else {
    initMessagesScrollNavigation();
}
