// =========================================
// Web Audio ringtone for calls
// =========================================
(function () {
    "use strict";
    if (window.__chatCallRingtoneInstalled) return;
    window.__chatCallRingtoneInstalled = true;

    let audioContext = null;
    let master = null;
    let audio = null;
    let timer = null;
    let lastState = "";
    let unlocked = false;

    function ensureAudioContext() {
        try {
            if (!audioContext) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return null;
                audioContext = new AudioContext();
                master = audioContext.createGain();
                master.gain.value = 0.72;
                master.connect(audioContext.destination);
            }
            return audioContext;
        } catch (error) {
            console.warn("Не удалось подготовить звук звонка:", error);
            return null;
        }
    }

    function ensureAudio() {
        if (audio) return audio;
        try {
            audio = document.createElement("audio");
            audio.id = "chatCallRingtoneAudio";
            audio.preload = "auto";
            audio.loop = true;
            audio.volume = 0.82;
            audio.setAttribute("playsinline", "");
            audio.setAttribute("webkit-playsinline", "");
            audio.src = "ringtone.mp3";
            audio.style.display = "none";
            document.body.appendChild(audio);
            return audio;
        } catch (error) {
            return null;
        }
    }

    async function unlockAudio() {
        const ctx = ensureAudioContext();
        const media = ensureAudio();
        let ok = false;
        try {
            if (ctx && ctx.state === "suspended") await ctx.resume();
            ok = Boolean(ctx && ctx.state === "running");
        } catch (error) {
            console.debug("Не удалось возобновить AudioContext:", error);
        }
        if (media) {
            try {
                const old = media.volume;
                media.volume = 0;
                await media.play();
                media.pause();
                media.currentTime = 0;
                media.volume = old;
                ok = true;
            } catch (error) {}
        }
        unlocked = ok || unlocked;
        return unlocked;
    }

    function tone(frequency, start, duration, gainValue) {
        const ctx = ensureAudioContext();
        if (!ctx || !master || ctx.state !== "running") return;

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
    }

    function playPhrase() {
        const ctx = ensureAudioContext();
        if (!ctx || !unlocked || ctx.state !== "running") return;

        const now = ctx.currentTime + 0.02;
        tone(660, now, 0.24, 0.58);
        tone(880, now + 0.27, 0.24, 0.58);
        tone(988, now + 0.54, 0.24, 0.54);
        tone(740, now + 0.81, 0.34, 0.54);
    }

    async function playNow() {
        if (!unlocked || audioContext?.state !== "running") {
            await unlockAudio();
        }

        const media = ensureAudio();
        if (media) {
            try {
                media.currentTime = 0;
                media.volume = 0.82;
                const p = media.play();
                if (p) {
                    await p;
                    return;
                }
                return;
            } catch (error) {}
        }
        playPhrase();
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
        lastState = "";
        if (audio) {
            try { audio.pause(); audio.currentTime = 0; } catch (error) {}
        }
    }

    function start(kind) {
        if (!kind) return stop();
        if (kind === lastState && timer) return;

        stop();
        lastState = kind;
        void playNow();
        timer = setInterval(() => void playNow(), 1700);
    }

    function detect() {
        const root = document.getElementById("chatCallV2");
        const incoming = document.getElementById("cv2Incoming");
        const controls = document.getElementById("cv2Controls");

        if (!root || !root.classList.contains("open")) {
            return stop();
        }

        if (incoming && getComputedStyle(incoming).display !== "none") {
            return start("incoming");
        }

        const status = document.getElementById("cv2Status")?.textContent || "";
        if (
            controls &&
            getComputedStyle(controls).display !== "none" &&
            status === "Вызов…"
        ) {
            return start("outgoing");
        }

        stop();
    }

    ["pointerdown", "touchstart", "touchend", "mousedown", "click", "keydown"].forEach(type => {
        document.addEventListener(type, () => {
            void unlockAudio().then(detect);
        }, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            void unlockAudio().then(detect);
        } else {
            if (timer) clearInterval(timer);
            timer = null;
        }
    });

    setInterval(detect, 250);
})();
