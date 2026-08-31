// ===============================
// Индикатор "печатает..."
// ===============================

async function subscribeToTyping() {

    if (typingChannel) {

        await supabaseClient
            .removeChannel(
                typingChannel
            );

    }





    typingChannel =
        supabaseClient

            .channel(
                "typing-status"
            )

            .on(

                "broadcast",

                {

                    event:
                        "typing"

                },

                payload => {

                    const userId =
                        payload?.payload?.userId;


                    const username =
                        payload?.payload?.username;


                    const chatId =
                        Number(
                            payload?.payload?.chatId
                        );


                    if (
                        !userId ||
                        !username ||
                        !chatId
                    ) {

                        return;

                    }


                    // =========================================
                    // Показываем печать ТОЛЬКО в текущем чате
                    // =========================================

                    if (
                        !currentChatId ||
                        chatId !==
                        Number(currentChatId)
                    ) {

                        return;

                    }


                    // =========================================
                    // Себя не показываем
                    // =========================================

                    if (
                        currentUser &&
                        userId ===
                        currentUser.id
                    ) {

                        return;

                    }


                    typingUsers[userId] = {

                        username:
                            username,

                        chatId:
                            chatId

                    };


                    updateTypingIndicator();


                    clearTimeout(
                        typingUsers[
                            userId +
                            "_timer"
                        ]
                    );


                    typingUsers[
                        userId +
                        "_timer"
                    ] = setTimeout(

                        () => {

                            delete typingUsers[
                                userId
                            ];


                            delete typingUsers[
                                userId +
                                "_timer"
                            ];


                            updateTypingIndicator();

                        },

                        2000

                    );

                }

            )

            .subscribe();

}



// ===============================
// Отправка статуса печати
// ===============================

function sendTypingStatus() {

    if (
        !typingChannel ||
        !currentUser ||
        !currentChatId
    ) {

        return;

    }


    typingChannel.send({

        type:
            "broadcast",

        event:
            "typing",

        payload: {

            userId:
                currentUser.id,

            username:
                currentUsername ||
                "Пользователь",

            chatId:
                Number(currentChatId)

        }

    });

}



// ===============================
// Обновление текста
// "печатает..."
// ===============================

function updateTypingIndicator() {

    const indicator =
        document.getElementById(
            "typingIndicator"
        );


    if (!indicator) {
        return;
    }


    const users =
        Object.values(
            typingUsers
        )

        .filter(
            user =>
                user &&
                user.username &&
                user.chatId ===
                Number(currentChatId)
        )

        .map(
            user =>
                user.username
        );


    if (
        users.length === 0
    ) {

        indicator.style.display =
            "none";

        indicator.textContent =
            "";

        return;

    }


    let text = "";


    if (
        users.length === 1
    ) {

        text =
            `${users[0]} печатает...`;

    }

    else if (
        users.length === 2
    ) {

        text =
            `${users[0]} и ${users[1]} печатают...`;

    }

    else if (
        users.length === 3
    ) {

        text =
            `${users[0]}, ${users[1]} и ${users[2]} печатают...`;

    }

    else {

        text =
            `${users[0]}, ${users[1]} и ещё ${users.length - 2} человек печатают...`;

    }


    indicator.textContent =
        text;


    indicator.style.display =
        "block";

}
