
// ===============================
// Запуск чата
// ===============================

async function startChat() {

    // 1. Получаем пользователя

    await initUser();


    if (!currentUser) {

        console.log(
            "Пользователь не авторизован."
        );

        return;

    }


    // 2. Загружаем список чатов

    await loadChats();


    // 3. Подключаем Realtime сообщений

    await subscribeToMessages();


    // 4. Подключаем индикатор печати

    await subscribeToTyping();

}



// ===============================
// Запуск
// ===============================

startChat();

