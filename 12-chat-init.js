
// ===============================
// Запуск чата
// ===============================

async function startChat() {
    await initUser();
    if (!currentUser) {
        console.log("Пользователь не авторизован.");
        return;
    }

    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="18-chat-emoji.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="19-chat-header-menu.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="20-group-chat-search.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="21-chat-users.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="22-chat-remove-users.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="23-public-chat-labels.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="24-chat-themes.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="25-chat-disappearing.js?v=efficient-countdown-20261127-2"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="15-chat-list-batch.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await loadChats();
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="16-message-status-batch.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="17-message-read-realtime-optimized.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await new Promise(function (resolve) { var script=document.createElement("script"); script.src="13-realtime-filter.js"; script.onload=resolve; script.onerror=resolve; document.head.appendChild(script); });
    await subscribeToMessages();
    await subscribeToTyping();
}

startChat();

(function centerAdminButton() {
    var style = document.createElement("style");
    style.textContent = "#adminPanelButton{left:50%!important;right:auto!important;transform:translate(-50%,-50%)!important}#adminPanelButton:hover{transform:translate(-50%,-50%) translateY(-1px) scale(1.03)!important}";
    document.head.appendChild(style);
})();
