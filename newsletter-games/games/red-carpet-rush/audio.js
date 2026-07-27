/**
 * FLASH! Red Carpet Rush - self-contained WebAudio SFX.
 *
 * Zero asset files - every sound is synthesised from oscillators + noise +
 * envelopes, so it ships on static GitHub Pages with no fetch, no CORS, no
 * supply-chain surface. Scoped to THIS game only.
 *
 * Posture: OPT-IN, MUTED BY DEFAULT (open-plan-office safe). The AudioContext
 * is created/resumed only inside a user gesture (browser autoplay policy).
 * Mute state persists in localStorage key `mg_audio` ('on' = unmuted), shared
 * with the other audio-enabled games so one opt-in covers the hub.
 *
 * Public API (window.RCAudio):
 *   unlock()         - create/resume the context; call from a click/tap handler
 *   toggle()         - flip mute, persist, returns the new muted bool
 *   isMuted()        - current mute state
 *   focus()          - soft servo whir while racking focus (looped, call stop)
 *   focusStop()      - stop the servo
 *   shutter()        - the signature mirror-slap + motor-drive click
 *   flashPop()       - capacitor whine into a bright transient
 *   verdict(kind)    - 'front' | 'exclusive' | 'page' | 'blurry' | 'miss' | 'wrong'
 *   crowd(intensity) - swell of pit noise, 0..1
 *   fanfare()        - cover reveal
 * Every play* is a safe no-op when muted or the context is unavailable.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'mg_audio';
    var ctx = null;
    var master = null;
    var noiseBuf = null;
    var servo = null;          // { osc, gain } while focusing

    function readMuted() {
        try { return localStorage.getItem(STORAGE_KEY) !== 'on'; }
        catch (_) { return true; } // default muted if storage unavailable
    }
    var muted = readMuted();

    /* ---- context lifecycle (gesture-gated) ---- */
    function unlock() {
        try {
            if (!ctx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0.22;
                master.connect(ctx.destination);
                noiseBuf = makeNoise(1.0);
            }
            if (ctx.state === 'suspended') ctx.resume();
        } catch (_) { /* audio is a nicety, never a failure path */ }
    }

    function toggle() {
        muted = !muted;
        try { localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on'); } catch (_) {}
        if (muted) focusStop();
        return muted;
    }

    function isMuted() { return muted; }

    function ready() { return !muted && ctx && master; }

    /* ---- primitives ---- */
    function makeNoise(seconds) {
        var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    /** One-shot noise burst through a filter. */
    function noise(dur, filterType, freq, peak, q) {
        if (!ready()) return;
        var src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        var f = ctx.createBiquadFilter();
        f.type = filterType || 'bandpass';
        f.frequency.value = freq || 1200;
        if (q) f.Q.value = q;
        var g = ctx.createGain();
        var t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak || 0.3), t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t); src.stop(t + dur + 0.02);
    }

    /** Simple enveloped oscillator tone. */
    function tone(freq, dur, type, peak, glideTo) {
        if (!ready()) return;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        var t = ctx.currentTime;
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak || 0.18), t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
    }

    /* ---- the camera ---- */

    /** Focus servo - a quiet rising whir held while the player racks focus. */
    function focus() {
        if (!ready() || servo) return;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        var f = ctx.createBiquadFilter();
        var t = ctx.currentTime;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(120, t);
        o.frequency.linearRampToValueAtTime(300, t + 1.1);
        f.type = 'lowpass';
        f.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.06);
        o.connect(f); f.connect(g); g.connect(master);
        o.start(t);
        servo = { osc: o, gain: g };
    }

    function focusStop() {
        if (!servo) return;
        try {
            var t = ctx.currentTime;
            servo.gain.gain.cancelScheduledValues(t);
            servo.gain.gain.setValueAtTime(servo.gain.gain.value || 0.0001, t);
            servo.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
            servo.osc.stop(t + 0.08);
        } catch (_) {}
        servo = null;
    }

    /** Mirror slap + motor drive - the signature sound of the game. */
    function shutter() {
        if (!ready()) return;
        noise(0.035, 'bandpass', 2600, 0.42, 1.4);   // slap
        setTimeout(function () { noise(0.05, 'bandpass', 900, 0.22, 2.0); }, 34); // mirror return
        setTimeout(function () { noise(0.09, 'lowpass', 520, 0.14); }, 70);       // motor wind
    }

    /** Flash capacitor: a fast whine up into a bright transient. */
    function flashPop() {
        if (!ready()) return;
        tone(2400, 0.06, 'triangle', 0.10, 5200);
        noise(0.07, 'highpass', 3400, 0.28);
    }

    /* ---- outcomes ---- */
    function verdict(kind) {
        if (!ready()) return;
        if (kind === 'front') {
            tone(660, 0.10, 'triangle', 0.20);
            setTimeout(function () { tone(880, 0.10, 'triangle', 0.20); }, 90);
            setTimeout(function () { tone(1320, 0.26, 'triangle', 0.22); }, 180);
        } else if (kind === 'exclusive') {
            tone(590, 0.10, 'triangle', 0.17);
            setTimeout(function () { tone(880, 0.20, 'triangle', 0.17); }, 95);
        } else if (kind === 'page') {
            tone(520, 0.14, 'sine', 0.14);
        } else if (kind === 'blurry') {
            tone(300, 0.16, 'sine', 0.12, 220);
        } else if (kind === 'miss') {
            tone(220, 0.20, 'sine', 0.12, 150);
        } else if (kind === 'wrong') {
            tone(180, 0.28, 'sawtooth', 0.14, 90);
            noise(0.18, 'lowpass', 400, 0.16);
        }
    }

    /** Pit noise swell - used on subject entry and big captures. */
    function crowd(intensity) {
        if (!ready()) return;
        var i = Math.max(0, Math.min(1, intensity == null ? 0.5 : intensity));
        noise(0.5 + i * 0.5, 'bandpass', 700 + i * 500, 0.05 + i * 0.10, 0.7);
    }

    function fanfare() {
        if (!ready()) return;
        var notes = [523, 659, 784, 1047];
        notes.forEach(function (n, i) {
            setTimeout(function () { tone(n, 0.30, 'triangle', 0.18); }, i * 110);
        });
        setTimeout(function () { crowd(1); }, 220);
    }

    window.RCAudio = {
        unlock: unlock,
        toggle: toggle,
        isMuted: isMuted,
        focus: focus,
        focusStop: focusStop,
        shutter: shutter,
        flashPop: flashPop,
        verdict: verdict,
        crowd: crowd,
        fanfare: fanfare
    };
})();
