// =========================================
// Регистрация через Supabase Auth
// Совместимо со старыми Safari/iOS без optional chaining
// =========================================

document.getElementById("registerForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const password2 = document.getElementById("password2").value;
    const message = document.getElementById("message");
    const submitButton = document.querySelector("#registerForm .submit-button");

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

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Создаём аккаунт...";
    }

    try {
        const result = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: { data: { username: username } }
        });

        const data = result && result.data ? result.data : null;
        const error = result && result.error ? result.error : null;

        if (error) {
            console.error("Ошибка регистрации:", error);
            const status = Number(error.status || 0);
            const code = String(error.code || "");
            const errorText = String(error.message || "").toLowerCase();

            if (status === 429 || code === "over_email_send_rate_limit" || errorText.indexOf("rate limit") !== -1) {
                message.textContent = "Supabase временно ограничил отправку писем. Не нажимайте регистрацию повторно — подождите и попробуйте позже.";
            } else if (errorText.indexOf("already registered") !== -1) {
                message.textContent = "Этот e-mail уже зарегистрирован. Перейдите ко входу.";
            } else {
                message.textContent = error.message || "Не удалось создать аккаунт.";
            }
            return;
        }

        const user = data && data.user ? data.user : null;
        if (!user) {
            message.textContent = "Пользователь не создан.";
            return;
        }

        // Профиль создаётся серверным trigger после создания Auth-пользователя.
        const profileResult = await supabaseClient
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

        const profile = profileResult ? profileResult.data : null;
        const profileError = profileResult ? profileResult.error : null;

        if (profileError) console.warn("Проверка созданного профиля:", profileError);
        if (!profile) console.warn("Профиль ещё не виден клиенту, Auth-пользователь уже создан:", user.id);

        message.style.color = "green";
        message.textContent = data && data.session
            ? "Регистрация успешна. Переходим ко входу..."
            : "Регистрация успешна. Подтвердите e-mail, если это требуется, затем войдите.";

        if (data && data.session) await supabaseClient.auth.signOut({ scope: "local" });
        setTimeout(function() {
            window.location.href = "login.html";
        }, 2000);
    } catch (error) {
        console.error("Неожиданная ошибка регистрации:", error);
        message.textContent = "Не удалось выполнить регистрацию. Проверьте интернет-соединение и попробуйте ещё раз позже.";
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Зарегистрироваться";
        }
    }
});
