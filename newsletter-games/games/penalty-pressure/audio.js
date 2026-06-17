/**
 * After-Hours Shootout — self-contained WebAudio SFX.
 *
 * Zero asset files — every sound is synthesised from oscillators + noise +
 * envelopes, so it ships on static GitHub Pages with no fetch, no CORS, no
 * supply-chain surface. Scoped to THIS game only — the other 12 games are
 * untouched and stay silent.
 *
 * Posture: OPT-IN, MUTED BY DEFAULT (open-plan-office safe). The AudioContext
 * is created/resumed only inside a user gesture (browser autoplay policy).
 * Mute state persists in localStorage key `mg_audio` ('on' = unmuted).
 *
 * Public API (window.PPAudio):
 *   unlock()  — create/resume the context; call from a click/tap handler
 *   toggle()  — flip mute, persist, returns the new muted bool
 *   isMuted() — current mute state
 *   kick(power) / net() / whistle() / ohh() / roar() / tick(which)
 * Every play* is a safe no-op when muted or the context is unavailable.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'mg_audio';
    var ctx = null;
    var master = null;
    var noiseBuf = null;

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
                master.gain.value = 0.25;
                master.connect(ctx.destination);
                noiseBuf = makeNoise(1.0);
            }
            if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        } catch (_) { ctx = null; }
    }

    function ready() {
        return !muted && ctx && ctx.state === 'running' && master;
    }

    function makeNoise(sec) {
        var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
        var d = b.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return b;
    }

    function noiseSource() {
        var s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        return s;
    }

    /* exponential AHDSR-ish envelope on a gain param (values must stay > 0) */
    function env(param, t0, peak, attack, decay, sustain, hold, release) {
        var s = Math.max(peak * sustain, 0.0001);
        param.setValueAtTime(0.0001, t0);
        param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
        param.exponentialRampToValueAtTime(s, t0 + attack + decay);
        param.setValueAtTime(s, t0 + attack + decay + hold);
        param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + hold + release);
    }

    function stopAt(node, t) {
        try { node.stop(t); } catch (_) { /* already stopped */ }
    }

    /* ---- 1. ball kick / thud ---- */
    function kick(power) {
        if (!ready()) return;
        var t = ctx.currentTime;
        var amp = 0.6 + 0.4 * (typeof power === 'number' ? Math.max(0, Math.min(1, power)) : 0.5);
        // pitched body
        var osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.07);
        var gK = ctx.createGain(); env(gK.gain, t, 0.9 * amp, 0.004, 0.05, 0, 0, 0.04);
        osc.connect(gK).connect(master);
        // leather slap (noise)
        var n = noiseSource();
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1;
        var gN = ctx.createGain(); env(gN.gain, t, 0.35 * amp, 0.002, 0.04, 0, 0, 0.02);
        n.connect(bp).connect(gN).connect(master);
        osc.start(t); n.start(t); stopAt(osc, t + 0.16); stopAt(n, t + 0.12);
    }

    /* ---- 2. net swoosh (on a goal, after the thud) ---- */
    function net() {
        if (!ready()) return;
        var t = ctx.currentTime;
        var n = noiseSource();
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(3000, t);
        bp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
        var g = ctx.createGain(); env(g.gain, t, 0.3, 0.02, 0.12, 0.3, 0.0, 0.18);
        n.connect(bp).connect(g).connect(master);
        n.start(t); stopAt(n, t + 0.4);
    }

    /* ---- 3. referee whistle ---- */
    function whistle() {
        if (!ready()) return;
        var t = ctx.currentTime;
        var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 2400;
        var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 2500;
        // trill / vibrato
        var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 18;
        var lfoG = ctx.createGain(); lfoG.gain.value = 40;
        lfo.connect(lfoG); lfoG.connect(o1.frequency);
        var g = ctx.createGain(); env(g.gain, t, 0.18, 0.01, 0.0, 0.95, 0.22, 0.06);
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2450; bp.Q.value = 3;
        o1.connect(g); o2.connect(g); g.connect(bp).connect(master);
        o1.start(t); o2.start(t); lfo.start(t);
        stopAt(o1, t + 0.32); stopAt(o2, t + 0.32); stopAt(lfo, t + 0.32);
    }

    /* ---- 4. crowd "oooh" (near miss) ---- */
    function ohh() {
        if (!ready()) return;
        var t = ctx.currentTime;
        var n = noiseSource();
        var fA = ctx.createBiquadFilter(); fA.type = 'bandpass'; fA.Q.value = 5;
        fA.frequency.setValueAtTime(750, t); fA.frequency.exponentialRampToValueAtTime(650, t + 0.5);
        var fB = ctx.createBiquadFilter(); fB.type = 'bandpass'; fB.Q.value = 6;
        fB.frequency.setValueAtTime(1150, t); fB.frequency.exponentialRampToValueAtTime(1000, t + 0.5);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
        var g = ctx.createGain(); env(g.gain, t, 0.4, 0.08, 0.2, 0.4, 0.0, 0.25);
        n.connect(fA); n.connect(fB);
        fA.connect(lp); fB.connect(lp); lp.connect(g).connect(master);
        n.start(t); stopAt(n, t + 0.62);
    }

    /* ---- 5. crowd roar / cheer (goal) ---- */
    function roar() {
        if (!ready()) return;
        var t = ctx.currentTime;
        // broadband swell
        var n = noiseSource();
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
        var gR = ctx.createGain(); env(gR.gain, t, 0.5, 0.06, 0.0, 0.7, 0.5, 0.35);
        n.connect(bp).connect(gR).connect(master);
        // detuned saw "voices" for warmth
        var v1 = ctx.createOscillator(); v1.type = 'sawtooth'; v1.frequency.value = 200;
        var v2 = ctx.createOscillator(); v2.type = 'sawtooth'; v2.frequency.value = 205;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        var gV = ctx.createGain(); env(gV.gain, t, 0.15, 0.06, 0.0, 0.8, 0.5, 0.4);
        v1.connect(lp); v2.connect(lp); lp.connect(gV).connect(master);
        n.start(t); v1.start(t); v2.start(t);
        stopAt(n, t + 0.95); stopAt(v1, t + 0.95); stopAt(v2, t + 0.95);
    }

    /* ---- 6. soft UI tick (aim / power lock) ---- */
    function tick(which) {
        if (!ready()) return;
        var t = ctx.currentTime;
        var o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = which === 'power' ? 1300 : 900;
        var g = ctx.createGain(); env(g.gain, t, 0.12, 0.002, 0.04, 0, 0, 0.02);
        o.connect(g).connect(master);
        o.start(t); stopAt(o, t + 0.08);
    }

    function toggle() {
        muted = !muted;
        try { localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on'); } catch (_) { /* ignore */ }
        if (!muted) unlock();
        return muted;
    }

    window.PPAudio = {
        unlock: unlock,
        toggle: toggle,
        isMuted: function () { return muted; },
        kick: kick,
        net: net,
        whistle: whistle,
        ohh: ohh,
        roar: roar,
        tick: tick
    };
})();
