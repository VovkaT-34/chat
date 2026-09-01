// ===============================
// Навигация по сообщениям
// ===============================


// ===============================
// Проверка положения прокрутки
// ===============================

function isMessagesBoxNearBottom() {

    const box =
        document.getElementById(
            "messages"
        );


    if (!box) {

        return true;

    }


    const distanceFromBottom =
        box.scrollHeight -
        box.scrollTop -
        box.clientHeight;


    return distanceFromBottom <= 50;

}



// ===============================
// Создание кнопки перехода вниз
// ===============================

function createScrollToBottomButton() {

    let button =
        document.getElementById(
            "scrollToBottomButton"
        );


    if (button) {

        return button;

    }


    button =
        document.createElement(
            "button"
        );


    button.id =
        "scrollToBottomButton";


    button.type =
        "button";


    button.innerHTML =
        "⌄";


    button.title =
        "Перейти к новым сообщениям";


    button.setAttribute(
        "aria-label",
        "Перейти к новым сообщениям"
    );


    // =================================
    // Положение внутри окна сообщений
    // =================================

    button.style.position =
        "absolute";


    button.style.left =
        "50%";


    button.style.bottom =
        "14px";


    button.style.transform =
        "translateX(-50%)";


    // =================================
    // Размер
    // =================================

    button.style.width =
        "42px";


    button.style.height =
        "42px";


    button.style.padding =
        "0";


    // =================================
    // Внешний вид
    // =================================

    button.style.border =
        "1px solid rgba(142,68,173,0.30)";


    button.style.borderRadius =
        "50%";


    button.style.background =
        "rgba(255,255,255,0.72)";


    button.style.backdropFilter =
        "blur(4px)";


    button.style.webkitBackdropFilter =
        "blur(4px)";


    button.style.color =
        "rgba(142,68,173,0.85)";


    button.style.fontSize =
        "30px";


    button.style.fontFamily =
        "Georgia, serif";


    button.style.fontWeight =
        "bold";


    button.style.lineHeight =
        "36px";


    button.style.textAlign =
        "center";


    button.style.cursor =
        "pointer";


    button.style.display =
        "none";


    button.style.alignItems =
        "center";


    button.style.justifyContent =
        "center";


    button.style.zIndex =
        "1000";


    button.style.boxShadow =
        "0 2px 8px rgba(0,0,0,0.16)";


    button.style.transition =
        "opacity 0.2s ease, transform 0.2s ease, background 0.2s ease";


    button.style.opacity =
        "0.72";


    // =================================
    // Наведение
    // =================================

    button.addEventListener(
        "mouseenter",
        () => {

            button.style.opacity =
                "1";


            button.style.background =
                "rgba(255,255,255,0.92)";


            button.style.transform =
                "translateX(-50%) scale(1.06)";

        }
    );


    button.addEventListener(
        "mouseleave",
        () => {

            button.style.opacity =
                "0.72";


            button.style.background =
                "rgba(255,255,255,0.72)";


            button.style.transform =
                "translateX(-50%)";

        }
    );


    // =================================
    // Нажатие
    // =================================

    button.addEventListener(
        "click",
        () => {

            const box =
                document.getElementById(
                    "messages"
                );


            if (!box) {

                return;

            }


            box.scrollTo({

                top:
                    box.scrollHeight,

                behavior:
                    "smooth"

            });


            setTimeout(
                async () => {

                    if (
                        isMessagesBoxNearBottom()
                    ) {

                        await markChatAsRead();

                    }


                    updateScrollToBottomButton();

                },
                350
            );

        }
    );


    // =================================
    // Помещаем кнопку внутрь контейнера
    // сообщений
    // =================================

    const messagesContainer =
        document.getElementById(
            "messages"
        );


    if (
        messagesContainer &&
        messagesContainer.parentElement
    ) {

        const parent =
            messagesContainer.parentElement;


        if (
            getComputedStyle(parent).position ===
            "static"
        ) {

            parent.style.position =
                "relative";

        }


        parent.appendChild(
            button
        );

    }

    else {

        document.body.appendChild(
            button
        );

    }


    return button;

}



// ===============================
// Обновление кнопки
// ===============================

function updateScrollToBottomButton() {

    const button =
        createScrollToBottomButton();


    if (!button) {

        return;

    }


    if (
        isMessagesBoxNearBottom()
    ) {

        button.style.display =
            "none";

    }

    else {

        button.style.display =
            "flex";

    }

}



// ===============================
// Инициализация навигации
// ===============================

function initMessagesScrollNavigation() {

    const box =
        document.getElementById(
            "messages"
        );


    if (!box) {

        return;

    }


    createScrollToBottomButton();


    box.addEventListener(
        "scroll",
        () => {

            updateScrollToBottomButton();

        }
    );


    updateScrollToBottomButton();

}


initMessagesScrollNavigation();
