// =========================================
// Вход через Supabase Auth
// =========================================

document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const errorBox = document.getElementById("error");
    const submitButton = document.querySelector("#loginForm .submit-button");

    errorBox.textContent = "";
    errorBox.style.color = "#b00020";

    const key = "chat-login-guard";
    let guard = { email: "", attempts: 0, lockedUntil: 0 };
    try { guard = JSON.parse(localStorage.getItem(key) || JSON.stringify(guard)); } catch {}

    const now = Date.now();
    if (guard.lockedUntil > now && guard.email === email) {
        const seconds = Math.ceil((guard.lockedUntil - now) / 1000);
        errorBox.textContent = `Слишком много неудачных попыток. Повторите через ${Math.ceil(seconds / 60)} мин.`;
        return;
    }
    if (guard.email !== email || guard.lockedUntil <= now) {
        guard = { email, attempts: 0, lockedUntil: 0 };
    }

    if (submitButton) submitButton.disabled = true;

    try {
        // Не делаем signOut перед входом: он мог уничтожать рабочую
        // локальную сессию и создавать лишние запросы к Auth.
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error || !data?.user) {
            console.error("Ошибка входа:", error);
            guard.attempts += 1;
            if (guard.attempts >= 5) {
                guard.lockedUntil = Date.now() + 5 * 60 * 1000;
                guard.attempts = 0;
                errorBox.textContent = "5 неудачных попыток. Вход временно заблокирован на 5 минут.";
            } else {
                const text = String(error?.message || "").toLowerCase();
                if (text.includes("email not confirmed")) {
                    errorBox.textContent = "E-mail ещё не подтверждён. Подтвердите его по письму и войдите снова.";
                } else if (Number(error?.status) === 429 || String(error?.code || "").includes("rate")) {
                    errorBox.textContent = "Слишком много попыток. Подождите немного и попробуйте снова.";
                } else {
                    errorBox.textContent = "Неверный e-mail или пароль.";
                }
            }
            localStorage.setItem(key, JSON.stringify(guard));
            return;
        }

        localStorage.removeItem(key);

        const { data: profile, error: profileError } = await supabaseClient.rpc("check_my_profile");
        if (profileError || !profile || !profile[0]) {
            console.error("Ошибка проверки профиля:", profileError);
            errorBox.textContent = "Аккаунт найден, но профиль пока недоступен. Попробуйте ещё раз.";
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
        errorBox.textContent = "Не удалось выполнить вход. Проверьте интернет-соединение и попробуйте ещё раз.";
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
});