// =========================================
// Вход через Supabase Auth
// =========================================

document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const errorBox = document.getElementById("error");
    const submitButton = document.querySelector("#loginForm .submit-button");
    const key = "chat-login-guard-v2";
    const now = Date.now();

    errorBox.textContent = "";
    errorBox.style.color = "#b00020";

    let guard = { email: "", attempts: 0, lockedUntil: 0, lockLevel: 0 };
    try {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved && typeof saved === "object") guard = { ...guard, ...saved };
    } catch {}

    if (guard.email !== email) {
        guard = { email, attempts: 0, lockedUntil: 0, lockLevel: 0 };
    }

    if (guard.lockedUntil > now) {
        const seconds = Math.max(1, Math.ceil((guard.lockedUntil - now) / 1000));
        const minutes = Math.floor(seconds / 60);
        const remain = minutes > 0
            ? `${minutes} мин. ${seconds % 60} сек.`
            : `${seconds} сек.`;
        errorBox.textContent = `Слишком много неудачных попыток. Вход заблокирован ещё на ${remain}.`;
        return;
    }

    if (guard.lockedUntil && guard.lockedUntil <= now) {
        guard.lockedUntil = 0;
        guard.attempts = 0;
        localStorage.setItem(key, JSON.stringify(guard));
    }

    if (submitButton) submitButton.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error || !data?.user) {
            console.error("Ошибка входа:", error);
            guard.attempts += 1;

            if (guard.attempts >= 5) {
                guard.lockLevel = Math.min((guard.lockLevel || 0) + 1, 5);
                const lockMinutes = [5, 15, 30, 60, 360][guard.lockLevel - 1];
                guard.lockedUntil = Date.now() + lockMinutes * 60 * 1000;
                guard.attempts = 0;
                errorBox.textContent = `5 неудачных попыток. Вход временно заблокирован на ${lockMinutes >= 60 ? `${lockMinutes / 60} ч.` : `${lockMinutes} мин.`}.`;
            } else {
                const left = 5 - guard.attempts;
                const text = String(error?.message || "").toLowerCase();
                if (text.includes("email not confirmed")) {
                    errorBox.textContent = "E-mail ещё не подтверждён. Подтвердите его по письму и войдите снова.";
                } else if (Number(error?.status) === 429 || String(error?.code || "").includes("rate")) {
                    errorBox.textContent = "Слишком много попыток. Подождите немного и попробуйте снова.";
                } else {
                    errorBox.textContent = `Неверный e-mail или пароль. Осталось попыток до блокировки: ${left}.`;
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
