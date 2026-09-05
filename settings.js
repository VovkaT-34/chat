const $ = id => document.getElementById(id);

function showMessage(text, error = false) {
    const box = $("message");
    if (!box) return;
    box.textContent = text;
    box.style.color = error ? "#b42318" : "#356b4a";
}

function hasNativeNotificationBridge() {
    return Boolean(window.AndroidNotifications);
}

function getNativeNotificationsEnabled() {
    if (!hasNativeNotificationBridge()) return null;
    try {
        return Boolean(window.AndroidNotifications.isEnabled());
    } catch (error) {
        console.warn("Не удалось проверить состояние уведомлений Android:", error);
        return null;
    }
}

function updateNotificationUi() {
    const button = $("notificationToggle");
    const status = $("notificationStatus");
    if (!button || !status) return;

    const nativeState = getNativeNotificationsEnabled();

    if (nativeState === true) {
        button.textContent = "Вкл.";
        status.textContent = "Системные уведомления включены";
        return;
    }

    if (nativeState === false) {
        button.textContent = "Включить";
        status.textContent = "Системные уведомления выключены — нажмите «Включить»";
        return;
    }

    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            button.textContent = "Вкл.";
            status.textContent = "Web Push разрешён";
        } else if (Notification.permission === "denied") {
            button.textContent = "Открыть настройки";
            status.textContent = "Уведомления запрещены браузером — откройте настройки";
        } else {
            button.textContent = "Включить";
            status.textContent = "Системные уведомления о новых сообщениях";
        }
    }
}

async function enableNotifications() {
    const button = $("notificationToggle");
    if (button) {
        button.disabled = true;
        button.textContent = "Подключение…";
    }

    try {
        if (hasNativeNotificationBridge()) {
            const enabled = getNativeNotificationsEnabled();

            if (enabled === true) {
                showMessage("Уведомления уже включены.");
                return;
            }

            window.AndroidNotifications.requestPermission();
            showMessage("Разрешите уведомления в системном окне Android.");
            setTimeout(updateNotificationUi, 700);
            return;
        }

        if (typeof enableChatPushNotifications === "function") {
            const subscription = await enableChatPushNotifications();
            if (subscription) {
                showMessage("Уведомления включены.");
            } else if ("Notification" in window && Notification.permission === "denied") {
                showMessage("Уведомления запрещены. Разрешите их в настройках браузера.", true);
            } else {
                showMessage("Не удалось включить уведомления.", true);
            }
            updateNotificationUi();
            return;
        }

        showMessage("Уведомления недоступны в этом окружении.", true);
    } catch (error) {
        console.error("Ошибка включения уведомлений:", error);
        const errorText = error && error.message ? error.message : String(error);
        showMessage("Не удалось включить уведомления: " + errorText, true);
    } finally {
        if (button) button.disabled = false;
        updateNotificationUi();
    }
}

$("usernameToggle").onclick = () => $("usernameField").classList.toggle("open");
$("passwordToggle").onclick = () => $("passwordField").classList.toggle("open");

$("usernameSave").onclick = async () => {
    const username = $("usernameInput").value.trim();
    if (!username) return showMessage("Введите ник.", true);

    const { data, error } = await supabaseClient.rpc("update_my_profile", { p_username: username });
    if (error) return showMessage("Не удалось изменить ник: " + error.message, true);

    const savedName = data && data[0] && data[0].username ? data[0].username : username;
    $("username").textContent = savedName;
    $("usernameInput").value = savedName;
    $("usernameField").classList.remove("open");
    showMessage("Ник изменён.");
};

$("passwordSave").onclick = async () => {
    const password = $("passwordInput").value;
    if (password.length < 6) return showMessage("Пароль должен содержать не менее 6 символов.", true);
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) return showMessage("Не удалось изменить пароль: " + error.message, true);
    $("passwordInput").value = "";
    $("passwordField").classList.remove("open");
    showMessage("Пароль изменён.");
};

$("soundToggle").onclick = () => {
    const next = localStorage.getItem("chat-sound-enabled") === "false";
    localStorage.setItem("chat-sound-enabled", String(next));
    $("soundToggle").textContent = next ? "Вкл." : "Выкл.";
};

$("notificationToggle").onclick = () => void enableNotifications();

$("logoutButton").onclick = () => void logout();

async function loadSettings() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        window.location.replace("./login.html");
        return;
    }
    $("email").textContent = user.email || "";

    const { data: profile, error: profileError } = await supabaseClient.rpc("get_my_profile");
    if (!profileError && profile && profile[0]) {
        const name = profile[0].username || "Пользователь";
        $("username").textContent = name;
        $("usernameInput").value = name;
    }

    const soundEnabled = localStorage.getItem("chat-sound-enabled");
    $("soundToggle").textContent = soundEnabled === "false" ? "Выкл." : "Вкл.";
    updateNotificationUi();
}

loadSettings();
