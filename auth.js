// =========================================
// Вход через Supabase Auth
// Совместимо со старыми Safari/iOS без optional chaining,
// object spread, template literals и catch без параметра.
// =========================================

document.getElementById("loginForm").addEventListener("submit", function(e) {
    e.preventDefault();

    var email = document.getElementById("email").value.trim().toLowerCase();
    var password = document.getElementById("password").value;
    var errorBox = document.getElementById("error");
    var submitButton = document.querySelector("#loginForm .submit-button");
    var key = "chat-login-guard-v2";
    var now = Date.now();

    errorBox.textContent = "";
    errorBox.style.color = "#b00020";

    var guard = {
        email: "",
        attempts: 0,
        lockedUntil: 0,
        lockLevel: 0
    };

    try {
        var savedText = localStorage.getItem(key);
        var saved = savedText ? JSON.parse(savedText) : null;

        if (saved && typeof saved === "object") {
            guard.email = saved.email || "";
            guard.attempts = Number(saved.attempts || 0);
            guard.lockedUntil = Number(saved.lockedUntil || 0);
            guard.lockLevel = Number(saved.lockLevel || 0);
        }
    } catch (storageError) {
        console.warn("Не удалось прочитать защиту входа:", storageError);
    }

    if (guard.email !== email) {
        guard = {
            email: email,
            attempts: 0,
            lockedUntil: 0,
            lockLevel: 0
        };
    }

    if (guard.lockedUntil > now) {
        var lockedSeconds = Math.max(1, Math.ceil((guard.lockedUntil - now) / 1000));
        var lockedMinutes = Math.floor(lockedSeconds / 60);
        var lockedRemain = lockedMinutes > 0
            ? lockedMinutes + " мин. " + (lockedSeconds % 60) + " сек."
            : lockedSeconds + " сек.";

        errorBox.textContent = "Слишком много неудачных попыток. Вход заблокирован ещё на " + lockedRemain + ".";
        return;
    }

    if (guard.lockedUntil && guard.lockedUntil <= now) {
        guard.lockedUntil = 0;
        guard.attempts = 0;
        try {
            localStorage.setItem(key, JSON.stringify(guard));
        } catch (storageError2) {
            console.warn("Не удалось сохранить защиту входа:", storageError2);
        }
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Входим...";
    }

    supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    }).then(function(result) {
        var data = result && result.data ? result.data : null;
        var error = result && result.error ? result.error : null;
        var user = data && data.user ? data.user : null;

        if (error || !user) {
            console.error("Ошибка входа:", error);

            guard.attempts += 1;

            if (guard.attempts >= 5) {
                guard.lockLevel = Math.min((guard.lockLevel || 0) + 1, 5);

                var lockMinutesList = [5, 15, 30, 60, 360];
                var lockMinutesValue = lockMinutesList[guard.lockLevel - 1];

                guard.lockedUntil = Date.now() + lockMinutesValue * 60 * 1000;
                guard.attempts = 0;

                errorBox.textContent = "5 неудачных попыток. Вход временно заблокирован на " +
                    (lockMinutesValue >= 60
                        ? (lockMinutesValue / 60) + " ч."
                        : lockMinutesValue + " мин.");
            } else {
                var left = 5 - guard.attempts;
                var errorMessage = error && error.message ? String(error.message) : "";
                var errorText = errorMessage.toLowerCase();
                var errorStatus = error && error.status ? Number(error.status) : 0;
                var errorCode = error && error.code ? String(error.code) : "";

                if (errorText.indexOf("email not confirmed") !== -1) {
                    errorBox.textContent = "E-mail ещё не подтверждён. Подтвердите его по письму и войдите снова.";
                } else if (errorStatus === 429 || errorCode.indexOf("rate") !== -1) {
                    errorBox.textContent = "Слишком много попыток. Подождите немного и попробуйте снова.";
                } else {
                    errorBox.textContent = "Неверный e-mail или пароль. Осталось попыток до блокировки: " + left + ".";
                }
            }

            try {
                localStorage.setItem(key, JSON.stringify(guard));
            } catch (storageError3) {
                console.warn("Не удалось сохранить защиту входа:", storageError3);
            }

            return;
        }

        try {
            localStorage.removeItem(key);
        } catch (storageError4) {
            console.warn("Не удалось очистить защиту входа:", storageError4);
        }

        return supabaseClient.rpc("check_my_profile").then(function(profileResult) {
            var profile = profileResult ? profileResult.data : null;
            var profileError = profileResult ? profileResult.error : null;

            if (profileError || !profile || !profile[0]) {
                console.error("Ошибка проверки профиля:", profileError);
                errorBox.textContent = "Аккаунт найден, но профиль пока недоступен. Попробуйте ещё раз.";
                return;
            }

            if (!profile[0].approved) {
                errorBox.textContent = "Ваш аккаунт ожидает подтверждения администратора.";
                return supabaseClient.auth.signOut({ scope: "local" });
            }

            window.location.replace("index.html");
        });
    }).catch(function(loginError) {
        console.error("Неожиданная ошибка входа:", loginError);
        errorBox.textContent = "Не удалось выполнить вход. Проверьте интернет-соединение и попробуйте ещё раз.";
    }).then(function() {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Войти";
        }
    });
});
