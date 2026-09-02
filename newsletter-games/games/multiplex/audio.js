/**
 * MULTIPLEX - self-contained WebAudio SFX.
 *
 * Zero asset files. Every sound is synthesised from oscillators, filtered noise
 * and gain envelopes, so it ships on static GitHub Pages and inside the
 * SharePoint build with no fetch, no CORS and no supply-chain surface. The same
 * reasoning as the two sibling kits (games/red-carpet-rush/audio.js and
 * games/penalty-pressure/audio.js), whose structure this file follows on
 * purpose rather than inventing a third shape.
 *
 * WHY THIS IS NOT A `stage` METHOD. The microgame contract gives a screen no
 * route to anything outside its own rectangle, and adding one would be a
 * contract change binding on nine screen authors. Every call here is made by
 * harness.js at a gauntlet-level event the harness already owns: a verdict, a
 * lost life, a loop-up, the end of a run. No microgame knows this file exists
 * and no microgame file changes because of it.
 *
 * WHY IT IS INVISIBLE TO THE HEADLESS INSTRUMENT. mpx_headless.mjs loads
 * harness.js and the nine screens and nothing else, so window.MPXAudio is
 * undefined there. Every harness call site is guarded, so the balance and
 * determinism passes step exactly the simulation they stepped before this file
 * existed. Sound is a nicety and never a failure path.
 *
 * POSTURE: OPT-IN, MUTED BY DEFAULT. This is played at a desk in an open-plan
 * office. The AudioContext is created and resumed only inside a user gesture
 * (browser autoplay policy requires it anyway). Mute state persists in the
 * localStorage key `mg_audio` ('on' = unmuted), shared with the sibling games
 * so a single opt-in covers the whole hub.
 *
 * TIMING NOTE. At the 400ms screen floor a verdict can fire 2.5 times a second,
 * so every sound here is kept short and quiet enough not to smear into the next
 * one. Nothing is longer than 320ms except gameOver, which only ever plays once.
 *
 * Public API (window.MPXAudio):
 *   unlock()        - create/resume the context; call from a click/tap handler
 *   toggle()        - flip mute, persist, returns the new muted bool
 *   isMuted()       - current mute state
 *   clear(streak)   - a screen cleared; pitch rises with the streak
 *   miss()          - a screen failed
 *   life()          - a life lost, heavier than a miss
 *   tick()          - quiet click, the closing moments of a screen
 *   loopUp()        - the gauntlet speeds up
 *   intermission()  - the breather card
 *   gameOver()      - end of run
 * Every play call is a safe no-op when muted or when the context is unavailable.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'mg_audio';
    var ctx = null;
    var master = null;
    var noiseBuf = null;

    function readMuted() {
        try { return localStorage.getItem(STORAGE_KEY) !== 'on'; }
        catch (_) { return true; }   // default muted if storage is unavailable
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
                /* Lower than the sibling kits' 0.22: this game fires a verdict
                   sound far more often than they do. */
                master.gain.value = 0.18;
                master.connect(ctx.destination);
                noiseBuf = makeNoise(1.0);
            }
            if (ctx.state === 'suspended') ctx.resume();
        } catch (_) { /* audio is a nicety, never a failure path */ }
    }

    function toggle() {
        muted = !muted;
        try { localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on'); } catch (_) {}
        return muted;
    }

    function isMuted() { return muted; }

    function ready() { return !muted && ctx && master; }

    /* ---- primitives ---- */

    /* Math.random is fine here and only here: this buffer is built once, at
       unlock, entirely outside the simulation. The contract's ban on randomness
       is a ban on randomness a game frame can observe, and nothing in this file
       is ever read by update(). */
    function makeNoise(seconds) {
        var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    /** One-shot filtered noise burst. */
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

    /** Simple enveloped oscillator tone, optionally gliding to a second pitch. */
    function tone(freq, dur, type, peak, glideTo) {
        if (!ready()) return;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        var t = ctx.currentTime;
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak || 0.16), t + 0.010);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
    }

    /* ---- the gauntlet ---- */

    /**
     * A screen cleared. Two quick ascending tones, the pair transposed up as the
     * streak grows so a hot run audibly climbs. Capped at six steps: past that
     * it stops reading as reward and starts reading as shrill, and the streak
     * multiplier itself caps at 2.5x anyway.
     */
    function clear(streak) {
        if (!ready()) return;
        var step = Math.max(0, Math.min(6, (streak | 0) - 1));
        var base = 660 * Math.pow(1.0595, step * 2);      // two semitones a step
        tone(base, 0.075, 'triangle', 0.20);
        setTimeout(function () { tone(base * 1.5, 0.10, 'triangle', 0.18); }, 62);
    }

    /** A screen failed but a life remains. Short descending sweep. */
    function miss() {
        if (!ready()) return;
        tone(300, 0.16, 'sawtooth', 0.13, 130);
    }

    /**
     * A life lost. The heavier cousin of miss(): the same sweep an octave down
     * with a low thump under it, so losing a life is distinguishable from a
     * dropped screen without looking at the ticket stubs.
     */
    function life() {
        if (!ready()) return;
        tone(180, 0.28, 'sawtooth', 0.15, 70);
        noise(0.20, 'lowpass', 320, 0.18);
    }

    /** The closing moments of a screen. Deliberately near-subliminal. */
    function tick() {
        if (!ready()) return;
        tone(1500, 0.022, 'square', 0.045);
    }

    /** The gauntlet speeds up. The one genuinely triumphant sound in the kit. */
    function loopUp() {
        if (!ready()) return;
        var notes = [660, 880, 990, 1320];
        notes.forEach(function (n, i) {
            setTimeout(function () { tone(n, 0.13, 'triangle', 0.17); }, i * 78);
        });
    }

    /** The breather card. A soft two-note house bell, lights going down. */
    function intermission() {
        if (!ready()) return;
        tone(523, 0.30, 'sine', 0.14);
        setTimeout(function () { tone(392, 0.42, 'sine', 0.13); }, 210);
    }

    /** End of run. Longer, rounder and resolving, so it reads as final. */
    function gameOver() {
        if (!ready()) return;
        var notes = [440, 392, 330, 262];
        notes.forEach(function (n, i) {
            setTimeout(function () { tone(n, 0.32, 'sine', 0.16); }, i * 130);
        });
        setTimeout(function () { noise(0.30, 'lowpass', 260, 0.10); }, 420);
    }

    window.MPXAudio = {
        unlock: unlock,
        toggle: toggle,
        isMuted: isMuted,
        clear: clear,
        miss: miss,
        life: life,
        tick: tick,
        loopUp: loopUp,
        intermission: intermission,
        gameOver: gameOver
    };
})();
