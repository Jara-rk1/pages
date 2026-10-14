/**
 * Ghosts on Mute
 * KPMG Newsletter Minigame, Spooktober 2026 (edition slot 2026-11).
 *
 * Everyone's mic is haunted. Tap a haunted tile to mute the ghost before it
 * spreads, leave the presenter alone, and keep the call calm for 60 seconds.
 *
 * This file is the glue only: engine setup, input gating, keyboard focus,
 * hit-testing, events to effects and sounds, the COPY block, reduced motion,
 * the page-local HUD and the test hooks. Rules live in model.js (pure), the
 * look in art.js (canvas only).
 *
 * ---------------------------------------------------------------------------
 * PALETTE (decision D2, 2026-10-13): the newsletter's own, not KPMG's. The newsletter
 * is not KPMG branded, so no exception request; brand_validator.py flags these
 * hexes and that is expected. Declared set, also in
 * docs/decisions/2026-10-13-ghosts-on-mute-palette.md:
 *   INK #151726, PLUM #462B41, LILAC #EDDCF3, LAVENDER #EEECFA, PERIWINKLE #AFB7D1,
 *   PUMPKIN #F2882D, GHOST #ECECEC, CREAM #C0B19B, MAUVE #6E6463.
 * WCAG text contrast is measured in art.js and index.html, where the pairs are drawn.
 * ---------------------------------------------------------------------------
 * view passed to GOMArt.draw: { now (ms, performance.now), rm (bool), focus (tile
 * index or -1), fx (array of { type, tile, kind, flash, points, onset, t0 (ms) }, newest
 * last, pruned after FX_TTL_MS; onset is the model's ledger ask id, shared by a pair or
 * one reply-all spread), copy (COPY), live (bool: input open), roundS (TUNING.ROUND_S) }.
 * fx types: the model's step events ('spawn','expire','hop','spread','leave',
 * 'presenter' (rotation),'glitch','end'); per tap, a 'tap' (press) plus the result
 * as its own type: 'mute','echo','pair','miss', or 'oops' for a presenter tap.
 */
