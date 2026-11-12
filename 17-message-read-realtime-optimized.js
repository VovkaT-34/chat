// ===============================
// Оптимизированное Realtime-прочтение
// ===============================
(async function(){
    if(!supabaseClient)return;

    try{
        var channels=typeof supabaseClient.getChannels==="function"?supabaseClient.getChannels():[];
        channels.forEach(function(channel){
            if(channel&&channel.topic==="realtime:user-chat-reads-realtime")void supabaseClient.removeChannel(channel);
        });
    }catch(error){
        console.warn("Не удалось заменить старый канал прочтения:",error);
    }

    supabaseClient
        .channel("user-chat-reads-realtime")
        .on(
            "postgres_changes",
            {
                event:"*",
                schema:"public",
                table:"user_chat_reads"
            },
            async function(payload){
                try{
                    var info=payload&&payload.new?payload.new:null;
                    if(!info||!currentUser||info.user_id===currentUser.id)return;

                    var chatId=Number(info.chat_id);
                    var lastReadId=Number(info.last_read_message_id);
                    if(!chatId||!lastReadId)return;

                    chatReadBoundaryCache.set(chatId,Math.max(Number(chatReadBoundaryCache.get(chatId)||0),lastReadId));

                    var box=document.getElementById("messages");
                    if(box&&Number(currentChatId)===chatId){
                        box.querySelectorAll('.message[data-message-id]').forEach(function(message){
                            var messageId=Number(message.dataset.messageId);
                            if(message.dataset.userId===String(currentUser.id)&&messageId<=lastReadId){
                                cacheAndApplyMessageStatus(messageId,"read");
                            }
                        });
                    }

                    if(typeof updateChatListMessageStatus==="function"){
                        await updateChatListMessageStatus(chatId);
                    }
                }catch(error){
                    console.warn("Ошибка оптимизированного прочтения Realtime:",error);
                }
            }
        )
        .subscribe();
})();
