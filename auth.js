// =========================================
// Вход через Supabase Auth REST API
// Совместимо со старыми Android WebView / Safari.
// =========================================

(function () {
    var SUPABASE_URL = "https://sxkukrqjtgkxmzuzondm.supabase.co";
    var SUPABASE_KEY = "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N";
    var STORAGE_KEY = "sb-sxkukrqjtgkxmzuzondm-auth-token";

    function requestJson(method, url, body, accessToken) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.setRequestHeader("apikey", SUPABASE_KEY);
            xhr.setRequestHeader("Content-Type", "application/json");

            if (accessToken) {
                xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
            } else {
                xhr.setRequestHeader("Authorization", "Bearer " + SUPABASE_KEY);
            }

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                var response = null;

                try {
                    response = xhr.responseText
                        ? JSON.parse(xhr.responseText)
                        : null;
                } catch (parseError) {
                    response = null;
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve({
                        data: response,
                        status: xhr.status,
                        error: null
                    });
                    return;
                }

                var message = response && (
                    response.msg ||
                    response.message ||
                    response.error_description ||
                    response.error
                )
                    ? String(
                        response.msg ||
                        response.message ||
                        response.error_description ||
                        response.error
                    )
                    : "HTTP " + xhr.status;

                resolve({
                    data: response,
                    status: xhr.status,
                    error: {
                        message: message,
                        status: xhr.status,
                        code: response && response.code
                            ? String(response.code)
                            : ""
                    }
                });
            };

            xhr.onerror = function () {
                reject(new Error("Сетевой запрос не выполнен."));
            };

            xhr.ontimeout = function () {
                reject(new Error("Превышено время ожидания запроса."));
            };

            xhr.timeout = 20000;
            xhr.send(body ? JSON.stringify(body) : null);
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
        } catch (storageError) {
            console.error(
                "Не удалось сохранить сессию:",
                storageError
            );
            return false;
        }
    }

    function clearSession() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (storageError) {
            console.warn(
                "Не удалось очистить сессию:",
                storageError
            );
        }
    }

    var loginForm = document.getElementById("loginForm");

    if (!loginForm) {
        return;
    }

    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();

        var emailElement = document.getElementById("email");
        var passwordElement = document.getElementById("password");
        var errorBox = document.getElementById("error");
        var submitButton = document.querySelector(
            "#loginForm .submit-button"
        );

        var email = emailElement.value.trim().toLowerCase();
        var password = passwordElement.value;
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
            var saved = savedText
                ? JSON.parse(savedText)
                : null;

            if (saved && typeof saved === "object") {
                guard.email = saved.email || "";
                guard.attempts = Number(saved.attempts || 0);
                guard.lockedUntil = Number(
                    saved.lockedUntil || 0
                );
                guard.lockLevel = Number(
                    saved.lockLevel || 0
                );
            }
        } catch (storageError) {
            console.warn(
                "Не удалось прочитать защиту входа:",
                storageError
            );
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
            var lockedSeconds = Math.max(
                1,
                Math.ceil(
                    (guard.lockedUntil - now) / 1000
                )
            );
            var lockedMinutes = Math.floor(
                lockedSeconds / 60
            );
            var lockedRemain = lockedMinutes > 0
                ? lockedMinutes + " мин. " +
                    (lockedSeconds % 60) + " сек."
                : lockedSeconds + " сек.";

            errorBox.textContent =
                "Слишком много неудачных попыток. " +
                "Вход заблокирован ещё на " +
                lockedRemain + ".";
            return;
        }

        if (guard.lockedUntil && guard.lockedUntil <= now) {
            guard.lockedUntil = 0;
            guard.attempts = 0;

            try {
                localStorage.setItem(
                    key,
                    JSON.stringify(guard)
                );
            } catch (storageError2) {
                console.warn(
                    "Не удалось сохранить защиту входа:",
                    storageError2
                );
            }
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Входим...";
        }

        requestJson(
            "POST",
            SUPABASE_URL +
                "/auth/v1/token?grant_type=password",
            {
                email: email,
                password: password
            },
            null
        )
        .then(function (result) {
            var data = result ? result.data : null;
            var error = result ? result.error : null;

            if (
                error ||
                !data ||
                !data.access_token ||
                !data.user
            ) {
                console.error(
                    "Ошибка входа:",
                    error
                );

                guard.attempts += 1;

                if (guard.attempts >= 5) {
                    guard.lockLevel = Math.min(
                        (guard.lockLevel || 0) + 1,
                        5
                    );

                    var lockMinutesList = [
                        5,
                        15,
                        30,
                        60,
                        360
                    ];

                    var lockMinutesValue =
                        lockMinutesList[
                            guard.lockLevel - 1
                        ];

                    guard.lockedUntil =
                        Date.now() +
                        lockMinutesValue * 60 * 1000;

                    guard.attempts = 0;

                    errorBox.textContent =
                        "5 неудачных попыток. Вход временно " +
                        "заблокирован на " +
                        (
                            lockMinutesValue >= 60
                                ? (lockMinutesValue / 60) + " ч."
                                : lockMinutesValue + " мин."
                        );
                } else {
                    var left = 5 - guard.attempts;
                    var errorMessage =
                        error && error.message
                            ? String(error.message)
                            : "";
                    var errorText =
                        errorMessage.toLowerCase();
                    var errorStatus =
                        error && error.status
                            ? Number(error.status)
                            : 0;
                    var errorCode =
                        error && error.code
                            ? String(error.code)
                            : "";

                    if (
                        errorText.indexOf(
                            "email not confirmed"
                        ) !== -1
                    ) {
                        errorBox.textContent =
                            "E-mail ещё не подтверждён. " +
                            "Подтвердите его по письму и войдите снова.";
                    } else if (
                        errorStatus === 429 ||
                        errorCode.indexOf("rate") !== -1
                    ) {
                        errorBox.textContent =
                            "Слишком много попыток. " +
                            "Подождите немного и попробуйте снова.";
                    } else {
                        errorBox.textContent =
                            "Неверный e-mail или пароль. " +
                            "Осталось попыток до блокировки: " +
                            left + ".";
                    }
                }

                try {
                    localStorage.setItem(
                        key,
                        JSON.stringify(guard)
                    );
                } catch (storageError3) {
                    console.warn(
                        "Не удалось сохранить защиту входа:",
                        storageError3
                    );
                }

                return null;
            }

            try {
                localStorage.removeItem(key);
            } catch (storageError4) {
                console.warn(
                    "Не удалось очистить защиту входа:",
                    storageError4
                );
            }

            // Важно для старого Safari:
            // не вызываем supabaseClient.auth.setSession() здесь.
            // REST-вход уже вернул полноценную сессию.
            // Сохраняем её в стандартном ключе Supabase, после чего
            // новая страница создаст свой supabaseClient и прочитает её.
            if (!saveSession(data)) {
                errorBox.textContent =
                    "Вход выполнен, но не удалось сохранить сессию на этом устройстве.";
                return null;
            }

            return requestJson(
                "POST",
                SUPABASE_URL +
                    "/rest/v1/rpc/check_my_profile",
                {},
                data.access_token
            );
        })
        .then(function (profileResult) {
            if (!profileResult) {
                return;
            }

            var profile = profileResult.data;
            var profileError = profileResult.error;

            if (
                profileError ||
                !profile ||
                !profile[0]
            ) {
                console.error(
                    "Ошибка проверки профиля:",
                    profileError
                );

                clearSession();

                errorBox.textContent =
                    "Аккаунт найден, но профиль пока недоступен. Попробуйте ещё раз.";
                return;
            }

            if (!profile[0].approved) {
                clearSession();
                errorBox.textContent =
                    "Ваш аккаунт ожидает подтверждения администратора.";
                return;
            }

            // Сессия уже сохранена. Переходим в чат.
            window.location.replace("index.html");
        })
        .catch(function (loginError) {
            console.error(
                "Неожиданная ошибка входа:",
                loginError
            );

            errorBox.textContent =
                "Не удалось выполнить вход. Проверьте интернет-соединение и попробуйте ещё раз.";
        })
        .then(function () {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Войти";
            }
        });
    });
})();
