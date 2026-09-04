// =========================================
// Web Audio ringtone for calls
// =========================================
(function () {
    "use strict";
    if (window.__chatCallRingtoneInstalled) return;
    window.__chatCallRingtoneInstalled = true;
    let audioContext = null, master = null, timer = null, lastState = "", unlocked = false;

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
        } catch (error) { console.warn("Не удалось подготовить звук звонка:", error); return null; }
    }

    async function resumeAudio() {
        const ctx = ensureAudio();
        if (!ctx) return false;
        try {
            if (ctx.state === "suspended") await ctx.resume();
            unlocked = ctx.state === "running";
            return unlocked;
        } catch (error) { console.warn("Не удалось возобновить звук звонка:", error); return false; }
    }

    function tone(frequency, start, duration, type = "sine", gainValue = 0.34) {
        const ctx = ensureAudio();
        if (!ctx || !master) return;
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain); gain.connect(master);
        oscillator.start(start); oscillator.stop(start + duration + 0.03);
    }

    function playPhrase() {
        const ctx = ensureAudio();
        if (!ctx || !unlocked || ctx.state !== "running") return;
        const now = ctx.currentTime + 0.02;
        tone(660, now, 0.24, "sine", 0.58);
        tone(880, now + 0.27, 0.24, "sine", 0.58);
        tone(988, now + 0.54, 0.24, "sine", 0.54);
        tone(740, now + 0.81, 0.34, "sine", 0.54);
    }

    async function playNow() { if (await resumeAudio()) playPhrase(); }
    function stop() { if (timer) clearInterval(timer); timer = null; lastState = ""; }
    function start(kind) {
        if (!kind) return stop();
        if (kind === lastState && timer) return;
        stop(); lastState = kind;
        void playNow();
        timer = setInterval(() => void playNow(), 1700);
    }

    function detect() {
        const root = document.getElementById("chatCallV2"), incoming = document.getElementById("cv2Incoming"), controls = document.getElementById("cv2Controls");
        if (!root || !root.classList.contains("open")) return stop();
        if (incoming && getComputedStyle(incoming).display !== "none") return start("incoming");
        const status = document.getElementById("cv2Status")?.textContent || "";
        if (controls && getComputedStyle(controls).display !== "none" && status === "Вызов…") return start("outgoing");
        stop();
    }

    ["pointerdown", "touchstart", "keydown", "click"].forEach(name => document.addEventListener(name, () => void resumeAudio(), { passive: true }));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void resumeAudio().then(detect); else stop(); });
    setInterval(detect, 250);
})();
