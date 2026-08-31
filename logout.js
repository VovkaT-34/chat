// =========================================
// Выход из аккаунта через Supabase
// =========================================

async function logout() {

    await supabaseClient.auth.signOut();

    window.location.replace("./login.html");

}
