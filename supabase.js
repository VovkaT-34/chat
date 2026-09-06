const SUPABASE_URL = "https://sxkukrqjtgkxmzuzondm.supabase.co";

const SUPABASE_KEY = "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N";

window.supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: window.localStorage
        }
    }
);

// На телефонах и планшетах масштабирование всей страницы мешает интерфейсу чата.
// Запрещаем pinch/double-tap zoom, не блокируя обычную прокрутку одним пальцем.
(function lockPageZoom() {
    try {
        var viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement("meta");
            viewport.name = "viewport";
            document.head.appendChild(viewport);
        }

        var content = viewport.getAttribute("content") || "";
        if (content.indexOf("width=") === -1) content += (content ? "," : "") + "width=device-width";
        if (content.indexOf("initial-scale=") === -1) content += ",initial-scale=1";
        if (content.indexOf("maximum-scale=") === -1) content += ",maximum-scale=1";
        if (content.indexOf("minimum-scale=") === -1) content += ",minimum-scale=1";
        if (content.indexOf("user-scalable=") === -1) content += ",user-scalable=no";
        viewport.setAttribute("content", content);

        document.documentElement.style.touchAction = "pan-x pan-y";
        if (document.body) document.body.style.touchAction = "pan-x pan-y";

        document.addEventListener("gesturestart", function (event) {
            event.preventDefault();
        }, { passive: false });

        document.addEventListener("gesturechange", function (event) {
            event.preventDefault();
        }, { passive: false });

        document.addEventListener("gestureend", function (event) {
            event.preventDefault();
        }, { passive: false });

        document.addEventListener("touchmove", function (event) {
            if (event.touches && event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false });

        document.addEventListener("wheel", function (event) {
            if (event.ctrlKey) event.preventDefault();
        }, { passive: false });
    } catch (e) {
        // Масштабирование не должно влиять на запуск и работу чата.
    }
})();
