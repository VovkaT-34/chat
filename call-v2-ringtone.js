// =========================================
// Web Audio ringtone for calls
// =========================================
(function () {
    "use strict";
    if (window.__chatCallRingtoneInstalled) return;
    window.__chatCallRingtoneInstalled = true;

    let audioContext = null;
    let master = null;
    let timer = null;
    let lastState = "";
    let unlocked = false;

    function ensureAudio() {
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

    async function unlockAudio() {
        const ctx = ensureAudio();
        if (!ctx) return false;
        try {
            if (ctx.state === "suspended") await ctx.resume();
            unlocked = ctx.state === "running";
        } catch (error) {
            console.debug("iOS не разрешил AudioContext:", error);
        }
        return unlocked;
    }

    function tone(frequency, start, duration, gainValue) {
        const ctx = ensureAudio();
        if (!ctx || !master) return;
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
        const ctx = ensureAudio();
        if (!ctx || !unlocked || ctx.state !== "running") return;
        const now = ctx.currentTime + 0.02;
        tone(660, now, 0.24, 0.58);
        tone(880, now + 0.27, 0.24, 0.58);
        tone(988, now + 0.54, 0.24, 0.54);
        tone(740, now + 0.81, 0.34, 0.54);
    }

    function playNow() {
        if (unlocked) playPhrase();
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
        lastState = "";
    }

    function start(kind) {
        if (!kind) return stop();
        if (kind === lastState && timer) return;
        stop();
        lastState = kind;
        playNow();
        timer = setInterval(playNow, 1700);
    }

    function detect() {
        const root = document.getElementById("chatCallV2");
        const incoming = document.getElementById("cv2Incoming");
        const controls = document.getElementById("cv2Controls");
        if (!root || !root.classList.contains("open")) return stop();
        if (incoming && getComputedStyle(incoming).display !== "none") return start("incoming");
        const status = document.getElementById("cv2Status")?.textContent || "";
        if (controls && getComputedStyle(controls).display !== "none" && status === "Вызов…") return start("outgoing");
        stop();
    }

    // Для iPhone/iPad используем события, которые WebKit официально считает
    // пользовательским жестом для запуска media/Web Audio.
    ["touchend", "mousedown", "click", "keydown"].forEach(type => {
        document.addEventListener(type, () => {
            void unlockAudio().then(detect);
        }, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            void unlockAudio().then(detect);
        } else {
            stop();
        }
    });

    setInterval(detect, 250);
})();
