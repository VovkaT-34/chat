async function loadIndexUnreadCount() {

    const badge = document.getElementById("chatBadge");

    if (!badge) return;


    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();


    if (userError || !userData.user) {
        console.log(userError);
        return;
    }


    const userId = userData.user.id;


    const { data: chats, error: chatError } =
        await supabaseClient
            .from("chats")
            .select("id");


    if (chatError) {
        console.log(chatError);
        return;
    }


    let totalUnread = 0;


    for (const chat of chats) {


        const { data, error } =
            await supabaseClient.rpc(
                "get_unread_messages_count",
                {
                    p_user_id: userId,
                    p_chat_id: chat.id
                }
            );


        if (!error && data) {

            totalUnread += Number(data);

        }

    }


    console.log(
        "Всего непрочитанных:",
        totalUnread
    );


    if (totalUnread > 0) {

        badge.textContent = totalUnread;

        badge.style.display = "";

    } else {

        badge.style.display = "none";

    }

}


document.addEventListener("DOMContentLoaded", () => {
    loadIndexUnreadCount();
});



let indexRealtime = null;

async function startIndexRealtime() {

    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    if (indexRealtime) {
        await supabaseClient.removeChannel(indexRealtime);
    }

    indexRealtime = supabaseClient
        .channel("index-unread")

        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },



            
            async (payload) => {
            
                await loadIndexUnreadCount();
            
                const {
                    data: { user }
                } = await supabaseClient.auth.getUser();
            
                if (
                    user &&
                    payload.new.user_id !== user.id &&
                    typeof playNotificationSound === "function"
                ) {
                    playNotificationSound();
                }
            
            }



            
        )

        .subscribe();

}

startIndexRealtime();

function playNotificationSound() {

    const sound = document.getElementById("messageSound");

    if (sound) {

        sound.play()
        .catch(error => {

            console.log(
                "Звук заблокирован браузером:",
                error
            );

        });

    }

}
