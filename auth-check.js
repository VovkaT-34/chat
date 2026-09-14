// =========================================
// Проверка авторизации и одобрения администратора через Supabase
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

function installOsintAuthFetch() {
    if (window.__osintAuthFetchInstalled) return;
    window.__osintAuthFetchInstalled = true;

    const nativeFetch = window.fetch.bind(window);
    const protectedHosts = new Set([
        "sxkukrqjtgkxmzuzondm.supabase.co",
        "glaz-boga-osint.onrender.com",
        "glaz-boga-osint-docker-test.onrender.com"
    ]);

    window.fetch = async function(input, init) {
        let url = "";
        try {
            url = typeof input === "string" ? input : (input && input.url) || "";
            const parsed = new URL(url, window.location.href);
            const protectedRequest =
                protectedHosts.has(parsed.hostname) &&
                (
                    parsed.hostname === "glaz-boga-osint.onrender.com" ||
                    parsed.hostname === "glaz-boga-osint-docker-test.onrender.com" ||
                    parsed.pathname.startsWith("/functions/v1/osint-public")
                );

            if (!protectedRequest) {
                return nativeFetch(input, init);
            }

            let accessToken = "";
            try {
                if (window.supabaseClient) {
                    const result = await window.supabaseClient.auth.getSession();
                    accessToken = result && result.data && result.data.session
                        ? result.data.session.access_token || ""
                        : "";
                }
            } catch (error) {
                console.warn("Не удалось получить токен для OSINT-запроса:", error);
            }

            if (!accessToken) {
                const stored = await getStoredLoginSession();
                accessToken = stored && stored.access_token ? stored.access_token : "";
            }

            const headers = new Headers(
                input instanceof Request ? input.headers : undefined
            );
            if (init && init.headers) {
                new Headers(init.headers).forEach((value, key) => headers.set(key, value));
            }
            if (accessToken) {
                headers.set("Authorization", "Bearer " + accessToken);
            }

            return nativeFetch(input, {
                ...(init || {}),
                headers
            });
        } catch (error) {
            return nativeFetch(input, init);
        }
    };
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

        let session = null;
        try {
            const result = await supabaseClient.auth.getSession();
            session = result && result.data ? result.data.session : null;
        } catch (error) {
            console.warn("Не удалось получить Supabase-сессию:", error);
        }

        if (!session || !session.user) {
            const storedSession = await getStoredLoginSession();
            if (storedSession && storedSession.access_token && storedSession.user) {
                session = storedSession;
            }
        }

        if (!session || !session.user || !session.user.id) {
            window.location.replace(loginPath);
            return;
        }

        const { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("approved")
            .eq("id", session.user.id)
            .single();

        if (profileError || !profile || profile.approved !== true) {
            window.location.replace(loginPath);
            return;
        }

        installOsintAuthFetch();
    } catch (error) {
        console.error("Ошибка проверки авторизации:", error);
        window.location.replace(loginPath);
    }
}

checkAuth();
