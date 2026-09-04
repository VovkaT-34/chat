// =========================================
// Кнопка настроек + выход из аккаунта
// =========================================

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.replace("./login.html");
}

(function installChatHeaderEnhancements() {
    function install() {
        if (!document.getElementById("chatTitle")) return;

        if (!document.getElementById("chat-header-enhancements")) {
            const style = document.createElement("style");
            style.id = "chat-header-enhancements";
            style.textContent = `
                .top-actions .logout-button.chat-settings-button{
                    width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;
                    padding:0!important;border-radius:50%!important;font-size:0!important;line-height:1!important;
                    display:flex!important;align-items:center!important;justify-content:center!important;
                }
                .top-actions .logout-button.chat-settings-button .settings-icon-svg{
                    display:block!important;width:22px!important;height:22px!important;flex:none!important;
                    color:currentColor!important;stroke:currentColor!important;
                    transform:rotate(0deg)!important;transition:transform .22s ease!important;
                }
                .top-actions .logout-button.chat-settings-button:hover .settings-icon-svg{
                    transform:rotate(28deg)!important;
                }
                .top-actions .logout-button.chat-settings-button:active .settings-icon-svg{
                    transform:rotate(52deg) scale(.94)!important;
                }
                @media(max-width:700px){
                    .top-actions .logout-button.chat-settings-button{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}
                    .top-actions .logout-button.chat-settings-button .settings-icon-svg{width:23px!important;height:23px!important}
                    .chat-header-actions{position:sticky!important;top:0!important;z-index:500!important}
                    .chat-header-main-actions,.chat-call-actions{width:100%!important}
                    .chat-call-actions{min-height:48px!important;padding-bottom:2px!important}
                }
                .chat-header-actions .chat-call-button .call-icon-phone{
                    position:relative!important;display:block!important;width:22px!important;height:22px!important;
                    margin:0!important;font-size:0!important;line-height:0!important;transform:none!important;
                }
                .chat-header-actions .chat-call-button .call-icon-phone:before{
                    content:""!important;position:absolute!important;left:2px!important;top:2px!important;width:18px!important;height:18px!important;
                    border:4px solid currentColor!important;border-top-color:transparent!important;border-right-color:transparent!important;
                    border-radius:5px 6px 9px 10px!important;transform:rotate(-45deg)!important;box-sizing:border-box!important;
                }
                .chat-header-actions .chat-call-button .call-icon-phone:after{
                    content:""!important;position:absolute!important;right:0!important;top:0!important;width:9px!important;height:9px!important;
                    border:0!important;border-radius:2px 7px 2px 2px!important;background:currentColor!important;transform:rotate(12deg)!important;
                    box-shadow:-12px 13px 0 -2px currentColor!important;
                }
                .chat-header-actions .chat-call-button .call-icon-video{
                    position:relative!important;display:block!important;width:20px!important;height:14px!important;
                    margin:0!important;border:0!important;border-radius:3px!important;background:currentColor!important;box-sizing:border-box!important;
                }
                .chat-header-actions .chat-call-button .call-icon-video:after{
                    content:""!important;position:absolute!important;left:-8px!important;right:auto!important;top:2px!important;width:0!important;height:0!important;
                    border-top:5px solid transparent!important;border-bottom:5px solid transparent!important;border-right:8px solid currentColor!important;border-left:0!important;
                }
            `;
            document.head.appendChild(style);
        }

        const logoutButton = document.querySelector(".top-actions .logout-button");
        if (logoutButton) {
            if (!logoutButton.classList.contains("chat-settings-button")) {
                logoutButton.classList.add("chat-settings-button");
            }

            if (!logoutButton.querySelector(".settings-icon-svg")) {
                logoutButton.innerHTML = `
                    <svg class="settings-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 3.2l1.1 1.9a7.5 7.5 0 0 1 1.7.7l2.1-.6 1.6 1.6-.6 2.1c.3.5.5 1.1.7 1.7l1.9 1.1v2.5l-1.9 1.1a7.5 7.5 0 0 1-.7 1.7l.6 2.1-1.6 1.6-2.1-.6a7.5 7.5 0 0 1-1.7.7L12 20.8h-2.5l-1.1-1.9a7.5 7.5 0 0 1-1.7-.7l-2.1.6-1.6-1.6.6-2.1a7.5 7.5 0 0 1-.7-1.7L1 12.3V9.8l1.9-1.1a7.5 7.5 0 0 1 .7-1.7L3 4.9l1.6-1.6 2.1.6a7.5 7.5 0 0 1 1.7-.7l1.1-1.9H12z" transform="translate(1 0) scale(.92)"/>
                        <circle cx="12" cy="11" r="3.1"/>
                    </svg>`;
            }

            logoutButton.title = "Настройки";
            logoutButton.setAttribute("aria-label", "Настройки");
            logoutButton.type = "button";

            if (!logoutButton.dataset.chatSettingsHandler) {
                logoutButton.dataset.chatSettingsHandler = "1";
                logoutButton.onclick = () => { window.location.href = "./settings.html"; };
            }
        }

        document.querySelectorAll(".chat-call-button").forEach(button => {
            const isVideo = button.classList.contains("chat-call-video");
            const iconClass = isVideo ? "call-icon-video" : "call-icon-phone";
            if (!button.querySelector("." + iconClass)) {
                button.innerHTML = `<span class="${iconClass}" aria-hidden="true"></span>`;
            }

            const ariaLabel = isVideo ? "Видеозвонок" : "Позвонить";
            const title = isVideo ? "Видеозвонок" : "Позвонить";
            if (button.getAttribute("aria-label") !== ariaLabel) {
                button.setAttribute("aria-label", ariaLabel);
            }
            if (button.title !== title) {
                button.title = title;
            }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();

    const observer = new MutationObserver(install);
    const startObserver = () => observer.observe(document.body, { childList: true, subtree: true });
    if (document.body) startObserver();
    else document.addEventListener("DOMContentLoaded", startObserver, { once: true });
})();
