// =========================================
// Original call icon set
// Pure CSS geometry; no external icon/font/image assets.
// =========================================
(function () {
    "use strict";

    if (window.__originalCallIconsInstalled) return;
    window.__originalCallIconsInstalled = true;

    const ICONS = {
        phone: '<span class="original-icon original-icon-phone" aria-hidden="true"></span>',
        video: '<span class="original-icon original-icon-video" aria-hidden="true"></span>',
        mic: '<span class="original-icon original-icon-mic" aria-hidden="true"></span>',
        micOff: '<span class="original-icon original-icon-mic original-icon-mic-off" aria-hidden="true"></span>',
        speaker: '<span class="original-icon original-icon-speaker" aria-hidden="true"></span>'
    };

    function installStyles() {
        if (document.getElementById("originalCallIconStyles")) return;

        const style = document.createElement("style");
        style.id = "originalCallIconStyles";
        style.textContent = `
            .original-icon{position:relative;display:block;flex:0 0 auto;width:26px;height:26px;box-sizing:border-box;color:currentColor}

            /* Original handset geometry */
            .original-icon-phone:before,.original-icon-phone:after{content:"";position:absolute;width:10px;height:16px;border:4px solid currentColor;border-radius:7px;box-sizing:border-box}
            .original-icon-phone:before{left:1px;top:0;transform:rotate(-42deg);border-right-color:transparent;border-bottom-color:transparent}
            .original-icon-phone:after{right:1px;bottom:0;transform:rotate(-42deg);border-left-color:transparent;border-top-color:transparent}

            /* Original camera geometry: body + right-facing lens */
            .original-icon-video{width:22px;height:17px;margin-top:4px;border:3px solid currentColor;border-radius:4px}
            .original-icon-video:after{content:"";position:absolute;right:-10px;top:3px;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:8px solid currentColor}

            /* Original microphone geometry */
            .original-icon-mic{width:12px;height:17px;margin:0 auto;border:3px solid currentColor;border-radius:8px}
            .original-icon-mic:before{content:"";position:absolute;left:-7px;top:12px;width:20px;height:10px;border:3px solid currentColor;border-top:0;border-radius:0 0 12px 12px}
            .original-icon-mic:after{content:"";position:absolute;left:3px;bottom:-9px;width:3px;height:8px;background:currentColor;border-radius:2px;box-shadow:-4px 7px 0 -1px currentColor,4px 7px 0 -1px currentColor}
            .original-icon-mic-off{transform:rotate(-45deg)}
            .original-icon-mic-off:after{box-shadow:none}

            /* Original speaker geometry */
            .original-icon-speaker{width:25px;height:22px;margin-top:2px}
            .original-icon-speaker:before{content:"";position:absolute;left:1px;top:8px;width:7px;height:7px;background:currentColor;border-radius:2px}
            .original-icon-speaker:after{content:"";position:absolute;left:7px;top:4px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:11px solid currentColor}
            .original-icon-speaker{border-right:3px solid currentColor;border-radius:0 50% 50% 0}

            .chat-call-button .call-icon-phone,.chat-call-button .call-icon-video{font-size:0!important;line-height:0!important;border:0!important;background:none!important}
            #cv2Mute,#cv2VideoControl,#cv2Speaker,#cv2Hangup{font-size:0!important;line-height:0!important}
        `;
        document.head.appendChild(style);
    }

    function replaceElement(button, type) {
        if (!button) return;
        if (button.dataset.originalIcon === type && button.querySelector(".original-icon")) return;
        button.dataset.originalIcon = type;
        button.innerHTML = ICONS[type];
    }

    function refresh() {
        installStyles();

        replaceElement(document.getElementById("callAudioButton"), "phone");
        replaceElement(document.getElementById("callVideoButton"), "video");

        const mute = document.getElementById("cv2Mute");
        if (mute) replaceElement(mute, mute.dataset.muted === "1" ? "micOff" : "mic");

        replaceElement(document.getElementById("cv2VideoControl"), "video");
        replaceElement(document.getElementById("cv2Speaker"), "speaker");

        const hangup = document.getElementById("cv2Hangup");
        if (hangup) replaceElement(hangup, "phone");
    }

    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(refresh, 1000);
})();
