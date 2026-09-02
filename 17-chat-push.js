// =========================================
// Отправка Web Push после сохранения сообщения
// =========================================

async function sendChatPushForMessage(messageId) {
    if (!messageId || !window.supabaseClient) return;

    try {
        const { data, error } = await window.supabaseClient.functions.invoke(
            "send-message-push",
            {
                body: { messageId }
            }
        );

        if (error) {
            console.warn("Web Push не отправлен:", error);
            return;
        }

        if (data?.error) {
            console.warn("Web Push сервер вернул ошибку:", data.error);
        }
    } catch (error) {
        console.warn("Ошибка вызова Web Push:", error);
    }
}
