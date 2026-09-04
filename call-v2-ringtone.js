// =========================================
// Original Web Audio ringtone for calls
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
                master.gain.value = 0.16;
                master.connect(audioContext.destination);
            }
            if (audioContext.state === "suspended") void audioContext.resume().then(() => { unlocked = true; }).catch(() => {});
            return audioContext;
        } catch (error) {
            console.warn("Не удалось подготовить звук звонка:", error);
            return null;
        }
    }

    function unlock() {
        const ctx = ensureAudio();
        if (!ctx) return;
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        unlocked = true;
    }

    function tone(frequency, start, duration, type = "sine", gainValue = 0.22) {
        const ctx = ensureAudio();
        if (!ctx || !master) return;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
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
        // Original four-note call motif. No external/copyrighted audio file.
        tone(660, now, 0.20, "sine", 0.30);
        tone(880, now + 0.23, 0.20, "sine", 0.30);
        tone(988, now + 0.46, 0.20, "sine", 0.28);
        tone(740, now + 0.69, 0.30, "sine", 0.28);
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
        lastState = "";
    }

    function start(kind) {
        if (kind === "") {
            stop();
            return;
        }
        if (kind === lastState && timer) return;
        stop();
        lastState = kind;
        playPhrase();
        timer = setInterval(playPhrase, 1700);
    }

    function detect() {
        const root = document.getElementById("chatCallV2");
        const incoming = document.getElementById("cv2Incoming");
        const controls = document.getElementById("cv2Controls");
        if (!root || !root.classList.contains("open")) {
            stop();
            return;
        }

        const incomingVisible = incoming && getComputedStyle(incoming).display !== "none";
        if (incomingVisible) {
            start("incoming");
            return;
        }

        const controlsVisible = controls && getComputedStyle(controls).display !== "none";
        const status = document.getElementById("cv2Status")?.textContent || "";
        if (controlsVisible && status === "Вызов…") {
            start("outgoing");
            return;
        }

        stop();
    }

    ["pointerdown", "touchstart", "keydown"].forEach(eventName => {
        document.addEventListener(eventName, unlock, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            unlock();
            detect();
        }
    });

    setInterval(detect, 250);
})();
