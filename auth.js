// =========================================
// Вход через Supabase Auth REST API
// Совместимо со старыми Android WebView / Safari.
// =========================================
(function () {
    var SUPABASE_URL = "https://sxkukrqjtgkxmzuzondm.supabase.co";
    var SUPABASE_KEY = "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N";
    var STORAGE_KEY = "sb-sxkukrqjtgkxmzuzondm-auth-token";

    function loginRequest(email, password) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();

            xhr.open(
                "POST",
                SUPABASE_URL + "/auth/v1/token?grant_type=password",
                true
            );

            // Supabase Auth expects the password-login payload as JSON.
            // Keep XMLHttpRequest for compatibility with old Safari/WebView.
            xhr.setRequestHeader("apikey", SUPABASE_KEY);
            xhr.setRequestHeader("Authorization", "Bearer " + SUPABASE_KEY);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.timeout = 20000;

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                var data = null;

                try {
                    data = xhr.responseText
                        ? JSON.parse(xhr.responseText)
                        : null;
                } catch (e) {
                    data = null;
                }

                if (
                    xhr.status >= 200 &&
                    xhr.status < 300 &&
                    data &&
                    data.access_token &&
                    data.user
                ) {
                    resolve(data);
                    return;
                }

                var message = data && (
                    data.msg ||
                    data.message ||
                    data.error_description ||
                    data.error
                );

                reject({
                    status: xhr.status,
                    code: data && data.code ? String(data.code) : "",
                    message: message
                        ? String(message)
                        : "HTTP " + xhr.status
                });
            };

            xhr.onerror = function () {
                reject({
                    status: 0,
                    message: "Сетевой запрос не выполнен."
                });
            };

            xhr.ontimeout = function () {
                reject({
                    status: 0,
                    message: "Превышено время ожидания запроса."
                });
            };

            xhr.send(JSON.stringify({
                email: email,
                password: password
            }));
        });
    }

    function saveSession(session) {
        if (
            !session ||
            !session.access_token ||
            !session.refresh_token ||
            !session.user
        ) {
            return false;
        }

        var expiresIn = Number(session.expires_in || 3600);
        var expiresAt = Number(
            session.expires_at ||
            Math.floor(Date.now() / 1000) + expiresIn
        );

        var stored = {
            access_token: session.access_token,
            token_type: session.token_type || "bearer",
            expires_in: expiresIn,
            expires_at: expiresAt,
            refresh_token: session.refresh_token,
            user: session.user
        };

        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(stored)
            );
            return true;
        } catch (e) {
            return false;
        }
    }

    var loginForm = document.getElementById("loginForm");

    if (!loginForm) return;

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        var emailElement = document.getElementById("email");
        var passwordElement = document.getElementById("password");
        var errorBox = document.getElementById("error");
        var submitButton = document.querySelector(
            "#loginForm .submit-button"
        );

        var email = emailElement.value
            .replace(/^\s+|\s+$/g, "")
            .toLowerCase();
        var password = passwordElement.value;

        // New guard key prevents an old failed-login counter from the broken
        // login implementation from blocking a valid account after the fix.
        var key = "chat-login-guard-v3";
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
        } catch (e) {}

        if (guard.email !== email) {
            guard = {
                email: email,
                attempts: 0,
                lockedUntil: 0,
                lockLevel: 0
            };
        }

        if (guard.lockedUntil > now) {
            var seconds = Math.max(
                1,
                Math.ceil((guard.lockedUntil - now) / 1000)
            );

            errorBox.textContent =
                "Слишком много неудачных попыток. Вход заблокирован ещё на " +
                Math.floor(seconds / 60) +
                " мин. " +
                (seconds % 60) +
                " сек.";

            return;
        }

        if (guard.lockedUntil && guard.lockedUntil <= now) {
            guard.lockedUntil = 0;
            guard.attempts = 0;
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Входим...";
        }

        loginRequest(email, password)
            .then(function (session) {
                try {
                    localStorage.removeItem(key);
                    // Remove the previous guard as well, so an old failed
                    // attempt counter cannot affect a successful login.
                    localStorage.removeItem("chat-login-guard-v2");
                } catch (e) {}

                if (!saveSession(session)) {
                    throw {
                        status: 0,
                        message: "Не удалось сохранить сессию на устройстве."
                    };
                }

                // Do not perform another authenticated request here.
                // The main page will read the saved Supabase session through
                // the normal Supabase client, avoiding the old Safari network
                // problem that occurred after login.
                window.location.replace("index.html");
            })
            .catch(function (error) {
                guard.attempts += 1;

                if (guard.attempts >= 5) {
                    guard.lockLevel = Math.min(
                        (guard.lockLevel || 0) + 1,
                        5
                    );

                    var lockMinutes = [5, 15, 30, 60, 360][
                        guard.lockLevel - 1
                    ];

                    guard.lockedUntil =
                        Date.now() + lockMinutes * 60 * 1000;
                    guard.attempts = 0;

                    errorBox.textContent =
                        "5 неудачных попыток. Вход временно заблокирован на " +
                        (
                            lockMinutes >= 60
                                ? (lockMinutes / 60) + " ч."
                                : lockMinutes + " мин."
                        );
                } else {
                    var text = error && error.message
                        ? String(error.message).toLowerCase()
                        : "";
                    var status = error && error.status
                        ? Number(error.status)
                        : 0;
                    var code = error && error.code
                        ? String(error.code).toLowerCase()
                        : "";

                    if (
                        text.indexOf("email not confirmed") !== -1 ||
                        code.indexOf("email_not_confirmed") !== -1
                    ) {
                        errorBox.textContent =
                            "E-mail ещё не подтверждён. Подтвердите его по письму и войдите снова.";
                    } else if (
                        status === 429 ||
                        text.indexOf("rate") !== -1 ||
                        code.indexOf("rate") !== -1
                    ) {
                        errorBox.textContent =
                            "Слишком много попыток. Подождите немного и попробуйте снова.";
                    } else if (status === 0) {
                        errorBox.textContent =
                            "Не удалось выполнить вход. Проверьте интернет-соединение и попробуйте ещё раз.";
                    } else {
                        errorBox.textContent =
                            "Неверный e-mail или пароль. Осталось попыток до блокировки: " +
                            (5 - guard.attempts) +
                            ".";
                    }
                }

                try {
                    localStorage.setItem(
                        key,
                        JSON.stringify(guard)
                    );
                } catch (e) {}
            })
            .then(function () {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = "Войти";
                }
            });
    });
})();
