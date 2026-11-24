/**
 * Gate Change
 * KPMG Newsletter Minigame, Travel Edition (November 2026 issue, edition slot 2026-12).
 *
 * Office closes at 5pm and everyone's flying out. Send each traveller to the gate the
 * departures board shows for their destination before boarding closes; packed laptops and
 * cancelled flights go to the service desk instead.
 *
 * This file is the glue only: engine setup, input, events to effects and sounds, the COPY block,
 * reduced motion, the page-local overrides and the test hooks. Rules live in model.js (pure),
 * the look in art.js (canvas only).
 *
 * ---------------------------------------------------------------------------
 * PALETTE (plan D3, 2026-11-25): the issue's own, sampled from its pages, not KPMG's. The newsletter
 * is not KPMG branded, so no exception request; brand_validator.py flags these hexes and that is
 * expected. Declared set, also in internal/newsletter/decisions/2026-11-25-gate-change-palette.md:
 *   SKY #467BCF, SKY_LT #A2C2F2, ROYAL #2E72C6, ROYAL_DK #1D4F94, KYOTO #890202, KYOTO_DK #5A0101,
 *   PASS #E43D3D, OLIVE #597643, CREAM #FFF6E6, BUTTER #FFF2B0, BOARD #13213F, BOARD2 #1E3158,
 *   AMBER #FFC94A, INK #1B1F2A, SLATE #4A5263, WHITE #FFFFFF, RUST #892F02.
 * TYPE: Montserrat 700-900 (the newsletter's headline voice) for everything but signage; Bebas Neue for
 *   the board, its banners and the pass destination. Both OFL, self-hosted in assets/fonts/.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    var GAME_ID = 'gate-change';
    var W = 400, H = 700;
    var FX_TTL_MS = 2400;

    var NS = window.GateChange = window.GateChange || {};   // model.js attaches .MODEL first
    var MODEL = NS.MODEL;
    var T = MODEL.TUNING;

    /* ============================================================
       COPY. Signage strings (drawn in Bebas Neue: board, banners, destinations) use only
       A-Z a-z 0-9 space ' ! . , / + - : (the vendored subset); the rest is Montserrat (printable ASCII).
       No names, no trademarks, no em or en dashes.
       ============================================================ */
    // legend icons: drawn in the palette, never emoji (one stroke weight, 24 px)
    function svg(body) { return '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>'; }
    var ICON = {
        gate: svg('<rect x="2" y="2" width="20" height="20" rx="5" fill="#2E72C6"/><path d="M7 12h9M12.5 8l4 4-4 4" stroke="#FFF6E6" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
        desk: svg('<rect x="2" y="2" width="20" height="20" rx="5" fill="#597643"/><path d="M12 6.5v10M8 12.5l4 4 4-4" stroke="#FFF6E6" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
        upgrade: svg('<rect x="1.5" y="5" width="21" height="14" rx="3" fill="#FFC94A"/><path d="M16.5 7v10" stroke="#1B1F2A" stroke-width="1.4" stroke-dasharray="2 2"/><path d="M5 10h7M5 14h5" stroke="#1B1F2A" stroke-width="2" stroke-linecap="round"/>'),
        wrong: svg('<circle cx="12" cy="12" r="10" fill="#E43D3D"/><path d="M8 8l8 8M16 8l-8 8" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>'),
        slow: svg('<circle cx="12" cy="13.5" r="8.5" fill="#FFF6E6" stroke="#E43D3D" stroke-width="2.2"/><path d="M12 13.5V9M12 13.5l3 2" stroke="#E43D3D" stroke-width="2.2" stroke-linecap="round"/><path d="M9.5 2.5h5" stroke="#E43D3D" stroke-width="2.2" stroke-linecap="round"/>'),
        laptop: svg('<rect x="5" y="5" width="14" height="10" rx="1.5" fill="#4A5263"/><rect x="6.8" y="6.8" width="10.4" height="6.4" fill="#A2C2F2"/><rect x="2.5" y="15.5" width="19" height="3" rx="1.5" fill="#1B1F2A"/>')
    };
    var COPY = {
        board: {
            title: 'DEPARTURES',
            columns: ['GATE', 'FLIGHT', 'DESTINATION', 'STATUS'],
            boarding: 'BOARDING', change: 'GATE CHANGE', fresh: 'NOW BOARDING', final: 'FINAL CALL', cancelled: 'CANCELLED'
        },
        gate: 'GATE',
        desk: { title: 'SERVICE DESK', sub: ['Laptop on annual leave,', 'or flight cancelled or gone'] },
        pass: {
            title: 'BOARDING PASS', upgrade: 'UPGRADE: DOUBLE POINTS', to: 'TO', gate: 'GATE',
            leave: 'ANNUAL LEAVE', client: 'CLIENT SITE', sneaky: 'One quick email...'
        },
        next: 'NEXT',
        hud: { score: 'SCORE', strikes: 'STRIKES' },
        captions: {
            wrong: 'WRONG GATE: {city} IS AT {gate}',
            notFlying: '{city} IS NOT FLYING: SERVICE DESK',
            missed: 'TOO SLOW: MISSED THE FLIGHT',
            laptop: 'THE LAPTOP WENT ON LEAVE TOO',
            nodesk: 'NOTHING WRONG: THEY BOARD AT {gate}',
            clientDesk: 'CLIENT SITE: THEY NEED THAT LAPTOP',
            recovered: T.RECOVER_STREAK + ' IN A ROW: STRIKE CLEARED',
            laptopLeft: 'LAPTOP LEFT BEHIND',
            rebooked: 'REBOOKED',
            change: 'GATE CHANGE: CHECK THE BOARD',
            cancel: '{city} CANCELLED: SERVICE DESK',
            lastcall: 'LAST CALL: DOUBLE POINTS'
        },
        // lowest first; min is the score that earns the band (tuned against the model bots, plan 6.3)
        ranks: [
            { min: 0, title: 'Carry-On Only', line: 'You made it out the door. The out-of-office can take it from here.' },
            { min: 6000, title: 'Frequent Flyer', line: 'Smooth boarding. Nobody had to sprint.' },
            { min: 15000, title: 'Gold Status', line: 'Lounge access granted. Everyone on the right plane.' },
            { min: 28000, title: 'Platinum Lounge', line: 'Gate changes do not faze you, and not one laptop got a holiday.' },
            { min: 40000, title: 'First Class Out of Office', line: 'Everyone away by five. Enjoy the break, you earned it.' }
        ],
        summary: 'Boarded {n}. Best streak {s}.',
        endTitle: { time: 'WHEELS UP AT 5', grounded: 'GROUNDED' },
        instructions: {
            title: 'GATE CHANGE',
            objective: "Enjoy this edition's game. Board every traveller before their pass timer runs out, until 5 PM.",
            controls: [
                'Swipe or tap toward the gate the BOARD shows for their destination (arrow keys work too). The pass can be out of date.',
                'Swipe down to the Service Desk if someone on annual leave has packed a laptop, or their flight is cancelled.'
            ],
            legend: {
                collect: [
                    { icon: ICON.gate, label: 'Right gate', points: '100-200' },
                    { icon: ICON.desk, label: 'Right desk call', points: '150-250' },
                    { icon: ICON.upgrade, label: 'Gold pass or last call: double' }
                ],
                avoid: [
                    { icon: ICON.wrong, label: 'Wrong gate or desk: a strike' },
                    { icon: ICON.slow, label: 'Too slow: a strike' },
                    { icon: ICON.laptop, label: 'Laptop boarded: streak lost' }
                ]
            },
            tip: 'Client-site travellers keep their laptops. Streaks multiply points (up to x' + (T.MULT_MAX_TENTHS / 10) + '), ' + T.RECOVER_STREAK + ' in a row clears a strike, ' + T.MAX_STRIKES + ' grounds you.'
        }
    };

    var COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'];
    var PAUSED_LABEL = 'PAUSED';

    // every Bebas (signage) string, for the glyph gate: board, banners, destinations, clock
    function displayStrings() {
        var c = COPY.captions, b = COPY.board, out = [b.boarding, b.change, b.fresh, b.final, b.cancelled,
            'ABC', '4:00 PM', '4:59 PM', '5:00 PM', c.change, c.lastcall];
        MODEL.DESTS.forEach(function (d) { out.push(d.city, d.flight, c.cancel.replace('{city}', d.city)); });
        return out;
    }

    /* ============================================================
       STATE
       ============================================================ */
    var round = null, nextSeed = null, live = false, finished = false, skipTap = false;
    var fx = [];
    var rm = GameEngine.prefersReducedMotion();

    var rmQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (rmQuery) {
        var onRM = function (e) { rm = !!e.matches; };
        if (rmQuery.addEventListener) rmQuery.addEventListener('change', onRM);
        else if (rmQuery.addListener) rmQuery.addListener(onRM);     // Safari < 14
    }

    function sfx(fn) { if (window.PPAudio && window.PPAudio[fn]) { try { window.PPAudio[fn](); } catch (_) { } } }
    function pushFx(o) { o.t0 = performance.now(); fx.push(o); }

    function newRound() {
        var seed = nextSeed != null ? nextSeed : (Math.random() * 4294967296) >>> 0;
        nextSeed = null;
        round = MODEL.createRound(seed);
        live = false; finished = false; skipTap = false; fx.length = 0;
        GameEngine.state.score = 0;
        rm = GameEngine.prefersReducedMotion();
    }

    /* ============================================================
       INPUT: swipe direction = where the door is (0 A left, 1 B up, 2 C right, 3 desk down)
       ============================================================ */
    function canInput() {
        return live && !finished && round && !round.ended && !GameEngine.state.paused && !GameEngine.state.gameOver;
    }

    function sendDir(dir) {
        if (!canInput()) return null;
        pushFx({ type: 'press', dir: dir });
        var res = MODEL.send(round, dir);
        if (res.result === 'wait') return res;
        pushFx({ type: 'sent', dir: dir, result: res.result, reason: res.reason, points: res.points, traveller: res.traveller, correct: res.correct, recovered: res.recovered, lastCall: round.lastCall });
        if (res.result === 'correct' || res.result === 'desk') sfx('tick');
        else if (res.result !== 'laptop') sfx('ohh');
        GameEngine.state.score = round.score;
        return res;
    }

    function hitDoor(x, y) {
        var D = GCArt.layout.doors;
        for (var i = 0; i < D.length; i++) {
            var r = D[i];
            if (x >= r.x - 6 && x < r.x + r.w + 6 && y >= r.y - 6 && y < r.y + r.h + 6) return i;
        }
        return -1;
    }

    function onTap(x, y) {
        if (skipTap) { skipTap = false; return; }    // the engine's synthetic centre tap after Space/Enter
        var d = hitDoor(x, y);
        if (d >= 0) sendDir(d);
    }

    var KEYS = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3, a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
    function onKey(key) {
        if (key === ' ' || key === 'Enter') { skipTap = true; return; }
        if (KEYS.hasOwnProperty(key)) sendDir(KEYS[key]);
    }

    function setupInput() {
        GameEngine.setupInput({
            onTap: onTap, onKey: onKey,
            onSwipeLeft: function () { sendDir(0); }, onSwipeUp: function () { sendDir(1); },
            onSwipeRight: function () { sendDir(2); }, onSwipeDown: function () { sendDir(3); }
        });
    }

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
                if (e.type === 'step') pushFx({ type: 'step', id: e.traveller.id });
                else if (e.type === 'missed') { pushFx({ type: 'missed', traveller: e.traveller, correct: e.correct }); sfx('ohh'); }
                else if (e.type === 'change') pushFx({ type: 'change', a: e.a, b: e.b });
                else if (e.type === 'cancel') { pushFx({ type: 'cancel', gate: e.gate, dest: e.dest }); sfx('ohh'); }
                else if (e.type === 'rollover') pushFx({ type: 'rollover', gate: e.gate });
                else if (e.type === 'lastcall') pushFx({ type: 'lastcall' });
            }
        }
        GameEngine.state.score = round.score;
        var now = performance.now();
        while (fx.length && now - fx[0].t0 > FX_TTL_MS) fx.shift();
        if (round.ended) finish();
    }

    function view() { return { now: performance.now(), rm: rm, fx: fx, copy: COPY, live: live, model: MODEL }; }
    function onDraw(ctx) {
        if (!round) return;
        GCArt.draw(ctx, round, view());
    }

    /* ---- page-local overrides: this page only, the engine file is untouched ---- */
    // ponytail: HUD recoloured by replacing the method on this page's engine object; an engine theme hook is the ceiling
    GameEngine.renderHUD = function () { GCArt.drawHUD(this.ctx, this.state, round, view()); };

    // ponytail: countdown recoloured the same way (GoM's copy of the engine canvas fallback); an engine theme hook is the ceiling
    var DISPLAY_FONT = '"Montserrat", "Arial Black", Arial, sans-serif';
    GameEngine.renderCountdown = function (count, callback) {
        var ctx = this.ctx, canvas = this.canvas, w = this._logicalWidth, h = this._logicalHeight;
        var steps = COUNTDOWN_STEPS, stepIndex = 0, stepMs = this.COUNTDOWN_STEP_MS, stepStart = 0, handedOver = false;
        function done() { if (handedOver) return; handedOver = true; callback(); }
        if (!ctx) { done(); return; }
        if (round) { GCArt.draw(ctx, round, view()); GCArt.drawHUD(ctx, this.state, round, view()); }   // the board shows through: read it during the count
        var snap = null;
        try { snap = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (_) { }
        function tick(now) {
            if (handedOver) return;
            if (!stepStart) stepStart = now;
            var progress = Math.min((now - stepStart) / stepMs, 1);
            var eased = 1 - Math.pow(1 - Math.min(progress * 1.6, 1), 3);
            var scale = rm ? 1 : 0.9 + 0.1 * eased;
            var alpha = Math.min(progress * 2, 1) * (progress < 0.8 ? 1 : (1 - progress) / 0.2);
            if (snap) ctx.putImageData(snap, 0, 0);
            ctx.save();
            ctx.globalAlpha = 0.5; ctx.fillStyle = GCArt.PALETTE.BOARD; ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = '900 ' + Math.round(88 * scale) + 'px ' + DISPLAY_FONT;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = GCArt.PALETTE.KYOTO; ctx.fillText(steps[stepIndex], w / 2 + 5, h / 2 + 5);   // the issue's offset shadow
            ctx.fillStyle = GCArt.PALETTE.BUTTER; ctx.fillText(steps[stepIndex], w / 2, h / 2);
            ctx.restore();
            if (progress >= 1) { stepIndex++; stepStart = 0; }
            if (stepIndex >= steps.length) { done(); return; }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    };

    // ponytail: pause overlay recoloured the same way; an engine theme hook is the ceiling
    GameEngine.renderPauseOverlay = function () {
        var ctx = this.ctx;
        if (!ctx) return;
        var w = this._logicalWidth, h = this._logicalHeight;
        ctx.save();
        ctx.globalAlpha = 0.75; ctx.fillStyle = GCArt.PALETTE.BOARD; ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1; ctx.fillStyle = GCArt.PALETTE.AMBER; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 36px ' + DISPLAY_FONT; ctx.fillText(PAUSED_LABEL, w / 2, h / 2 - 30);
        ctx.fillStyle = GCArt.PALETTE.CREAM; ctx.font = '700 14px ' + DISPLAY_FONT;
        ctx.fillText('Press Esc to resume', w / 2, h / 2 + 20);
        ctx.restore();
    };

    // ponytail: rank band and summary appended after the engine's game-over card; an engine results hook is the ceiling
    var engineGameOver = GameEngine.renderGameOver;
    GameEngine.renderGameOver = function (data) {
        engineGameOver.call(this, data);
        var ov = this._overlayEl;
        if (!ov || !ov.firstChild) return;
        var sc = data.score || 0, band = COPY.ranks[0];
        for (var i = 0; i < COPY.ranks.length; i++) if (sc >= COPY.ranks[i].min) band = COPY.ranks[i];
        if (round) ov.firstChild.textContent = round.endReason === 'time' ? COPY.endTitle.time : COPY.endTitle.grounded;
        var t = document.createElement('div'); t.className = 'gc-rank'; t.textContent = band.title;
        var l = document.createElement('div'); l.className = 'gc-rank-line';
        l.textContent = band.line + (round ? ' ' + COPY.summary.replace('{n}', round.counts.correct + round.counts.desk).replace('{s}', round.bestStreak) : '');
        ov.insertBefore(l, ov.firstChild.nextSibling);
        ov.insertBefore(t, l);
    };

    /* ============================================================
       INIT
       ============================================================ */
    function init() {
        // canvas text uses whatever face is loaded when it draws: ask for both now (the canvas redraws every frame)
        if (document.fonts && document.fonts.load) ['900 16px Montserrat', '700 12px Montserrat', '24px "Bebas Neue"'].forEach(function (f) { document.fonts.load(f).catch(function () { }); });
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

    // test hooks for the bots and gates (live model state; sends go through the same gate as input)
    NS.state = function () { return round; };
    NS.send = sendDir;
    NS.seed = function (n) { nextSeed = n >>> 0; if (round && !live && !finished) newRound(); };
    NS.COPY = COPY;
    NS.displayStrings = displayStrings;
    NS.view = function () { return { live: live, rm: rm, fx: fx.length }; };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
