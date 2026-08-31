
// =========================================
// Вход через Supabase Auth
// =========================================

document
    .getElementById("loginForm")
    .addEventListener("submit", async function(e) {

        e.preventDefault();


        const email =
            document
                .getElementById("email")
                .value
                .trim();


        const password =
            document
                .getElementById("password")
                .value;


        const error =
            document
                .getElementById("error");


        error.textContent = "";


        // =========================================
        // Вход через Supabase Auth
        // =========================================

        const {
            data,
            error: authError
        } = await supabaseClient.auth.signInWithPassword({

            email: email,

            password: password

        });


        // =========================================
        // Ошибка входа
        // =========================================

        if (authError || !data?.user) {

            error.textContent =
                "Неверный e-mail или пароль.";

            return;

        }


        // =========================================
        // Получаем профиль через RPC
        // =========================================
        //
        // Прямого SELECT из profiles больше нет.
        // Проверка выполняется через
        // SECURITY DEFINER функцию
        // check_my_profile().
        //

        const {
            data: profile,
            error: profileError
        } = await supabaseClient.rpc(
            "check_my_profile"
        );


        // =========================================
        // Ошибка получения профиля
        // =========================================

        if (
            profileError ||
            !profile ||
            !profile[0]
        ) {

            console.error(
                "Ошибка проверки профиля:",
                profileError
            );

            error.textContent =
                "Ошибка проверки профиля.";

            await supabaseClient.auth.signOut();

            return;

        }


        // =========================================
        // Получаем данные профиля
        // =========================================

        const userProfile =
            profile[0];


        // =========================================
        // Проверяем подтверждение аккаунта
        // =========================================

        if (!userProfile.approved) {

            error.textContent =
                "Ваш аккаунт ожидает подтверждения администратора.";

            await supabaseClient.auth.signOut();

            return;

        }


        // =========================================
        // Вход разрешён
        // =========================================

        window.location.href =
            "index.html";

    });

