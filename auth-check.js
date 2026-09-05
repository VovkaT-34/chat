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

async function restoreStoredSession() {
    const storedSession = await getStoredLoginSession();
    if (!storedSession) return null;

    try {
        const result = await supabaseClient.auth.setSession({
            access_token: storedSession.access_token,
            refresh_token: storedSession.refresh_token
        });

        if (result && result.error) {
            console.warn(
                "Не удалось восстановить Supabase-сессию:",
                result.error
            );
            return null;
        }

        return result && result.data && result.data.session
            ? result.data.session
            : null;
    } catch (error) {
        console.warn("Ошибка восстановления Supabase-сессии:", error);
        return null;
    }
}

async function checkAuth() {
    try {
        if (!window.supabaseClient) {
            window.location.replace("./login.html");
            return;
        }

        // На старом Safari сначала явно передаём клиенту сессию,
        // которую auth.js сохранил после REST-входа.
        let session = await restoreStoredSession();

        // Если сохранённой сессии нет, используем обычную сессию Supabase.
        if (!session) {
            try {
                const result = await supabaseClient.auth.getSession();
                session = result && result.data
                    ? result.data.session
                    : null;
            } catch (error) {
                console.warn("Не удалось получить Supabase-сессию:", error);
            }
        }

        if (!session || !session.access_token) {
            window.location.replace("./login.html");
            return;
        }

        // Здесь намеренно НЕ проверяем profile/RPC и НЕ делаем signOut.
        // На iPhone 6 старый Safari может временно не выполнить RPC сразу
        // после перехода со страницы входа. Раньше это ошибочно воспринималось
        // как отсутствие аккаунта и создавало бесконечный возврат на login.html.
        // Реального пользователя и профиль после восстановления сессии
        // инициализирует 02-chat-user.js.
        return;
    } catch (error) {
        console.error("Ошибка проверки авторизации:", error);

        // Последняя попытка: если REST-вход уже сохранил рабочую сессию,
        // не выбрасываем пользователя на login.html из-за временного сбоя.
        try {
            const storedSession = await getStoredLoginSession();
            if (storedSession && storedSession.access_token) {
                const restored = await restoreStoredSession();
                if (restored) return;
            }
        } catch (restoreError) {
            console.warn(
                "Последнее восстановление сессии не удалось:",
                restoreError
            );
        }

        window.location.replace("./login.html");
    }
}

checkAuth();
