```javascript
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


    const messagesContainer =
        document.getElementById(
            "messages"
        );


    if (!messagesContainer) {

        return null;

    }


    button =
        document.createElement(
            "button"
        );


    button.id =
        "scrollToBottomButton";


    button.type =
        "button";


    button.setAttribute(
        "aria-label",
        "Перейти к последним сообщениям"
    );


    button.title =
        "Перейти к последним сообщениям";


    button.innerHTML =
        "⌄";


    button.addEventListener(
        "click",
        event => {

            event.preventDefault();

            event.stopPropagation();


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
                () => {

                    markChatAsRead();

                    updateScrollToBottomButton();

                },
                350
            );

        }
    );


    messagesContainer.appendChild(
        button
    );


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

        button.classList.remove(
            "scroll-to-bottom-visible"
        );

    }

    else {

        button.classList.add(
            "scroll-to-bottom-visible"
        );

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
```
