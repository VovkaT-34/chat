// =========================================
// Регистрация через Supabase Auth REST API
// Совместимо со старыми Android WebView / Safari.
// =========================================

(function () {
    var SUPABASE_URL = "https://sxkukrqjtgkxmzuzondm.supabase.co";
    var SUPABASE_KEY = "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N";

    function requestJson(method, url, body) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.setRequestHeader("apikey", SUPABASE_KEY);
            xhr.setRequestHeader("Authorization", "Bearer " + SUPABASE_KEY);
            xhr.setRequestHeader("Content-Type", "application/json");

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                var response = null;
                try {
                    response = xhr.responseText ? JSON.parse(xhr.responseText) : null;
                } catch (parseError) {
                    response = null;
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve({ data: response, status: xhr.status, error: null });
                    return;
                }

                var message = response && (response.msg || response.message || response.error_description || response.error)
                    ? String(response.msg || response.message || response.error_description || response.error)
                    : "HTTP " + xhr.status;

                resolve({
                    data: response,
                    status: xhr.status,
                    error: { message: message, status: xhr.status, code: response && response.code ? String(response.code) : "" }
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

    document.getElementById("registerForm").addEventListener("submit", function (e) {
        e.preventDefault();

        var username = document.getElementById("username").value.trim();
        var email = document.getElementById("email").value.trim().toLowerCase();
        var password = document.getElementById("password").value;
        var password2 = document.getElementById("password2").value;
        var message = document.getElementById("message");
        var submitButton = document.querySelector("#registerForm .submit-button");

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

        requestJson(
            "POST",
            SUPABASE_URL + "/auth/v1/signup",
            {
                email: email,
                password: password,
                data: { username: username }
            }
        ).then(function (result) {
            var data = result ? result.data : null;
            var error = result ? result.error : null;

            if (error) {
                console.error("Ошибка регистрации:", error);
                var status = Number(error.status || 0);
                var code = String(error.code || "");
                var errorText = String(error.message || "").toLowerCase();

                if (status === 429 || code === "over_email_send_rate_limit" || errorText.indexOf("rate limit") !== -1) {
                    message.textContent = "Supabase временно ограничил отправку писем. Не нажимайте регистрацию повторно — подождите и попробуйте позже.";
                } else if (errorText.indexOf("already registered") !== -1) {
                    message.textContent = "Этот e-mail уже зарегистрирован. Перейдите ко входу.";
                } else {
                    message.textContent = error.message || "Не удалось создать аккаунт.";
                }
                return;
            }

            if (!data || !data.user) {
                message.textContent = "Пользователь не создан.";
                return;
            }

            message.style.color = "green";
            message.textContent = data.session
                ? "Регистрация успешна. Переходим ко входу..."
                : "Регистрация успешна. Подтвердите e-mail, если это требуется, затем войдите.";

            setTimeout(function () {
                window.location.href = "login.html";
            }, 2000);
        }).catch(function (error) {
            console.error("Неожиданная ошибка регистрации:", error);
            message.textContent = "Не удалось выполнить регистрацию. Проверьте интернет-соединение и попробуйте ещё раз позже.";
        }).then(function () {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Зарегистрироваться";
            }
        });
    });
})();
