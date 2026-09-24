/**
 * Field Goal at the 'G
 * KPMG Newsletter Minigame, October 2026 edition: gridiron comes to the MCG.
 *
 * Ten field goals under the lights, 20 to 62 yards, from the hashes, in the wind.
 * Two taps per kick: lock the AIM (allow for the wind), then set the POWER.
 * Not enough power falls short; too much sprays the kick. Mirrors
 * games/penalty-pressure/ (Canvas 2D, zero deps, one cached stadium layer,
 * pooled particles, engine-clamped dt, one J() gate for reduced motion).
 *
 * The world is in YARDS and projected through one camera behind the holder:
 * X lateral (0 = the ball), Y height, Z downfield (0 = the holder's spot).
 * Deliberately generic: no league or club names, logos, colours or players.
 * Colours are KPMG palette only (rgba() values derive from palette hexes).
 */
(function () {
    'use strict';

    var GAME_ID = 'field-goal';
    var W = 400, H = 700;
    var HUD_H = GameEngine.HUD_HEIGHT;       // 48
    var C = KPMG.colours;

    /* ---- camera (yards -> logical px) ----
       The camera looks along the ball-to-posts line, so the posts are always
       centred and the field is drawn rotated when the kick is off a hash. */
    var HOR = 190, F = 780, CAM_H = 7, CAM_Z = 13;   // raised broadcast camera: the posts clear the line
    function depth(z) { return Math.max(0.5, z + CAM_Z); }
    function sx(x, z) { return 200 + F * x / depth(z); }
    function sy(y, z) { return HOR + F * (CAM_H - y) / depth(z); }
    function sc(z) { return F / depth(z); }   // px per yard at depth z

    /* ---- the kicking game (yards), exposed on window.FieldGoal for the tuning harness ---- */
    var MODEL = {
        KICKS: [20, 25, 30, 35, 40, 45, 50, 54, 58, 62],
        HASH: 3.08,               // hash marks sit at the uprights' own width
        HALF: 3.08,               // half the width between the uprights
        BALL: 0.15,               // ball radius, for the upright contact band
        BAR: 3.33,                // crossbar height (10 ft)
        TOP: 9.5,                 // stylised upright top
        AIM_SPAN: 5,              // aim sweeps +/- this many yards around the posts (on-screen at 20 yd)
        RANGE0: 12, RANGE1: 56,   // range = RANGE0 + RANGE1 * power
        BAR_DOINK: 0.03,          // power this far below the minimum clips the crossbar
        MIDDLE: 0.6,              // "down the middle" band (yards off centre)
        aimHalf: function (k) { return lerp(1.10, 0.72, k / 9); },   // s per sweep
        powHalf: function (k) { return lerp(0.95, 0.62, k / 9); },
        maxWind: function (k) { return k === 0 ? 6 : lerp(8, 22, k / 9); }, // km/h
        drift: function (wind, d) { return (wind / 20) * 5 * Math.pow(d / 62, 1.2); }, // yards, signed
        // the clean band above the minimum: forgiving on a chip shot, tight from 60
        sweet: function (d) { return Math.min(1 - MODEL.minPower(d), lerp(0.5, 0.1, clamp01((d - 20) / 42))); },
        minPower: function (d) { return clamp01((d - MODEL.RANGE0) / MODEL.RANGE1); },
        spray: function (d, power) {
            var excess = Math.max(0, power - MODEL.minPower(d) - MODEL.sweet(d));
            return 0.22 + 0.012 * d + 7 * excess * excess;
        },
        /* Pure outcome of one kick. rnd() is uniform [0,1); gauss built from it. */
        resolve: function (d, aimOff, power, wind, rnd) {
            var need = MODEL.minPower(d);
            var g = rnd() + rnd() + rnd() + rnd() - 2;           // ~N(0, 0.577)
            var x = aimOff + MODEL.drift(wind, d) + g * MODEL.spray(d, power);
            var edge = MODEL.HALF - MODEL.BALL;
            var r = { x: x, good: false, kind: '', doink: false, acc: 1 };
            if (power < need - MODEL.BAR_DOINK) { r.kind = 'short'; return r; }
            if (power < need) {                                    // clips the crossbar
                r.doink = true; r.good = rnd() < 0.5; r.kind = r.good ? 'bar-in' : 'bar-out'; return r;
            }
            var ax = Math.abs(x);
            if (Math.abs(ax - MODEL.HALF) < MODEL.BALL + 0.1) {   // off an upright
                r.doink = true; r.good = rnd() < 0.45; r.kind = r.good ? 'post-in' : 'post-out'; return r;
            }
            if (ax < edge) {
                r.good = true;
                r.kind = ax < MODEL.MIDDLE ? 'middle' : 'good';
                r.acc = 1 + 0.5 * clamp01(1 - ax / edge);
                return r;
            }
            r.kind = x < 0 ? 'wide-left' : 'wide-right';
            return r;
        },
        points: function (d, r, streak) {
            if (!r.good) return 0;
            return Math.round(d * 10 * (r.doink ? 1 : r.acc)) + Math.min(300, 50 * (streak - 1));
        },
        PERFECT: 1000
    };

    /* ---- reduced motion ---- */
    var RM = false;
    function J(m) { return RM ? 0 : m; }

    function rgba(hex, a) {
        var h = hex.replace('#', '');
        return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')';
    }
    function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
    function outQuart(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 4); }
    function outBack(t) { t = clamp01(t); var s = 1.70158, s1 = s + 1; return 1 + s1 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    /* ============================================================
       STATE
       ============================================================ */
    var phase;                 // 'aim' | 'power' | 'kick' | 'outcome' | 'done'
    var k, dist, hash, wind, postsZ, fwdU, fwdV;
    var made, streak, score;
    var aimT, aimDir, aimOff, powT, powDir, power;
    var result, flightT, flightDur, outcomeTimer;
    var ball, kicker, refs, cam, flash, callout, trail, streamT;
    var bg = null, field = null;

    function reset() {
        RM = GameEngine.prefersReducedMotion();
        k = 0; made = 0; streak = 0; score = 0;
        GameEngine.state.score = 0;
        cam = { trauma: 0, shakeX: 0, shakeY: 0, zoom: 1 };
        flash = { a: 0, color: C.white };
        callout = { text: '', sub: '', color: C.white, glyph: '', t: 0, life: 0, active: false };
        trail = []; streamT = 0;
        particlesClear();
        setupKick();
    }

    function setupKick() {
        dist = MODEL.KICKS[k];
        hash = k === 0 ? 0 : [-1, 0, 1][(Math.random() * 3) | 0] * MODEL.HASH;
        var mw = MODEL.maxWind(k);
        wind = Math.round(mw * (0.35 + 0.65 * Math.random())) * (Math.random() < 0.5 ? -1 : 1);
        postsZ = Math.sqrt(dist * dist + hash * hash);
        fwdU = -hash / postsZ; fwdV = dist / postsZ;
        ball = { x: 0, y: 0.15, z: 0, spin: 0, flying: false };
        kicker = { t: 0 };
        refs = { up: 0, wave: 0 };
        result = null; flightT = 0; trail.length = 0;
        aimT = 0.5; aimDir = 1; aimOff = 0; powT = 0; powDir = 1; power = 0;
        field = null;                               // rebuilt for this spot
        phase = 'aim';
    }

    /* Field coords (u across from the field centre, v downfield from the ball's
       yard line) -> camera frame [X, Z]. The ball sits at u = hash, the posts at u = 0. */
    function toCam(u, v) {
        var du = u - hash;
        return [du * fwdV - v * fwdU, du * fwdU + v * fwdV];
    }

    /* ============================================================
       PARTICLES (pooled, zero per-frame alloc)
       ============================================================ */
    var MAX = (GameEngine.isMobile && GameEngine.isMobile()) ? 150 : 300;
    var P = {
        x: new Float32Array(MAX), y: new Float32Array(MAX), vx: new Float32Array(MAX), vy: new Float32Array(MAX),
        life: new Float32Array(MAX), max: new Float32Array(MAX), size: new Float32Array(MAX),
        rot: new Float32Array(MAX), vr: new Float32Array(MAX), grav: new Float32Array(MAX),
        kind: new Uint8Array(MAX), alive: new Uint8Array(MAX), color: new Array(MAX), cursor: 0
    };
    function particlesClear() { for (var i = 0; i < MAX; i++) P.alive[i] = 0; }
    function emit(n, cfg, x, y, ang) {
        if (RM) return;
        for (var j = 0; j < n; j++) {
            var i = P.cursor; P.cursor = (P.cursor + 1) % MAX;
            P.x[i] = x + (Math.random() - 0.5) * cfg.spreadX; P.y[i] = y + (Math.random() - 0.5) * cfg.spreadY;
            var a = ang + (Math.random() - 0.5) * cfg.spread, sp = lerp(cfg.spMin, cfg.spMax, Math.random());
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
            P.vy[i] += P.grav[i] * dt; P.vx[i] *= 0.99; P.vy[i] *= 0.99;
            P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.rot[i] += P.vr[i] * dt;
        }
    }
    function drawParticles(ctx) {
        for (var i = 0; i < MAX; i++) {
            if (!P.alive[i]) continue;
            ctx.globalAlpha = Math.min(1, P.life[i] / P.max[i]);
            ctx.fillStyle = P.color[i];
            if (P.kind[i] === 0) {
                ctx.save(); ctx.translate(P.x[i], P.y[i]); ctx.rotate(P.rot[i]);
                ctx.fillRect(-P.size[i] / 2, -P.size[i] / 3, P.size[i], P.size[i] * 0.6);
                ctx.restore();
            } else {
                ctx.fillRect(P.x[i] - P.size[i] / 2, P.y[i] - P.size[i] / 2, P.size[i], P.size[i]);
            }
        }
        ctx.globalAlpha = 1;
    }
    var CONFETTI = { kind: 0, colors: C.palette, spread: 1.6, spMin: 120, spMax: 300, lifeMin: 1.0, lifeMax: 1.9, szMin: 5, szMax: 9, grav: 260, spreadX: 30, spreadY: 10 };
    var TURF = { kind: 1, colors: [C.green, C.white, C.dark], spread: 1.2, spMin: 40, spMax: 150, lifeMin: 0.3, lifeMax: 0.6, szMin: 2, szMax: 4, grav: 520, spreadX: 10, spreadY: 4 };

    /* ============================================================
       INPUT: one verb (tap / Space / Enter / Up)
       ============================================================ */
    function setupInput() {
        GameEngine.setupInput({
            onTap: function () { handleTap(); },     // engine maps Space and Enter here
            onKey: function (key) { if (key === 'ArrowUp' || key === 'w' || key === 'W') handleTap(); }
        });
    }

    function handleTap() {
        if (phase === 'aim') {
            aimOff = lerp(-MODEL.AIM_SPAN, MODEL.AIM_SPAN, aimT);
            phase = 'power'; powT = 0; powDir = 1;
            sfx('tick', 'aim');
        } else if (phase === 'power') {
            power = powT;
            launch();
            sfx('tick', 'power');
        }
    }

    function launch() {
        result = MODEL.resolve(dist, aimOff, power, wind, Math.random);
        var need = MODEL.minPower(dist);
        // flight path, world yards. Short kicks come down before the posts.
        var reach = result.kind === 'short' ? lerp(0.55, 0.9, clamp01(power / Math.max(0.01, need))) * dist : dist;
        var crossH = result.kind.indexOf('bar') === 0 ? MODEL.BAR : lerp(MODEL.BAR + 0.8, MODEL.BAR + 5, clamp01((power - need) / 0.4));
        ball.fx = result.x;                        // where it crosses the goal plane
        ball.reach = reach; ball.crossH = crossH;
        ball.flying = true;
        flightDur = 0.9 + dist / 70;
        flightT = 0;
        phase = 'kick';
        emit(10, TURF, sx(0, 0), sy(0, 0), -Math.PI / 2);
        sfx('kick', power);
    }

    /* ball position along its flight, u in [0, 1+] (u = 1 at the goal plane) */
    function flightPos(u) {
        // two eased halves through (0, 0.15), an apex at u = 0.62, and (1, crossH)
        var a = 0.62, peak = ball.crossH + 1.5 + dist * 0.04, y;
        if (u <= a) { var t = u / a; y = lerp(0.15, peak, 1 - (1 - t) * (1 - t)); }
        else if (u <= 1) { var t2 = (u - a) / (1 - a); y = lerp(peak, ball.crossH, t2 * t2); }
        else y = Math.max(0.15, ball.crossH - (u - 1) * 18);
        return { x: ball.fx * u, y: y, z: u * postsZ };   // drift is linear to the plane: enough at this size
    }

    function settle() {
        phase = 'outcome';
        outcomeTimer = result.good ? 1.5 : 1.2;
        var gx = 200, gy = sy(MODEL.BAR + 2, postsZ);
        if (result.good) {
            made++; streak++;
            var pts = MODEL.points(dist, result, streak);
            score += pts;
            var perfect = k === MODEL.KICKS.length - 1 && made === MODEL.KICKS.length;
            if (perfect) score += MODEL.PERFECT;
            GameEngine.state.score = score;
            refs.up = 0.0001;
            flashNow(C.teal, 0.35); addTrauma(0.5);
            emit(55, CONFETTI, gx - 60, gy, -Math.PI / 2 + 0.5);
            emit(55, CONFETTI, gx + 60, gy, -Math.PI / 2 - 0.5);
            var title = result.kind === 'middle' ? 'DOWN THE MIDDLE!' : result.doink ? 'DOINK... GOOD!' : "IT'S GOOD!";
            showCallout(perfect ? 'PERFECT TEN!' : title, '+' + pts + (perfect ? '  +' + MODEL.PERFECT + ' BONUS' : '  ·  ' + dist + ' YD'),
                        result.kind === 'middle' || perfect ? C.pacific : C.teal, '✔');
            sfx('roar');
        } else {
            streak = 0;
            refs.wave = 0.0001;
            addTrauma(0.3);
            flashNow(C.amber, 0.25);
            var t = { 'short': ['SHORT!', 'needed more leg'], 'bar-out': ['DOINK! NO GOOD', 'off the crossbar'],
                      'post-out': ['DOINK! NO GOOD', 'off the upright'], 'wide-left': ['WIDE LEFT', 'mind the wind'],
                      'wide-right': ['WIDE RIGHT', 'mind the wind'] }[result.kind];
            showCallout(t[0], t[1], C.amber, '✖');
            sfx('ohh');
        }
    }

    function next() {
        k++;
        if (k >= MODEL.KICKS.length) { phase = 'done'; GameEngine.state.score = score; GameEngine.endGame(); return; }
        setupKick();
    }

    function addTrauma(t) { cam.trauma = Math.min(1, cam.trauma + J(t)); }
    function flashNow(color, a) { flash.color = color; flash.a = RM ? Math.min(a, 0.2) : a; }
    function showCallout(text, sub, color, glyph) {
        callout.text = text; callout.sub = sub; callout.color = color; callout.glyph = glyph;
        callout.t = 0; callout.life = 0; callout.active = true;
    }
    function sfx(fn, arg) { if (window.PPAudio && window.PPAudio[fn]) { try { window.PPAudio[fn](arg); } catch (_) { } } }

    /* ============================================================
       UPDATE
       ============================================================ */
    function onUpdate(dt) {
        streamT += dt;
        if (phase === 'aim') {
            aimT += (dt / MODEL.aimHalf(k)) * aimDir;
            if (aimT >= 1) { aimT = 1; aimDir = -1; } else if (aimT <= 0) { aimT = 0; aimDir = 1; }
        } else if (phase === 'power') {
            powT += (dt / MODEL.powHalf(k)) * powDir;
            if (powT >= 1) { powT = 1; powDir = -1; } else if (powT <= 0) { powT = 0; powDir = 1; }
        } else if (phase === 'kick') {
            kicker.t = Math.min(1, kicker.t + dt * 5);
            flightT += dt / flightDur;
            // the verdict lands as the ball reaches the posts (or the turf, if short)
            var end = result.kind === 'short' ? ball.reach / dist : 1;
            var u = Math.min(flightT, end);
            var p = flightPos(u);
            if (result.kind === 'short') p.y = Math.max(0.15, (3.5 + dist * 0.04) * Math.sin(Math.PI * u / end));
            ball.x = p.x; ball.y = p.y; ball.z = p.z;
            ball.spin += dt * 14;
            if (!RM) { trail.push(sx(ball.x, ball.z), sy(ball.y, ball.z)); if (trail.length > 16) trail.splice(0, 2); }
            if (!RM) cam.zoom = lerp(1, 1.12, clamp01(flightT));
            // made and wide kicks sail on; doinks and short kicks drop dead
            if (flightT >= end) { ball.flying = result.good || result.kind.indexOf('wide') === 0; settle(); }
        } else if (phase === 'outcome') {
            outcomeTimer -= dt;
            if (ball.flying) {                     // on into the stands
                flightT += dt / flightDur;
                var q = flightPos(Math.min(flightT, 1.5));
                ball.x = q.x; ball.y = q.y; ball.z = q.z; ball.spin += dt * 14;
            } else if (result.doink) {             // off the iron: drop to the turf
                ball.y = Math.max(0.15, ball.y - dt * 9); ball.z += dt * (result.kind === 'bar-out' ? -2 : 0);
            }
            if (outcomeTimer <= 0) { cam.zoom = 1; next(); }
        }
        if (refs.up > 0) refs.up = Math.min(1, refs.up + dt * 5);
        if (refs.wave > 0) refs.wave += dt;
        updateParticles(dt);
        if (callout.active) { callout.life += dt; callout.t = Math.min(1, callout.t + dt / 0.3); if (callout.life > 1.3) callout.active = false; }
        if (cam.trauma > 0) {
            var s = cam.trauma * cam.trauma * 11;
            cam.shakeX = s * (Math.random() * 2 - 1); cam.shakeY = s * (Math.random() * 2 - 1);
            cam.trauma = Math.max(0, cam.trauma - dt * 1.8);
        } else { cam.shakeX = 0; cam.shakeY = 0; }
        if (flash.a > 0) flash.a = Math.max(0, flash.a - dt * 4);
    }

    /* ============================================================
       STADIUM (built once, capped at DPR 2): sky, skyline, light towers, stands
       ============================================================ */
    function buildStadium() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cv = document.createElement('canvas');
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var b = cv.getContext('2d'); b.scale(dpr, dpr);

        var sky = b.createLinearGradient(0, HUD_H, 0, 300);
        sky.addColorStop(0, C.purple); sky.addColorStop(0.55, C.blue); sky.addColorStop(1, C.cobalt);
        b.fillStyle = sky; b.fillRect(0, 0, W, H);
        for (var st = 0; st < 40; st++) {                       // a few stars
            b.fillStyle = rgba(C.white, 0.25 + Math.random() * 0.4);
            b.fillRect(Math.random() * W, HUD_H + 40 + Math.random() * 70, 1.2, 1.2);
        }

        // city skyline beyond the far stand: a generic CBD, one crowned tower
        var towers = [[8, 22, 58], [30, 16, 40], [46, 20, 72], [66, 14, 50], [80, 24, 96], [104, 12, 44],
                      [300, 18, 48], [318, 22, 80], [340, 14, 58], [354, 26, 104], [380, 16, 62]];
        for (var t = 0; t < towers.length; t++) {
            var tx = towers[t][0], tw = towers[t][1], th = towers[t][2];
            b.fillStyle = rgba(C.blue, 0.95); b.fillRect(tx, 176 - th, tw, th + 10);
            for (var wy = 176 - th + 5; wy < 176; wy += 6) for (var wx = tx + 3; wx < tx + tw - 2; wx += 5)
                if (Math.random() < 0.35) { b.fillStyle = rgba(C.lightBlue, 0.45); b.fillRect(wx, wy, 1.6, 2); }
        }
        b.fillStyle = C.amber; b.fillRect(354, 72, 26, 6);        // the crowned tower's gold cap
        b.fillStyle = rgba(C.amber, 0.6); b.fillRect(364, 60, 6, 12);

        // six leaning light towers ringing the ground, lamp banks up top
        var lt = [[24, 120, 0.18], [120, 108, -0.05], [280, 108, 0.05], [376, 120, -0.18]];   // clear of the scoreboard
        b.save(); b.globalCompositeOperation = 'lighter';
        for (var i = 0; i < lt.length; i++) {
            var g = b.createRadialGradient(lt[i][0], lt[i][1], 3, lt[i][0], lt[i][1], 150);
            g.addColorStop(0, rgba(C.lightBlue, 0.55)); g.addColorStop(0.35, rgba(C.pacific, 0.16)); g.addColorStop(1, rgba(C.pacific, 0));
            b.fillStyle = g; b.fillRect(0, 0, W, 330);
        }
        b.restore();
        for (var m = 0; m < lt.length; m++) {
            var x0 = lt[m][0], y0 = lt[m][1], lean = lt[m][2];
            b.strokeStyle = rgba(C.dark, 0.95); b.lineWidth = 4;
            b.beginPath(); b.moveTo(x0 - lean * 90, 190); b.lineTo(x0, y0 + 6); b.stroke();
            b.save(); b.translate(x0, y0); b.rotate(lean);
            b.fillStyle = rgba(C.dark, 0.95); GameEngine.drawRoundedRect(b, -16, -8, 32, 14, 2); b.fill();
            for (var r = 0; r < 2; r++) for (var c = 0; c < 6; c++) {
                b.fillStyle = C.white; b.fillRect(-13 + c * 4.6, -5.5 + r * 5.5, 3, 3.5);
            }
            b.restore();
        }

        // the stand: a deep bowl, three tiers, a roof line, crowd speckle
        var tiers = [[150, 186, 0.9], [186, 226, 0.85], [226, 300, 0.95]];
        for (var tr = 0; tr < tiers.length; tr++) {
            b.fillStyle = rgba(tr === 1 ? C.cobalt : C.blue, tiers[tr][2]);
            b.fillRect(0, tiers[tr][0], W, tiers[tr][1] - tiers[tr][0]);
            b.fillStyle = rgba(C.dark, 0.45); b.fillRect(0, tiers[tr][1] - 3, W, 3);
        }
        b.fillStyle = rgba(C.dark, 0.9); b.fillRect(0, 146, W, 6);           // roof edge
        var crowd = [C.lightPurple, C.light, C.lightBlue, C.white, C.pacific, C.amber];
        for (var cc = 0; cc < 1500; cc++) {
            var cy = 153 + Math.random() * 145;
            if (cy > 183 && cy < 189 || cy > 223 && cy < 229) continue;
            b.fillStyle = rgba(crowd[(Math.random() * crowd.length) | 0], 0.35 + Math.random() * 0.45);
            b.fillRect(Math.random() * W, cy, 1.8, 1.8);
        }
        // big screens in the stand corners
        b.fillStyle = rgba(C.dark, 0.95); b.fillRect(14, 190, 64, 30); b.fillRect(322, 190, 64, 30);
        b.fillStyle = rgba(C.pacific, 0.35); b.fillRect(17, 193, 58, 24); b.fillRect(325, 193, 58, 24);

        // grain
        for (var gn = 0; gn < 700; gn++) {
            b.fillStyle = rgba(Math.random() > 0.5 ? C.white : C.dark, 0.025);
            b.fillRect(Math.random() * W, Math.random() * H, 1, 1);
        }
        return cv;
    }

    /* ============================================================
       FIELD (rebuilt once per kick: the spot, hash and distance move it)
       ============================================================ */
    /* field polygon/line helpers: field coords in, clipped to the near plane, projected */
    var NEAR = 1 - CAM_Z;                                    // camera-frame Z of the near plane
    function clipPoly(pts) {
        var out = [];
        for (var i = 0; i < pts.length; i++) {
            var a = pts[i], c = pts[(i + 1) % pts.length], ain = a[1] >= NEAR, cin = c[1] >= NEAR;
            if (ain) out.push(a);
            if (ain !== cin) { var t = (NEAR - a[1]) / (c[1] - a[1]); out.push([lerp(a[0], c[0], t), NEAR]); }
        }
        return out;
    }
    function fpoly(b, uv) {
        var pts = clipPoly(uv.map(function (p) { return toCam(p[0], p[1]); }));
        if (pts.length < 3) return false;
        b.beginPath();
        for (var i = 0; i < pts.length; i++) b[i ? 'lineTo' : 'moveTo'](sx(pts[i][0], pts[i][1]), sy(0, pts[i][1]));
        b.closePath();
        return true;
    }
    function fline(b, u0, v0, u1, v1, wYd, minW) {
        var a = toCam(u0, v0), c = toCam(u1, v1);
        if (a[1] < NEAR && c[1] < NEAR) return;
        if (a[1] < NEAR) { var t = (NEAR - a[1]) / (c[1] - a[1]); a = [lerp(a[0], c[0], t), NEAR]; }
        if (c[1] < NEAR) { var t2 = (NEAR - c[1]) / (a[1] - c[1]); c = [lerp(c[0], a[0], t2), NEAR]; }
        b.lineWidth = Math.max(minW || 0.6, wYd * sc((a[1] + c[1]) / 2));
        b.beginPath(); b.moveTo(sx(a[0], a[1]), sy(0, a[1])); b.lineTo(sx(c[0], c[1]), sy(0, c[1])); b.stroke();
    }
    function ftext(b, text, u, v, sizeYd, alpha) {
        var p = toCam(u, v);
        if (p[1] < NEAR + 1) return;
        var s = sc(p[1]), fs = s * sizeYd;
        if (fs < 4) return;
        var squash = clamp01((sy(0, p[1]) - sy(0, p[1] + sizeYd)) / fs);   // lie it flat on the turf
        b.save(); b.translate(sx(p[0], p[1]), sy(0, p[1] + sizeYd / 2)); b.scale(1, Math.max(0.1, squash));
        b.font = 'bold ' + Math.round(fs) + 'px Arial, Helvetica, sans-serif';
        b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillStyle = rgba(C.white, alpha);
        b.fillText(text, 0, 0); b.restore();
    }

    function buildField() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cv = document.createElement('canvas');
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var b = cv.getContext('2d'); b.scale(dpr, dpr);
        var gl = dist - 10, back = -CAM_Z - 20, L = -26.67, R = 26.67;   // goal line, behind camera, sidelines

        // grass to the fence, mowing stripes every 5 yd, the end zone
        var fence = sy(0, postsZ + 14);
        b.fillStyle = C.green; b.fillRect(0, fence, W, H);
        for (var v = gl, j = 0; v > back; v -= 5, j++) {
            b.fillStyle = j % 2 === 0 ? rgba(C.white, 0.05) : rgba(C.dark, 0.07);
            if (fpoly(b, [[L, v - 5], [R, v - 5], [R, v], [L, v]])) b.fill();
        }
        b.fillStyle = rgba(C.blue, 0.92);
        if (fpoly(b, [[L, gl], [R, gl], [R, dist], [L, dist]])) b.fill();
        ftext(b, 'MELBOURNE', 0, gl + 3, 2.8, 0.85);

        // sidelines, goal line, end line, yard lines, hash ticks, numbers
        b.strokeStyle = rgba(C.white, 0.9);
        fline(b, L, back, L, dist, 0.12, 1); fline(b, R, back, R, dist, 0.12, 1);
        fline(b, L, gl, R, gl, 0.22); fline(b, L, dist, R, dist, 0.15);
        for (var yd = 5; gl - yd > back; yd += 5) {
            var vv = gl - yd;
            fline(b, L, vv, R, vv, 0.1);
            if (yd % 10 === 0 && yd <= 50) {
                ftext(b, String(yd), L + 9, vv - 1, 2, 0.8);
                ftext(b, String(yd), R - 9, vv - 1, 2, 0.8);
            }
        }
        for (var hv = gl - 1; hv > back; hv -= 1) {
            fline(b, -MODEL.HASH - 0.35, hv, -MODEL.HASH + 0.35, hv, 0.08);
            fline(b, MODEL.HASH - 0.35, hv, MODEL.HASH + 0.35, hv, 0.08);
        }
        b.strokeStyle = rgba(C.pacific, 0.9); fline(b, L, 7, R, 7, 0.16);   // line of scrimmage

        // depth fade at the fence, a light pool on the spot, the vignette
        var fade = b.createLinearGradient(0, fence, 0, fence + 60);
        fade.addColorStop(0, rgba(C.cobalt, 0.5)); fade.addColorStop(1, rgba(C.cobalt, 0));
        b.fillStyle = fade; b.fillRect(0, fence, W, 60);
        var pool = b.createRadialGradient(200, sy(0, 0), 8, 200, sy(0, 0), 150);
        pool.addColorStop(0, rgba(C.lightBlue, 0.14)); pool.addColorStop(1, rgba(C.lightBlue, 0));
        b.fillStyle = pool; b.fillRect(0, fence, W, H - fence);
        var vg = b.createRadialGradient(200, 380, 140, 200, 380, 430);
        vg.addColorStop(0, rgba(C.blue, 0)); vg.addColorStop(1, rgba(C.dark, 0.5));
        b.fillStyle = vg; b.fillRect(0, fence, W, H - fence);
        return cv;
    }

    /* ============================================================
       DRAW
       ============================================================ */
    function onDraw(ctx) {
        if (!bg) bg = buildStadium();
        if (!field) field = buildField();
        var fx = 200, fy = sy(MODEL.BAR, postsZ);
        ctx.save();
        ctx.translate(cam.shakeX, cam.shakeY);
        if (cam.zoom !== 1) { ctx.translate(fx, fy); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-fx, -fy); }
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.drawImage(field, 0, 0, W, H);

        var behind = ball.z > postsZ;                // the ball has passed the posts
        if (behind) drawBall(ctx);
        drawRefs(ctx);
        drawPosts(ctx);
        drawAim(ctx);
        if (!behind) drawTrail(ctx);
        drawLine(ctx);
        drawHolderAndKicker(ctx);
        if (!behind) drawBall(ctx);
        drawParticles(ctx);
        ctx.restore();

        if (flash.a > 0) {
            ctx.save(); ctx.globalAlpha = flash.a; ctx.fillStyle = flash.color;
            ctx.fillRect(0, HUD_H, W, H - HUD_H); ctx.restore();
        }
        drawPower(ctx);
        drawCallout(ctx);
        drawScoreboard(ctx);
    }

    function drawPosts(ctx) {
        var px = 0, z = postsZ, s = sc(z);
        var base = sy(0, z), bar = sy(MODEL.BAR, z), top = sy(MODEL.TOP, z);
        var xl = sx(px - MODEL.HALF, z), xr = sx(px + MODEL.HALF, z), xm = sx(px, z);
        var lw = Math.max(2.5, s * 0.22);
        ctx.save();
        ctx.lineCap = 'round';
        // shadow side then face, so the yellow reads round under the lights
        ctx.strokeStyle = rgba(C.dark, 0.5); ctx.lineWidth = lw + 2;
        ctx.beginPath(); ctx.moveTo(xm + 1, base); ctx.lineTo(xm + 1, bar + s * 0.6);
        ctx.quadraticCurveTo(xm + 1, bar, xm - s * 1.2, bar); ctx.lineTo(xl + 1, bar); ctx.lineTo(xl + 1, top);
        ctx.moveTo(xm, bar); ctx.lineTo(xr + 1, bar); ctx.lineTo(xr + 1, top); ctx.stroke();
        ctx.strokeStyle = C.amber; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(xm, base); ctx.lineTo(xm, bar + s * 0.6);
        ctx.quadraticCurveTo(xm, bar, xm - s * 1.2, bar); ctx.lineTo(xl, bar); ctx.lineTo(xl, top);
        ctx.moveTo(xm, bar); ctx.lineTo(xr, bar); ctx.lineTo(xr, top); ctx.stroke();
        // padding on the base post
        ctx.fillStyle = C.blue; ctx.fillRect(xm - lw * 1.3, base - s * 2, lw * 2.6, s * 2);
        // wind streamers on top of each upright, streaming downwind
        var len = s * (0.6 + Math.abs(wind) * 0.09), dir = wind >= 0 ? 1 : -1;
        [xl, xr].forEach(function (x) {
            ctx.strokeStyle = C.red; ctx.lineWidth = Math.max(1.5, s * 0.12);
            ctx.beginPath(); ctx.moveTo(x, top);
            for (var i = 1; i <= 6; i++) {
                var f = i / 6;
                var wob = Math.sin(streamT * (6 + Math.abs(wind) * 0.4) + i * 1.3) * J(s * 0.12) * f;
                ctx.lineTo(x + dir * len * f, top + s * (0.15 + 0.5 * (1 - Math.min(1, Math.abs(wind) / 12))) * f + wob);
            }
            ctx.stroke();
        });
        ctx.restore();
    }

    function figure(ctx, x, y, s, jersey, pose) {
        // compact broadcast-distance player, s = px per yard
        var h = s * 1.6;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = rgba(C.dark, 0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, h * 0.28, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.white; ctx.lineCap = 'round'; ctx.lineWidth = h * 0.13;
        ctx.beginPath(); ctx.moveTo(-h * 0.08, 0); ctx.lineTo(-h * 0.1, -h * 0.45); ctx.moveTo(h * 0.08, 0); ctx.lineTo(h * 0.1, -h * 0.45); ctx.stroke();
        ctx.fillStyle = jersey;
        GameEngine.drawRoundedRect(ctx, -h * 0.2, -h * 0.82, h * 0.4, h * 0.42, h * 0.08); ctx.fill();
        if (pose === 'up') {
            ctx.strokeStyle = jersey; ctx.lineWidth = h * 0.09;
            ctx.beginPath(); ctx.moveTo(-h * 0.16, -h * 0.75); ctx.lineTo(-h * 0.26, -h * 1.2);
            ctx.moveTo(h * 0.16, -h * 0.75); ctx.lineTo(h * 0.26, -h * 1.2); ctx.stroke();
        }
        ctx.fillStyle = jersey;
        ctx.beginPath(); ctx.arc(0, -h * 0.95, h * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawRefs(ctx) {
        // two officials under the uprights: both arms up = GOOD, arms crossing = NO GOOD
        var z = postsZ + 0.5, s = sc(z);
        [-MODEL.HALF - 0.8, MODEL.HALF + 0.8].forEach(function (ox, i) {
            var x = sx(ox, z), y = sy(0, z), h = s * 1.9;
            ctx.save(); ctx.translate(x, y);
            ctx.strokeStyle = C.dark; ctx.lineCap = 'round'; ctx.lineWidth = h * 0.12;
            ctx.beginPath(); ctx.moveTo(-h * 0.07, 0); ctx.lineTo(-h * 0.08, -h * 0.45); ctx.moveTo(h * 0.07, 0); ctx.lineTo(h * 0.08, -h * 0.45); ctx.stroke();
            ctx.fillStyle = C.white; ctx.fillRect(-h * 0.18, -h * 0.84, h * 0.36, h * 0.42);
            ctx.fillStyle = C.dark;
            for (var st = 0; st < 3; st++) ctx.fillRect(-h * 0.18 + st * h * 0.13 + h * 0.03, -h * 0.84, h * 0.05, h * 0.42);
            ctx.strokeStyle = C.white; ctx.lineWidth = h * 0.08;
            ctx.beginPath();
            if (refs.up > 0) {
                var a = outQuart(refs.up);
                ctx.moveTo(-h * 0.15, -h * 0.78); ctx.lineTo(-h * lerp(0.28, 0.2, a), -h * lerp(0.45, 1.35, a));
                ctx.moveTo(h * 0.15, -h * 0.78); ctx.lineTo(h * lerp(0.28, 0.2, a), -h * lerp(0.45, 1.35, a));
            } else if (refs.wave > 0) {
                var sw = Math.sin(refs.wave * 14) * (RM ? 0 : 0.25);
                ctx.moveTo(-h * 0.15, -h * 0.72); ctx.lineTo(h * (0.3 + sw), -h * 0.62);
                ctx.moveTo(h * 0.15, -h * 0.72); ctx.lineTo(-h * (0.3 + sw), -h * 0.62);
            } else {
                ctx.moveTo(-h * 0.15, -h * 0.78); ctx.lineTo(-h * 0.22, -h * 0.42);
                ctx.moveTo(h * 0.15, -h * 0.78); ctx.lineTo(h * 0.22, -h * 0.42);
            }
            ctx.stroke();
            ctx.fillStyle = C.dark; ctx.beginPath(); ctx.arc(0, -h * 0.97, h * 0.13, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });
    }

    function drawLine(ctx) {
        // the lines at scrimmage: rushers (purple) beyond, our blockers (blue) in front
        for (var i = -3; i <= 3; i++) {
            if (i === 0) continue;
            var r = toCam(hash + i * 1.5 + 0.4, 8.2);
            figure(ctx, sx(r[0], r[1]), sy(0, r[1]), sc(r[1]), C.purple, 'up');
        }
        for (var j = -3; j <= 3; j++) {
            var o = toCam(hash + j * 1.15, 6.5);
            figure(ctx, sx(o[0], o[1]), sy(0, o[1]), sc(o[1]), C.cobalt);
        }
    }

    function drawHolderAndKicker(ctx) {
        var s = sc(0), bx = sx(0, 0), by = sy(0, 0);
        // holder: on one knee to the right of the ball, back to camera, finger on the tip
        var hx = bx + s * 0.55;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.fillStyle = rgba(C.dark, 0.3);
        ctx.beginPath(); ctx.ellipse(hx, by + s * 0.12, s * 0.62, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.white; ctx.lineWidth = s * 0.2;
        ctx.beginPath(); ctx.moveTo(hx + s * 0.08, by - s * 0.42); ctx.lineTo(hx + s * 0.2, by + s * 0.02);   // knee down
        ctx.lineTo(hx + s * 0.26, by + s * 0.3); ctx.stroke();                                               // shin on the turf
        ctx.beginPath(); ctx.moveTo(hx - s * 0.08, by - s * 0.42); ctx.lineTo(hx - s * 0.3, by - s * 0.5);    // front thigh
        ctx.lineTo(hx - s * 0.3, by - s * 0.02); ctx.stroke();
        ctx.fillStyle = C.dark;
        ctx.beginPath(); ctx.ellipse(hx - s * 0.3, by, s * 0.14, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx + s * 0.28, by + s * 0.33, s * 0.1, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.blue;                                                                             // back, leaning in
        ctx.beginPath(); ctx.moveTo(hx - s * 0.26, by - s * 0.4); ctx.lineTo(hx + s * 0.24, by - s * 0.4);
        ctx.lineTo(hx + s * 0.18, by - s * 1.05); ctx.lineTo(hx - s * 0.4, by - s * 1.0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.pacific; ctx.fillRect(hx - s * 0.3, by - s * 0.55, s * 0.52, s * 0.07);
        ctx.strokeStyle = C.blue; ctx.lineWidth = s * 0.13;                                                 // arm to the ball tip
        ctx.beginPath(); ctx.moveTo(hx - s * 0.32, by - s * 0.92);
        if (phase === 'aim' || phase === 'power') ctx.lineTo(bx + s * 0.05, by - s * 0.42);
        else ctx.lineTo(hx - s * 0.5, by - s * 1.3);
        ctx.stroke();
        ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(hx - s * 0.12, by - s * 1.24, s * 0.23, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.white; ctx.lineWidth = s * 0.05;
        ctx.beginPath(); ctx.moveTo(hx - s * 0.12, by - s * 1.47); ctx.lineTo(hx - s * 0.12, by - s * 1.02); ctx.stroke();
        ctx.restore();

        // kicker: approaches from the left rear, soccer style
        var t = phase === 'kick' || phase === 'outcome' ? outQuart(kicker.t) : 0;
        var kx = bx - s * lerp(1.9, 0.5, t), ky = by + s * lerp(1.3, 0.35, t);
        var ks = s * 1.25;
        ctx.save(); ctx.translate(kx, ky);
        ctx.fillStyle = rgba(C.dark, 0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, ks * 0.5, ks * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.white; ctx.lineCap = 'round'; ctx.lineWidth = ks * 0.2;
        ctx.beginPath(); ctx.moveTo(-ks * 0.1, -ks * 0.6); ctx.lineTo(-ks * 0.15, 0); ctx.stroke();       // plant leg
        var fx = lerp(-ks * 0.25, ks * 0.55, t), fy = lerp(ks * 0.05, -ks * 0.55, t);
        ctx.beginPath(); ctx.moveTo(ks * 0.1, -ks * 0.6); ctx.quadraticCurveTo(ks * 0.25, -ks * 0.25, fx, fy); ctx.stroke();
        ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(fx, fy, ks * 0.14, ks * 0.08, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.blue; GameEngine.drawRoundedRect(ctx, -ks * 0.32, -ks * 1.35, ks * 0.64, ks * 0.8, ks * 0.14); ctx.fill();
        ctx.fillStyle = C.white; ctx.font = 'bold ' + Math.round(ks * 0.42) + 'px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('3', 0, -ks * 0.98);
        ctx.fillStyle = C.pacific; ctx.fillRect(-ks * 0.32, -ks * 0.66, ks * 0.64, ks * 0.08);
        ctx.strokeStyle = C.blue; ctx.lineWidth = ks * 0.16;
        ctx.beginPath(); ctx.moveTo(-ks * 0.28, -ks * 1.2); ctx.lineTo(-ks * 0.6, -ks * lerp(0.8, 1.1, t));
        ctx.moveTo(ks * 0.28, -ks * 1.2); ctx.lineTo(ks * 0.55, -ks * lerp(0.75, 0.95, t)); ctx.stroke();
        ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(0, -ks * 1.58, ks * 0.26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.white; ctx.lineWidth = ks * 0.06;
        ctx.beginPath(); ctx.moveTo(0, -ks * 1.84); ctx.lineTo(0, -ks * 1.33); ctx.stroke();
        ctx.restore();
    }

    function drawTrail(ctx) {
        if (trail.length < 4) return;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var i = 2; i + 1 < trail.length; i += 2) {
            ctx.strokeStyle = rgba(C.white, (i / trail.length) * 0.55); ctx.lineWidth = 1 + 2.5 * i / trail.length;
            ctx.beginPath(); ctx.moveTo(trail[i - 2], trail[i - 1]); ctx.lineTo(trail[i], trail[i + 1]); ctx.stroke();
        }
        ctx.restore();
    }

    function drawBall(ctx) {
        if (phase === 'done') return;
        var z = ball.z, s = sc(z), x = sx(ball.x, z), y = sy(ball.y, z);
        var r = Math.max(3, s * 0.17);
        // ground shadow shrinks as the ball climbs
        ctx.fillStyle = rgba(C.dark, 0.3 * clamp01(1 - ball.y / 12));
        ctx.beginPath(); ctx.ellipse(x, sy(0, z), r * 1.1, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(x, y);
        if (z > 1) {                                   // in the air over a dark crowd: a halo keeps it findable
            var halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 3.2);
            halo.addColorStop(0, rgba(C.lightBlue, 0.55)); halo.addColorStop(1, rgba(C.lightBlue, 0));
            ctx.fillStyle = halo; ctx.fillRect(-r * 3.2, -r * 3.2, r * 6.4, r * 6.4);
        }
        ctx.rotate(ball.flying || phase === 'kick' ? ball.spin : -0.12);
        var g = ctx.createRadialGradient(-r * 0.4, -r * 0.3, r * 0.1, 0, 0, r * 1.5);
        g.addColorStop(0, C.amber); g.addColorStop(1, C.dark);      // leather under the lights
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(C.white, 0.9); ctx.lineWidth = 1; ctx.stroke();
        if (r > 4) {
            ctx.strokeStyle = C.white; ctx.lineWidth = Math.max(1, r * 0.1);
            ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.4); ctx.stroke();
            for (var l = -2; l <= 2; l++) { ctx.beginPath(); ctx.moveTo(-r * 0.14, l * r * 0.16); ctx.lineTo(r * 0.14, l * r * 0.16); ctx.stroke(); }
        }
        ctx.restore();
    }

    function drawAim(ctx) {
        if (phase !== 'aim' && phase !== 'power') return;
        var off = phase === 'aim' ? lerp(-MODEL.AIM_SPAN, MODEL.AIM_SPAN, aimT) : aimOff;
        var z = postsZ, x = sx(off, z), top = sy(MODEL.TOP, z), bar = sy(MODEL.BAR, z);
        ctx.save();
        ctx.strokeStyle = rgba(C.white, phase === 'aim' ? 0.9 : 0.55); ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(x, bar + 8); ctx.lineTo(x, Math.max(HUD_H + 44, top)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = phase === 'aim' ? C.white : rgba(C.white, 0.6);
        ctx.beginPath(); ctx.moveTo(x, bar + 6); ctx.lineTo(x - 7, bar + 18); ctx.lineTo(x + 7, bar + 18); ctx.closePath(); ctx.fill();
        ctx.restore();
        label(ctx, phase === 'aim' ? 'TAP TO AIM' : 'TAP TO SET POWER', 200, 668, C.white, 14);
    }

    function drawPower(ctx) {
        if (phase !== 'power' && phase !== 'aim') return;
        var mx = 372, y0 = 330, y1 = 560, mh = y1 - y0;
        var need = MODEL.minPower(dist);
        ctx.save();
        ctx.globalAlpha = phase === 'power' ? 1 : 0.45;
        ctx.fillStyle = rgba(C.dark, 0.6); ctx.fillRect(mx - 9, y0, 18, mh);
        ctx.fillStyle = rgba(C.red, 0.4); ctx.fillRect(mx - 9, y1 - mh * need, 18, mh * need);          // falls short
        ctx.fillStyle = rgba(C.teal, 0.55);
        var sw = MODEL.sweet(dist);
        ctx.fillRect(mx - 9, y1 - mh * (need + sw), 18, mh * sw);                                    // clean
        if (phase === 'power') { ctx.fillStyle = C.amber; ctx.fillRect(mx - 5, y1 - mh * powT, 10, mh * powT); }
        ctx.strokeStyle = C.white; ctx.lineWidth = 1.5; ctx.strokeRect(mx - 9, y0, 18, mh);
        // the line you must beat, with a shape cue as well as colour
        var ny = y1 - mh * need;
        ctx.fillStyle = C.white;
        ctx.beginPath(); ctx.moveTo(mx - 12, ny); ctx.lineTo(mx - 19, ny - 5); ctx.lineTo(mx - 19, ny + 5); ctx.closePath(); ctx.fill();
        ctx.fillRect(mx - 9, ny - 1, 18, 2);
        ctx.restore();
        label(ctx, 'POWER', mx, y1 + 14, C.white, 10);
    }

    function label(ctx, text, x, y, color, size) {
        ctx.save();
        ctx.font = 'bold ' + size + 'px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(C.dark, 0.6); ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = color; ctx.fillText(text, x, y);
        ctx.restore();
    }

    function drawCallout(ctx) {
        if (!callout.active) return;
        var s = RM ? 1 : 0.4 + outBack(callout.t) * 0.6;
        var a = callout.life > 0.9 ? Math.max(0, 1 - (callout.life - 0.9) / 0.4) : 1;
        ctx.save();
        ctx.translate(200, 400); ctx.scale(s, s); ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px Arial, Helvetica, sans-serif';          // shape channel: tick or cross
        ctx.lineWidth = 5; ctx.strokeStyle = C.white; ctx.strokeText(callout.glyph, 0, -46);
        ctx.fillStyle = callout.color; ctx.fillText(callout.glyph, 0, -46);
        var fs = callout.text.length > 12 ? 30 : 42;
        ctx.font = 'bold ' + fs + 'px Arial, Helvetica, sans-serif';
        ctx.lineWidth = 6; ctx.strokeStyle = C.white; ctx.strokeText(callout.text, 0, 0);
        ctx.fillStyle = callout.color; ctx.fillText(callout.text, 0, 0);
        ctx.font = 'bold 15px Arial, Helvetica, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = rgba(C.dark, 0.8); ctx.strokeText(callout.sub, 0, 32);
        ctx.fillStyle = C.white; ctx.fillText(callout.sub, 0, 32);
        ctx.restore();
    }

    function drawScoreboard(ctx) {
        var y = HUD_H + 4, h = 34;
        ctx.save();
        ctx.fillStyle = rgba(C.dark, 0.85);
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.fill();
        ctx.strokeStyle = rgba(C.amber, 0.8); ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.stroke();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left'; ctx.fillStyle = C.white; ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        ctx.fillText('KICK ' + Math.min(k + 1, MODEL.KICKS.length) + '/' + MODEL.KICKS.length, 18, y + 12);
        ctx.fillStyle = C.amber; ctx.fillText(dist + ' YD', 18, y + 26);
        // wind: arrow shape + number, readable without colour
        ctx.textAlign = 'center'; ctx.fillStyle = rgba(C.white, 0.7); ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
        ctx.fillText('WIND', 200, y + 10);
        ctx.fillStyle = C.white; ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        var arrow = wind === 0 ? '•' : wind < 0 ? '◀ ' : '';
        var arrowR = wind > 0 ? ' ▶' : '';
        ctx.fillText(arrow + Math.abs(wind) + ' km/h' + arrowR, 200, y + 25);
        ctx.textAlign = 'right'; ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        ctx.fillStyle = C.white; ctx.fillText('MADE ' + made, W - 18, y + 12);
        ctx.fillStyle = streak > 1 ? C.amber : rgba(C.white, 0.55);
        ctx.fillText(streak > 1 ? 'STREAK x' + streak : (hash < 0 ? 'LEFT HASH' : hash > 0 ? 'RIGHT HASH' : 'MIDDLE'), W - 18, y + 26);
        ctx.restore();
    }

    /* ============================================================
       INIT
       ============================================================ */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 640 });
        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: "FIELD GOAL AT THE 'G",
                objective: 'Gridiron has come to the MCG. Line up ten field goals under the lights, from 20 yards out to 62, and split the uprights.',
                controls: [
                    'Tap / Space to lock your AIM (it sweeps left and right)',
                    'Tap / Space again to set POWER, just past the white line',
                    'Watch the wind: aim into it, or it carries the kick wide'
                ],
                legend: {
                    collect: [
                        { icon: '\u{1F3AF}', label: 'Down the middle', points: '1.5x' },
                        { icon: '\u{1F3C8}', label: 'Yards kicked', points: '10 each' },
                        { icon: '\u{1F525}', label: 'Streak bonus', points: '50' }
                    ],
                    avoid: [
                        { icon: '\u{1F4A8}', label: 'The wind' },
                        { icon: '⬇️', label: 'Falling short' }
                    ]
                },
                tip: 'Power past the white line reaches the posts. Stay in the green band: overhit it and the kick sprays. Make all ten for a 1,000 point bonus.'
            },
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: function () { },
            onReset: function () { reset(); },
            onInit: function () { reset(); setupInput(); },
            onCountdownComplete: function () { setupKick(); }
        });
    }

    window.FieldGoal = { MODEL: MODEL };   // read by the tuning harness; the score bound lives server-side

    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
