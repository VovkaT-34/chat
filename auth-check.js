// =========================================
// Проверка авторизации и одобрения администратора через Supabase
// Совместимо со старыми Safari / Android WebView.
// =========================================

async function getStoredLoginSession() {
    try {
        const raw = localStorage.getItem("sb-sxkukrqjtgkxmzuzondm-auth-token");
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
    const src = window.location.pathname.includes("/airplanes5/") ? "../supabase.js" : "./supabase.js";
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
    const protectedHosts = new Set(["sxkukrqjtgkxmzuzondm.supabase.co", "glaz-boga-osint.onrender.com", "glaz-boga-osint-docker-test.onrender.com"]);
    window.fetch = async function(input, init) {
        let url = "";
        try {
            url = typeof input === "string" ? input : (input && input.url) || "";
            const parsed = new URL(url, window.location.href);
            const protectedRequest = protectedHosts.has(parsed.hostname) && (parsed.hostname === "glaz-boga-osint.onrender.com" || parsed.hostname === "glaz-boga-osint-docker-test.onrender.com" || parsed.pathname.startsWith("/functions/v1/osint-public"));
            if (!protectedRequest) return nativeFetch(input, init);
            let accessToken = "";
            try {
                if (window.supabaseClient) {
                    const result = await window.supabaseClient.auth.getSession();
                    accessToken = result && result.data && result.data.session ? result.data.session.access_token || "" : "";
                }
            } catch (error) {
                console.warn("Не удалось получить токен для OSINT-запроса:", error);
            }
            if (!accessToken) {
                const stored = await getStoredLoginSession();
                accessToken = stored && stored.access_token ? stored.access_token : "";
            }
            const headers = new Headers(input instanceof Request ? input.headers : undefined);
            if (init && init.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
            if (accessToken) headers.set("Authorization", "Bearer " + accessToken);
            return nativeFetch(input, { ...(init || {}), headers });
        } catch (error) {
            return nativeFetch(input, init);
        }
    };
}

function installOsintUiIndicators() {
    if (window.__osintUiIndicatorsInstalled) return;
    if (!window.location.pathname.endsWith("game-glaz-boga.html")) return;

    const style = document.createElement("style");
    style.textContent = `
        .osint-ram-indicator {
            display:inline-flex !important;
            align-items:center !important;
            margin-left:auto !important;
            padding:3px 8px !important;
            border:1px solid rgba(57,229,140,.45) !important;
            border-radius:8px !important;
            background:rgba(57,229,140,.10) !important;
            color:#39e58c !important;
            font-size:12px !important;
            font-weight:800 !important;
            line-height:1.35 !important;
            white-space:nowrap !important;
            vertical-align:middle !important;
            opacity:1 !important;
            visibility:visible !important;
            position:relative !important;
            z-index:20 !important;
        }
        .search-title-row .osint-ram-indicator { flex:0 0 auto !important; }
    `;
    document.head.appendChild(style);

    const findSearchTitleRow = () => {
        const titles = Array.from(document.querySelectorAll(".search-title"));
        const title = titles.find(el => (el.textContent || "").trim().includes("Глубокий поиск"));
        return title ? title.closest(".search-title-row") : null;
    };

    const installRam = () => {
        const row = findSearchTitleRow();
        if (!row) return false;
        let indicator = document.getElementById("osintRamIndicator");
        if (!indicator) {
            indicator = document.createElement("span");
            indicator.id = "osintRamIndicator";
            indicator.className = "osint-ram-indicator";
            indicator.textContent = "ОЗУ: — MB";
            row.appendChild(indicator);
        } else if (indicator.parentElement !== row) {
            row.appendChild(indicator);
        }
        return true;
    };

    const updateRam = async () => {
        if (!installRam()) return;
        try {
            const response = await fetch("https://glaz-boga-osint.onrender.com/memory", { cache: "no-store" });
            if (!response.ok) return;
            const data = await response.json();
            const value = Number(data.ram_mb);
            if (Number.isFinite(value)) {
                const indicator = document.getElementById("osintRamIndicator");
                if (indicator) indicator.textContent = "ОЗУ: " + value.toFixed(1) + " MB";
            }
        } catch (error) {}
    };

    const patchMailAccessProgress = () => {
        if (typeof window.renderDeep !== "function" || window.__osintRenderDeepPatched) return;
        const originalRenderDeep = window.renderDeep;
        window.renderDeep = function(data) {
            originalRenderDeep(data);
            if (data && data.kind === "email_mailaccess" && data.total) {
                const element = document.getElementById("deepChecked");
                if (element) element.textContent = "Проверено: " + Number(data.checked || 0) + " / " + Number(data.total || 0);
            }
        };
        window.__osintRenderDeepPatched = true;
    };

    const timer = setInterval(() => {
        const ready = installRam();
        patchMailAccessProgress();
        if (ready && window.__osintRenderDeepPatched) {
            window.__osintUiIndicatorsInstalled = true;
            clearInterval(timer);
        }
    }, 250);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", installRam, { once: true });
    } else {
        installRam();
    }

    updateRam();
    setInterval(updateRam, 2500);
}

async function checkAuth() {
    const loginPath = window.location.pathname.includes("/airplanes5/") ? "../login.html" : "./login.html";
    try {
        try { await loadSupabaseIfNeeded(); } catch (error) { console.warn("Не удалось загрузить Supabase:", error); }
        if (!window.supabaseClient) { window.location.replace(loginPath); return; }
        let session = null;
        try {
            const result = await supabaseClient.auth.getSession();
            session = result && result.data ? result.data.session : null;
        } catch (error) { console.warn("Не удалось получить Supabase-сессию:", error); }
        if (!session || !session.user) {
            const storedSession = await getStoredLoginSession();
            if (storedSession && storedSession.access_token && storedSession.user) session = storedSession;
        }
        if (!session || !session.user || !session.user.id) { window.location.replace(loginPath); return; }
        const { data: profile, error: profileError } = await supabaseClient.from("profiles").select("approved").eq("id", session.user.id).single();
        if (profileError || !profile || profile.approved !== true) { window.location.replace(loginPath); return; }
        installOsintAuthFetch();
        installOsintUiIndicators();
    } catch (error) {
        console.error("Ошибка проверки авторизации:", error);
        window.location.replace(loginPath);
    }
}

checkAuth();
