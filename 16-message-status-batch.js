// ===============================
// Пакетное восстановление статусов сообщений
// ===============================
(function(){
    if(typeof renderMessage!=="function"||typeof refreshChatMessageStatuses!=="function")return;
    if(window.__messageStatusBatchInstalled)return;
    window.__messageStatusBatchInstalled=true;

    var originalRenderMessage=renderMessage;
    var statusTimer=null;

    function scheduleStatusRefresh(){
        clearTimeout(statusTimer);
        statusTimer=setTimeout(function(){
            var chatId=Number(window.currentChatId||currentChatId||0);
            var box=document.getElementById("messages");
            if(!chatId||!box)return;
            var ids=[];
            box.querySelectorAll(".message[data-message-id]").forEach(function(message){
                if(message.dataset.userId===String(currentUser.id))ids.push(Number(message.dataset.messageId));
            });
            if(ids.length)void refreshChatMessageStatuses(chatId,ids);
        },80);
    }

    window.renderMessage=function(message){
        var result=originalRenderMessage(message);
        if(result&&currentUser&&message&&message.user_id===currentUser.id)scheduleStatusRefresh();
        return result;
    };
})();
