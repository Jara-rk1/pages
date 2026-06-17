/**
 * Penalty Pressure — "After-Hours Shootout"
 * KPMG Newsletter Minigame · June 2026 World Cup / Afterhours edition.
 *
 * A premium penalty shootout: match night at the pub, step up for KPMG United.
 * Two-tap skill shot (aim sweep -> power/height meter) vs a fair-but-tough
 * read-AI keeper. Fixed 10 kicks; placement + streak + difficulty scoring.
 *
 * Tech (per the build research): Canvas 2D only, zero new deps; one offscreen
 * canvas caches the static stadium (capped at DPR 2); crisp line-art drawn live
 * on top; a pooled Float32 particle system; all motion driven by the engine's
 * clamped dt (no second rAF). GSAP is NOT required — every animation is a
 * dt-synced eased lerp, which keeps presentation frame-coherent with the engine
 * loop and trivially satisfies the "GSAP optional" contract. Reduced-motion is
 * gated through one J() multiplier: information always stays, kinetics drop.
 * Colours are KPMG-palette only (rgba() values are derived from palette hexes).
 */
(function () {
    'use strict';

    var GAME_ID = 'penalty-pressure';
    var W = 400, H = 700;
    var HUD_H = GameEngine.HUD_HEIGHT;       // 48 — keep critical art below this
    var C = KPMG.colours;

    /* ---- pitch / goal geometry (logical px) ---- */
    var GOAL_LEFT = 80, GOAL_RIGHT = 320, GOAL_TOP = 150, GOAL_LINE = 300;
    var GOAL_W = GOAL_RIGHT - GOAL_LEFT;     // 240
    var GOAL_H = GOAL_LINE - GOAL_TOP;       // 150
    var BALL_R = 9;
    var SPOT_X = 200, SPOT_Y = 545;
    var TOTAL_KICKS = 10;

    /* ---- reduced motion ---- */
    var RM = false;
    function J(m) { return RM ? 0 : m; }

    /* ---- colour helper: rgba from a palette hex ---- */
    function rgba(hex, a) {
        var h = hex.replace('#', '');
        var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    /* ---- easing ---- */
    function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
    function outQuart(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 4); }
    function inQuad(t) { t = clamp01(t); return t * t; }
    function inOutQuad(t) { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function outBack(t) { t = clamp01(t); var s = 1.70158, s1 = s + 1; return 1 + s1 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
    function outElastic(t) {
        t = clamp01(t);
        if (t === 0 || t === 1) return t;
        var p = 0.4;
        return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    /* ~N(0,1)-ish from 4 uniforms (std ~0.577) — cheap, no allocation */
    function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2); }

    /* ============================================================
       STATE
       ============================================================ */
    var phase;                 // 'aim' | 'power' | 'shoot' | 'outcome' | 'done'
    var kickNum, goals, streak, score, suddenDeath;
    var aimT, aimDir, aimX, lockedAimNorm;
    var powT, powDir, power;
    var ball, keeper, kicker, net, trail;
    var flightT, travelDur, outcome, outcomeTimer, lastResult;
    var cam, flash, hitStop, timeScale;
    var callout;               // kinetic typography
    var leanTimer;             // keeper tell countdown

    var bg = null;             // offscreen static-stadium cache

    function difficulty(k) {
        if (suddenDeath) return { aim: 0.78, pow: 0.68, read: 0.60, dive: 0.17 };
        if (k <= 3) return { aim: 1.15, pow: 0.95, read: 0.33, dive: 0.24 };
        if (k <= 7) return { aim: 1.00, pow: 0.85, read: 0.42, dive: 0.22 };
        if (k <= 12) return { aim: 0.90, pow: 0.78, read: 0.50, dive: 0.20 };
        return { aim: 0.80, pow: 0.70, read: 0.58, dive: 0.18 };
    }
    function diff() { return difficulty(kickNum); }

    function reset() {
        RM = GameEngine.prefersReducedMotion();
        phase = 'aim';
        kickNum = 1; goals = 0; streak = 0; score = 0; suddenDeath = false;
        GameEngine.state.score = 0;
        ball = { x: SPOT_X, y: SPOT_Y, r: BALL_R, vx: 0, vy: 0, squash: 1, spin: 0, scale: 1, flying: false, restY: SPOT_Y };
        keeper = { x: 200, baseY: GOAL_LINE - 8, dir: 0, intend: 0, diveT: 0, lean: 0, sway: 0 };
        kicker = { x: 168, y: 612, swing: 0, runup: 0 };
        net = buildNet();
        trail = [];
        flightT = 0; travelDur = 0.4; outcome = null; outcomeTimer = 0; lastResult = null;
        cam = { shakeX: 0, shakeY: 0, nudgeX: 0, nudgeY: 0, zoom: 1, fx: 200, fy: GOAL_TOP + 60, trauma: 0 };
        flash = { a: 0, color: C.white };
        hitStop = 0; timeScale = 1;
        callout = { text: '', sub: '', color: C.white, glyph: '', t: 0, active: false, life: 0 };
        leanTimer = -1;
        resetSweeps();
        particlesClear();
    }

    function resetSweeps() {
        aimT = 0.5; aimDir = 1; aimX = SPOT_X; lockedAimNorm = 0.5;
        powT = 0; powDir = 1; power = 0;
    }

    function startKick() {
        ball.x = SPOT_X; ball.y = SPOT_Y; ball.vx = 0; ball.vy = 0; ball.squash = 1; ball.scale = 1; ball.flying = false; ball.spin = 0;
        keeper.x = 200; keeper.dir = 0; keeper.intend = 0; keeper.diveT = 0; keeper.lean = 0;
        kicker.swing = 0; kicker.runup = 0;
        trail.length = 0;
        flightT = 0; outcome = null; leanTimer = -1;
        resetSweeps();
        phase = 'aim';
    }

    /* ============================================================
       NET (live ripple)
       ============================================================ */
    function buildNet() {
        var cols = 9, rows = 6, nodes = [];
        for (var r = 0; r <= rows; r++) {
            for (var c = 0; c <= cols; c++) {
                nodes.push({
                    bx: GOAL_LEFT + (GOAL_W * c / cols),
                    by: GOAL_TOP + (GOAL_H * r / rows),
                    push: 0, vel: 0
                });
            }
        }
        return { cols: cols, rows: rows, nodes: nodes };
    }
    function netImpact(hx, hy) {
        for (var i = 0; i < net.nodes.length; i++) {
            var n = net.nodes[i];
            var d = Math.hypot(n.bx - hx, n.by - hy);
            n.push += J(20) * Math.exp(-d / 55);
        }
    }
    function updateNet(dt) {
        var K = 70, DAMP = 6;
        for (var i = 0; i < net.nodes.length; i++) {
            var n = net.nodes[i];
            if (n.push === 0 && n.vel === 0) continue;
            n.vel += (-n.push * K - n.vel * DAMP) * dt;
            n.push += n.vel * dt;
            if (Math.abs(n.push) < 0.05 && Math.abs(n.vel) < 0.05) { n.push = 0; n.vel = 0; }
        }
    }

    /* ============================================================
       POOLED PARTICLES (Float32 struct-of-arrays — zero per-frame alloc)
       ============================================================ */
    var MAX = (GameEngine.isMobile && GameEngine.isMobile()) ? 150 : 300;
    var P = {
        x: new Float32Array(MAX), y: new Float32Array(MAX),
        vx: new Float32Array(MAX), vy: new Float32Array(MAX),
        life: new Float32Array(MAX), max: new Float32Array(MAX),
        size: new Float32Array(MAX), rot: new Float32Array(MAX), vr: new Float32Array(MAX),
        grav: new Float32Array(MAX), kind: new Uint8Array(MAX), alive: new Uint8Array(MAX),
        color: new Array(MAX), cursor: 0
    };
    function particlesClear() { for (var i = 0; i < MAX; i++) P.alive[i] = 0; }
    function emit(count, cfg) {
        if (RM) return;                       // reduced motion: no flung particles
        for (var k = 0; k < count; k++) {
            var i = P.cursor; P.cursor = (P.cursor + 1) % MAX;
            P.x[i] = cfg.x + (Math.random() - 0.5) * (cfg.spreadX || 0);
            P.y[i] = cfg.y + (Math.random() - 0.5) * (cfg.spreadY || 0);
            var a = cfg.ang + (Math.random() - 0.5) * cfg.spread;
            var sp = lerp(cfg.spMin, cfg.spMax, Math.random());
            P.vx[i] = Math.cos(a) * sp; P.vy[i] = Math.sin(a) * sp;
            P.max[i] = P.life[i] = lerp(cfg.lifeMin, cfg.lifeMax, Math.random());
            P.size[i] = lerp(cfg.szMin, cfg.szMax, Math.random());
            P.rot[i] = Math.random() * 6.28; P.vr[i] = (Math.random() - 0.5) * 10;
            P.grav[i] = cfg.grav; P.kind[i] = cfg.kind; P.alive[i] = 1;
            P.color[i] = cfg.colors[(Math.random() * cfg.colors.length) | 0];
        }
    }
    function updateParticles(dt) {
        for (var i = 0; i < MAX; i++) {
            if (!P.alive[i]) continue;
            P.life[i] -= dt;
            if (P.life[i] <= 0) { P.alive[i] = 0; continue; }
            P.vy[i] += P.grav[i] * dt;
            P.vx[i] *= 0.99; P.vy[i] *= 0.99;
            P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
            P.rot[i] += P.vr[i] * dt;
        }
    }
    function drawParticles(ctx) {
        for (var i = 0; i < MAX; i++) {
            if (!P.alive[i]) continue;
            var t = P.life[i] / P.max[i];
            ctx.globalAlpha = t < 1 ? t : 1;
            ctx.fillStyle = P.color[i];
            if (P.kind[i] === 0) { // confetti — rotating rect
                ctx.save();
                ctx.translate(P.x[i], P.y[i]); ctx.rotate(P.rot[i]);
                ctx.fillRect(-P.size[i] / 2, -P.size[i] / 3, P.size[i], P.size[i] * 0.6);
                ctx.restore();
            } else {               // scuff / spray / sparkle — cheap square dot
                ctx.fillRect(P.x[i] - P.size[i] / 2, P.y[i] - P.size[i] / 2, P.size[i], P.size[i]);
            }
        }
        ctx.globalAlpha = 1;
    }
    var CONFETTI = { kind: 0, colors: C.palette, spread: 1.4, spMin: 120, spMax: 320, lifeMin: 1.0, lifeMax: 2.0, szMin: 5, szMax: 10, grav: 260, spreadX: 30, spreadY: 10 };
    var NETSPRAY = { kind: 2, colors: [C.white, C.lightBlue], spread: 6.28, spMin: 30, spMax: 120, lifeMin: 0.25, lifeMax: 0.5, szMin: 2, szMax: 4, grav: 200, spreadX: 6, spreadY: 6 };
    var SCUFF = { kind: 1, colors: [C.green, C.dark, C.white], spread: 1.0, spMin: 40, spMax: 140, lifeMin: 0.3, lifeMax: 0.6, szMin: 2, szMax: 5, grav: 520, spreadX: 8, spreadY: 4 };
    var SPARKLE = { kind: 3, colors: [C.pacific, C.lightPurple, C.lightBlue], spread: 6.28, spMin: 20, spMax: 90, lifeMin: 0.4, lifeMax: 0.9, szMin: 2, szMax: 4, grav: -10, spreadX: 20, spreadY: 20 };

    /* ============================================================
       INPUT — single verb (tap / Space), no swipe (avoids misread)
       ============================================================ */
    function setupInput() {
        GameEngine.setupInput({
            // onTap already fires for tap, Space AND Enter (engine maps them).
            // onKey must therefore NOT also handle Space/Enter or each press
            // would lock twice. Only add the non-mapped convenience keys here.
            onTap: function () { handleTap(); },
            onKey: function (key) {
                if (key === 'ArrowUp' || key === 'w' || key === 'W') handleTap();
            }
        });
    }

    function handleTap() {
        if (phase === 'aim') {
            lockedAimNorm = aimT;
            aimX = lerp(GOAL_LEFT + 16, GOAL_RIGHT - 16, aimT);
            phase = 'power';
            keeperRead();
            ppa('tick', 'aim');
        } else if (phase === 'power') {
            power = powT;
            launchShot();
            ppa('tick', 'power');
        }
        // ignore taps during shoot / outcome
    }

    /* keeper decides its dive on aim-lock, using only the revealed aimX (a read,
       not omniscience), then telegraphs with a lean before committing. */
    function keeperRead() {
        var d = diff();
        var col = lockedAimNorm < 0.38 ? -1 : lockedAimNorm > 0.62 ? 1 : 0;
        if (Math.random() < Math.min(d.read, 0.60)) {
            keeper.intend = col;                       // read it
        } else {
            var opts = [-1, 0, 1].filter(function (x) { return x !== col; });
            keeper.intend = opts[(Math.random() * opts.length) | 0]; // guessed wrong
        }
        leanTimer = 0.14;                               // 140ms tell before the dive is visible
    }

    function launchShot() {
        var p = power;
        // target placement
        var tx = aimX;
        var ty, over = false;
        if (p <= 0.95) {
            ty = lerp(GOAL_LINE - 10, GOAL_TOP + 8, p / 0.95);
        } else {
            ty = GOAL_TOP - ((p - 0.95) / 0.05) * 42; over = true; // over the bar
        }
        // power-scaled gaussian scatter (the fairness keystone)
        var sx = 4 + 22 * p * p, sy = 3 + 14 * p * p;
        var landX = tx + gauss() * sx;
        var landY = ty + gauss() * sy;
        ball.flying = true; ball.startX = ball.x; ball.startY = ball.y;
        ball.endX = landX; ball.endY = landY;
        ball.over = over;
        travelDur = lerp(0.42, 0.30, p);
        flightT = 0;
        keeper.dir = keeper.intend;                    // commit the dive
        phase = 'shoot';
        ppa('kick', p);
    }

    function keeperHandX() {
        if (keeper.dir < 0) return GOAL_LEFT + 58;
        if (keeper.dir > 0) return GOAL_RIGHT - 58;
        return 200;
    }

    function resolveShot() {
        var lx = ball.endX, ly = ball.endY;
        var inPostsX = lx > GOAL_LEFT + BALL_R && lx < GOAL_RIGHT - BALL_R;
        var underBar = ly > GOAL_TOP + BALL_R;
        var result;
        if (ball.over || !underBar) { result = 'over'; }
        else if (!inPostsX) { result = 'wide'; }
        else {
            // keeper reach: correct dive covers ~60% of the mouth horizontally,
            // but the top ~50px band is always beyond the leap (top corners score).
            var topBand = ly < GOAL_TOP + 50;
            var reach = 78;
            var covered = Math.abs(lx - keeperHandX()) < reach;
            result = (!topBand && covered) ? 'save' : 'goal';
        }
        applyResult(result, lx, ly);
    }

    function zoneOf(lx, ly) {
        var cx = (lx - GOAL_LEFT) / GOAL_W;            // 0..1
        var cy = (ly - GOAL_TOP) / GOAL_H;             // 0..1
        var col = cx < 0.34 ? 'L' : cx > 0.66 ? 'R' : 'C';
        var row = cy < 0.40 ? 'hi' : cy > 0.72 ? 'lo' : 'mid';
        return { col: col, row: row };
    }
    function placementMult(z) {
        if (z.row === 'hi' && z.col !== 'C') return 2.5;   // top corner
        if (z.row === 'hi' && z.col === 'C') return 1.8;   // top middle
        if (z.row === 'lo' && z.col !== 'C') return 1.6;   // side low
        if (z.row === 'lo' && z.col === 'C') return 0.5;   // lazy low-centre
        return 1.0;                                        // mid
    }

    function applyResult(result, lx, ly) {
        lastResult = result;
        phase = 'outcome';
        outcomeTimer = (result === 'goal') ? 1.35 : 1.05;

        if (result === 'goal') {
            goals++;
            streak++;
            var z = zoneOf(lx, ly);
            var pm = placementMult(z);
            // accuracy: closeness to the nearest top-corner "bin"
            var binX = lx < 200 ? GOAL_LEFT + 16 : GOAL_RIGHT - 16;
            var dist = Math.hypot(lx - binX, ly - (GOAL_TOP + 16));
            var acc = clamp01(1.2 - dist / 300); acc = 0.8 + acc * 0.4;
            var dm = 1 + 0.06 * (kickNum - 1);
            var sBonus = Math.min(200, 25 * (streak - 1));
            var ks = Math.round((suddenDeath ? 300 : 100) * pm * acc * dm) + (suddenDeath ? 100 * Math.max(0, streak - TOTAL_KICKS - 1) : sBonus);
            score += ks;
            GameEngine.state.score = score;

            netImpact(lx, ly);
            addTrauma(z.row === 'hi' && z.col !== 'C' ? 0.85 : 0.7);
            doHitStop(5);
            flashNow(C.teal, 0.5);
            emit(70, withXY(CONFETTI, GOAL_LEFT + 20, GOAL_TOP + 10));
            emit(70, withXY(CONFETTI, GOAL_RIGHT - 20, GOAL_TOP + 10));
            emit(22, withXY(NETSPRAY, lx, ly));
            if (z.row === 'hi' && z.col !== 'C') {
                emit(16, withXY(SPARKLE, lx, ly));
                showCallout('TOP BINS!', '+' + ks, C.pacific, '✓');
            } else {
                showCallout('GOAL!', '+' + ks, C.teal, '✓');
            }
            ppa('net'); ppa('roar');
        } else {
            streak = 0;
            doHitStop(3);
            if (result === 'save') {
                addTrauma(0.4); flashNow(C.blue, 0.32);
                emit(14, withXY(SCUFF, keeperHandX(), GOAL_LINE - 6));
                showCallout('SAVED!', 'keeper reads it', C.blue, '🧤');
                ppa('ohh');
            } else if (result === 'over') {
                addTrauma(0.3); flashNow(C.amber, 0.3);
                showCallout('OVER THE BAR', 'too much power', C.amber, '⬆');
                ppa('ohh');
            } else { // wide
                addTrauma(0.3); flashNow(C.amber, 0.3);
                showCallout('WIDE!', 'off target', C.amber, '✕');
                ppa('ohh');
            }
        }
    }

    function withXY(cfg, x, y) {
        // shallow-copy a config with a fresh emit origin (and an upward fan for confetti)
        var o = {}; for (var k in cfg) o[k] = cfg[k];
        o.x = x; o.y = y;
        // confetti fans up-and-outward from each top corner; everything else jets straight up
        o.ang = (cfg.kind === 0) ? (-Math.PI / 2 + (x < 200 ? 0.5 : -0.5)) : -Math.PI / 2;
        return o;
    }

    function nextKick() {
        if (suddenDeath) {
            if (lastResult !== 'goal') { endNow(); return; }
            kickNum++; startKick(); return;
        }
        if (kickNum >= TOTAL_KICKS) {
            if (goals === TOTAL_KICKS) { suddenDeath = true; kickNum++; startKick(); ppa('whistle'); return; }
            endNow(); return;
        }
        kickNum++; startKick();
    }

    function endNow() {
        phase = 'done';
        GameEngine.state.score = score;
        GameEngine.endGame();
    }

    /* ---- juice primitives ---- */
    function addTrauma(t) { cam.trauma = Math.min(1, cam.trauma + J(t)); }
    function doHitStop(frames) { hitStop = RM ? 0 : frames; }   // a freeze is motion too — drop it under reduced-motion
    function flashNow(color, a) { flash.color = color; flash.a = RM ? Math.min(a, 0.22) : a; }
    function showCallout(text, sub, color, glyph) {
        callout.text = text; callout.sub = sub; callout.color = color; callout.glyph = glyph || '';
        callout.t = 0; callout.active = true; callout.life = 0;
    }
    function ppa(fn, arg) { if (window.PPAudio && window.PPAudio[fn]) { try { window.PPAudio[fn](arg); } catch (_) { } } }

    /* ============================================================
       UPDATE
       ============================================================ */
    function onUpdate(dt) {
        // hit-stop: freeze the sim but keep rendering the held frame
        if (hitStop > 0) { hitStop--; updateCamera(dt); return; }

        var sdt = dt * timeScale;

        // sweeps
        if (phase === 'aim') {
            var ca = diff().aim;
            aimT += (sdt / ca) * aimDir;
            if (aimT >= 1) { aimT = 1; aimDir = -1; } else if (aimT <= 0) { aimT = 0; aimDir = 1; }
            aimX = lerp(GOAL_LEFT + 16, GOAL_RIGHT - 16, aimT);
            kicker.runup = Math.min(1, kicker.runup + dt * 1.5);
        } else if (phase === 'power') {
            var cp = diff().pow;
            powT += (sdt / cp) * powDir;
            if (powT >= 1) { powT = 1; powDir = -1; } else if (powT <= 0) { powT = 0; powDir = 1; }
            // keeper lean tell
            if (leanTimer >= 0) {
                leanTimer -= dt;
                keeper.lean = lerp(keeper.lean, keeper.intend, Math.min(1, dt * 6));
            }
        } else if (phase === 'shoot') {
            updateShot(sdt);
        } else if (phase === 'outcome') {
            outcomeTimer -= dt;       // outcome timing is real-time (not slowed)
            // keep keeper diving visually
            keeper.diveT = Math.min(1, keeper.diveT + dt / Math.max(0.12, diff().dive));
            if (outcomeTimer <= 0) { timeScale = 1; cam.zoom = 1; nextKick(); }
        }

        // keeper idle sway (ready stance)
        keeper.sway = Math.sin(performance.now() / 380) * J(2);

        updateBallVisual(dt);
        updateNet(dt);
        updateParticles(sdt);
        updateCallout(dt);
        updateCamera(dt);
        if (flash.a > 0) flash.a = Math.max(0, flash.a - dt * 4.2);
    }

    function updateShot(sdt) {
        flightT += sdt / travelDur;
        var t = clamp01(flightT);
        ball.x = lerp(ball.startX, ball.endX, t);
        var arc = J(70) * Math.sin(t * Math.PI);     // slight rise then settle
        ball.y = lerp(ball.startY, ball.endY, t) - arc;
        ball.spin += sdt * 22;
        // kicker leg swing
        kicker.swing = Math.min(1, kicker.swing + sdt * 8);
        // ball trail (ghosting)
        if (!RM) { trail.push({ x: ball.x, y: ball.y }); if (trail.length > 8) trail.shift(); }
        // keeper dive begins on launch
        keeper.diveT = Math.min(1, keeper.diveT + sdt / Math.max(0.12, diff().dive));
        // decisive-kick slow-mo + zoom (last kick or sudden death), gated for reduced motion
        if (!RM && (kickNum === TOTAL_KICKS || suddenDeath) && t > 0.45) {
            timeScale = lerp(timeScale, 0.4, 0.12);
            cam.zoom = lerp(cam.zoom, 1.18, 0.12);
        }
        if (flightT >= 1) {
            ball.x = ball.endX; ball.y = ball.endY; ball.flying = false;
            timeScale = 1;
            resolveShot();
        }
    }

    function updateBallVisual(dt) {
        // ease ball squash back toward 1
        ball.squash = lerp(ball.squash, 1, Math.min(1, dt * 10));
    }

    function updateCallout(dt) {
        if (!callout.active) return;
        callout.life += dt;
        callout.t = Math.min(1, callout.t + dt / 0.32);
        if (callout.life > (callout.text === 'GOAL!' || callout.text === 'TOP BINS!' ? 1.3 : 1.0)) callout.active = false;
    }

    function updateCamera(dt) {
        if (cam.trauma > 0) {
            var s = cam.trauma * cam.trauma, amp = 13 * s;
            cam.shakeX = amp * (Math.random() * 2 - 1);
            cam.shakeY = amp * (Math.random() * 2 - 1);
            cam.trauma = Math.max(0, cam.trauma - dt * 1.8);
        } else { cam.shakeX = 0; cam.shakeY = 0; }
    }

    /* ============================================================
       OFFSCREEN STATIC STADIUM (built once, capped at DPR 2)
       ============================================================ */
    function buildBackground() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cv = document.createElement('canvas');
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var b = cv.getContext('2d');
        b.scale(dpr, dpr);

        // L0 — night sky
        var sky = b.createLinearGradient(0, HUD_H, 0, GOAL_LINE + 30);
        sky.addColorStop(0, C.purple); sky.addColorStop(0.5, C.blue); sky.addColorStop(1, C.cobalt);
        b.fillStyle = sky; b.fillRect(0, 0, W, H);

        // L1 — floodlight pylons + bloom (additive) + beams
        var lights = [[40, 70], [360, 70], [120, 56], [280, 56]];
        // pylon masts (structure) — taller, with a lamp housing + bulb grid
        for (var pm = 0; pm < lights.length; pm++) {
            var lx0 = lights[pm][0], ly0 = lights[pm][1];
            var main = (ly0 === 70), tall = main ? 30 : 20, ww = main ? 22 : 16;
            b.fillStyle = rgba(C.dark, 0.92); b.fillRect(lx0 - 2, ly0, 4, tall);
            b.fillStyle = rgba(C.dark, 0.85);
            GameEngine.drawRoundedRect(b, lx0 - ww / 2, ly0 - 7, ww, 8, 2); b.fill();
            var bulbs = main ? 4 : 3;
            for (var bz = 0; bz < bulbs; bz++) {
                b.fillStyle = rgba(C.lightBlue, 0.95);
                b.fillRect(lx0 - ww / 2 + 3 + bz * (ww - 6) / bulbs, ly0 - 5, 2.4, 4);
            }
        }
        b.save(); b.globalCompositeOperation = 'lighter';
        for (var i = 0; i < lights.length; i++) {
            var rad = (lights[i][1] === 70) ? 175 : 130;
            var lg = b.createRadialGradient(lights[i][0], lights[i][1], 4, lights[i][0], lights[i][1], rad);
            lg.addColorStop(0, rgba(C.lightBlue, 0.65));
            lg.addColorStop(0.4, rgba(C.pacific, 0.2));
            lg.addColorStop(1, rgba(C.pacific, 0));
            b.fillStyle = lg; b.fillRect(0, 0, W, 340);
        }
        // light beams (cones) from the two main corner pylons onto the pitch
        var beams = [[40, 78], [360, 78]];
        for (var bm = 0; bm < beams.length; bm++) {
            var bX = beams[bm][0], bY = beams[bm][1];
            var beamG = b.createLinearGradient(bX, bY, 200, 300);
            beamG.addColorStop(0, rgba(C.lightBlue, 0.16)); beamG.addColorStop(1, rgba(C.lightBlue, 0));
            b.fillStyle = beamG;
            b.beginPath(); b.moveTo(bX - 6, bY); b.lineTo(bX + 6, bY); b.lineTo(290, 300); b.lineTo(110, 300); b.closePath(); b.fill();
        }
        // amber warm "pub big-screen" glow from centre
        var warm = b.createRadialGradient(200, 150, 10, 200, 150, 230);
        warm.addColorStop(0, rgba(C.amber, 0.14)); warm.addColorStop(1, rgba(C.amber, 0));
        b.fillStyle = warm; b.fillRect(0, 0, W, 340);
        b.restore();

        // L2 — stands + crowd speckle
        b.fillStyle = rgba(C.blue, 0.9);
        b.beginPath(); b.moveTo(0, 110); b.lineTo(W, 110); b.lineTo(W, GOAL_TOP + 4); b.lineTo(0, GOAL_TOP + 4); b.closePath(); b.fill();
        var crowdCols = [C.lightPurple, C.light, C.purple, C.lightBlue];
        for (var ccc = 0; ccc < 520; ccc++) {
            var cxv = Math.random() * W, cyv = 112 + Math.random() * (GOAL_TOP - 116);
            b.fillStyle = rgba(crowdCols[(Math.random() * crowdCols.length) | 0], 0.5 + Math.random() * 0.4);
            b.fillRect(cxv, cyv, 1.6, 1.6);
        }

        // L3 — pitch (perspective trapezoid) + mowing stripes + atmospheric fade
        b.fillStyle = C.green;
        b.beginPath();
        b.moveTo(GOAL_LEFT - 6, GOAL_LINE); b.lineTo(GOAL_RIGHT + 6, GOAL_LINE);
        b.lineTo(W, H); b.lineTo(0, H); b.closePath(); b.fill();
        // mowing stripes
        for (var s = 0; s < 7; s++) {
            var y0 = GOAL_LINE + (H - GOAL_LINE) * (s / 7);
            var y1 = GOAL_LINE + (H - GOAL_LINE) * ((s + 1) / 7);
            b.fillStyle = (s % 2 === 0) ? rgba(C.white, 0.05) : rgba(C.dark, 0.06);
            // trapezoid band
            var wTop = lerp(GOAL_W + 12, W, (y0 - GOAL_LINE) / (H - GOAL_LINE));
            var wBot = lerp(GOAL_W + 12, W, (y1 - GOAL_LINE) / (H - GOAL_LINE));
            b.beginPath();
            b.moveTo(200 - wTop / 2, y0); b.lineTo(200 + wTop / 2, y0);
            b.lineTo(200 + wBot / 2, y1); b.lineTo(200 - wBot / 2, y1); b.closePath(); b.fill();
        }
        // atmospheric cobalt fade near the goal line (depth)
        var fade = b.createLinearGradient(0, GOAL_LINE, 0, GOAL_LINE + 120);
        fade.addColorStop(0, rgba(C.cobalt, 0.35)); fade.addColorStop(1, rgba(C.cobalt, 0));
        b.fillStyle = fade; b.fillRect(0, GOAL_LINE, W, 120);

        // light pools on the pitch (additive — grounds the keeper + ball in light)
        b.save(); b.globalCompositeOperation = 'lighter';
        var poolB = b.createRadialGradient(200, GOAL_LINE + 12, 6, 200, GOAL_LINE + 12, 150);
        poolB.addColorStop(0, rgba(C.lightBlue, 0.1)); poolB.addColorStop(1, rgba(C.lightBlue, 0));
        b.fillStyle = poolB; b.fillRect(0, GOAL_LINE - 20, W, 220);
        var poolA = b.createRadialGradient(200, SPOT_Y, 6, 200, SPOT_Y, 95);
        poolA.addColorStop(0, rgba(C.amber, 0.1)); poolA.addColorStop(1, rgba(C.amber, 0));
        b.fillStyle = poolA; b.fillRect(0, GOAL_LINE, W, H - GOAL_LINE);
        b.restore();

        // penalty arc + spot (baked, faint)
        b.strokeStyle = rgba(C.white, 0.5); b.lineWidth = 2;
        b.beginPath(); b.ellipse(200, SPOT_Y - 60, 110, 34, 0, Math.PI * 0.08, Math.PI * 0.92); b.stroke();
        b.fillStyle = rgba(C.white, 0.7); b.beginPath(); b.ellipse(200, SPOT_Y, 4, 2.4, 0, 0, Math.PI * 2); b.fill();

        // L (grain) — kill gradient banding
        for (var gn = 0; gn < 900; gn++) {
            b.fillStyle = rgba(Math.random() > 0.5 ? C.white : C.dark, 0.025);
            b.fillRect(Math.random() * W, Math.random() * H, 1, 1);
        }

        // vignette (premium unifier)
        var vg = b.createRadialGradient(200, 360, 120, 200, 360, 420);
        vg.addColorStop(0, rgba(C.blue, 0)); vg.addColorStop(1, rgba(C.dark, 0.56));
        b.fillStyle = vg; b.fillRect(0, 0, W, H);

        return cv;
    }

    /* ============================================================
       DRAW
       ============================================================ */
    function onDraw(ctx) {
        if (!bg) bg = buildBackground();

        ctx.save();
        // camera transform (HUD is drawn by the engine AFTER this -> stays steady)
        ctx.translate(cam.shakeX + cam.nudgeX, cam.shakeY + cam.nudgeY);
        if (cam.zoom !== 1) {
            ctx.translate(cam.fx, cam.fy); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.fx, -cam.fy);
        }

        ctx.drawImage(bg, 0, 0, W, H);     // cached stadium (1 blit)

        drawGoalAndNet(ctx);
        drawKeeper(ctx);
        drawAimAndPower(ctx);
        drawKicker(ctx);
        drawTrail(ctx);
        drawBall(ctx);
        drawParticles(ctx);
        drawCallout(ctx);

        ctx.restore();

        // full-screen flash (below HUD), outside the camera so it never shakes
        if (flash.a > 0) {
            ctx.save();
            ctx.fillStyle = flash.color; ctx.globalAlpha = flash.a;
            ctx.fillRect(0, HUD_H, W, H - HUD_H);
            ctx.restore();
        }

        drawScoreboard(ctx);   // jumbotron — drawn last so it sits above the scene, below HUD
    }

    function drawGoalAndNet(ctx) {
        // net (live, ripples on goal)
        ctx.strokeStyle = rgba(C.light, 0.28); ctx.lineWidth = 1;
        var n = net, cols = n.cols, rows = n.rows;
        // vertical strands
        for (var c = 0; c <= cols; c++) {
            ctx.beginPath();
            for (var r = 0; r <= rows; r++) {
                var nd = n.nodes[r * (cols + 1) + c];
                var x = nd.bx, y = nd.by + nd.push;
                if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        // horizontal strands
        for (var r2 = 0; r2 <= rows; r2++) {
            ctx.beginPath();
            for (var c2 = 0; c2 <= cols; c2++) {
                var nd2 = n.nodes[r2 * (cols + 1) + c2];
                var x2 = nd2.bx, y2 = nd2.by + nd2.push;
                if (c2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
            }
            ctx.stroke();
        }
        // posts + crossbar (white, mid-shadow for roundness)
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(C.mid, 0.6); ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(GOAL_LEFT + 1.5, GOAL_LINE); ctx.lineTo(GOAL_LEFT + 1.5, GOAL_TOP); ctx.lineTo(GOAL_RIGHT + 1.5, GOAL_TOP); ctx.stroke();
        ctx.strokeStyle = C.white; ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(GOAL_LEFT, GOAL_LINE); ctx.lineTo(GOAL_LEFT, GOAL_TOP);
        ctx.lineTo(GOAL_RIGHT, GOAL_TOP); ctx.lineTo(GOAL_RIGHT, GOAL_LINE);
        ctx.stroke();
    }

    // thick curved limb (knee/elbow bend) — bowed perpendicular by `bend`
    function limb(ctx, x0, y0, x1, y1, bend, w, style) {
        var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        var nx = -dy / len, ny = dx / len;
        ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(mx + nx * bend, my + ny * bend, x1, y1); ctx.stroke();
    }
    function boot(ctx, x, y, ang) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = rgba(C.dark, 0.95);
        ctx.beginPath(); ctx.ellipse(2, 0, 5.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawKeeper(ctx) {
        var ky = keeper.baseY;
        var diveX = keeperHandX();
        var t = outQuart(keeper.diveT);
        var active = (phase === 'shoot' || phase === 'outcome');
        var cx = lerp(200, diveX, active ? t : 0) + keeper.sway;
        var lean = keeper.lean * 8;
        var rot = (active ? lerp(0, keeper.dir * 0.6, t) : keeper.lean * 0.12);

        ctx.save();
        ctx.translate(cx + lean, ky - 36);
        ctx.rotate(rot);
        var stretch = 1 + 0.22 * (active ? t : 0);

        // contact shadow (soft, stretches into the dive)
        ctx.fillStyle = rgba(C.dark, 0.28);
        ctx.beginPath(); ctx.ellipse(0, 39, 22 * stretch, 5.5, 0, 0, Math.PI * 2); ctx.fill();

        // legs (mid->dark gradient, knee bend + boots)
        var legG = ctx.createLinearGradient(0, 18, 0, 40);
        legG.addColorStop(0, C.mid); legG.addColorStop(1, C.dark);
        var lLegX = -10 - 14 * stretch * (keeper.dir < 0 ? 1 : 0.2);
        var rLegX = 10 + 14 * stretch * (keeper.dir > 0 ? 1 : 0.2);
        limb(ctx, -1, 18, lLegX, 38, keeper.dir < 0 ? -3 : 2, 8, legG);
        limb(ctx, 1, 18, rLegX, 38, keeper.dir > 0 ? 3 : -2, 8, legG);
        boot(ctx, lLegX, 38, keeper.dir < 0 ? -0.5 : 0);
        boot(ctx, rLegX, 38, keeper.dir > 0 ? 0.5 : 0);

        // torso (magenta->purple gradient, slight curve)
        var tg2 = ctx.createLinearGradient(-8, -18, 8, 22);
        tg2.addColorStop(0, C.magenta); tg2.addColorStop(1, C.purple);
        ctx.strokeStyle = tg2; ctx.lineCap = 'round'; ctx.lineWidth = 15;
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(keeper.dir * 2, 4, 0, 20); ctx.stroke();

        // arms + gloves (red gloves — failure colour ON the action)
        var armSpread = 16 + 14 * (active ? t : 0.4);
        var laY = -16 - 10 * (keeper.dir < 0 ? t : 0), raY = -16 - 10 * (keeper.dir > 0 ? t : 0);
        limb(ctx, -2, -8, -armSpread, laY, -4, 6.5, C.purple);
        limb(ctx, 2, -8, armSpread, raY, 4, 6.5, C.purple);
        for (var gi = 0; gi < 2; gi++) {
            var gx = gi === 0 ? -armSpread : armSpread, gy = gi === 0 ? laY : raY;
            ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(gx, gy, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = rgba(C.amber, 0.9); ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(gx, gy, 6, Math.PI * 0.8, Math.PI * 1.7); ctx.stroke();
        }

        // head (amber, 2-tone)
        var hg = ctx.createLinearGradient(-7, -31, 7, -17);
        hg.addColorStop(0, C.amber); hg.addColorStop(1, rgba(C.amber, 0.7));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, -24, 7, 0, Math.PI * 2); ctx.fill();

        // rim light (lit edge toward the floodlights)
        ctx.strokeStyle = rgba(C.lightBlue, 0.55); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-7, -12); ctx.quadraticCurveTo(-9, 4, -6, 18); ctx.stroke();
        ctx.beginPath(); ctx.arc(-2, -25, 7, Math.PI * 0.7, Math.PI * 1.4); ctx.stroke();
        ctx.restore();
    }

    function drawKicker(ctx) {
        // kicker behind the ball, foreground; recedes (alpha) once the ball is gone
        var swing = outQuart(kicker.swing);
        var lean = kicker.runup * 8;
        ctx.save();
        ctx.translate(kicker.x, kicker.y);
        ctx.globalAlpha = phase === 'outcome' ? 0.85 : 1;

        // shadow
        ctx.fillStyle = rgba(C.dark, 0.32);
        ctx.beginPath(); ctx.ellipse(8, 30, 20, 5, 0, 0, Math.PI * 2); ctx.fill();

        // legs (cobalt->blue gradient, knee bend + boots)
        var legG = ctx.createLinearGradient(0, 10, 0, 34);
        legG.addColorStop(0, C.cobalt); legG.addColorStop(1, C.blue);
        limb(ctx, 2, 12, -4, 32, -3, 7, legG);                 // standing leg
        boot(ctx, -4, 33, -0.2);
        var footX = lerp(-2, 24, swing), footY = lerp(28, 6, swing);
        limb(ctx, 2, 12, footX, footY, 5, 7, legG);            // kicking leg — swings forward
        boot(ctx, footX, footY, 0.5 + swing * 0.5);

        // torso (pacific->cobalt, slight curve with lean)
        var tg = ctx.createLinearGradient(0, -28, 0, 12);
        tg.addColorStop(0, C.pacific); tg.addColorStop(1, C.cobalt);
        ctx.strokeStyle = tg; ctx.lineCap = 'round'; ctx.lineWidth = 13;
        ctx.beginPath(); ctx.moveTo(0, -16 + lean * 0.2); ctx.quadraticCurveTo(2 + lean * 0.1, -2, 2, 12); ctx.stroke();

        // arms (curved)
        limb(ctx, 0, -8, -12, 2 - swing * 8, -4, 5, C.cobalt);
        limb(ctx, 0, -8, 14, -4 - swing * 6, 4, 5, C.pacific);

        // head (2-tone) + rim
        var hg = ctx.createLinearGradient(-6, -32, 6, -20);
        hg.addColorStop(0, C.amber); hg.addColorStop(1, rgba(C.amber, 0.7));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(2, -26 + lean * 0.2, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(C.lightBlue, 0.55); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, -27, 6.5, Math.PI * 0.7, Math.PI * 1.4); ctx.stroke();
        ctx.restore();
    }

    function drawTrail(ctx) {
        if (!trail.length) return;
        for (var i = 0; i < trail.length; i++) {
            ctx.globalAlpha = (i / trail.length) * 0.4;
            ctx.fillStyle = C.lightBlue;
            ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, ball.r * 0.85, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawBall(ctx) {
        if (phase === 'done') return;
        var x = ball.x, y = ball.y;
        // ground shadow (height cue) — shrinks as the ball rises
        var heightFactor = clamp01((SPOT_Y - y) / (SPOT_Y - GOAL_TOP));
        ctx.fillStyle = rgba(C.dark, 0.3 * (1 - heightFactor * 0.6));
        ctx.beginPath();
        ctx.ellipse(x, Math.min(SPOT_Y + 6, y + ball.r + 6 + heightFactor * 40), ball.r * (1 - heightFactor * 0.4), ball.r * 0.4 * (1 - heightFactor * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();

        var speed = Math.hypot(ball.x - (ball.startX || x), 0);
        var stretch = ball.flying ? (1 + clamp01(flightT) * J(0.12)) : 1;
        var sx = stretch * ball.squash, sy = (1 / stretch) / ball.squash;

        ctx.save();
        ctx.translate(x, y);
        if (ball.flying) ctx.rotate(Math.atan2(ball.endY - ball.startY, ball.endX - ball.startX));
        ctx.scale(sx, sy);
        // body white->amber under the lights
        var g = ctx.createRadialGradient(-ball.r * 0.3, -ball.r * 0.3, 1, 0, 0, ball.r);
        g.addColorStop(0, C.white); g.addColorStop(1, C.amber);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, ball.r, 0, Math.PI * 2); ctx.fill();
        // spin pentagons (suggested by 2 dark dots that rotate)
        ctx.fillStyle = rgba(C.dark, 0.85);
        ctx.save(); ctx.rotate(ball.spin);
        ctx.beginPath(); ctx.arc(0, 0, ball.r * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ball.r * 0.55, 0, ball.r * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // spec highlight
        ctx.fillStyle = rgba(C.lightBlue, 0.8);
        ctx.beginPath(); ctx.arc(-ball.r * 0.35, -ball.r * 0.35, ball.r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawAimAndPower(ctx) {
        if (phase === 'aim') {
            // sweeping aim line + chevron
            var x = aimX;
            ctx.save();
            ctx.strokeStyle = rgba(C.amber, 0.85); ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(x, GOAL_TOP + 6); ctx.lineTo(x, GOAL_LINE - 4); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = C.amber;
            ctx.beginPath(); ctx.moveTo(x, GOAL_TOP - 2); ctx.lineTo(x - 6, GOAL_TOP - 12); ctx.lineTo(x + 6, GOAL_TOP - 12); ctx.closePath(); ctx.fill();
            ctx.restore();
            label(ctx, 'TAP TO AIM', 200, GOAL_LINE + 150, C.white, 13);
        } else if (phase === 'power') {
            // frozen aim marker
            ctx.strokeStyle = rgba(C.amber, 0.5); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(aimX, GOAL_TOP + 6); ctx.lineTo(aimX, GOAL_LINE - 4); ctx.stroke();
            // vertical power/height meter on the right margin
            var mx = 350, my0 = 330, my1 = 540, mh = my1 - my0;
            ctx.fillStyle = rgba(C.dark, 0.5); ctx.fillRect(mx - 8, my0, 16, mh);
            // danger zone (>0.95 = over the bar)
            ctx.fillStyle = rgba(C.red, 0.55); ctx.fillRect(mx - 8, my0, 16, mh * 0.05);
            // sweet zone (mid)
            ctx.fillStyle = rgba(C.teal, 0.35); ctx.fillRect(mx - 8, my0 + mh * 0.30, 16, mh * 0.45);
            // fill from bottom up to powT
            var fillH = mh * powT;
            ctx.fillStyle = C.amber; ctx.fillRect(mx - 8, my1 - fillH, 16, fillH);
            ctx.strokeStyle = C.white; ctx.lineWidth = 1.5; ctx.strokeRect(mx - 8, my0, 16, mh);
            label(ctx, 'TAP TO SET POWER', 200, GOAL_LINE + 150, C.white, 13);
        }
    }

    function label(ctx, text, x, y, color, size) {
        ctx.save();
        ctx.font = 'bold ' + size + 'px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(C.dark, 0.55);
        ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = color; ctx.fillText(text, x, y);
        ctx.restore();
    }

    function drawCallout(ctx) {
        if (!callout.active) return;
        var sc = RM ? 1 : (0.4 + outBack(callout.t) * 0.75);   // punch-in
        var a = callout.life > 0.8 ? Math.max(0, 1 - (callout.life - 0.8) / 0.5) : 1;
        ctx.save();
        ctx.translate(200, 250);
        ctx.scale(sc, sc);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (callout.glyph) {
            // shape channel — each outcome carries a distinct glyph, readable with no colour or motion
            ctx.font = 'bold 40px Arial, Helvetica, sans-serif';
            ctx.lineWidth = 5; ctx.strokeStyle = C.white; ctx.strokeText(callout.glyph, 0, -44);
            ctx.fillStyle = callout.color; ctx.fillText(callout.glyph, 0, -44);
        }
        ctx.font = 'bold 46px Arial, Helvetica, sans-serif';
        ctx.lineWidth = 6; ctx.strokeStyle = C.white; ctx.strokeText(callout.text, 0, 0);
        ctx.fillStyle = callout.color; ctx.fillText(callout.text, 0, 0);
        if (callout.sub) {
            ctx.font = 'bold 15px Arial, Helvetica, sans-serif';
            ctx.fillStyle = C.white; ctx.fillText(callout.sub, 0, 32);
        }
        ctx.restore();
    }

    function drawScoreboard(ctx) {
        // jumbotron strip just below the engine HUD
        var y = HUD_H + 4, h = 30;
        ctx.save();
        ctx.fillStyle = rgba(C.dark, 0.82);
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.fill();
        ctx.strokeStyle = rgba(C.cobalt, 0.9); ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.stroke();
        // LIVE dot + match-night tag
        ctx.fillStyle = C.lightBlue; ctx.beginPath(); ctx.arc(20, y + h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 10px Arial, Helvetica, sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(C.white, 0.7); ctx.textAlign = 'left';
        ctx.fillText('LIVE · MATCH NIGHT', 30, y + h / 2);
        // kick counter
        ctx.textAlign = 'center'; ctx.fillStyle = C.white; ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        var kc = suddenDeath ? 'SUDDEN DEATH' : ('KICK ' + Math.min(kickNum, TOTAL_KICKS) + ' / ' + TOTAL_KICKS);
        ctx.fillText(kc, 200, y + h / 2);
        // streak (amber pacifier)
        ctx.textAlign = 'right'; ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillStyle = streak > 1 ? C.amber : rgba(C.white, 0.55);
        ctx.fillText(streak > 1 ? ('⚽ x' + streak) : 'GOALS ' + goals, W - 18, y + h / 2);
        ctx.restore();
    }

    /* ============================================================
       INIT
       ============================================================ */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 640 });
        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'AFTER-HOURS SHOOTOUT',
                objective: "Match night at the pub — step up and take 10 penalties for KPMG United. Tap to lock your aim, tap again to set power and height, then beat the keeper.",
                controls: [
                    'Tap / Space to lock AIM (sweeps left–right)',
                    'Tap / Space again to set POWER & HEIGHT',
                    'Read the keeper’s lean, then place it past him'
                ],
                legend: {
                    collect: [
                        { icon: '\u{1F3AF}', label: 'Top corner', points: '2.5x' },
                        { icon: '↗️', label: 'Top middle', points: '1.8x' },
                        { icon: '⚽', label: 'Side low', points: '1.6x' }
                    ],
                    avoid: [
                        { icon: '\u{1F9E4}', label: 'The keeper' },
                        { icon: '⬆️', label: 'Over the bar' }
                    ]
                },
                tip: 'Top corners score biggest but risk flying over — power scatters your aim. Keep a scoring streak alive for bonus points.'
            },
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: function () { },
            onReset: function () { reset(); },
            onInit: function () { reset(); setupInput(); },
            onCountdownComplete: function () { startKick(); }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
