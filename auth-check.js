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

        if (result.error) {
            console.warn("Не удалось восстановить Supabase-сессию:", result.error);
            return null;
        }

        return result.data && result.data.session
            ? result.data.session
            : null;
    } catch (error) {
        console.warn("Ошибка восстановления Supabase-сессии:", error);
        return null;
    }
}

async function checkMyProfileWithRetry() {
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const result = await supabaseClient.rpc(
                "check_my_profile"
            );

            if (
                result &&
                !result.error &&
                result.data &&
                result.data[0]
            ) {
                return {
                    profile: result.data[0],
                    error: null
                };
            }

            lastError = result ? result.error : null;
        } catch (error) {
            lastError = error;
        }

        await new Promise(function (resolve) {
            setTimeout(resolve, 700);
        });
    }

    return {
        profile: null,
        error: lastError
    };
}

async function checkAuth() {
    try {
        if (!window.supabaseClient) {
            window.location.replace("./login.html");
            return;
        }

        let session = null;

        try {
            const storedSession = await getStoredLoginSession();
            if (storedSession) {
                session = await restoreStoredSession();
            }
        } catch (error) {
            console.warn("Ошибка первичного восстановления сессии:", error);
        }

        if (!session) {
            const result = await supabaseClient.auth.getSession();
            session = result && result.data
                ? result.data.session
                : null;
        }

        if (!session) {
            window.location.replace("./login.html");
            return;
        }

        const profileResult = await checkMyProfileWithRetry();
        const profile = profileResult.profile;

        // Старый Safari / WebView может иметь уже действующую Auth-сессию,
        // но временно не выполнить RPC профиля. В таком случае нельзя
        // выбрасывать пользователя обратно на страницу входа.
        if (profileResult.error) {
            console.warn(
                "Профиль временно недоступен, сохраняем действующую сессию:",
                profileResult.error
            );
            return;
        }

        if (!profile) {
            await supabaseClient.auth.signOut({ scope: "local" });
            window.location.replace("./login.html");
            return;
        }

        if (!profile.approved) {
            await supabaseClient.auth.signOut({ scope: "local" });
            window.location.replace("./login.html");
            return;
        }
    } catch (error) {
        console.error("Ошибка проверки авторизации:", error);

        // Последняя попытка: если REST-вход уже сохранил сессию,
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
