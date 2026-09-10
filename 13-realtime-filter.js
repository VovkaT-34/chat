// ===============================
// Фильтры Realtime по нужным событиям
// ===============================
(function () {
    if (window.__filteredMessageRealtimeInstalled) return;
    window.__filteredMessageRealtimeInstalled = true;

    function getAllowedChatIds() {
        var ids = [];
        document.querySelectorAll("#chatList .chat-item[data-chat-id]").forEach(function (item) {
            var id = Number(item.dataset.chatId);
            if (id > 0 && ids.indexOf(id) === -1) ids.push(id);
        });
        return ids;
    }

    var originalChannel = supabaseClient.channel.bind(supabaseClient);

    supabaseClient.channel = function (name, options) {
        var channel = originalChannel(name, options);
        var channelName = String(name);

        if (
            channelName.indexOf("messages-realtime-") !== 0 &&
            channelName.indexOf("message-deliveries-realtime") !== 0 &&
            channelName.indexOf("user-chat-reads-realtime") !== 0
        ) {
            return channel;
        }

        var originalOn = channel.on.bind(channel);

        channel.on = function (type, config, callback) {
            if (
                type === "postgres_changes" &&
                config &&
                config.table === "messages" &&
                config.event === "INSERT"
            ) {
                var chatIds = getAllowedChatIds();

                if (chatIds.length > 0 && chatIds.length <= 100) {
                    config = Object.assign({}, config, {
                        filter: "chat_id=in.(" + chatIds.join(",") + ")"
                    });
                    console.log("Realtime сообщений отфильтрован по чатам:", chatIds.length);
                } else if (chatIds.length > 100) {
                    console.warn("Слишком много чатов для одного Realtime-фильтра:", chatIds.length);
                }
            }

            if (
                type === "postgres_changes" &&
                config &&
                config.table === "message_deliveries" &&
                config.event === "INSERT" &&
                currentUser &&
                currentUser.id
            ) {
                config = Object.assign({}, config, {
                    filter: "user_id=neq." + currentUser.id
                });
                console.log("Realtime доставок отфильтрован по user_id");
            }

            if (
                type === "postgres_changes" &&
                config &&
                config.table === "user_chat_reads" &&
                currentUser &&
                currentUser.id
            ) {
                config = Object.assign({}, config, {
                    filter: "user_id=neq." + currentUser.id
                });
                console.log("Realtime прочтений отфильтрован по user_id");
            }

            return originalOn(type, config, callback);
        };

        return channel;
    };

    // После появления/исчезновения чата пересоздаём подписку,
    // чтобы новый список chat_id сразу попал в Realtime-фильтр.
    if (typeof loadChats === "function" && !window.__filteredLoadChatsInstalled) {
        window.__filteredLoadChatsInstalled = true;

        var originalLoadChats = loadChats;

        window.loadChats = async function () {
            var result = await originalLoadChats.apply(this, arguments);

            if (
                typeof reconnectChatRealtime === "function" &&
                currentUser &&
                supabaseClient
            ) {
                try {
                    await reconnectChatRealtime();
                } catch (error) {
                    console.warn("Ошибка обновления Realtime-фильтра чатов:", error);
                }
            }

            return result;
        };
    }
})();