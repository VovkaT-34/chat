// =========================================
// Надёжный ringtone для звонков
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

    function ensureContext() {
        try {
            if (!audioContext) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                audioContext = new AC();
                master = audioContext.createGain();
                master.gain.value = 0.72;
                master.connect(audioContext.destination);
            }
            return audioContext;
        } catch (e) { return null; }
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
        } catch (e) { return null; }
    }

    async function unlock() {
        const ctx = ensureContext();
        const media = ensureAudio();
        let ok = false;
        try {
            if (ctx && ctx.state === "suspended") await ctx.resume();
            ok = Boolean(ctx && ctx.state === "running");
        } catch (e) {}
        if (media) {
            try {
                const old = media.volume;
                media.volume = 0;
                await media.play();
                media.pause();
                media.currentTime = 0;
                media.volume = old;
                ok = true;
            } catch (e) {}
        }
        unlocked = ok || unlocked;
        return unlocked;
    }

    function tone(freq, start, duration, gainValue) {
        const ctx = ensureContext();
        if (!ctx || !master) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.03);
    }

    function playWebAudio() {
        const ctx = ensureContext();
        if (!ctx || !unlocked || ctx.state !== "running") return false;
        const now = ctx.currentTime + 0.02;
        tone(660, now, 0.24, 0.58);
        tone(880, now + 0.27, 0.24, 0.58);
        tone(988, now + 0.54, 0.24, 0.54);
        tone(740, now + 0.81, 0.34, 0.54);
        return true;
    }

    function playNow() {
        if (!unlocked) return;
        const media = ensureAudio();
        if (media) {
            try {
                media.currentTime = 0;
                media.volume = 0.82;
                const p = media.play();
                if (p) p.catch(() => playWebAudio());
                return;
            } catch (e) {}
        }
        playWebAudio();
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
        lastState = "";
        if (audio) {
            try { audio.pause(); audio.currentTime = 0; } catch (e) {}
        }
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

    ["pointerdown", "touchstart", "keydown", "click"].forEach(type => {
        document.addEventListener(type, () => { void unlock().then(detect); }, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void unlock().then(detect);
        else stop();
    });

    void unlock();
    setInterval(detect, 250);
})();
