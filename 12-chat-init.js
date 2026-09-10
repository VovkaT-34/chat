
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


    // 2. Подключаем эмодзи

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "18-chat-emoji.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 2.1. Подключаем меню трёх точек в шапке чата

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "19-chat-header-menu.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 2.2. Подключаем живой поиск участников группового чата

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "20-group-chat-search.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 3. Подключаем пакетную загрузку данных списка чатов

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "15-chat-list-batch.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 4. Загружаем список чатов

    await loadChats();


    // 5. Подключаем пакетное восстановление статусов сообщений

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "16-message-status-batch.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 6. Подключаем оптимизированное Realtime-прочтение

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "17-message-read-realtime-optimized.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 7. Подключаем фильтрацию Realtime по доступным чатам

    await new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = "13-realtime-filter.js";
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });


    // 8. Подключаем Realtime сообщений

    await subscribeToMessages();


    // 9. Подключаем индикатор печати

    await subscribeToTyping();

}



// ===============================
// Запуск
// ===============================

startChat();

