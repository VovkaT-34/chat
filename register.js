// =========================================
// Регистрация через Supabase Auth
// =========================================

document
.getElementById("registerForm")
.addEventListener("submit", async function(e) {

    e.preventDefault();


    const username =
        document
        .getElementById("username")
        .value
        .trim();


    const email =
        document
        .getElementById("email")
        .value
        .trim();


    const password =
        document
        .getElementById("password")
        .value;


    const password2 =
        document
        .getElementById("password2")
        .value;


    const message =
        document
        .getElementById("message");


    message.textContent = "";


    // Проверка паролей

    if (password !== password2) {

        message.textContent =
            "Пароли не совпадают.";

        return;

    }


    // Минимальная длина пароля

    if (password.length < 6) {

        message.textContent =
            "Пароль должен содержать минимум 6 символов.";

        return;

    }


    // Создание пользователя в Supabase Auth

    const {
        data,
        error
    } = await supabaseClient.auth.signUp({

        email: email,

        password: password

    });


    if (error) {

        message.textContent =
            error.message;

        return;

    }


    // Проверяем, создан ли пользователь

    const user =
        data?.user;


    if (!user) {

        message.textContent =
            "Пользователь не создан.";

        return;

    }


    // Создаём профиль пользователя

    const {
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .insert({

            id: user.id,

            username: username,

            email: email,

            approved: false

        });


    if (profileError) {

        console.error(
            "Ошибка создания профиля:",
            profileError
        );


        message.textContent =
            "Не удалось создать профиль пользователя.";

        return;

    }


    // Успешная регистрация

    message.style.color =
        "green";


    message.textContent =
        "Регистрация успешна. Переходим ко входу...";


    // Если после регистрации Supabase
    // создал активную сессию,
    // сразу выходим из неё.

    await supabaseClient.auth.signOut();


    setTimeout(function() {

        window.location.href =
            "login.html";

    }, 2000);

});
