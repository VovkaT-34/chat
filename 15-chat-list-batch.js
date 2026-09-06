// ===============================
// Пакетное обновление списка чатов
// ===============================

(function(){
    var originalLoadChats = window.loadChats;
    if (typeof originalLoadChats !== "function") return;

    window.loadChats = async function(){
        var originalUnread = window.updateUnreadCount;
        var originalStatus = window.updateChatListMessageStatus;

        // Во время построения списка запрещаем старые per-chat запросы.
        window.updateUnreadCount = function(){};
        window.updateChatListMessageStatus = function(){};

        try {
            await originalLoadChats();
        } finally {
            window.updateUnreadCount = originalUnread;
            window.updateChatListMessageStatus = originalStatus;
        }

        var list = document.getElementById("chatList");
        if (!list || !currentUser || !supabaseClient) return;

        var ids = Array.prototype.map.call(
            list.querySelectorAll(".chat-item[data-chat-id]"),
            function(item){ return Number(item.dataset.chatId); }
        ).filter(function(id){ return id > 0; });

        if (!ids.length) return;

        var result = await supabaseClient.rpc("get_my_chat_list_data", {
            p_chat_ids: ids
        });

        if (result.error) {
            console.error("Ошибка пакетной загрузки данных чатов:", result.error);
            ids.forEach(function(id){
                updateUnreadCount(id);
                updateChatListMessageStatus(id);
            });
            return;
        }

        (result.data || []).forEach(function(row){
            var id = Number(row.chat_id);
            var badge = document.getElementById("count-" + id);
            if (badge) {
                var count = Number(row.unread_count) || 0;
                badge.textContent = count > 0 ? count : "";
                badge.style.display = count > 0 ? "inline-block" : "none";
            }

            var statusEl = document.querySelector('[data-chat-status-id="'+id+'"]');
            if (statusEl && row.last_message_id && row.last_message_status) {
                statusEl.dataset.messageStatus = "sent";
                setMessageStatus(statusEl, row.last_message_status);
            }
        });
    };
})();
