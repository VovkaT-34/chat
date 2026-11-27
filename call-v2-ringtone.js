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
            console.debug("Не удалось возобновить AudioContext:", error);
        }
        return unlocked;
    }

    function tone(frequency, start, duration, gainValue) {
        const ctx = ensureAudio();
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
        const ctx = ensureAudio();
        if (!ctx || !unlocked || ctx.state !== "running") return;

        const now = ctx.currentTime + 0.02;
        tone(660, now, 0.24, 0.58);
        tone(880, now + 0.27, 0.24, 0.58);
        tone(988, now + 0.54, 0.24, 0.54);
        tone(740, now + 0.81, 0.34, 0.54);
    }

    // Invalidates any pending async resume/play operation when ringing stops.
    let playbackGeneration = 0;

    function stop(suspendAudio = true) {
        playbackGeneration++;
        if (timer) clearInterval(timer);
        timer = null;
        lastState = "";
        if (suspendAudio && audioContext?.state === "running") {
            void audioContext.suspend().catch(() => {});
        }
    }

    async function playNow(generation) {
        if (generation !== playbackGeneration || !lastState) return;
        if (!unlocked || audioContext?.state !== "running") {
            await unlockAudio();
        }
        // A call may have been answered/ended while AudioContext.resume() was pending.
        if (generation !== playbackGeneration || !lastState) {
            if (!lastState && audioContext?.state === "running") {
                void audioContext.suspend().catch(() => {});
            }
            return;
        }
        playPhrase();
    }

    function start(kind) {
        if (!kind) return stop();
        if (kind === lastState && timer) return;

        stop(false);
        lastState = kind;
        const generation = playbackGeneration;
        void playNow(generation);
        timer = setInterval(() => void playNow(generation), 1700);
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
            status.startsWith("Вызов…")
        ) {
            return start("outgoing");
        }

        stop();
    }

    // Keep the broader set of iOS user-gesture events. The previous
    // touchend/mousedown-only variant could miss the first gesture on Safari.
    ["pointerdown", "touchstart", "touchend", "mousedown", "click", "keydown"].forEach(type => {
        document.addEventListener(type, () => {
            const root = document.getElementById("chatCallV2");
            if (!root?.classList.contains("open")) return;
            const incoming = document.getElementById("cv2Incoming");
            const controls = document.getElementById("cv2Controls");
            const status = document.getElementById("cv2Status")?.textContent || "";
            const ringing = (incoming && getComputedStyle(incoming).display !== "none") ||
                (controls && getComputedStyle(controls).display !== "none" && status.startsWith("Вызов…"));
            if (ringing) void unlockAudio().then(detect);
        }, { passive: true });
    });

    let observedCallRoot = null;
    let callRootObserver = null;

    function observeCallRoot(root) {
        if (!root || root === observedCallRoot) return;
        if (callRootObserver) callRootObserver.disconnect();
        observedCallRoot = root;
        callRootObserver = new MutationObserver(detect);
        callRootObserver.observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "style"]
        });
        detect();
    }

    const existingCallRoot = document.getElementById("chatCallV2");
    if (existingCallRoot) {
        observeCallRoot(existingCallRoot);
    } else if (document.body) {
        // call-v2.js normally creates the root before this file loads.
        // Keep a one-shot discovery observer as a safe fallback.
        const rootDiscoveryObserver = new MutationObserver(() => {
            const root = document.getElementById("chatCallV2");
            if (!root) return;
            rootDiscoveryObserver.disconnect();
            observeCallRoot(root);
        });
        rootDiscoveryObserver.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            detect();
        } else {
            stop();
            if (audioContext?.state === "running") void audioContext.suspend().catch(() => {});
        }
    });
    detect();
})();
