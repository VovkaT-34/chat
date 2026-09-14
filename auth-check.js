// =========================================
// Проверка авторизации через Supabase
// Совместимо со старыми Safari / Android WebView.
// =========================================

async function getStoredLoginSession() {
    try {
        const raw = localStorage.getItem(
            "sb-sxkukrqjtgkxmzuzondm-auth-token"
        );
        if (!raw) return null;
        const stored = JSON.parse(raw);
        if (!stored || !stored.access_token || !stored.refresh_token || !stored.user) return null;
        return stored;
    } catch (error) {
        console.warn("Не удалось прочитать сохранённую сессию:", error);
        return null;
    }
}

async function loadSupabaseIfNeeded() {
    if (window.supabaseClient) return true;
    const src = window.location.pathname.includes("/airplanes5/")
        ? "../supabase.js"
        : "./supabase.js";
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return !!window.supabaseClient;
}

async function checkAuth() {
    const loginPath = window.location.pathname.includes("/airplanes5/")
        ? "../login.html"
        : "./login.html";

    try {
        try {
            await loadSupabaseIfNeeded();
        } catch (error) {
            console.warn("Не удалось загрузить Supabase:", error);
        }

        if (!window.supabaseClient) {
            window.location.replace(loginPath);
            return;
        }

        const storedSession = await getStoredLoginSession();
        if (storedSession && storedSession.access_token) return;

        try {
            const result = await supabaseClient.auth.getSession();
            const session = result && result.data ? result.data.session : null;
            if (session && session.access_token) return;
        } catch (error) {
            console.warn("Не удалось получить Supabase-сессию:", error);
        }

        window.location.replace(loginPath);
    } catch (error) {
        console.error("Ошибка проверки авторизации:", error);
        try {
            const storedSession = await getStoredLoginSession();
            if (storedSession && storedSession.access_token) return;
        } catch (restoreError) {
            console.warn("Последняя проверка сохранённой сессии не удалась:", restoreError);
        }
        window.location.replace(loginPath);
    }
}

checkAuth();
