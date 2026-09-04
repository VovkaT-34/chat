// =========================================
// Уникальные векторные иконки кнопок звонка
// =========================================
(function () {
    "use strict";

    // Иконки рисуются непосредственно SVG-кодом проекта.
    // Внешние картинки, emoji и сторонние icon-fonts для кнопок звонка не используются.
    const AUDIO_ICON = `
        <svg class="custom-call-svg custom-call-svg-audio" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M8.2 5.7c1.1-1.1 2.9-1.1 4 0l3.2 3.2c.9.9.9 2.4.1 3.4l-2.1 2.5c1.4 2.5 3.3 4.4 5.8 5.8l2.5-2.1c1-.8 2.5-.8 3.4.1l3.2 3.2c1.1 1.1 1.1 2.9 0 4-1.8 1.8-4.5 2.3-6.8 1.3C14.5 24.2 7.8 17.5 4.9 10.5c-1-2.3-.5-5 1.3-6.8Z" fill="currentColor"/>
            <path d="M9.5 7.5c.3-.3.8-.3 1.1 0l2.8 2.8c.3.3.3.7 0 1l-1.4 1.7c-.5.6-1.2.9-1.9.7-1.2-.4-2.3-1-3.2-1.9-.9-.9-1.5-2-1.9-3.2-.2-.7.1-1.4.7-1.9l1.7-1.4c.6-.5 1.5-.4 2.1.2Z" fill="rgba(255,255,255,.28)"/>
        </svg>`;

    const VIDEO_ICON = `
        <svg class="custom-call-svg custom-call-svg-video" viewBox="0 0 34 26" aria-hidden="true" focusable="false">
            <rect x="2" y="4" width="19" height="18" rx="4" fill="currentColor"/>
            <path d="M21 9.1 30.2 4.8c.9-.4 1.8.2 1.8 1.2v14c0 1-.9 1.6-1.8 1.2L21 16.9V9.1Z" fill="currentColor"/>
            <path d="M22.4 10.1 29.2 6.9v12.2l-6.8-3.2v-5.8Z" fill="rgba(255,255,255,.22)"/>
            <circle cx="9" cy="13" r="2.1" fill="rgba(255,255,255,.2)"/>
        </svg>`;

    function installStyle() {
        if (document.getElementById("customCallIconsStyle")) return;

        const style = document.createElement("style");
        style.id = "customCallIconsStyle";
        style.textContent = `
            .chat-header-actions .chat-call-button .custom-call-svg {
                display:block!important;
                width:27px!important;
                height:27px!important;
                margin:0!important;
                overflow:visible!important;
                flex:none!important;
            }
            .chat-header-actions .chat-call-button .custom-call-svg-video {
                width:28px!important;
                height:24px!important;
            }
            .chat-header-actions .chat-call-button .call-icon-phone,
            .chat-header-actions .chat-call-button .call-icon-video {
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                width:auto!important;
                height:auto!important;
                border:0!important;
                background:none!important;
                transform:none!important;
                font-size:0!important;
                line-height:0!important;
            }
            .chat-header-actions .chat-call-button .call-icon-phone::before,
            .chat-header-actions .chat-call-button .call-icon-phone::after,
            .chat-header-actions .chat-call-button .call-icon-video::before,
            .chat-header-actions .chat-call-button .call-icon-video::after {
                content:none!important;
                display:none!important;
            }
        `;
        document.head.appendChild(style);
    }

    function replaceButton(button, type) {
        if (!button) return;

        const iconClass = type === "audio" ? "custom-call-svg-audio" : "custom-call-svg-video";
        if (button.querySelector(`.${iconClass}`)) return;

        button.innerHTML = type === "audio" ? AUDIO_ICON : VIDEO_ICON;
    }

    function install() {
        installStyle();
        replaceButton(document.getElementById("callAudioButton"), "audio");
        replaceButton(document.getElementById("callVideoButton"), "video");
    }

    function boot() {
        install();
        const observer = new MutationObserver(install);
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(install, 1000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
