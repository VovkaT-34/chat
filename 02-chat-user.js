// ===============================
// Текущий пользователь
// ===============================

async function restoreLoginSession() {

    // auth.js performs the password login through the REST API for old
    // Safari/WebView compatibility and stores the returned Supabase session
    // in the standard auth storage key. The Supabase client created on this
    // page does not automatically adopt a session that was written by a
    // different page after the client was initialized, so explicitly hand
    // the stored access/refresh tokens to the client before getUser().

    const storageKey =
        "sb-sxkukrqjtgkxmzuzondm-auth-token";

    try {

        const storedText =
            window.localStorage.getItem(storageKey);

        if (!storedText) {
            return;
        }

        const stored =
            JSON.parse(storedText);

        if (
            !stored ||
            !stored.access_token ||
            !stored.refresh_token
        ) {
            return;
        }

        const {
            error
        } = await supabaseClient.auth.setSession({
            access_token: stored.access_token,
            refresh_token: stored.refresh_token
        });

        if (error) {
            console.log(
                "Ошибка восстановления сессии:",
                error
            );
        }

    } catch (error) {

        console.log(
            "Не удалось восстановить сессию:",
            error
        );

    }
}


async function initUser() {

    // Сначала передаём Supabase-клиенту сессию, которую auth.js сохранил
    // после успешного входа. Это особенно важно для старого Safari.

    await restoreLoginSession();

    const {
        data,
        error
    } = await supabaseClient.auth.getUser();

    if (error) {
        console.log(error);
        return;
    }

    currentUser = data.user;

    // Важно: call-v2.js и другие модули используют window.currentUser.
    // Основное состояние остаётся currentUser, но синхронизируем ссылку
    // после успешной авторизации, чтобы звонки не считали пользователя
    // неавторизованным.
    window.currentUser = currentUser;

    if (!currentUser) return;

    const {
        data: profile,
        error: profileError
    } = await supabaseClient.rpc(
        "get_my_profile"
    );

    if (profileError) {
        console.log(
            "Ошибка проверки профиля:",
            profileError
        );
        return;
    }

    currentUsername =
        profile?.[0]?.username ||
        "Пользователь";

    window.currentUsername = currentUsername;
}
