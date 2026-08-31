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

}
