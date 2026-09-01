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


    button.textContent =
        "↓";


    button.title =
        "Перейти к новым сообщениям";


    button.setAttribute(
        "aria-label",
        "Перейти к новым сообщениям"
    );


    button.style.position =
        "absolute";


    button.style.right =
        "20px";


    button.style.bottom =
        "90px";


    button.style.width =
        "44px";


    button.style.height =
        "44px";


    button.style.border =
        "none";


    button.style.borderRadius =
        "50%";


    button.style.background =
        "#8E44AD";


    button.style.color =
        "white";


    button.style.fontSize =
        "24px";


    button.style.fontWeight =
        "bold";


    button.style.cursor =
        "pointer";


    button.style.display =
        "none";


    button.style.zIndex =
        "1000";


    button.style.boxShadow =
        "0 2px 8px rgba(0,0,0,0.25)";


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


            // После перехода вниз
            // сообщения действительно становятся
            // просмотренными.

            setTimeout(
                () => {

                    markChatAsRead();

                    updateScrollToBottomButton();

                },
                350
            );

        }
    );


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

        button.style.alignItems =
            "center";

        button.style.justifyContent =
            "center";

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
