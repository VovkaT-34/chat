// =========================================
// Регистрация через Supabase Auth
// =========================================

document
.getElementById("registerForm")
.addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const password2 = document.getElementById("password2").value;
    const message = document.getElementById("message");

    message.textContent = "";
    message.style.color = "#b00020";

    if (username.length < 2) {
        message.textContent = "Имя пользователя должно содержать минимум 2 символа.";
        return;
    }

    if (password !== password2) {
        message.textContent = "Пароли не совпадают.";
        return;
    }

    if (password.length < 6) {
        message.textContent = "Пароль должен содержать минимум 6 символов.";
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                username
            }
        }
    });

    if (error) {
        console.error("Ошибка регистрации:", error);
        message.textContent = error.message || "Не удалось создать аккаунт.";
        return;
    }

    const user = data?.user;
    if (!user) {
        message.textContent = "Пользователь не создан.";
        return;
    }

    // Профиль создаётся серверным trigger после создания Auth-пользователя.
    // Это работает и тогда, когда Supabase требует подтверждение e-mail
    // и у браузера ещё нет authenticated-сессии.
    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
        console.warn("Проверка созданного профиля:", profileError);
    }

    if (!profile) {
        console.warn("Профиль ещё не виден клиенту, но Auth-пользователь создан:", user.id);
    }

    message.style.color = "green";
    message.textContent = data.session
        ? "Регистрация успешна. Переходим ко входу..."
        : "Регистрация успешна. Подтвердите e-mail, если это требуется, затем войдите.";

    if (data.session) {
        await supabaseClient.auth.signOut();
    }

    setTimeout(function() {
        window.location.href = "login.html";
    }, 2000);
});
