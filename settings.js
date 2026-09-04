const $ = id => document.getElementById(id);

function showMessage(text, error = false) {
    const box = $("message");
    if (!box) return;
    box.textContent = text;
    box.style.color = error ? "#b42318" : "#356b4a";
}

async function loadSettings() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        window.location.replace("./login.html");
        return;
    }
    $("email").textContent = user.email || "";

    const { data: profile, error: profileError } = await supabaseClient.rpc("get_my_profile");
    if (!profileError && profile?.[0]) {
        const name = profile[0].username || "Пользователь";
        $("username").textContent = name;
        $("usernameInput").value = name;
    }

    const soundEnabled = localStorage.getItem("chat-sound-enabled");
    $("soundToggle").textContent = soundEnabled === "false" ? "Выкл." : "Вкл.";
}

$("usernameToggle").onclick = () => $("usernameField").classList.toggle("open");
$("passwordToggle").onclick = () => $("passwordField").classList.toggle("open");

$("usernameSave").onclick = async () => {
    const username = $("usernameInput").value.trim();
    if (!username) return showMessage("Введите ник.", true);

    const { data, error } = await supabaseClient.rpc("update_my_profile", { p_username: username });
    if (error) return showMessage("Не удалось изменить ник: " + error.message, true);

    const savedName = data?.[0]?.username || username;
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

$("logoutButton").onclick = () => void logout();
loadSettings();
