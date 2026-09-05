// ===============================
// Текущий пользователь
// ===============================

async function restoreLoginSession() {
    const storageKey = "sb-sxkukrqjtgkxmzuzondm-auth-token";

    try {
        const storedText = window.localStorage.getItem(storageKey);
        if (!storedText) return;

        const stored = JSON.parse(storedText);
        if (!stored || !stored.access_token || !stored.refresh_token) return;

        const result = await supabaseClient.auth.setSession({
            access_token: stored.access_token,
            refresh_token: stored.refresh_token
        });

        if (result && result.error) {
            console.log("Ошибка восстановления сессии:", result.error);
        }
    } catch (error) {
        console.log("Не удалось восстановить сессию:", error);
    }
}

async function initUser() {
    await restoreLoginSession();

    const result = await supabaseClient.auth.getUser();
    const data = result ? result.data : null;
    const error = result ? result.error : null;

    if (error) {
        console.log(error);
        return;
    }

    currentUser = data ? data.user : null;
    window.currentUser = currentUser;

    if (!currentUser) return;

    const profileResult = await supabaseClient.rpc("get_my_profile");
    const profile = profileResult ? profileResult.data : null;
    const profileError = profileResult ? profileResult.error : null;

    if (profileError) {
        console.log("Ошибка проверки профиля:", profileError);
        return;
    }

    currentUsername = "Пользователь";
    if (profile && profile.length && profile[0] && profile[0].username) {
        currentUsername = profile[0].username;
    }

    window.currentUsername = currentUsername;
}
