// ===============================
// Текущий пользователь
// ===============================

async function initUser() {

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
