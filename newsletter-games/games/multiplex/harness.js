/**
 * MULTIPLEX - a nine-screen microgame gauntlet.
 * KPMG Newsletter Minigame, September 2026 edition.
 *
 * Nine screens. One input each. A few seconds each. Three lives. Clear a screen
 * and the next one cuts in; miss one and you lose a life. The gauntlet loops
 * faster every pass, so there is no score ceiling.
 *
 * THIS FILE IS THE SHELL, NOT A GAME. It owns everything outside the play
 * rectangle: the clock, the transition, lives, the loop counter, scoring, input
 * normalisation, the flash budget and the reduced-motion gate. A microgame owns
 * only what happens inside its own 376 x 552 rectangle and is written against
 * MICROGAME-CONTRACT.md, which sits next to this file. The worked example is
 * microgames/_reference.js.
 *
 * ---------------------------------------------------------------------------
 * BRAND DEVIATION (deliberate, approved 2026-08-26)
 * This game uses a BESPOKE cinema palette (film black, velvet, ticket gold and
 * cream, plus nine per-screen tints) that is OFF the mandatory KPMG 8-colour
 * palette, for the September cinema-themed edition. The deviation is scoped to
 * this directory only: no shared asset is touched, and the page header plus the
 * engine HUD stay KPMG Blue so the tile still reads as part of the hub.
 * brand_validator.py would flag the hexes in P and TINTS below; that is
 * expected, not a defect. Every hex here carries a verified WCAG contrast
 * figure - white body text clears 9.13:1 at worst against a screen surface, and
 * every accent clears 3.5:1 against its own surface. Do not swap a hex without
 * re-running that check.
 * ---------------------------------------------------------------------------
 *
 * ACCESSIBILITY - PHOTOSENSITIVITY (WCAG 2.3.1). This note used to say that a
 * screen-to-screen cut "is itself a flash" and that the 400ms screen floor was
 * the answer to it. Both halves were MEASURED and both were false: a cut to the
 * wipe is not a flash for this palette, and the 400ms floor is not what bounds
 * the cut rate. What follows is what actually carries the compliance, in the
 * order it matters. None of it is advisory.
 *
 *   1. THE PALETTE IS DARK. That, and nothing else, is why a cut is not a
 *      flash. The general flash threshold needs an opposing relative-luminance
 *      change of >= 0.10 over more than 25% of the 10-degree visual field. The
 *      wipe (P.black) sits at luminance 0.0053, so a surface only becomes a
 *      flash against it at 0.1053; the nine surfaces run 0.0223 to 0.0649, so
 *      the worst of them (food-falls) clears the threshold by 1.62x. The AREA
 *      half is always met, at 12.6x, because the wipe covers the whole play
 *      rect on every viewport - so the luminance half is the only thing between
 *      this game and a 2.3.1 breach, and it was the one thing with no
 *      executable test. paletteSelfTest() in section 6 is now that test: a
 *      tenth surface at mid grey (0.2159) or Ticket Gold (0.4493) throws at
 *      load and the game does not run.
 *   2. THE GAP FLOORS BOUND THE CUT RATE. A cut costs one whole screen cycle,
 *      playMs + gapMs, and playMs has NO lower bound: MIN_SCREEN_MS is a
 *      timeout ceiling on the play phase, not a minimum, because a screen may
 *      resolve on its first update frame. So the gap is the entire bound, and
 *      with wipeMs and verdictHoldMs at zero the cut rate was measured at
 *      4.2/second, squarely inside the photosensitive band. MIN_WIPE_MS and
 *      MIN_VERDICT_HOLD_MS floor the gap at 420ms, i.e. 2.38 cuts/second, and
 *      selfTest() proves that under hostile tuning.
 *   3. ONE ledger. canFlash() below is the single global scheduler. Transitions
 *      and in-game effects draw from the same 3-per-second budget - screens do
 *      not get their own allowance, because nine independent 3/sec budgets is
 *      27/sec. A screen cannot paint a flash at all; it calls stage.flash() and
 *      the harness paints it, blooming inward from the play-rect edge, capped
 *      at Ticket Cream, never a full-canvas white-out, and never red.
 *   4. MIN_SCREEN_MS = 400 is still a hard floor on per-screen duration, on
 *      every loop, with screenDurationMs() the only path to a duration and a
 *      load-time self-test on it. It is a playability and legibility floor
 *      rather than the photosensitivity one it was described as.
 *
 * Under reduced motion canFlash() returns false unconditionally, the wipe stops
 * animating and every kinetic multiplier goes to zero through j(). Information
 * always stays; kinetics drop. NOTE that the reduced-motion gap is
 * verdictHoldMs alone (200ms, not 420ms), so the (2) bound there is 5/second
 * rather than 2.38, held under 3 in practice only by how long a screen takes to
 * resolve. Raising it would change shipped reduced-motion behaviour, so it is
 * recorded as an open item, not silently fixed.
 *
 * Set window.__mpxFlashAudit = [] before load to have the scheduler record
 * every granted flash for an empirical rate audit. Every figure above is
 * measured; the arithmetic and the instruments are in the R2 harness-invariants
 * record.
 */
