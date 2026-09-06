
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


    // 2. Подключаем пакетную загрузку данных списка чатов

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "15-chat-list-batch.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 3. Загружаем список чатов

    await loadChats();


    // 4. Подключаем фильтрацию Realtime по доступным чатам

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "13-realtime-filter.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 5. Подключаем Realtime сообщений

    await subscribeToMessages();


    // 6. Подключаем индикатор печати

    await subscribeToTyping();

}



// ===============================
// Запуск
// ===============================

startChat();

