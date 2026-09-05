// =========================================
// Проверка авторизации через Supabase
// Совместимо со старыми Safari / Android WebView.
// =========================================

async function getStoredLoginSession() {
    try {
        const raw = localStorage.getItem(
            "sb-sxkukrqjtgkxmzuzondm-auth-token"
        );

        if (!raw) return null;

        const stored = JSON.parse(raw);

        if (
            !stored ||
            !stored.access_token ||
            !stored.refresh_token ||
            !stored.user
        ) {
            return null;
        }

        return stored;
    } catch (error) {
        console.warn("Не удалось прочитать сохранённую сессию:", error);
        return null;
    }
}

async function checkAuth() {
    try {
        if (!window.supabaseClient) {
            window.location.replace("./login.html");
            return;
        }

        // auth.js сохраняет готовую сессию в стандартный Supabase localStorage.
        // На старом Safari нельзя здесь повторно вызывать setSession():
        // 02-chat-user.js делает это сразу после загрузки страницы. Два
        // одновременных setSession() могут конкурировать за refresh token.
        const storedSession = await getStoredLoginSession();

        if (storedSession && storedSession.access_token) {
            return;
        }

        // Обычный путь для современных браузеров, где Supabase сам восстановил
        // локальную сессию.
        try {
            const result = await supabaseClient.auth.getSession();
            const session = result && result.data
                ? result.data.session
                : null;

            if (session && session.access_token) {
                return;
            }
        } catch (error) {
            console.warn("Не удалось получить Supabase-сессию:", error);
        }

        window.location.replace("./login.html");
    } catch (error) {
        console.error("Ошибка проверки авторизации:", error);

        // Последняя проверка localStorage: если REST-вход уже сохранил
        // полноценную сессию, не выбрасываем пользователя на login.html.
        try {
            const storedSession = await getStoredLoginSession();
            if (storedSession && storedSession.access_token) {
                return;
            }
        } catch (restoreError) {
            console.warn(
                "Последняя проверка сохранённой сессии не удалась:",
                restoreError
            );
        }

        window.location.replace("./login.html");
    }
}

checkAuth();
