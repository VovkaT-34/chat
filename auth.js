// =========================================
// Вход через Supabase Auth
// =========================================

document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const errorBox = document.getElementById("error");
    const submitButton = document.querySelector("#loginForm .submit-button");

    errorBox.textContent = "";
    errorBox.style.color = "#b00020";
    if (submitButton) submitButton.disabled = true;

    try {
        await supabaseClient.auth.signOut({ scope: "local" });

        let result = null;
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
            lastError = result.error;
            if (!lastError) break;
            const status = Number(lastError.status || 0);
            if (status < 500 || status === 429) break;
            await new Promise(resolve => setTimeout(resolve, 700));
        }

        if (lastError || !result?.data?.user) {
            console.error("Ошибка входа:", lastError);
            const status = Number(lastError?.status || 0);
            const code = String(lastError?.code || "");
            if (status === 429 || code.includes("rate_limit")) {
                errorBox.textContent = "Слишком много попыток. Подождите несколько минут и попробуйте снова.";
            } else if (status >= 500) {
                errorBox.textContent = "Сервис входа временно недоступен. Попробуйте ещё раз через несколько секунд.";
            } else if (String(lastError?.message || "").toLowerCase().includes("email not confirmed")) {
                errorBox.textContent = "E-mail ещё не подтверждён. Подтвердите его по письму и войдите снова.";
            } else {
                errorBox.textContent = "Неверный e-mail или пароль.";
            }
            return;
        }

        const { data: profile, error: profileError } = await supabaseClient.rpc("check_my_profile");
        if (profileError || !profile || !profile[0]) {
            console.error("Ошибка проверки профиля:", profileError);
            errorBox.textContent = "Аккаунт найден, но профиль пока недоступен. Попробуйте войти ещё раз.";
            await supabaseClient.auth.signOut({ scope: "local" });
            return;
        }

        if (!profile[0].approved) {
            errorBox.textContent = "Ваш аккаунт ожидает подтверждения администратора.";
            await supabaseClient.auth.signOut({ scope: "local" });
            return;
        }

        window.location.replace("index.html");
    } catch (e) {
        console.error("Неожиданная ошибка входа:", e);
        errorBox.textContent = "Не удалось выполнить вход. Проверьте интернет-соединение и попробуйте снова.";
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
});