(function () {
    'use strict';

    var GAME_ID = 'ghosts-on-mute';
    var W = 400, H = 700;
    var COLS = 3, ROWS = 4, TILES = COLS * ROWS;
    var FX_TTL_MS = 1500;
    // the G4 ceiling: equals init_db.py ghosts-on-mute max_score and model.oracle().maxScore (seeds 1-1000)
    var RANK_CEILING = 42500;

    /* ============================================================
       COPY (W3 copy lane owns this block)
       Display strings (drawn in Bebas Neue) use only A-Z a-z 0-9 space ' ! . , / + - :
       (the vendored subset, G15). No names, no trademarks, no em or en dashes.
       ============================================================ */
    var COPY = {
        // art.js reads title (the call bar), presenting, glitch and handles
        title: 'Spooktober catch-up',
        presenting: 'Presenting',
        glitch: 'Mercury glitch!',
        handles: [
            'Balcony', 'Kitchen', 'Cat nap', 'Loft desk',
            'Big mug', 'Garden', 'Tea time', 'Cuppa',
            'Dial-in', 'Early bird', 'Night owl', 'Hallway'
        ],
        captions: {
            mute: 'Muted!',
            echo: 'Echo muted',
            pair: 'No, you go ahead!',
            presenter: 'Oops, they were presenting',
            replyAll: 'Echo burst',
            laugh: 'Giggle ghost',
            calmLow: 'Keep it calm',
            dropped: 'The call dropped',
            calm: 'Calm',
            secondsLeft: 'Left'
        },
        // lowest to highest; each band is a fifth of RANK_CEILING
        ranks: [
            { title: 'The Reborn Phantom', line: 'Gentle start. The ghosts had a lovely time.' },
            { title: 'The Crypt Keeper', line: 'You kept the call tidy. The crypt, tidier.' },
            { title: 'The Mad Scientist', line: 'Muting at speed. It is alive, and quiet.' },
            { title: 'The Monster Mash Organizer', line: 'Everyone got a turn to speak. Even the ghosts.' },
            { title: 'The Underworld Sovereign', line: 'Not a whisper out of place. Lovely work.' }
        ],
        instructions: {
            title: 'GHOSTS ON MUTE',
            objective: "Enjoy this edition's game. Everyone's mic is haunted, so help them out: mute each ghost before it drifts to the next caller. Keep the call calm for 60 seconds.",
            controls: [
                'Tap or click a haunted tile to mute its ghost (arrow keys and Space work too)',
                'Leave the presenter alone: a wrong tap only resets your streak'
            ],
            legend: {
                collect: [
                    { icon: '\u{1F47B}', label: 'Haunted mic', points: '100' },
                    { icon: '\u{1F46F}', label: 'Pair, both quick', points: '100' },
                    { icon: '\u{1F602}', label: 'Giggle ghost', points: '150' }
                ],
                avoid: [
                    { icon: '\u{1F5A5}\u{FE0F}', label: 'The presenter' },
                    { icon: '\u{231B}', label: 'Lingering ghosts' }
                ]
            },
            tip: 'Quick mutes score more and build a streak. A ghost left too long costs Calm and hops to a neighbour.'
        }
    };

    // every Bebas string, for the G15 glyph gate and the copy checker
    function displayStrings() {
        var c = COPY.captions;
        return [COPY.title, COPY.instructions.title, COPY.presenting, COPY.glitch,
            c.mute, c.echo, c.pair, c.presenter, c.replyAll, c.laugh, c.calmLow, c.dropped, c.calm, c.secondsLeft]
            .concat(COPY.ranks.map(function (r) { return r.title; }))
            .concat(COUNTDOWN_STEPS, [PAUSED_LABEL]);
    }

    /* ============================================================
       STATE
       ============================================================ */
    // engine overlay strings drawn in Bebas by the page-local overrides (not copy-lane text)
    var COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'];
    var PAUSED_LABEL = 'PAUSED';
    var NS = window.GhostsOnMute = window.GhostsOnMute || {};   // model.js attaches .MODEL first
    var MODEL = NS.MODEL;
    var round = null;          // model state
    var nextSeed = null;       // set by .seed(n); consumed by the next round
    var live = false;          // input open: after the countdown, until the end
    var finished = false;      // endGame called for this round
    var skipTap = false;       // one-frame flag: swallow the engine's synthetic Space/Enter tap
    var focus = -1;            // keyboard focus tile, -1 until a key is used
    var fx = [];
    var rm = GameEngine.prefersReducedMotion();   // true from page load, not only from the first round

    /* ---- reduced motion: read now, follow the media query live ---- */
    var rmQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function readRM() { rm = GameEngine.prefersReducedMotion(); }
    if (rmQuery) {
        var onRM = function (e) { rm = !!e.matches; };
        if (rmQuery.addEventListener) rmQuery.addEventListener('change', onRM);
        else if (rmQuery.addListener) rmQuery.addListener(onRM);     // Safari < 14
    }

    function sfx(fn) { if (window.PPAudio && window.PPAudio[fn]) { try { window.PPAudio[fn](); } catch (_) { } } }

    // onset: the model's ledger ask id (2.7); fx sharing one onset (a pair, one reply-all spread) are one flash
    function pushFx(type, tile, kind, flash, points, onset) {
        fx.push({ type: type, tile: tile, kind: kind || null, flash: !!flash, points: points || 0, onset: onset == null ? null : onset, t0: performance.now() });
    }

    function newRound() {
        var seed = nextSeed != null ? nextSeed : (Math.random() * 4294967296) >>> 0;
        nextSeed = null;
        round = MODEL.createRound(seed);
        live = false; finished = false; skipTap = false; focus = -1; fx.length = 0;
        GameEngine.state.score = 0;
        readRM();
    }

    /* ============================================================
       INPUT
       ============================================================ */
    function canInput() {
        return live && !finished && round && !round.ended && !GameEngine.state.paused && !GameEngine.state.gameOver;
    }

    function hitTile(x, y) {
        for (var i = 0; i < TILES; i++) {
            var r = GOMArt.layout.tileRect(i);
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
        }
        return -1;
    }

    function tapTile(i) {
        if (!canInput() || i < 0 || i >= TILES) return null;
        var res = MODEL.tap(round, i);
        pushFx('tap', i, res.result, false, 0);                     // press feedback
        // tap results as art.js draws them: a poof, or a wrong tap ('oops' keeps clear of the rotation event 'presenter')
        pushFx(res.result === 'presenter' ? 'oops' : res.result, i, res.result, res.flash, res.points, res.onset);
        if (res.result === 'mute' || res.result === 'echo' || res.result === 'pair') sfx('tick');
        GameEngine.state.score = round.score;
        return res;
    }

    function onTap(x, y) {
        if (skipTap) { skipTap = false; return; }    // the engine's onTap(200, 350) after Space/Enter
        tapTile(hitTile(x, y));
    }

    function onKey(key) {
        if (key === ' ' || key === 'Enter') {
            skipTap = true;                           // set even when gated, so the countdown never leaks a tap
            if (!canInput()) return;
            if (focus < 0) focus = 4;                 // first key only shows the ring
            else tapTile(focus);
            return;
        }
        var d = key === 'ArrowLeft' ? [-1, 0] : key === 'ArrowRight' ? [1, 0] :
            key === 'ArrowUp' ? [0, -1] : key === 'ArrowDown' ? [0, 1] : null;
        if (!d || !canInput()) return;
        if (focus < 0) { focus = 4; return; }
        var c = Math.max(0, Math.min(COLS - 1, focus % COLS + d[0]));
        var r = Math.max(0, Math.min(ROWS - 1, Math.floor(focus / COLS) + d[1]));
        focus = r * COLS + c;
    }

    function setupInput() {
        GameEngine.setupInput({ onTap: onTap, onKey: onKey });
    }

    // audio unlock in the first user gesture (the engine never calls it)
    function unlockOnce() {
        if (window.PPAudio) window.PPAudio.unlock();
        document.removeEventListener('pointerdown', unlockOnce, true);
        document.removeEventListener('keydown', unlockOnce, true);
    }
    document.addEventListener('pointerdown', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);

    /* ============================================================
       LOOP
       ============================================================ */
    function finish() {
        if (finished) return;
        finished = true; live = false;
        GameEngine.state.score = round.score;
        sfx('whistle');
        GameEngine.endGame();
    }

    function onUpdate(dt) {
        skipTap = false;
        if (!round) return;
        if (live && !round.ended) {
            var evs = MODEL.step(round, dt);
            for (var i = 0; i < evs.length; i++) {
                var e = evs[i];
                pushFx(e.type, e.tile, e.kind, e.flash, 0, e.onset);
                if (e.type === 'expire') sfx('ohh');
            }
        }
        GameEngine.state.score = round.score;       // the engine score mirrors the model every frame
        var now = performance.now();
        while (fx.length && now - fx[0].t0 > FX_TTL_MS) fx.shift();
        if (round.ended) finish();
    }

    function onDraw(ctx) {
        if (!round) return;
        GOMArt.draw(ctx, round, { now: performance.now(), rm: rm, focus: focus, fx: fx, copy: COPY, live: live, roundS: MODEL.TUNING.ROUND_S });
    }

    /* ---- page-local overrides: this page only, the engine file is untouched ---- */
    // ponytail: HUD recoloured by replacing the method on this page's engine object; an engine-wide theme hook is the ceiling
    GameEngine.renderHUD = function () { GOMArt.drawHUD(this.ctx, this.state); };

    // ponytail: countdown recoloured by replacing the method on this page's engine object (a copy of the
    // engine's canvas fallback, game-engine.js:676-770, minus its GSAP and DOM paths); an engine theme hook is the ceiling
    var DISPLAY_FONT = '"Bebas Neue", Arial, sans-serif';
    GameEngine.renderCountdown = function (count, callback) {
        var ctx = this.ctx, canvas = this.canvas, w = this._logicalWidth, h = this._logicalHeight;
        var steps = COUNTDOWN_STEPS, stepIndex = 0, stepMs = this.COUNTDOWN_STEP_MS, stepStart = 0;
        var handedOver = false;
        function finish() { if (handedOver) return; handedOver = true; callback(); }
        if (!ctx) { finish(); return; }
        // the wash is redrawn every frame over the frame under it, not stacked into solid INK
        var snap = null;
        try { snap = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (_) { }
        function tick(now) {
            if (handedOver) return;
            if (!stepStart) stepStart = now;
            var progress = Math.min((now - stepStart) / stepMs, 1);
            var eased = 1 - Math.pow(1 - Math.min(progress * 1.6, 1), 3);
            var scale = rm ? 1 : 0.9 + 0.1 * eased;      // reduce: opacity only, nothing travels
            var alpha = Math.min(progress * 2, 1) * (progress < 0.8 ? 1 : (1 - progress) / 0.2);
            if (snap) ctx.putImageData(snap, 0, 0);
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = GOMArt.PALETTE.INK;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = Math.round(96 * scale) + 'px ' + DISPLAY_FONT;
            ctx.fillStyle = GOMArt.PALETTE.GHOST;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(steps[stepIndex], w / 2, h / 2);
            ctx.restore();
            if (progress >= 1) { stepIndex++; stepStart = 0; }
            if (stepIndex >= steps.length) { finish(); return; }
            requestAnimationFrame(tick);                 // one chain for all four steps
        }
        requestAnimationFrame(tick);
    };

    // ponytail: pause overlay recoloured the same way; an engine theme hook is the ceiling
    GameEngine.renderPauseOverlay = function () {
        var ctx = this.ctx;
        if (!ctx) return;
        var w = this._logicalWidth, h = this._logicalHeight;
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = GOMArt.PALETTE.INK;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = GOMArt.PALETTE.GHOST;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '40px ' + DISPLAY_FONT;
        ctx.fillText(PAUSED_LABEL, w / 2, h / 2 - 30);
        ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
        ctx.fillText('Press Esc to resume', w / 2, h / 2 + 20);
        ctx.restore();
    };

    // ponytail: the rank band is appended after the engine's game-over card; a results hook in the engine is the ceiling
    var engineGameOver = GameEngine.renderGameOver;
    GameEngine.renderGameOver = function (data) {
        engineGameOver.call(this, data);
        var ov = this._overlayEl;
        if (!ov || !ov.firstChild) return;
        var band = COPY.ranks[Math.max(0, Math.min(COPY.ranks.length - 1, Math.floor(5 * (data.score || 0) / RANK_CEILING)))];
        var t = document.createElement('div'); t.className = 'gom-rank'; t.textContent = band.title;
        var l = document.createElement('div'); l.className = 'gom-rank-line'; l.textContent = band.line;
        ov.insertBefore(l, ov.firstChild.nextSibling);
        ov.insertBefore(t, l);
    };

    /* ============================================================
       INIT
       ============================================================ */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 640 });
        GameEngine.startGame(GAME_ID, {
            instructions: COPY.instructions,
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: function () { live = false; },
            onReset: function () { live = false; finished = true; fx.length = 0; },
            onInit: function () { newRound(); setupInput(); },
            onCountdownComplete: function () { live = true; }
        });
    }

    // test hooks for the bots, G7 and G8 (read the live model state; taps go through the same gate)
    NS.state = function () { return round; };
    NS.tapTile = tapTile;
    // seeds the next round; before the first input (onInit has already built a round) it rebuilds the current one
    NS.seed = function (n) { nextSeed = n >>> 0; if (round && !live && !finished) newRound(); };
    NS.COPY = COPY;
    NS.displayStrings = displayStrings;
    NS.view = function () { return { focus: focus, live: live, rm: rm, fx: fx.length }; };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
