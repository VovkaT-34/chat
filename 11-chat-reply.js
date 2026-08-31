// ===============================
// Ответ на сообщение
// ===============================

function replyToMessage(
    id,
    username,
    text
) {

    replyMessageId =
        id;


    const input =
        document.getElementById(
            "messageInput"
        );


    const replyBox =
        document.getElementById(
            "replyBox"
        );


    const replyText =
        document.getElementById(
            "replyText"
        );


    if (
        !input ||
        !replyBox ||
        !replyText
    ) {

        return;

    }


    const shortText =

        text.length > 40

        ?

        text.substring(
            0,
            40
        ) + "..."

        :

        text;


    replyText.innerHTML = `

        <b>↩ ${username}</b><br>

        ${shortText}

    `;


    replyBox.style.display =
        "block";


    input.placeholder =
        "Введите сообщение...";


    input.focus();

}



// ===============================
// Отмена ответа
// ===============================

function cancelReply() {

    replyMessageId =
        null;


    const replyBox =
        document.getElementById(
            "replyBox"
        );


    if (replyBox) {

        replyBox.style.display =
            "none";

    }


    const input =
        document.getElementById(
            "messageInput"
        );


    if (input) {

        input.placeholder =
            "Введите сообщение...";

    }

}
