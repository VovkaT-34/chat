// =========================================
// Порядок чатов по последней переписке
// =========================================
(function () {
    let channel = null;
    let refreshTimer = null;

    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            if (typeof loadChats === "function") void loadChats();
        }, 120);
    }

    function subscribe() {
        if (channel || !window.supabaseClient || !window.currentUser?.id) return;

        channel = window.supabaseClient
            .channel(`chat-order-${window.currentUser.id}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "messages"
            }, payload => {
                if (payload?.new) scheduleRefresh();
            })
            .subscribe();
    }

    if (window.supabaseClient?.auth?.onAuthStateChange) {
        window.supabaseClient.auth.onAuthStateChange(() => {
            setTimeout(subscribe, 0);
        });
    }

    const wait = setInterval(() => {
        if (!window.currentUser?.id) return;
        clearInterval(wait);
        subscribe();
    }, 100);

    setTimeout(() => clearInterval(wait), 15000);
})();