(function () {
    'use strict';

    var GAME_ID = 'multiplex';
    var W = 400, H = 700;
    var HUD_H = GameEngine.HUD_HEIGHT;       // 48 - the engine paints over this band

    /* ============================================================
       1. PALETTE  (see the brand-deviation note above)
       ============================================================ */
    var P = {
        black:    '#12100F',   // Film Black    - frame, letterbox, wipe
        graphite: '#2B2622',   // Reel Graphite - sprocket backing plate
        curtain:  '#6E0F1A',   // Curtain Red   - static motifs, never strobed
        velvet:   '#A22337',   // Velvet Highlight - miss state, static
        gold:     '#D4AF37',   // Ticket Gold   - HUD accent only
        cream:    '#F3E9D2',   // Ticket Cream  - HUD text, brightest legal flash
        white:    '#FFFFFF',   // Marquee White - body text on every surface
        grey:     '#8C857D'    // Spotlight Grey - secondary UI text
    };

    /* Per-screen tints. Surface is the dark background, accents are the bright
       interactive elements. Gold and Cream are deliberately absent: they are
       reserved for the HUD so the interface never reads as another screen.
       Ordering below is the gauntlet order, and it is FIXED - the adjacent-hue
       separation (every consecutive pair at least 50 degrees apart) was verified
       against this sequence, so shuffling would void it. */
    var TINTS = {
        'food-falls':      { surface: '#2C4A6B', accent: '#EA8B4C' },
        'pivot':           { surface: '#4B2E7A', accent: '#F0C93F' },
        'sunnies-on':      { surface: '#163329', accent: '#2FBF6D' },
        'nothing-but-net': { surface: '#26346E', accent: '#E27339' },
        'the-chase':       { surface: '#234A34', accent: '#E6B31E' },
        'incoming':        { surface: '#1B2A4A', accent: '#E2483A', accent2: '#B8C4CE' },
        'dig':             { surface: '#3A2418', accent: '#8A9440', accent2: '#C9622A' },
        'make-the-gate':   { surface: '#47263A', accent: '#E8799E', accent2: '#6FA0D8' },
        'compact':         { surface: '#3A2A12', accent: '#D9A83A', accent2: '#A8C4D4' },

        /* Neutral slate for the reference screen. Deliberately unlike all nine
           so nobody mistakes it for a shipping surface. White on it is 11.2:1,
           the accent on it 3.9:1. */
        '_reference':      { surface: '#2A2E33', accent: '#7FA6C9' }
    };

    /* The gauntlet order. A screen slug missing from the registry is a build
       defect, reported loudly at start rather than silently skipped. */
    var ORDER = [
        'food-falls', 'pivot', 'sunnies-on', 'nothing-but-net', 'the-chase',
        'incoming', 'dig', 'make-the-gate', 'compact'
    ];

    /* The film each screen references, drawn under the stage title. This table
       IS the "make the references explicit" change: Jara played the live build
       and said the references were unclear, and the art alone does not fix that,
       because a player who has not seen a film cannot recognise a silhouette
       from it. Naming the film is the only thing that does. Authorisation, and
       the exposure it accepts, are section 0 of the explicit-references plan.

       The `title` column is not decoration. It is asserted against the screen's
       own registered title in register() below, so this table and the nine
       screens cannot drift apart silently; MICROGAME-CONTRACT.md section 14 is
       the tiebreaker if they ever disagree.

       FRIENDS is a television series, not a film, and is labelled so rather than
       quietly listed among them. LOVE ACTUALLY is an ASSUMPTION: the IP
       assessment tied make-the-gate to no single title, so being explicit
       required choosing one, and this is the one chosen. It is overridable on a
       word, and changing it means changing this row and nothing else.

       _reference has no row on purpose: it is the implementer's mark screen and
       never ships in the gauntlet. */
    var CREDITS = {
        'food-falls':      { title: 'FOOD FALLS',      film: 'CLOUDY WITH A CHANCE OF MEATBALLS (2009)' },
        'pivot':           { title: 'PIVOT!',          film: 'FRIENDS (TV, 1994)' },
        'sunnies-on':      { title: 'SUNNIES ON',      film: 'THE MATRIX (1999)' },
        'nothing-but-net': { title: 'NOTHING BUT NET', film: 'SPACE JAM (1996)' },
        'the-chase':       { title: 'SEEKER',          film: 'HARRY POTTER (2001)' },
        'incoming':        { title: 'ASSEMBLE',        film: 'THE AVENGERS (2012)' },
        'dig':             { title: 'DIG',             film: 'FANTASTIC MR FOX (2009)' },
        'make-the-gate':   { title: 'MAKE THE GATE',   film: 'LOVE ACTUALLY (2003)' },
        'compact':         { title: 'COMPACT',         film: 'WALL-E (2008)' }
    };

    /* A screen in the running order with no credit row would ship a blank
       second line rather than a loud failure, so it throws here instead. ORDER
       is known at load; the title half of the pair is checked in register(),
       which is the first moment both halves exist. */
    (function creditSelfTest() {
        for (var _i = 0; _i < ORDER.length; _i++) {
            if (!CREDITS[ORDER[_i]]) {
                throw new Error('MULTIPLEX: screen "' + ORDER[_i] + '" is in the running ' +
                    'order with no row in CREDITS, so it would name no film.');
            }
        }
    })();

    var F_UI = 'Arial, Helvetica, sans-serif';
    var F_DISPLAY = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';

    /* ============================================================
       2. GEOMETRY (logical px, 400 x 700)
       ============================================================ */
    var BAND_Y = HUD_H;                      // 48  - MULTIPLEX chrome band
    var BAND_H = 60;                         //       stage name, lives, timer rule
    var PLAY = { x: 12, y: 108, w: 376, h: 552 };
    var FOOT_Y = PLAY.y + PLAY.h;            // 660 - control hint strip
    var FOOT_H = H - FOOT_Y;                 // 40

    /* ============================================================
       3. THE FLOORS  -  not tunable, not comments
       ============================================================ */
    /* Per-screen duration may not drop below this on any loop. Nothing in this
       file reads a duration except through screenDurationMs(). Read the
       photosensitivity note at the top of this file before assuming what it
       buys: it is a TIMEOUT ceiling on the play phase, not a minimum, so it
       does NOT bound the cut rate. */
    var MIN_SCREEN_MS = 400;

    /* THE SAMPLE FLOOR: the game never advances more than one 60Hz step of GAME
       time per frame, however long the real frame took.
       ============================================================
       A player's control resolution is the number of times the game SAMPLES their
       input, and that is a frame count, not a duration. game-engine.js:377 clamps
       dt at 0.1, so at the engine's own worst permitted frame time a 400ms screen
       is FOUR frames. Four samples cannot be both precise and traversable at any
       step size: the input note further down proves the ramp cannot fix it,
       because KEY_RATE * 0.1 * 168 = 40.3px already equals the-chase's whole catch
       window at the SLOWEST possible step. That proof is correct, and it is also
       only half the problem. The other half is the sample count.

       Measured 2026-08-31 by the R6 blind census at dt = 0.1: pivot 57 to 63%,
       the-chase 55 to 62%, dig 60 to 64% of seeds unwinnable by keyboard at the
       floor loops, against 0.0% for pointer-strong on all 468 cells at the same
       dt. A gap that large between two control schemes, at a frame rate the engine
       explicitly permits, is an operability failure and not a difficulty setting.

       CAP THE CLOCK, NOT THE CONTENT, and that distinction was measured rather
       than reasoned. The first attempt at this fix floored the screen DURATION at
       24 frames instead, which is the same idea applied to the wrong quantity. It
       fixed the steered screens and made `incoming` far WORSE: 0% to 65% at the
       floor loops, because incoming sizes its arrival schedule off stage.timeLeft,
       so handing it a 2.4s budget scheduled five objects where 0.4s scheduled one,
       against a player who still had only 24 samples to answer them with. Every
       screen that sizes itself in seconds would have done the same thing to some
       degree. Stretching the clock instead leaves every screen bit-identical in
       content to its 60Hz self and gives the samples back on their own.

       INERT AT 60Hz BY CONSTRUCTION, not by luck: a 60Hz caller passes exactly
       1/60 and Math.min(1/60, 1/60) is 1/60, so no digest moves. Callers faster
       than 60Hz are untouched, since the cap is a maximum.

       THE COST, STATED. At 10 FPS the game runs at one sixth speed in real time:
       a floor screen takes 2.4 real seconds to play its 0.4 game-seconds, and the
       whole gauntlet takes six times as long on that device. It is slow motion,
       not a different game, and the alternative measured above is unplayable.
       Flash safety is unaffected in the safe direction: the ledger's window is
       game time, so a slowed clock emits FEWER flashes per real second. */
    var MAX_SIM_DT = 1 / 60;

    /* The 3-per-second ceiling of the WCAG 2.3.1 general flash threshold. ONE
       constant, shared by the flash ledger in canFlash() and by the cut-rate
       floors below, so the two can never drift apart. */
    var MAX_EVENTS_PER_SEC = 3;

    /* Cut-rate floors. A screen-to-screen cut costs one whole cycle,
       playMs + gapMs, and playMs has no lower bound (a screen may resolve on
       its first update frame), so the gap is the only thing that bounds the cut
       rate:
           cuts/sec <= 1000 / gapMs      gapMs = 2 * wipeMs + verdictHoldMs
       Holding cuts/sec at or under 3 therefore needs gapMs >= 1000/3 = 333.33.
       These two floors give 2*110 + 200 = 420ms, i.e. 2.38 cuts/second, a 1.26x
       margin. They are deliberately EQUAL to the shipped tuning values, on three
       requirements: hold the 3/second bound, leave shipped behaviour untouched,
       and never raise a worst case above what already ships. The 200 is FORCED by
       those; the 110 is CHOSEN CONSERVATIVELY from an admissible [67, 110], since
       the 3/second bound alone would permit any wipe floor at or above 66.67 once
       the hold is pinned at 200. Derivation, and why the top of that range: the R2
       harness-invariants record, section 2.3.
       Any lower pair of floors fails the third requirement. Raising either TUNING
       value is still free and always safe; lowering one now means editing a
       photosensitivity constant with its derivation next to it, which is exactly
       when the arithmetic should be re-run. */
    var MIN_WIPE_MS = 110;
    var MIN_VERDICT_HOLD_MS = 200;
    var MIN_GAP_MS = 1000 / MAX_EVENTS_PER_SEC;

    /* ============================================================
       4. TUNING  -  C2 owns every number in here
       ============================================================ */
    var TUNING = {
        lives: 3,

        /* Clock. Effective duration is baseScreenMs - loop * loopStepMs, clamped
           up to MIN_SCREEN_MS. Loop 0 is 5.0s, loop 1 is 4.4s, and the floor is
           reached at loop 8. */
        baseScreenMs: 5000,
        loopStepMs: 600,

        /* Difficulty handed to each screen as stage.difficulty, 0..1. */
        difficultyPerLoop: 0.18,

        /* Scoring. Provisional: measured values land here after the balance pass.
           points = (basePoints + speedBonusMax * fractionOfTimeLeft)
                    * min(streakCap, 1 + streak * streakStep)
                    * (1 + loop * loopBonus) */
        basePoints: 100,
        speedBonusMax: 60,
        streakStep: 0.15,
        streakCap: 2.5,
        loopBonus: 0.25,

        /* Transition. The wipe is a shape cue, not a luminance flip. Raising
           these lowers the cut rate, so they are safe upward and floored below. */
        wipeMs: 110,
        verdictHoldMs: 200,

        /* How long the big prompt verb sits over the play area. Capped at a
           third of the screen so it can never eat a short late-loop screen. */
        bannerMs: 600
    };

    /* The floor is exported read-only. TUNING.minScreenMs mirrors it and cannot
       be reassigned either, so an edit there fails loudly in strict mode rather
       than silently lowering the floor. */
    Object.defineProperty(TUNING, 'minScreenMs', {
        value: MIN_SCREEN_MS, writable: false, enumerable: true, configurable: false
    });

    /* The shipped lives count, captured here, before TUNING is exported on
       window.MULTIPLEX and so before anything can tamper with it. livesCount()
       falls back to this rather than to a duplicated literal. */
    var SAFE_LIVES = TUNING.lives;

    /**
     * The ONLY source of a per-screen duration. Clamps through MIN_SCREEN_MS and
     * survives nonsense tuning (a NaN would otherwise propagate through Math.max
     * and produce a screen that never ends).
     *
     * Frame rate does NOT enter here. The sample floor is applied to the clock in
     * advance(), so a screen is the same number of game-milliseconds at every
     * frame rate and this stays the pure loop -> ms function it always was.
     */
    function screenDurationMs(loop) {
        var d = TUNING.baseScreenMs - loop * TUNING.loopStepMs;
        if (!isFinite(d)) d = MIN_SCREEN_MS;
        return Math.max(MIN_SCREEN_MS, d);
    }

    /**
     * The ONLY sources of a gap timing, same shape and same guard as
     * screenDurationMs. Returning a NUMBER matters as much as the clamp does:
     * a raw TUNING.wipeMs of "5000" string-CONCATENATES in swapAt and hangs the
     * gauntlet forever, and a NaN or an Infinity makes every `G.gapT >= x` test
     * false forever, which is the same hang by a different route. Math.max
     * always returns a Number; clamp() would hand the string straight through.
     */
    function wipeMs() {
        var v = TUNING.wipeMs;
        if (!isFinite(v)) return MIN_WIPE_MS;
        return Math.max(MIN_WIPE_MS, v);
    }
    function verdictHoldMs() {
        var v = TUNING.verdictHoldMs;
        if (!isFinite(v)) return MIN_VERDICT_HOLD_MS;
        return Math.max(MIN_VERDICT_HOLD_MS, v);
    }
    /** Total gap length, and the quantity the cut rate is actually bounded by. */
    function gapDurationMs(rm) {
        return rm ? verdictHoldMs() : wipeMs() * 2 + verdictHoldMs();
    }

    /**
     * The ONLY source of a lives count. A non-finite value is not merely odd, it
     * is UNENDABLE: `G.lives <= 0` is false for NaN, and Infinity never
     * decrements to zero, so the run has no exit. A large FINITE value is left
     * alone on purpose - the headless census rigs raise lives to 1e6 to reach
     * the floor loop, and clamping that would silently change every gate - and
     * is bounded instead where it actually hurts, in drawBand's render loop.
     */
    function livesCount() {
        var v = TUNING.lives;
        return isFinite(v) ? +v : SAFE_LIVES;
    }

    /* Executable proof, at load, that both floors hold at an absurd loop count
       and under hostile tuning. If this ever throws, a floor has been defeated
       and the game must not run. */
    (function selfTest() {
        var keep = {
            b: TUNING.baseScreenMs, s: TUNING.loopStepMs,
            w: TUNING.wipeMs, v: TUNING.verdictHoldMs, l: TUNING.lives
        };
        var probes = [0, 1, 8, 50, 1e6];
        var hostile = [0, -1, NaN, Infinity, -Infinity, '5000', 'abc', null, undefined];
        var i;

        /* The screen-duration floor. */
        for (i = 0; i < probes.length; i++) {
            if (screenDurationMs(probes[i]) < MIN_SCREEN_MS) {
                throw new Error('MULTIPLEX: screen-duration floor defeated at loop ' + probes[i]);
            }
        }
        TUNING.baseScreenMs = NaN; TUNING.loopStepMs = 1e9;
        if (screenDurationMs(3) < MIN_SCREEN_MS) {
            throw new Error('MULTIPLEX: screen-duration floor defeated by non-finite tuning');
        }
        TUNING.baseScreenMs = keep.b; TUNING.loopStepMs = keep.s;

        /* The CUT RATE, which is what the gap floors exist for and what the
           screen floor above does not bound. Asserts the rate, not that the
           numbers are positive: a cut costs one whole cycle and the play phase
           can be a single frame, so cuts/sec <= 1000 / gapDurationMs(false).
           Driving every hostile value through the accessors also means a raw
           TUNING read reintroduced anywhere in this file fails here rather than
           in a player's browser. */
        function assertCutRate(label) {
            var gap = gapDurationMs(false);
            if (!(gap >= MIN_GAP_MS)) {       // !(>=) so a NaN gap fails too
                throw new Error('MULTIPLEX: cut rate ' + (1000 / gap).toFixed(2) +
                    '/second exceeds ' + MAX_EVENTS_PER_SEC + '/second (gap ' + gap +
                    'ms, floor ' + MIN_GAP_MS.toFixed(2) + 'ms) at ' + label);
            }
        }
        assertCutRate('the shipped tuning');
        for (i = 0; i < hostile.length; i++) {
            TUNING.wipeMs = hostile[i]; TUNING.verdictHoldMs = hostile[i];
            assertCutRate('wipeMs = verdictHoldMs = ' + String(hostile[i]));
        }
        TUNING.wipeMs = keep.w; TUNING.verdictHoldMs = keep.v;

        /* Two guards that were added as one-line fixes and had no test at all
           until a positive-control sweep pointed that out. Both are cheap and
           both fail closed. */
        if (clamp(NaN, 0, 1) !== 0) {
            throw new Error('MULTIPLEX: clamp() is not NaN-safe, so one NaN tuning value ' +
                'reaches stage.difficulty and every screen sizes itself with NaN');
        }
        for (i = 0; i < hostile.length; i++) {
            TUNING.lives = hostile[i];
            if (!isFinite(livesCount())) {
                throw new Error('MULTIPLEX: livesCount() returned ' + livesCount() +
                    ' for lives = ' + String(hostile[i]) + '; a non-finite lives count is ' +
                    'an unendable run, because G.lives <= 0 is never true');
            }
        }
        TUNING.lives = keep.l;
    })();

    /* ============================================================
       5. FLASH SCHEDULER - WCAG 2.3.1, max 3 per second, GLOBALLY
       ============================================================ */
    var RM = false;                          // reduced motion, read once at init
    function j(m) { return RM ? 0 : m; }     // one kinetic multiplier for everything

    var flashTimes = [];
    /**
     * The single ledger. Every flash source in the game passes through here:
     * the screen-to-screen transition, and every stage.flash() a microgame asks
     * for. There is deliberately no second scheduler anywhere.
     */
    function canFlash() {
        if (RM) return false;                // reduced motion: never strobe
        var now = performance.now();
        while (flashTimes.length && now - flashTimes[0] > 1000) flashTimes.shift();
        if (flashTimes.length >= MAX_EVENTS_PER_SEC) return false;
        flashTimes.push(now);
        if (window.__mpxFlashAudit) window.__mpxFlashAudit.push(now);
        return true;
    }

    /* ============================================================
       6. COLOUR HELPERS
       ============================================================ */
    var _rgbCache = {};
    function hx(hex) {
        var v = _rgbCache[hex];
        if (v) return v;
        var h = hex.replace('#', '');
        v = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        _rgbCache[hex] = v;
        return v;
    }
    function rgba(hex, a) {
        var c = hx(hex);
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    }
    function mix(a, b, t) {
        var x = hx(a), y = hx(b);
        return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
                        Math.round(x[1] + (y[1] - x[1]) * t) + ',' +
                        Math.round(x[2] + (y[2] - x[2]) * t) + ')';
    }
    /* NaN-safe by ordering, not by an extra branch: NaN fails `v >= lo` and
       falls to lo. The obvious `v < lo ? lo : v > hi ? hi : v` returns NaN for
       NaN, because both comparisons are false, and a single NaN there poisoned
       stage.difficulty and with it the sizing of all nine screens. */
    function clamp(v, lo, hi) { return v >= lo ? (v > hi ? hi : v) : lo; }

    /**
     * WCAG relative luminance from a hex literal. Same three lines as the
     * reference implementation, including the 0.03928 linearisation break rather
     * than the 0.04045 of the later erratum, so this agrees by construction with
     * the offline instrument that derived the bounds below (the R2 luminance
     * derivation).
     */
    function relLum(hex) {
        var c = hx(hex), k = [0.2126, 0.7152, 0.0722], out = 0, i, v;
        for (i = 0; i < 3; i++) {
            v = c[i] / 255;
            out += k[i] * (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        }
        return out;
    }

    /* Executable proof, at load, of the ONE invariant the photosensitivity
       compliance actually rests on: the palette is dark enough that a cut to the
       wipe is not a flash. Read the note at the top of this file for why this is
       the load-bearing test and the 400ms floor is not. It sits here rather than
       beside selfTest() only because it needs hx() from this section.

       Two bounds, and they differ on purpose:

         SURFACE   L < L(wipe) + 0.10, the general flash threshold delta, derived
                   from P.black so it moves if the wipe colour ever does. A
                   surface fills the play rect, so the AREA half of the threshold
                   is always met (12.6x) and the luminance half is the whole
                   defence. Measured worst case food-falls at 0.0649 against
                   0.1053, a 1.62x margin. A tenth surface at mid grey (0.2159)
                   or Ticket Gold (0.4493) throws.

         ACCENT    L <= L(P.cream). Accents are bright by design and all 14 of
                   them are ABOVE the surface bound, so that bound is not a legal
                   accent bound and applying it would stop the game running. What
                   an accent may not do is exceed the harness's own flash cap:
                   drawGlow paints at most Ticket Cream and never a full-canvas
                   white-out, so an accent brighter than Cream would put a bigger
                   luminance flip on the canvas, at the UNLIMITED cut rate, than a
                   rate-limited flash is permitted to. Worst case today is
                   pivot's #F0C93F at 0.6066 against 0.8199, a 1.35x margin.

       Iterating TINTS rather than ORDER is deliberate: it covers _reference and
       any future tenth entry, which is the case that made this test necessary. */
    (function paletteSelfTest() {
        var wipeL = relLum(P.black);
        var surfaceMax = wipeL + 0.10;
        var accentMax = relLum(P.cream);
        var roles = ['accent', 'accent2'];
        var slug, t, l, i;
        for (slug in TINTS) {
            if (!Object.prototype.hasOwnProperty.call(TINTS, slug)) continue;
            t = TINTS[slug];
            if (!t || typeof t.surface !== 'string') {
                throw new Error('MULTIPLEX: tint "' + slug + '" has no surface hex');
            }
            l = relLum(t.surface);
            if (!(l < surfaceMax)) {
                throw new Error('MULTIPLEX: screen surface "' + slug + '" ' + t.surface +
                    ' has relative luminance ' + l.toFixed(4) + ', at or above ' +
                    surfaceMax.toFixed(4) + '. A cut to the ' + P.black + ' wipe would be a ' +
                    'WCAG 2.3.1 flash, and the cut rate is not rate limited.');
            }
            for (i = 0; i < roles.length; i++) {
                if (t[roles[i]] == null) continue;
                l = relLum(t[roles[i]]);
                if (!(l <= accentMax)) {
                    throw new Error('MULTIPLEX: accent "' + slug + '.' + roles[i] + '" ' +
                        t[roles[i]] + ' has relative luminance ' + l.toFixed(4) +
                        ', brighter than Ticket Cream ' + P.cream + ' at ' +
                        accentMax.toFixed(4) + ', the brightest flash the harness will paint.');
                }
            }
        }
    })();

    /* ============================================================
       7. SEEDED RNG
       ============================================================
       Screens may not call Math.random. A seeded stream makes a balance run
       reproducible and lets a failure be replayed exactly, which is the whole
       reason the headless stepper below is usable. */
    var _seed = 0;
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ============================================================
       8. REGISTRY
       ============================================================ */
    var REGISTRY = {};
    var MISSING = [];

    /**
     * A microgame registers itself at load. Shape errors are thrown here, at
     * load, naming the slug, rather than surfacing as a blank screen mid-round.
     */
    function register(def) {
        if (!def || typeof def !== 'object') throw new Error('MULTIPLEX.register: no definition');
        var slug = def.slug;
        if (typeof slug !== 'string' || !slug) throw new Error('MULTIPLEX.register: missing slug');
        if (typeof def.update !== 'function') throw new Error('MULTIPLEX.register(' + slug + '): update must be a function');
        if (typeof def.draw !== 'function') throw new Error('MULTIPLEX.register(' + slug + '): draw must be a function');
        if (def.init != null && typeof def.init !== 'function') throw new Error('MULTIPLEX.register(' + slug + '): init must be a function');
        if (def.goal !== 'achieve' && def.goal !== 'survive') throw new Error('MULTIPLEX.register(' + slug + '): goal must be "achieve" or "survive"');
        if (typeof def.title !== 'string' || !def.title) throw new Error('MULTIPLEX.register(' + slug + '): missing title');
        if (typeof def.prompt !== 'string' || !def.prompt) throw new Error('MULTIPLEX.register(' + slug + '): missing prompt');
        if (typeof def.hint !== 'string' || !def.hint) throw new Error('MULTIPLEX.register(' + slug + '): missing hint');
        if (REGISTRY[slug]) throw new Error('MULTIPLEX.register(' + slug + '): already registered');
        /* The credit table names a title as well as a film, and this is the
           first moment both halves of that pair exist. Asserting it here is what
           makes the table a check rather than a duplicate: a screen renamed
           without updating CREDITS, or the reverse, fails at load naming the
           slug, instead of shipping a title and a film that disagree. */
        if (CREDITS[slug] && def.title !== CREDITS[slug].title) {
            throw new Error('MULTIPLEX.register(' + slug + '): title "' + def.title +
                '" does not match the credit table entry "' + CREDITS[slug].title +
                '". One of the two is stale. MICROGAME-CONTRACT.md section 14 decides.');
        }
        REGISTRY[slug] = def;
    }

    function runningOrder() {
        var out = [], i;

        /* Solo mode: index.html?only=<slug> runs one screen on repeat, so a
           screen can be built and played before the gauntlet is assembled. The
           loop counter still climbs, so the difficulty ramp is testable too. */
        var only = null;
        try { only = new URLSearchParams(window.location.search).get('only'); } catch (_) { only = null; }
        if (only && REGISTRY[only]) {
            console.info('MULTIPLEX: solo mode, running only "' + only + '"');
            MISSING.length = 0;
            return [only];
        }

        MISSING.length = 0;
        for (i = 0; i < ORDER.length; i++) {
            if (REGISTRY[ORDER[i]]) out.push(ORDER[i]);
            else MISSING.push(ORDER[i]);
        }
        if (MISSING.length) {
            console.error('MULTIPLEX: screen(s) not registered, gauntlet running short:', MISSING.join(', '));
        }
        return out;
    }

    /* ============================================================
       9. INPUT  -  one normalised control state for all nine verbs
       ============================================================
       Registered once, never removed, and gated on `live`. That removes the
       whole double-registration / leaked-listener class: a replay does not
       re-bind anything. Microgames never touch a listener; they read INPUT.

       axis is an ABSOLUTE position in -1..+1, not a rate, so pointer and
       keyboard drive the identical variable and every screen feels the same.
       A pointer sets it directly; keys ease it at KEY_RATE units/sec, or faster
       if the screen is too short for that. axisY is the same idea on the other
       axis, 0 meaning the vertical centre.

       ACCESSIBILITY - WCAG 2.1.1 KEYBOARD. A fixed rate is a fixed number of
       SECONDS to cross the axis, against a screen that shrinks 12.5x, so at 2.4
       units/sec a 2-unit sweep costs 17% of loop 0 and 208% of a 400ms screen:
       from loop 7 a keyboard player could not reach the far side of the play area
       at all, on any of the four axis-steered screens, which is a target that
       cannot be operated by keyboard rather than one that is merely hard. The
       sweep is therefore capped at KEY_SWEEP_FRAC of THIS screen's own duration,
       the same technique the screens use to size a requirement against
       stage.timeLeft. 0.35 is set by the other screens' arithmetic, not by taste:
       pivot floors its descent at 200ms (pivot.js, Math.max(0.2, ...)), so a
       sweep must fit inside that at the 400ms floor.

       WHY THE RATE RAMPS RATHER THAN JUMPING. A FLAT derived rate bought traverse
       and sold precision, and measurably made one screen worse. At the 400ms floor
       the derived rate is 2000 / (0.35 * 400) = 14.29 units/sec, so a single 60Hz
       frame moves the axis 0.238 units. On the-chase one axis unit is 168px, so a
       held frame jumped the marker 40.0px against a catch radius of 20px, i.e. a
       40px window: the reachable positions formed a lattice whose pitch equalled
       the window, and a keyboard player stepped clean over the target. That screen
       also needs 0.18s of CONTINUOUS contact, 11 frames at 60Hz, which is
       unreachable when every held frame crosses a whole window. So the rate eases
       from KEY_RATE to the derived rate over a ramp: a tap positions finely and
       only a sustained hold reaches traverse speed.

       FIRST FRAME, THE TRUE FIGURE: 0.0813 units, 13.7px on the-chase, about a
       third of the 40px catch window. This comment claimed 0.04 units and 6.7px
       until 2026-08-28. That is the k = 0 value, i.e. what the first frame WOULD
       move if easeAxis ran at the ramp's start, but updateInput does keyT += dt
       BEFORE calling easeAxis, so the first held frame is always one dt in and
       never at k = 0. The old figure understated the real step by 2.03x, and the
       headroom it invented is exactly what runs out below 60Hz.

       THE RAMP IS A FRAME COUNT, NOT A DURATION, and that is a fix rather than a
       flourish. Because the first frame sits at k = dt / ramp, a FIXED 0.08s ramp
       made the first step dt-dependent: measured at the 400ms floor, 13.7px at
       dt 1/60, 41.2px at 1/30, 82.6px at 0.05, and at the engine's 0.1 clamp the
       axis went 0 to +1 in ONE frame. Against a 40px window that is the flat-rate
       lattice this ramp exists to remove, back again from 30Hz down, i.e. a WCAG
       2.1.1 operability failure at frame rates game-engine.js:377 explicitly
       permits. Scaling the ramp by 60 * dt holds it at a constant ~4.8 frames
       instead, giving 13.7 / 27.3 / 41.0 / 81.9px across those same four rates.
       Bit-identical at 60Hz by construction, not by luck: 60 * (1/60) is exactly
       1.0 in IEEE 754, so Math.max(1, 60 * dt) * KEY_ACCEL_T === KEY_ACCEL_T.

       Cost, stated rather than hidden: a full edge-to-edge sweep at the floor is
       173ms, not the 140ms a flat derived rate gave, which still fits inside
       pivot's 200ms descent floor with 27ms spare. KEY_RATE remains the floor so
       the long early screens never get twitchier, where precision matters more
       than traverse. And the frame-count ramp costs traverse at coarse dt, so
       mid-loop screens that need a long reach get measurably harder there; the
       full before-and-after matrix is in the R2 harness-invariants record,
       section 12.

       NOT FIXABLE IN THE RAMP, and that part still stands: KEY_RATE * 0.1 * 168 =
       40.3px, so at the engine's dt clamp the SLOWEST possible keyboard step
       already equals the whole catch window. A per-frame cap tight enough to
       protect a 40px window makes the full-width traverse guarantee unreachable
       inside a 400ms screen at four frames.

       FIXED ELSEWHERE, 2026-08-31. The sentence above is a proof about the ramp,
       and it quietly assumes the frame is 0.1s of GAME time. It is not, any more:
       MAX_SIM_DT caps a simulated step at 1/60 however long the real frame took,
       so `KEY_RATE * 0.1` is no longer a step this code can produce. The slowest
       possible step is back to KEY_RATE / 60 = 6.7px at every frame rate, and the
       lattice the proof is about cannot form. Measured before and after in the
       2026-08-31 accessibility record. */
    var KEY_RATE = 2.4;
    var KEY_SWEEP_FRAC = 0.35;
    var KEY_ACCEL_T = 0.08;      // seconds of hold before the derived rate is reached
    var INPUT = {
        axis: 0, axisY: 0, held: false, holdT: 0,
        tapped: false, released: false,
        tapX: 0, tapY: 0
    };
    var keyDir = 0, keyDirY = 0, keyT = 0, keyTY = 0;
    var keyPress = false, live = false, bound = false;

    function resetInput() {
        INPUT.axis = 0; INPUT.axisY = 0; INPUT.held = false; INPUT.holdT = 0;
        INPUT.tapped = false; INPUT.released = false;
        INPUT.tapX = PLAY.w / 2; INPUT.tapY = PLAY.h / 2;
        keyDir = 0; keyDirY = 0; keyT = 0; keyTY = 0; keyPress = false;
    }

    function press(x, y) {
        if (!live) return;
        INPUT.held = true; INPUT.tapped = true; INPUT.holdT = 0;
        if (x != null) { INPUT.tapX = x; INPUT.tapY = y; }
    }
    function release() {
        if (!live || !INPUT.held) return;
        INPUT.held = false; INPUT.released = true;
    }

    function bindInput() {
        if (bound) return;
        bound = true;
        var el = GameEngine.canvas;

        /* Pointer x, mapped into the play rect and normalised to -1..+1. */
        function axisFromEvent(e) {
            var rect = el.getBoundingClientRect();
            if (!rect.width) return;
            var lx = (e.clientX - rect.left) * (W / rect.width);
            var ly = (e.clientY - rect.top) * (H / rect.height);
            INPUT.axis = clamp((lx - (PLAY.x + PLAY.w / 2)) / (PLAY.w / 2), -1, 1);
            /* Pointer and keyboard drive the SAME two variables, which is the
               property that makes a screen feel identical on both. */
            INPUT.axisY = clamp((ly - (PLAY.y + PLAY.h / 2)) / (PLAY.h / 2), -1, 1);
            INPUT.tapX = clamp(lx - PLAY.x, 0, PLAY.w);
            INPUT.tapY = clamp(ly - PLAY.y, 0, PLAY.h);
        }

        el.addEventListener('pointerdown', function (e) {
            if (!e.isPrimary) return;
            axisFromEvent(e);
            press(INPUT.tapX, INPUT.tapY);
        });
        el.addEventListener('pointermove', function (e) {
            if (!e.isPrimary) return;
            axisFromEvent(e);
        });
        el.addEventListener('pointerup', function (e) {
            if (!e.isPrimary) return;
            release();
        });
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);

        document.addEventListener('keydown', function (e) {
            if (!live || e.repeat) return;
            var k = e.key;
            if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keyDir = -1; }
            else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keyDir = 1; }
            /* WCAG 2.1.1. Up/down steer the SECOND axis rather than acting,
               because a keyboard press used to land at PLAY.h / 2 unconditionally
               and `incoming` measures distance in BOTH axes from the tap, spawning
               threats at any height: a keyboard player could aim in x and never in
               y, so a threat away from mid-height was unreachable by keyboard at
               all. Space and Enter carry the press alone now. */
            else if (k === 'ArrowUp' || k === 'w' || k === 'W') { keyDirY = -1; }
            else if (k === 'ArrowDown' || k === 's' || k === 'S') { keyDirY = 1; }
            else if (k === ' ' || k === 'Enter') {
                /* A keyboard press acts where the player has steered, on both
                   axes, so a tap-position screen plays the same on both control
                   schemes. axisY 0 reproduces the old PLAY.h / 2 exactly, which is
                   what makes this additive for the eight screens that ignore y. */
                if (!keyPress) {
                    keyPress = true;
                    press((INPUT.axis + 1) / 2 * PLAY.w, (INPUT.axisY + 1) / 2 * PLAY.h);
                }
            }
        });
        document.addEventListener('keyup', function (e) {
            if (!live) return;
            var k = e.key;
            if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && keyDir < 0) keyDir = 0;
            else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && keyDir > 0) keyDir = 0;
            else if ((k === 'ArrowUp' || k === 'w' || k === 'W') && keyDirY < 0) keyDirY = 0;
            else if ((k === 'ArrowDown' || k === 's' || k === 'S') && keyDirY > 0) keyDirY = 0;
            else if (k === ' ' || k === 'Enter') {
                keyPress = false; release();
            }
        });
        /* A tab-out mid-hold would otherwise leave held stuck true forever. */
        window.addEventListener('blur', function () {
            keyDir = 0; keyDirY = 0; keyPress = false; release();
        });
    }

    /* Eased key steering. See the KEY_ACCEL_T note in the block comment above for
       why this ramps instead of applying the derived rate flat. */
    function easeAxis(cur, dir, heldT, dt, full) {
        /* KEY_ACCEL_T is a 60Hz figure, so the ramp is scaled to hold a constant
           FRAME count at any frame time. See the block comment above. */
        var ramp = KEY_ACCEL_T * Math.max(1, 60 * dt);
        var k = ramp > 0 ? Math.min(1, heldT / ramp) : 1;
        return clamp(cur + dir * (KEY_RATE + (full - KEY_RATE) * k) * dt, -1, 1);
    }

    function updateInput(dt) {
        var full = Math.max(KEY_RATE, 2000 / (KEY_SWEEP_FRAC * G.screenMs));
        if (keyDir !== 0) {
            keyT += dt;
            INPUT.axis = easeAxis(INPUT.axis, keyDir, keyT, dt, full);
        } else { keyT = 0; }
        if (keyDirY !== 0) {
            keyTY += dt;
            INPUT.axisY = easeAxis(INPUT.axisY, keyDirY, keyTY, dt, full);
        } else { keyTY = 0; }
        if (INPUT.held) INPUT.holdT += dt; else INPUT.holdT = 0;
    }
    function clearEdges() { INPUT.tapped = false; INPUT.released = false; }

    /* ============================================================
       10. THE DRAWING FACADE  -  what a microgame paints through
       ============================================================
       A screen names a colour ROLE, never a hex, so it cannot leave the verified
       palette or break the contrast figures. It gets no image loading and no
       font control, which is also the trademark guard: there is no path here to
       blit an asset. stage.ctx is the escape hatch for real geometry, already
       clipped to the play rect and translated to its origin. */
    var stage = {
        w: PLAY.w, h: PLAY.h,
        ctx: null, mem: null,
        t: 0, timeLeft: 0, progress: 0,
        difficulty: 0, loop: 0, rm: false,
        input: INPUT,
        j: j
    };
    var _tint = TINTS['food-falls'];
    var _warned = {};

    function colour(role) {
        switch (role) {
            case 'surface': return _tint.surface;
            case 'deep':    return mix(_tint.surface, P.black, 0.5);
            case 'lift':    return mix(_tint.surface, P.white, 0.16);
            case 'accent':  return _tint.accent;
            case 'accent2': return _tint.accent2 || _tint.accent;
            case 'ink':     return P.white;
            case 'dim':     return P.grey;
        }
        if (!_warned[role]) {
            _warned[role] = true;
            console.warn('MULTIPLEX: unknown colour role "' + role + '", falling back to ink');
        }
        return P.white;
    }

    function paint(ctx, role, o, strokeDefault) {
        var a = (o && o.alpha != null) ? o.alpha : 1;
        var c = colour(role);
        /* An opts object without an explicit `stroke` must not silently flip a
           stroke-by-default shape (a line) into a fill of its own path, which
           draws nothing at all. */
        var stroked = (o && o.stroke != null) ? !!o.stroke : !!strokeDefault;
        if (stroked) {
            ctx.strokeStyle = a < 1 ? rgba(hex6(c), a) : c;
            ctx.lineWidth = (o && o.width) || 2;
            ctx.stroke();
        } else {
            ctx.fillStyle = a < 1 ? rgba(hex6(c), a) : c;
            ctx.fill();
        }
    }
    /* mix() returns rgb(), so alpha has to go through a converter that accepts
       both forms rather than assuming a hex literal. */
    function hex6(c) {
        if (c.charAt(0) === '#') return c;
        var m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return '#FFFFFF';
        function p(n) { var s = Number(n).toString(16); return s.length < 2 ? '0' + s : s; }
        return '#' + p(m[1]) + p(m[2]) + p(m[3]);
    }

    stage.rect = function (x, y, w, h, role, o) {
        var c = stage.ctx; c.beginPath(); c.rect(x, y, w, h); paint(c, role, o);
    };
    stage.roundRect = function (x, y, w, h, r, role, o) {
        var c = stage.ctx; GameEngine.drawRoundedRect(c, x, y, w, h, r); paint(c, role, o);
    };
    stage.circle = function (x, y, r, role, o) {
        var c = stage.ctx; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); paint(c, role, o);
    };
    stage.line = function (x1, y1, x2, y2, role, o) {
        var c = stage.ctx;
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
        c.lineCap = 'round';
        paint(c, role, o, true);
    };
    /** points is a FLAT array: [x1, y1, x2, y2, ...]. Closed automatically. */
    stage.poly = function (points, role, o) {
        var c = stage.ctx, i;
        if (!points || points.length < 6) return;
        c.beginPath(); c.moveTo(points[0], points[1]);
        for (i = 2; i < points.length - 1; i += 2) c.lineTo(points[i], points[i + 1]);
        c.closePath();
        paint(c, role, o);
    };
    /** o = { size, role, align, baseline, display, alpha } */
    stage.text = function (str, x, y, o) {
        var c = stage.ctx;
        o = o || {};
        var size = o.size || 16;
        var col = colour(o.role || 'ink');
        c.save();
        c.font = (o.display ? 'bold ' + size + 'px ' + F_DISPLAY : 'bold ' + size + 'px ' + F_UI);
        c.fillStyle = (o.alpha != null && o.alpha < 1) ? rgba(hex6(col), o.alpha) : col;
        c.textAlign = o.align || 'center';
        c.textBaseline = o.baseline || 'middle';
        c.fillText(String(str), x, y);
        c.restore();
    };

    /* Non-drawing services. flash() is a REQUEST, not a paint: the harness owns
       the pixels so no screen can white out the canvas or flash red. */
    stage.flash = function (intensity) {
        if (!G) return false;
        /* Reduced motion gets NO bloom, not a quieter one. The soft fallback
           below exists for a flash the rate limiter turned down, where the
           player is not photosensitive and a sub-threshold glow is the graceful
           degradation. Applying it under reduced motion would put a decaying
           luminance change on the one path that promised none. A screen that
           loses its flash here still reads: the contract requires every
           success and failure to carry a shape cue as well. */
        if (RM) return false;
        if (!canFlash()) { G.glow = Math.max(G.glow, 0.24); return false; }
        G.glow = clamp(intensity == null ? 0.8 : intensity, 0, 1);
        return true;
    };
    stage.shake = function (px) { if (G) G.shake = Math.max(G.shake, j(px || 4)); };
    stage.rand = function () { return G ? G.rand() : Math.random(); };

    /* ============================================================
       11. GAUNTLET STATE MACHINE
       ============================================================ */
    var G = null;
    var RUN = [];

    function newGauntlet() {
        RUN = runningOrder();
        if (!RUN.length) throw new Error('MULTIPLEX: no microgames registered');
        G = {
            loop: 0, index: 0, lives: livesCount(), streak: 0, cleared: 0,
            phase: 'play',                   // 'play' | 'gap'
            screen: null, mem: null, tint: null,
            screenMs: 0, elapsed: 0, verdict: null, gapVerdict: null,
            gapT: 0, gapMs: 0, swapped: false, armInput: false,
            banner: 0, glow: 0, shake: 0,
            rand: mulberry32(_seed)
        };
        resetInput();
        enterScreen();
    }

    function enterScreen() {
        var slug = RUN[G.index];
        var def = REGISTRY[slug];
        G.screen = def;
        G.tint = TINTS[slug] || TINTS['food-falls'];
        _tint = G.tint;
        G.screenMs = screenDurationMs(G.loop);
        G.elapsed = 0;
        G.verdict = null;
        /* Consumed on this screen's first play frame, not here: enterScreen runs
           mid-gap, and a press or a release landing between the last gap frame
           and the first play frame would otherwise survive into the new screen. */
        G.armInput = true;
        G.banner = Math.min(TUNING.bannerMs, G.screenMs * 0.33);
        G.rand = mulberry32((_seed + G.loop * 977 + G.index * 31) | 0);

        stage.mem = {};
        stage.t = 0;
        stage.timeLeft = G.screenMs / 1000;
        stage.progress = 0;
        stage.loop = G.loop;
        stage.difficulty = clamp(G.loop * TUNING.difficultyPerLoop, 0, 1);
        stage.rm = RM;

        /* init may either mutate stage.mem or return a fresh state object. The
           returned form is preferred, and is why a screen never needs module
           level mutable state - there is nowhere for it to leak to. */
        if (def.init) {
            var r = def.init(stage);
            if (r && typeof r === 'object') stage.mem = r;
        }
        G.mem = stage.mem;
    }

    function finishScreen(verdict) {
        if (G.verdict) return;               // first verdict wins, always
        G.verdict = verdict;
        /* Held separately because the incoming screen resets G.verdict halfway
           through the hold, and the outcome must stay on screen for all of it. */
        G.gapVerdict = verdict;
        G.phase = 'gap';
        G.gapT = 0;
        G.gapMs = gapDurationMs(RM);
        G.swapped = false;

        if (verdict === 'win') {
            G.cleared++;
            G.streak++;
            GameEngine.state.score += screenPoints();
        } else {
            G.streak = 0;
            G.lives--;
        }
    }

    function screenPoints() {
        var left = clamp(1 - G.elapsed / G.screenMs, 0, 1);
        var streakMult = Math.min(TUNING.streakCap, 1 + G.streak * TUNING.streakStep);
        var loopMult = 1 + G.loop * TUNING.loopBonus;
        return Math.round((TUNING.basePoints + TUNING.speedBonusMax * left) * streakMult * loopMult);
    }

    function advanceIndex() {
        G.index++;
        if (G.index >= RUN.length) { G.index = 0; G.loop++; }
    }

    /**
     * One step of the whole gauntlet. Pure with respect to wall-clock time: it
     * reads nothing but dt, so a balance run can drive it at any rate with no
     * animation frame. MULTIPLEX.advance exposes it for exactly that.
     */
    function advance(dt) {
        if (!G) return;
        /* THE SAMPLE FLOOR. See the MAX_SIM_DT note. Applied once, here, at the
           single entry point every frame goes through, so no later line in this
           file or in any microgame can see an uncapped dt. A non-finite or
           negative dt becomes a zero-length frame rather than being propagated
           (NaN would poison stage.t and every `>=` test against it forever) and
           rather than an early return, so a dt of 0 still processes and clears
           input edges exactly as it did before. */
        if (!isFinite(dt) || dt < 0) dt = 0;
        if (dt > MAX_SIM_DT) dt = MAX_SIM_DT;
        updateInput(dt);

        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
        if (G.glow > 0) G.glow = Math.max(0, G.glow - dt * 3.2);

        if (G.phase === 'play') {
            /* First frame of a screen: drop the press state carried across the
               cut. A hold that began on the previous screen is not this screen's
               input, and leaving it in place let a player who simply never let go
               arrive at a hold-and-release screen already past its charge time
               and lose on frame one, having pressed nothing here at all. The
               edges go too, which closes the one-frame race where a pointerup
               landing after the last gap frame read as a release on this one.
               axis SURVIVES: it is an absolute position, not an event, and it is
               where the player is still pointing. */
            if (G.armInput) {
                G.armInput = false;
                INPUT.held = false;
                INPUT.holdT = 0;
                clearEdges();
            }

            G.elapsed += dt * 1000;
            if (G.banner > 0) G.banner = Math.max(0, G.banner - dt * 1000);

            stage.t = G.elapsed / 1000;
            stage.timeLeft = Math.max(0, (G.screenMs - G.elapsed) / 1000);
            stage.progress = clamp(G.elapsed / G.screenMs, 0, 1);
            stage.mem = G.mem;

            var out = G.screen.update(dt, stage);
            clearEdges();

            if (out === 'win' || out === 'lose') {
                finishScreen(out);
            } else if (G.elapsed >= G.screenMs) {
                /* Timeout resolves by the screen's declared goal: an "achieve"
                   screen wanted something done and did not get it; a "survive"
                   screen wanted the clock run out. Declaring this in the
                   registration removes a whole class of off-by-one verdict bug
                   from nine separate implementations. */
                finishScreen(G.screen.goal === 'survive' ? 'win' : 'lose');
            }
            return;
        }

        /* 'gap': wipe out, hold (the cut happens here, hidden), wipe in. */
        G.gapT += dt * 1000;
        clearEdges();

        var swapAt = RM ? verdictHoldMs() * 0.5 : wipeMs() + verdictHoldMs() * 0.5;
        if (!G.swapped && G.gapT >= swapAt) {
            G.swapped = true;
            if (G.lives <= 0) return;        // hold the covered frame, end below
            advanceIndex();
            enterScreen();
            /* ONE ledger charge for the cut itself. The wipe always plays: the
               shape channel is not optional. Only the incoming screen's entry
               pop is gated, so a spent budget costs sparkle, never clarity. */
            if (canFlash()) G.glow = 0.55;
        }

        if (G.gapT >= G.gapMs) {
            if (G.lives <= 0) { GameEngine.endGame(); return; }
            G.phase = 'play';
        }
    }

    /* ============================================================
       12. RENDER
       ============================================================ */
    function draw(ctx) {
        if (!G) return;

        /* Frame and letterbox. The engine repaints the top 48px afterwards. */
        ctx.fillStyle = P.black;
        ctx.fillRect(0, 0, W, H);

        drawSprockets(ctx);

        /* Math.random, not the seeded stream: draw() must not consume the
           simulation's RNG or a rendered run and a headless run would diverge,
           and a replayed failure would not reproduce. */
        var shakeX = 0, shakeY = 0;
        if (G.shake > 0) {
            shakeX = (Math.random() - 0.5) * G.shake;
            shakeY = (Math.random() - 0.5) * G.shake;
        }

        /* The play rect. Clip first (canvas coords), then translate, so a screen
           cannot paint over the chrome and cannot see the shake in its own
           coordinates. The outer restore repairs any state a screen leaves. */
        ctx.save();
        ctx.beginPath();
        ctx.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
        ctx.clip();
        ctx.translate(PLAY.x + shakeX, PLAY.y + shakeY);

        _tint = G.tint;
        ctx.fillStyle = G.tint.surface;
        ctx.fillRect(-PLAY.x, -PLAY.y, W + PLAY.w, H + PLAY.h);

        stage.ctx = ctx;
        stage.mem = G.mem;
        G.screen.draw(stage);
        stage.ctx = null;

        ctx.restore();

        drawGlow(ctx);
        if (G.phase === 'play' && G.banner > 0) drawBanner(ctx);
        if (G.phase === 'gap') drawGap(ctx);

        drawBand(ctx);
        drawFoot(ctx);
    }

    /* Film-strip gutters. Static: a scrolling sprocket run would be a second
       motion source for no information gain. */
    function drawSprockets(ctx) {
        var y, holeH = 14, gap = 12;
        ctx.fillStyle = P.graphite;
        ctx.fillRect(0, PLAY.y, PLAY.x, PLAY.h);
        ctx.fillRect(PLAY.x + PLAY.w, PLAY.y, W - PLAY.x - PLAY.w, PLAY.h);
        ctx.fillStyle = P.black;
        for (y = PLAY.y + 8; y < PLAY.y + PLAY.h - holeH; y += holeH + gap) {
            GameEngine.drawRoundedRect(ctx, 3, y, 6, holeH, 2); ctx.fill();
            GameEngine.drawRoundedRect(ctx, W - 9, y, 6, holeH, 2); ctx.fill();
        }
    }

    /* Edge bloom, never a full-canvas white-out, capped at Ticket Cream, and
       never red. This is the ONLY place a flash is painted. */
    function drawGlow(ctx) {
        if (G.glow <= 0.01) return;
        var a = G.glow * 0.5;
        var grad = ctx.createLinearGradient(0, PLAY.y, 0, PLAY.y + PLAY.h);
        grad.addColorStop(0, rgba(P.cream, a));
        grad.addColorStop(0.35, rgba(P.cream, 0));
        grad.addColorStop(0.65, rgba(P.cream, 0));
        grad.addColorStop(1, rgba(P.cream, a));
        ctx.fillStyle = grad;
        ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
    }

    function drawBanner(ctx) {
        var k = clamp(G.banner / Math.max(1, Math.min(TUNING.bannerMs, G.screenMs * 0.33)), 0, 1);
        var a = RM ? 1 : Math.min(1, k * 2.2);
        var cy = PLAY.y + PLAY.h * 0.42;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = rgba(P.black, 0.55);
        ctx.fillRect(PLAY.x, cy - 30, PLAY.w, 60);
        ctx.font = 'bold 34px ' + F_DISPLAY;
        ctx.fillStyle = P.cream;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(G.screen.prompt, W / 2, cy);
        ctx.restore();
    }

    /* Shutter-blade wipe in Film Black. A directional wipe, not a luminance
       flip, and it carries the verdict as a SHAPE so the outcome reads with no
       colour and no motion at all. */
    function drawGap(ctx) {
        /* Read once per frame, through the accessors, so the cover ramp cannot
           disagree with the swapAt and gapMs the state machine used. */
        var cover, wm = wipeMs(), vh = verdictHoldMs();
        if (RM) {
            cover = 1;
        } else if (G.gapT < wm) {
            cover = G.gapT / wm;
        } else if (G.gapT < wm + vh) {
            cover = 1;
        } else {
            cover = clamp(1 - (G.gapT - wm - vh) / wm, 0, 1);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
        ctx.clip();

        var blades = 6, bh = PLAY.h / blades, i, y, w = PLAY.w * cover;
        ctx.fillStyle = P.black;
        for (i = 0; i < blades; i++) {
            y = PLAY.y + i * bh;
            if (i % 2 === 0) ctx.fillRect(PLAY.x, y, w, bh + 1);
            else ctx.fillRect(PLAY.x + PLAY.w - w, y, w, bh + 1);
        }

        if (cover > 0.92) {
            var cx = W / 2, cy = PLAY.y + PLAY.h / 2;
            var win = G.gapVerdict === 'win';
            ctx.strokeStyle = win ? P.gold : P.velvet;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (win) {                       // tick
                ctx.moveTo(cx - 22, cy);
                ctx.lineTo(cx - 6, cy + 17);
                ctx.lineTo(cx + 24, cy - 18);
            } else {                         // cross
                ctx.moveTo(cx - 18, cy - 18); ctx.lineTo(cx + 18, cy + 18);
                ctx.moveTo(cx + 18, cy - 18); ctx.lineTo(cx - 18, cy + 18);
            }
            ctx.stroke();

            ctx.font = 'bold 13px ' + F_UI;
            ctx.fillStyle = P.cream;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(win ? 'CLEARED' : (G.lives > 0 ? 'MISSED' : 'OUT'), cx, cy + 46);
        }
        ctx.restore();
    }

    /* The credit is up to 40 characters against a 400px canvas, so its size is
       MEASURED rather than eyeballed, and measured PER STRING: one long film
       title is not allowed to shrink the other eight, and truncating with an
       ellipsis is not an option, because the film name is the entire message.
       11px is the preferred size and the loop only ever comes down from it.

       Cached per string. Both the string set and the font are fixed for the life
       of the page, so this measures nine times, not once a frame.

       7px is a legibility floor, not a fitting floor: below it the line is
       unreadable and the change defeats itself, so a string that still does not
       fit is reported rather than silently squeezed. The fix for that is the
       plan's own order of preference: drop the year, then shorten the title. */
    var CREDIT_MAX_W = W - 28;           // the timer rule's own left/right margins
    var CREDIT_MIN_PX = 7;
    var _creditSize = {}, _creditWarned = {};
    function creditSize(ctx, str) {
        if (_creditSize[str]) return _creditSize[str];
        var size = 11;
        ctx.font = 'bold ' + size + 'px ' + F_UI;
        while (size > CREDIT_MIN_PX && ctx.measureText(str).width > CREDIT_MAX_W) {
            size -= 0.5;
            ctx.font = 'bold ' + size + 'px ' + F_UI;
        }
        if (ctx.measureText(str).width > CREDIT_MAX_W && !_creditWarned[str]) {
            _creditWarned[str] = true;
            console.warn('MULTIPLEX: film credit "' + str + '" does not fit ' + CREDIT_MAX_W +
                'px at the ' + CREDIT_MIN_PX + 'px legibility floor. Drop the year or ' +
                'shorten the title; do not truncate it.');
        }
        _creditSize[str] = size;
        return size;
    }

    /* The MULTIPLEX chrome band, immediately under the engine's HUD. Gold and
       cream live here and nowhere else, so the interface never reads as a tenth
       screen. */
    function drawBand(ctx) {
        ctx.save();
        ctx.fillStyle = P.black;
        ctx.fillRect(0, BAND_Y, W, BAND_H);
        ctx.fillStyle = rgba(P.graphite, 0.9);
        ctx.fillRect(0, BAND_Y, W, 1);

        ctx.font = 'bold 17px ' + F_DISPLAY;
        ctx.fillStyle = P.cream;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(G.screen.title, W / 2, BAND_Y + 20);

        /* The film credit, a second line directly under the stage title. It sits
           here, persistent for the whole screen, rather than in the 420ms
           transition where nobody could read it - and putting it there would
           also have meant lengthening the gap, which R2 has just floored against
           a photosensitivity argument.

           It is chrome, not play: the wipe clips to PLAY, so this line never
           takes part in a cut and contributes nothing to the flashing-area
           budget the art lanes work against. The gold is #D4AF37 on #12100F,
           9.0:1, so an 11px line clears WCAG AA for normal text with margin. */
        var _credit = CREDITS[G.screen.slug];
        if (_credit) {
            ctx.font = 'bold ' + creditSize(ctx, _credit.film) + 'px ' + F_UI;
            ctx.fillStyle = P.gold;
            ctx.fillText(_credit.film, W / 2, BAND_Y + 37);
        }

        /* Lives as ticket stubs. Shape and fill both change, so the state does
           not depend on colour alone. The stub COUNT is bounded because this
           loop runs inside requestAnimationFrame: a hostile lives of 1e9 is a
           frozen tab, not a long band (measured). 16 is the stub pitch and the
           right margin, so (W - 16) / 16 = 24 stubs is the most that fit before
           the first one leaves the canvas. livesCount() carries the non-finite
           guard; this carries the finite-but-absurd one. */
        var i, pips = clamp(livesCount(), 0, (W - 16) / 16), sy = BAND_Y + 13;
        var sx = W - 16 - (pips * 16);
        for (i = 0; i < pips; i++) {
            var x = sx + i * 16;
            GameEngine.drawRoundedRect(ctx, x, sy, 12, 14, 2);
            if (i < G.lives) { ctx.fillStyle = P.gold; ctx.fill(); }
            else { ctx.strokeStyle = rgba(P.gold, 0.35); ctx.lineWidth = 1.5; ctx.stroke(); }
        }

        ctx.font = 'bold 11px ' + F_UI;
        ctx.fillStyle = P.grey;
        ctx.textAlign = 'left';
        ctx.fillText('LOOP ' + (G.loop + 1), 14, BAND_Y + 20);

        /* Timer rule. Drains left to right; frozen full during the gap so it
           never reads as a live clock while nothing is playable. */
        var frac = G.phase === 'play' ? clamp(1 - G.elapsed / G.screenMs, 0, 1) : 0;
        var ry = BAND_Y + BAND_H - 14;
        ctx.fillStyle = rgba(P.graphite, 1);
        ctx.fillRect(14, ry, W - 28, 6);
        ctx.fillStyle = frac < 0.25 ? P.velvet : P.gold;
        ctx.fillRect(14, ry, (W - 28) * frac, 6);
        ctx.restore();
    }

    function drawFoot(ctx) {
        ctx.save();
        ctx.fillStyle = P.black;
        ctx.fillRect(0, FOOT_Y, W, FOOT_H);
        ctx.font = '11px ' + F_UI;
        ctx.fillStyle = P.grey;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(G.screen.hint, W / 2, FOOT_Y + FOOT_H / 2 - 4);
        ctx.font = 'bold 10px ' + F_UI;
        ctx.fillStyle = rgba(P.grey, 0.75);
        ctx.fillText('CLEARED ' + G.cleared, W / 2, FOOT_Y + FOOT_H / 2 + 11);
        ctx.restore();
    }

    /* ============================================================
       13. ENGINE WIRING
       ============================================================ */
    var INSTRUCTIONS = {
        title: 'MULTIPLEX',
        objective: 'Nine screens, one move each, a few seconds apiece. Clear the screen before the rule runs out. Three lives. Every pass through the nine runs faster than the last.',
        controls: [
            'Drag, or use the arrow keys, to steer',
            'Tap, click or press SPACE to act',
            'Hold and let go where a screen asks for it'
        ],
        tip: 'Read the word that flashes up. It is the whole instruction.'
    };

    function onInit() {
        RM = GameEngine.prefersReducedMotion();
        stage.rm = RM;
        flashTimes.length = 0;
        GameEngine.setupInput({});           // inherits ESC-pause and scroll suppression
        newGauntlet();
    }

    /* Input goes live only after the countdown. onInit runs BEFORE the engine's
       instructions overlay, and that overlay starts the game on Space: going
       live any earlier hands the first screen a phantom tap on its first frame. */
    function onCountdownComplete() {
        resetInput();
        live = true;
    }

    function onUpdate(dt) {
        if (GameEngine.state.paused) return;
        advance(dt);
    }

    function onDraw(ctx) { draw(ctx); }

    function onGameOver() { live = false; }

    function onReset() { live = false; G = null; resetInput(); }

    function start() {
        GameEngine.startGame(GAME_ID, {
            onInit: onInit,
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: onGameOver,
            onReset: onReset,
            onCountdownComplete: onCountdownComplete,
            instructions: INSTRUCTIONS
        });
    }

    function boot() {
        GameEngine.initCanvas('game-container', {
            width: W, height: H, maxWidth: 460, background: P.black
        });
        bindInput();
        start();
    }

    /* ============================================================
       14. PUBLIC SURFACE
       ============================================================ */
    var MULTIPLEX = {
        register: register,
        TUNING: TUNING,
        ORDER: ORDER.slice(),
        TINTS: TINTS,
        PALETTE: P,
        PLAY: { x: PLAY.x, y: PLAY.y, w: PLAY.w, h: PLAY.h },
        screenDurationMs: screenDurationMs,
        canFlash: canFlash,

        /** Fix the RNG stream. Call before the round starts for a reproducible run. */
        seed: function (n) { _seed = n | 0; },

        /** Headless step, for a balance or verification harness: no animation
         *  frame, no drawing, any dt. Drive INPUT through MULTIPLEX.input. */
        advance: advance,
        input: INPUT,

        /** Snapshot for assertions. Deliberately a copy. */
        state: function () {
            if (!G) return null;
            return {
                loop: G.loop, index: G.index, slug: RUN[G.index] || null,
                lives: G.lives, streak: G.streak, cleared: G.cleared,
                phase: G.phase, verdict: G.verdict,
                screenMs: G.screenMs, elapsed: G.elapsed,
                score: GameEngine.state.score
            };
        },
        missing: function () { return MISSING.slice(); },
        registered: function () { return Object.keys(REGISTRY); }
    };
    Object.defineProperty(MULTIPLEX, 'MIN_SCREEN_MS', {
        value: MIN_SCREEN_MS, writable: false, enumerable: true, configurable: false
    });

    /* Exposed for the same reason MIN_SCREEN_MS is: an instrument that predicts
       where the game will be on the next frame has to know how much game time a
       frame actually buys, and the honest way to tell it is to publish the number
       rather than let it copy a literal. A headless rig that models t + dt with
       the dt IT passed is now wrong by up to 6x, which shows up as a pure timing
       screen reading 100% unwinnable while every position screen improves. */
    Object.defineProperty(MULTIPLEX, 'MAX_SIM_DT', {
        value: MAX_SIM_DT, writable: false, enumerable: true, configurable: false
    });

    window.MULTIPLEX = MULTIPLEX;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
