// ===============================
// Пакетное обновление списка чатов
// ===============================
// Сохраняем существующую логику UI, но при загрузке списка
// не выполняем отдельный RPC для каждого чата.

async function batchUpdateChatListData(chatIds) {
    if (!currentUser || !supabaseClient || !Array.isArray(chatIds) || !chatIds.length) return;

    var ids = chatIds.map(Number).filter(function(id){ return id > 0; });
    if (!ids.length) return;

    // Один запрос получает последние собственные сообщения сразу для всех чатов.
    var messagesResult = await supabaseClient
        .from("messages")
        .select("id,chat_id,created_at")
        .in("chat_id", ids)
        .eq("user_id", currentUser.id)
        .order("created_at", {ascending:false});

    if (messagesResult.error) {
        console.error("Ошибка пакетной загрузки статусов чатов:", messagesResult.error);
        return;
    }

    var latestByChat = {};
    (messagesResult.data || []).forEach(function(message){
        var chatId = Number(message.chat_id);
        if (!latestByChat[chatId]) latestByChat[chatId] = message;
    });

    // Статусы в списке нужны только для последнего собственного сообщения.
    // Запрашиваем их только там, где такое сообщение действительно есть.
    await Promise.all(Object.keys(latestByChat).map(async function(chatId){
        var last = latestByChat[chatId];
        var el = document.querySelector('[data-chat-status-id="'+Number(chatId)+'"]');
        if (!el) return;

        var statusResult = await supabaseClient.rpc("get_message_status", {p_message_id:last.id});
        if (statusResult.error) return;

        el.dataset.messageStatus = "sent";
        setMessageStatus(el, statusResult.data);
    }));

    // Unread остаётся через существующий RPC, но запускается только после
    // построения списка и с уже существующими debounce-таймерами.
    ids.forEach(function(chatId){
        updateUnreadCount(chatId);
    });
}

window.batchUpdateChatListData = batchUpdateChatListData;
