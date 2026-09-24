/**
 * Field Goal at the 'G
 * KPMG Newsletter Minigame, October 2026 edition: the NFL's first game at the MCG.
 *
 * Kick for the 49ers in their 27-7 win over the Rams (MCG, Friday 11 September
 * 2026, 100,021 there): Eddy Pineiro's six kicks from the day, in order, with the
 * score running as it did, then four bonus kicks to beat the MCG record (his 56)
 * and reach the NFL record (68). Two taps per kick: lock the AIM into a gusting
 * wind, then set the POWER. Not enough power falls short; too much sprays it.
 *
 * Canvas 2D, zero deps, pooled particles, one J() gate for reduced motion.
 * The world is in YARDS, projected through one camera (view) that sits behind
 * the holder, dollies after the ball in flight (ball-cam) and turns round behind
 * the posts for a replay of long makes and doinks. Reduced motion keeps the
 * camera still and skips the replays.
 *
 * ---------------------------------------------------------------------------
 * BRAND DEVIATION (Jara, 2026-09-24: "prioritise newsletter and NFL colours,
 * KPMG secondary where it fits"). Scoped to this directory, as MULTIPLEX's was:
 * the page header and the engine HUD stay KPMG Blue. brand_validator.py will
 * flag the hexes in NEWS, SF and LAR; that is expected. NEWS is sampled from the
 * newsletter's page 5 render; SF and LAR are the clubs' published colours.
 * Text contrast, WCAG 2.x, measured 2026-09-24:
 *   white on SF red 7.75, Sol on Royal 7.42, white on the scoreboard 12.63,
 *   SF gold 4.59 / NEWS amber 7.63 / Sol 8.65 on the scoreboard, NEWS navy on
 *   white 10.21. Callouts carry a white and a dark stroke, so their fill is free.
 * Re-measure before swapping any of them.
 * ---------------------------------------------------------------------------
 * Real names, numbers, kits and team names are used as reporting of the match
 * (Jara, 2026-09-24). No club or league logo, helmet mark or wordmark is drawn:
 * the team chips and every piece of lettering are our own, in Bebas Neue.
 * Facts: CBS box score, ESPN and club rosters, read 2026-09-24; each number was
 * confirmed by two sources.
 */
(function () {
    'use strict';

    var GAME_ID = 'field-goal';
    var W = 400, H = 700;
    var HUD_H = GameEngine.HUD_HEIGHT;       // 48
    var C = KPMG.colours;
    var NEWS = { sky: '#C3E7F4', navy: '#023C91', red: '#F0001B', amber: '#FFBD59' };
    var SF = { red: '#AA0000', gold: '#B3995D' };
    var LAR = { royal: '#003594', sol: '#FFD100' };
    var PINK = '#FD349C', BLUSH = '#FFA3DA';
    var BLOSSOM = [BLUSH, PINK, C.lightPurple, C.white];
    // the site's vendored subset (see ../multiplex/index.html); it has A-Z a-z 0-9 and ' ! . , / + - :
    var FD = '"Bebas Neue", "Arial Black", Arial, sans-serif';

    // the 49ers wore white at the MCG; the Rams, at home, wore Royal with Sol pants
    var KIT_SF = { jersey: C.white, num: SF.red, pants: SF.gold, helmet: SF.gold, sock: C.white };
    var KIT_LAR = { jersey: LAR.royal, num: LAR.sol, pants: LAR.sol, helmet: LAR.royal, sock: LAR.royal };
    var LINE_SF = [85, 71, 77, 46, 64, 68, 89];      // field goal unit, long snapper Jon Weeks (46) at centre
    var LINE_LAR = [94, 0, 91, 55, 97, 57];          // the Rams' rush

    /* ---- camera (yards -> logical px) ----
       One pinhole camera. s = +1 looks downfield along the ball-to-posts line;
       s = -1 looks back from behind the posts (the replay). */
    var F = 780, CAM_H = 7, CAM_Z = 13, HOR = 190, HOR_BACK = 350;
    var view = { x: 0, y: CAM_H, z: -CAM_Z, s: 1, hor: HOR };
    function viewReset() { view.x = 0; view.y = CAM_H; view.z = -CAM_Z; view.s = 1; view.hor = HOR; }
    function atRest() { return view.s > 0 && view.x === 0 && view.y === CAM_H && view.z === -CAM_Z; }
    function depth(z) { return Math.max(0.5, view.s * (z - view.z)); }
    function front(z) { return view.s * (z - view.z) - 1; }          // >= 0: past the near plane
    function sx(x, z) { return 200 + F * view.s * (x - view.x) / depth(z); }
    function sy(y, z) { return view.hor + F * (view.y - y) / depth(z); }
    function sc(z) { return F / depth(z); }   // px per yard at depth z

    /* ---- the kicking game (yards), exposed on window.FieldGoal for the tuning harness ---- */
    var MODEL = {
        // the day, in order (CBS box score), then the bonus round. `before` is the scoring
        // that happened since the last kick, so the score reads as it did at the time.
        CARD: [
            { d: 20, fg: true, q: 'Q1', clock: '6:15', note: 'OPENING THE SCORING' },
            { d: 33, fg: false, q: 'Q2', clock: '4:28', note: "PAT AFTER ROBINSON'S 39-YD TD", before: [['lar', 7], ['sf', 6]] },
            { d: 33, fg: false, q: 'Q3', clock: '11:03', note: "PAT AFTER EVANS'S 2-YD TD", before: [['sf', 6]] },
            { d: 33, fg: false, q: 'Q4', clock: '12:57', note: "PAT AFTER SAMUEL'S 15-YD TD", before: [['sf', 6]] },
            { d: 56, fg: true, q: 'Q4', clock: '9:43', note: 'THE 56-YARDER' },
            { d: 52, fg: true, q: 'Q4', clock: 'LATE', note: 'HE HIT THE RIGHT UPRIGHT FROM HERE' },
            { d: 58, bonus: true, note: 'BEAT THE MCG RECORD OF 56' },
            { d: 62, bonus: true, note: 'BONUS: 62 YARDS' },
            { d: 65, bonus: true, note: 'BONUS: 65 YARDS' },
            { d: 68, bonus: true, note: 'THE NFL RECORD: 68 YARDS (CAM LITTLE, 2025)' }
        ],
        MCG_RECORD: 56,
        HASH: 3.08,               // hash marks sit at the uprights' own width
        HALF: 3.08,               // half the width between the uprights
        BALL: 0.15,               // ball radius, for the upright contact band
        BAR: 3.33,                // crossbar height (10 ft)
        TOP: 9.5,                 // stylised upright top
        AIM_SPAN: 5,              // aim sweeps +/- this many yards around the posts (on-screen at 20 yd)
        RANGE0: 12, RANGE1: 62,   // range = RANGE0 + RANGE1 * power: 68 yd needs 0.9
        BAR_DOINK: 0.03,          // power this far below the minimum clips the crossbar
        MIDDLE: 0.45,             // "down the middle" band (yards off centre)
        aimHalf: function (k) { return lerp(0.9, 0.55, k / 9); },    // s per sweep
        powHalf: function (k) { return lerp(0.8, 0.42, k / 9); },
        maxWind: function (k) { return lerp(9, 22, k / 9); },         // km/h, the settled wind
        gust: function (k) { return lerp(3, 9, k / 9); },           // km/h, the swing around it
        windAt: function (base, amp, t, p1, p2) { return base + amp * (0.7 * Math.sin(1.6 * t + p1) + 0.3 * Math.sin(3.7 * t + p2)); },
        drift: function (wind, d) { return (wind / 20) * 5 * Math.pow(d / 62, 1.2); }, // yards, signed
        // the clean band above the minimum: forgiving on a chip shot, a sliver from 68
        sweet: function (d) { return Math.min(1 - MODEL.minPower(d), lerp(0.28, 0.045, clamp01((d - 20) / 48))); },
        minPower: function (d) { return clamp01((d - MODEL.RANGE0) / MODEL.RANGE1); },
        spray: function (d, power) {
            var excess = Math.max(0, power - MODEL.minPower(d) - MODEL.sweet(d));
            return 0.3 + 0.014 * d + 7 * excess * excess;
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
    MODEL.KICKS = MODEL.CARD.map(function (c) { return c.d; });

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
    var phase;                 // 'aim' | 'power' | 'kick' | 'outcome' | 'replay' | 'done'
    var k, card, dist, hash, wind, baseWind, gustA, gustP1, gustP2, windT, postsZ, fwdU, fwdV;
    var made, streak, score, matchSF, matchLAR, longest, appliedK;
    var aimT, aimDir, aimOff, powT, powDir, power;
    var result, flightT, flightDur, outcomeTimer, closeCall, wantReplay, replayU, captionT;
    var ball, kicker, refs, cam, flash, callout, trail, streamT;
    var bg = null, field = null, tone = null, fenceRest = 0;
    var pyro = [];             // queued bursts: { t, x, y, color }
    var petals = [];           // spring blossom on the wind, screen space

    function reset() {
        RM = GameEngine.prefersReducedMotion();
        k = 0; made = 0; streak = 0; score = 0; matchSF = 0; matchLAR = 0; longest = 0; appliedK = -1;
        GameEngine.state.score = 0;
        cam = { trauma: 0, shakeX: 0, shakeY: 0 };
        flash = { a: 0, color: C.white };
        callout = { text: '', sub: '', color: C.white, glyph: '', t: 0, life: 0, active: false };
        trail = []; streamT = 0; pyro.length = 0;
        if (!petals.length) for (var i = 0; i < 18; i++) petals.push({
            x: Math.random() * W, y: HUD_H + 50 + Math.random() * 560, s: lerp(2.5, 5, Math.random()),
            ph: Math.random() * 6.28, color: BLOSSOM[i % BLOSSOM.length]
        });
        particlesClear();
        setupKick();
    }

    function setupKick() {
        card = MODEL.CARD[k]; dist = card.d;
        if (appliedK !== k) {                       // setupKick runs twice for kick 1 (init, then countdown)
            (card.before || []).forEach(function (e) { if (e[0] === 'sf') matchSF += e[1]; else matchLAR += e[1]; });
            appliedK = k;
        }
        // PATs go from the middle; field goals from whichever hash the drive ended on
        hash = k === 0 || card.fg === false ? 0 : [-1, 0, 1][(Math.random() * 3) | 0] * MODEL.HASH;
        var mw = MODEL.maxWind(k);
        baseWind = Math.round(mw * (0.35 + 0.65 * Math.random())) * (Math.random() < 0.5 ? -1 : 1);
        gustA = MODEL.gust(k); gustP1 = Math.random() * 6.28; gustP2 = Math.random() * 6.28; windT = 0;
        wind = MODEL.windAt(baseWind, gustA, 0, gustP1, gustP2);
        postsZ = Math.sqrt(dist * dist + hash * hash);
        fwdU = -hash / postsZ; fwdV = dist / postsZ;
        ball = { x: 0, y: 0.15, z: 0, spin: 0, flying: false };
        kicker = { t: 0 };
        refs = { up: 0, wave: 0 };
        result = null; flightT = 0; trail.length = 0; captionT = 0;
        aimT = 0.5; aimDir = 1; aimOff = 0; powT = 0; powDir = 1; power = 0;
        viewReset();
        field = null;                               // rebuilt for this spot
        fenceRest = sy(0, postsZ + 14);
        phase = 'aim';
    }

    /* Field coords (u across from the field centre, v downfield from the ball's
       yard line) -> kick frame [X, Z]. The ball sits at u = hash, the posts at u = 0. */
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
            } else if (P.kind[i] === 2) {                 // a spark: a short streak along its velocity
                ctx.strokeStyle = P.color[i]; ctx.lineWidth = P.size[i] * 0.7; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(P.x[i], P.y[i]); ctx.lineTo(P.x[i] - P.vx[i] * 0.06, P.y[i] - P.vy[i] * 0.06); ctx.stroke();
            } else {
                ctx.fillRect(P.x[i] - P.size[i] / 2, P.y[i] - P.size[i] / 2, P.size[i], P.size[i]);
            }
        }
        ctx.globalAlpha = 1;
    }
    var CONFETTI = { kind: 0, colors: BLOSSOM.concat([SF.gold, SF.red]), spread: 1.6, spMin: 120, spMax: 300, lifeMin: 1.0, lifeMax: 1.9, szMin: 5, szMax: 9, grav: 260, spreadX: 30, spreadY: 10 };
    var TURF = { kind: 1, colors: [C.green, C.white, C.dark], spread: 1.2, spMin: 40, spMax: 150, lifeMin: 0.3, lifeMax: 0.6, szMin: 2, szMax: 4, grav: 520, spreadX: 10, spreadY: 4 };
    // pyro fountains along the dead-ball line, red, white and blue as in the debut photo;
    // four pulses each, one colour per pulse
    var PYRO = { kind: 2, colors: null, spread: 0.45, spMin: 200, spMax: 320, lifeMin: 0.9, lifeMax: 1.4, szMin: 3, szMax: 4.5, grav: 260, spreadX: 6, spreadY: 2 };
    var PYRO_RWB = [NEWS.red, C.white, C.cobalt];
    function queuePyro(n) {
        var y = sy(0, postsZ + 12);
        for (var i = 0; i < n; i++) for (var j = 0; j < 4; j++)
            pyro.push({ t: j * 0.12 + i * 0.05, x: lerp(40, 360, i / (n - 1)), y: y, color: PYRO_RWB[(i + j) % 3] });
    }

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
        } else if (phase === 'replay') {
            next();                                 // skip the replay
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
        closeCall = result.doink || Math.abs(Math.abs(result.x) - MODEL.HALF) < 0.7;
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
    function flightEnd() { return result.kind === 'short' ? ball.reach / dist : 1; }
    /* The whole flight as one function of u, so the kick, the aftermath and the replay agree:
       short kicks die on the turf, made and wide kicks sail on, missed doinks drop off the iron. */
    function placeBall(u) {
        var end = flightEnd(), p;
        if (u <= end) {
            p = flightPos(u);
            if (result.kind === 'short') p.y = Math.max(0.15, (3.5 + dist * 0.04) * Math.sin(Math.PI * u / end));
        } else if (result.good || result.kind.indexOf('wide') === 0) {
            p = flightPos(Math.min(u, 1.5));
        } else {
            p = flightPos(end);
            var secs = (u - end) * flightDur;
            if (result.kind === 'short') p.y = 0.15;
            else { p.y = Math.max(0.15, p.y - secs * 9); p.z += result.kind === 'bar-out' ? -2 * secs : 0; }
        }
        ball.x = p.x; ball.y = p.y; ball.z = p.z;
    }

    /* Ball-cam: ease in behind the ball, never nearer the posts than 22 yd so they
       stay on screen, and rise with it so the ball holds near the horizon. */
    function ballCam(u) {
        var e = outQuart(clamp01(u / 0.55));
        var zT = Math.max(-CAM_Z, Math.min(ball.z - 22, postsZ - 22));
        view.z = lerp(-CAM_Z, zT, e);
        view.y = lerp(CAM_H, Math.max(CAM_H, ball.y + 0.5), e);
        view.x = lerp(0, ball.x * 0.5, e);
    }

    function settle() {
        phase = 'outcome';
        outcomeTimer = result.good ? 1.5 : 1.2;
        wantReplay = !RM && (result.doink || result.good && dist >= 50);
        var gx = 200, gy = sy(MODEL.BAR + 2, postsZ);
        if (result.good) {
            made++; streak++;
            var pts = MODEL.points(dist, result, streak);
            score += pts;
            var perfect = k === MODEL.KICKS.length - 1 && made === MODEL.KICKS.length;
            if (perfect) score += MODEL.PERFECT;
            GameEngine.state.score = score;
            if (!card.bonus) matchSF += card.fg ? 3 : 1;
            var record = card.bonus && dist > Math.max(MODEL.MCG_RECORD, longest);
            longest = Math.max(longest, dist);
            refs.up = 0.0001;
            flashNow(NEWS.amber, 0.3); addTrauma(0.5);
            emit(35, CONFETTI, gx - 60, gy, -Math.PI / 2 + 0.5);
            emit(35, CONFETTI, gx + 60, gy, -Math.PI / 2 - 0.5);
            queuePyro(perfect || record ? 6 : 4);
            var title = result.kind === 'middle' ? 'DOWN THE MIDDLE!' : result.doink ? 'DOINK... GOOD!' : "IT'S GOOD!";
            var sub = '+' + pts + '  FROM ' + dist + ' YD', color = result.kind === 'middle' ? SF.red : NEWS.amber;
            if (k === 4) { title = 'THE 56-YARDER!'; sub = '+' + pts + '  JUST LIKE #18'; }
            if (k === 5) { title = 'MISS REDEEMED!'; sub = '+' + pts + '  HE HIT THE UPRIGHT HERE'; color = NEWS.red; }
            if (record) { title = dist === 68 ? 'NFL RECORD EQUALLED!' : 'NEW MCG RECORD!'; color = NEWS.red; }
            if (perfect) { title = 'PERFECT TEN!'; sub = '+' + pts + '  +' + MODEL.PERFECT + ' BONUS'; color = NEWS.red; }
            showCallout(title, sub, color, '✔');
            sfx('roar');
        } else {
            streak = 0;
            refs.wave = 0.0001;
            addTrauma(0.3);
            flashNow(NEWS.navy, 0.2);
            var t = { 'short': ['SHORT!', 'NEEDED MORE LEG'], 'bar-out': ['DOINK! NO GOOD', 'OFF THE CROSSBAR'],
                      'post-out': ['DOINK! NO GOOD', 'OFF THE UPRIGHT'], 'wide-left': ['WIDE LEFT', 'MIND THE WIND'],
                      'wide-right': ['WIDE RIGHT', 'MIND THE WIND'] }[result.kind];
            if (k === 5) t = [t[0], 'JUST LIKE ON THE DAY'];
            showCallout(t[0], t[1], NEWS.navy, '✖');
            sfx('ohh');
        }
    }

    function startReplay() {
        phase = 'replay'; replayU = 0;
        particlesClear(); pyro.length = 0; trail.length = 0; callout.active = false;
        refs.up = 0; refs.wave = 0; ball.flying = true; kicker.t = 0;
        view.s = -1; view.x = 0; view.y = 2.5; view.z = postsZ + 26; view.hor = HOR_BACK;
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
        streamT += dt; windT += dt; captionT += dt;
        wind = MODEL.windAt(baseWind, gustA, windT, gustP1, gustP2);    // it gusts: the kick takes it at launch
        if (phase === 'aim') {
            aimT += (dt / MODEL.aimHalf(k)) * aimDir;
            if (aimT >= 1) { aimT = 1; aimDir = -1; } else if (aimT <= 0) { aimT = 0; aimDir = 1; }
        } else if (phase === 'power') {
            powT += (dt / MODEL.powHalf(k)) * powDir;
            if (powT >= 1) { powT = 1; powDir = -1; } else if (powT <= 0) { powT = 0; powDir = 1; }
        } else if (phase === 'kick') {
            kicker.t = Math.min(1, kicker.t + dt * 5);
            var end = flightEnd();
            var slow = !RM && closeCall && flightT > end - 0.22 ? 0.35 : 1;   // slow motion into a close call
            flightT = Math.min(end, flightT + dt * slow / flightDur);
            placeBall(flightT);
            ball.spin += dt * 14 * slow;
            if (!RM) { trail.push(ball.x, ball.y, ball.z); if (trail.length > 36) trail.splice(0, 3); ballCam(flightT); }
            if (flightT >= end) { ball.flying = result.good || result.kind.indexOf('wide') === 0; settle(); }
        } else if (phase === 'outcome') {
            outcomeTimer -= dt;
            flightT += dt / flightDur;
            placeBall(flightT); if (ball.flying) ball.spin += dt * 14;
            if (outcomeTimer <= 0) { if (wantReplay) startReplay(); else next(); }
        } else if (phase === 'replay') {
            replayU += dt * 0.7 / flightDur;
            kicker.t = Math.min(1, kicker.t + dt * 3.5);
            placeBall(replayU); ball.spin += dt * 10;
            if (replayU >= flightEnd() && !refs.up && !refs.wave) { if (result.good) refs.up = 0.0001; else refs.wave = 0.0001; }
            if (replayU >= flightEnd() + 0.45) next();
        }
        if (refs.up > 0) refs.up = Math.min(1, refs.up + dt * 5);
        if (refs.wave > 0) refs.wave += dt;
        for (var q = pyro.length - 1; q >= 0; q--) {
            if ((pyro[q].t -= dt) > 0) continue;
            PYRO.colors = [pyro[q].color];
            emit(10, PYRO, pyro[q].x, pyro[q].y, -Math.PI / 2);
            pyro.splice(q, 1);
        }
        if (!RM) for (var n = 0; n < petals.length; n++) {     // blossom rides the wind: ~5 px/s per km/h
            var pt = petals[n];
            pt.ph += dt * 2.2;
            pt.x += (wind * 5 + Math.sin(pt.ph) * 14) * dt;
            pt.y += (10 + Math.cos(pt.ph * 0.7) * 8) * dt;
            if (pt.x > W + 8) pt.x = -8; else if (pt.x < -8) pt.x = W + 8;
            if (pt.y > H - 30) pt.y = HUD_H + 44;
        }
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

        // the newsletter's sky, a touch deeper overhead
        b.fillStyle = NEWS.sky; b.fillRect(0, 0, W, H);
        var sky = b.createLinearGradient(0, HUD_H, 0, 170);
        sky.addColorStop(0, rgba(C.lightBlue, 0.3)); sky.addColorStop(1, rgba(C.lightBlue, 0));
        b.fillStyle = sky; b.fillRect(0, 0, W, 170);

        // city skyline beyond the far stand, pale as on the cover: a generic CBD, one crowned tower
        var towers = [[8, 22, 58], [30, 16, 40], [46, 20, 72], [66, 14, 50], [80, 24, 96], [104, 12, 44],
                      [300, 18, 48], [318, 22, 80], [340, 14, 58], [354, 26, 104], [380, 16, 62]];
        b.fillStyle = rgba(C.pacific, 0.3);
        for (var t = 0; t < towers.length; t++) b.fillRect(towers[t][0], 176 - towers[t][2], towers[t][1], towers[t][2] + 10);
        b.fillStyle = NEWS.amber; b.fillRect(354, 72, 26, 6);        // the crowned tower's gold cap
        b.fillStyle = rgba(NEWS.amber, 0.6); b.fillRect(364, 60, 6, 12);

        // a Friday-morning sun (10:35 kick-off), peeking out as on the starters page
        var sunX = 62, sunY = 104;
        b.strokeStyle = NEWS.amber; b.lineCap = 'round'; b.lineWidth = 5;
        for (var ray = 0; ray < 10; ray++) {
            var ra = ray / 10 * Math.PI * 2;
            b.beginPath(); b.moveTo(sunX + Math.cos(ra) * 27, sunY + Math.sin(ra) * 27);
            b.lineTo(sunX + Math.cos(ra) * 37, sunY + Math.sin(ra) * 37); b.stroke();
        }
        b.fillStyle = NEWS.amber; b.beginPath(); b.arc(sunX, sunY, 21, 0, Math.PI * 2); b.fill();

        // soft cloud banks drifting over the skyline, as on the cover
        [[168, 112, 1], [252, 96, 0.8], [330, 128, 0.9], [10, 136, 0.7]].forEach(function (cl) {
            var cx = cl[0], cy = cl[1], k2 = cl[2];
            b.fillStyle = rgba(C.white, 0.92);
            b.beginPath();
            b.arc(cx, cy, 13 * k2, 0, Math.PI * 2); b.arc(cx + 16 * k2, cy - 7 * k2, 16 * k2, 0, Math.PI * 2);
            b.arc(cx + 34 * k2, cy, 12 * k2, 0, Math.PI * 2); b.rect(cx, cy, 34 * k2, 12 * k2);
            b.fill();
        });

        // four leaning light towers ringing the ground, lamps off in daylight
        var lt = [[24, 120, 0.18], [120, 108, -0.05], [280, 108, 0.05], [376, 120, -0.18]];   // clear of the scoreboard
        for (var m = 0; m < lt.length; m++) {
            var x0 = lt[m][0], y0 = lt[m][1], lean = lt[m][2];
            b.strokeStyle = rgba(C.dark, 0.85); b.lineWidth = 4;
            b.beginPath(); b.moveTo(x0 - lean * 90, 190); b.lineTo(x0, y0 + 6); b.stroke();
            b.save(); b.translate(x0, y0); b.rotate(lean);
            b.fillStyle = rgba(C.dark, 0.9); GameEngine.drawRoundedRect(b, -16, -8, 32, 14, 2); b.fill();
            for (var r = 0; r < 2; r++) for (var c = 0; c < 6; c++) {
                b.fillStyle = C.light; b.fillRect(-13 + c * 4.6, -5.5 + r * 5.5, 3, 3.5);
            }
            b.restore();
        }

        // the stand: a deep bowl in the shade of its roof, three tiers, a crowd in both clubs' colours
        var tiers = [[150, 186, 0.95], [186, 226, 0.85], [226, 300, 0.9]];
        for (var tr = 0; tr < tiers.length; tr++) {
            b.fillStyle = rgba(tr === 1 ? C.cobalt : NEWS.navy, tiers[tr][2]);
            b.fillRect(0, tiers[tr][0], W, tiers[tr][1] - tiers[tr][0]);
            b.fillStyle = rgba(C.dark, 0.45); b.fillRect(0, tiers[tr][1] - 3, W, 3);
        }
        b.fillStyle = C.border; b.fillRect(0, 144, W, 5);                   // white roof edge
        b.fillStyle = rgba(C.dark, 0.5); b.fillRect(0, 149, W, 3);          // its shadow
        var crowd = [SF.red, SF.red, SF.gold, C.white, LAR.sol, LAR.sol, C.lightBlue, BLUSH];
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

    /* The backdrop is flat, so fake its depth: scale it about the horizon to keep the
       stand sitting on the fence as the ball-cam closes in; behind the posts, slide it
       down onto the far fence instead. */
    function drawBackdrop(ctx) {
        if (view.s < 0) {
            var farFence = sy(0, -CAM_Z - 20);
            ctx.fillStyle = NEWS.sky; ctx.fillRect(0, 0, W, H);
            ctx.drawImage(bg, 0, farFence - 300, W, H);
            return;
        }
        var k2 = (sy(0, postsZ + 14) - HOR) / Math.max(1, fenceRest - HOR);
        if (k2 > 1.001) {
            ctx.save(); ctx.translate(200, HOR); ctx.scale(k2, k2); ctx.translate(-200, -HOR);
            ctx.drawImage(bg, 0, 0, W, H); ctx.restore();
        } else ctx.drawImage(bg, 0, 0, W, H);
    }

    /* ============================================================
       FIELD (cached per kick at rest; drawn live while the camera moves)
       ============================================================ */
    /* field polygon/line helpers: field coords in, clipped to the near plane, projected */
    function clipPoly(pts) {
        var out = [];
        for (var i = 0; i < pts.length; i++) {
            var a = pts[i], c = pts[(i + 1) % pts.length], fa = front(a[1]), fc = front(c[1]);
            if (fa >= 0) out.push(a);
            if ((fa >= 0) !== (fc >= 0)) { var t = fa / (fa - fc); out.push([lerp(a[0], c[0], t), lerp(a[1], c[1], t)]); }
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
        var a = toCam(u0, v0), c = toCam(u1, v1), fa = front(a[1]), fc = front(c[1]);
        if (fa < 0 && fc < 0) return;
        if (fa < 0) { var t = fa / (fa - fc); a = [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; }
        if (fc < 0) { var t2 = fc / (fc - fa); c = [lerp(c[0], a[0], t2), lerp(c[1], a[1], t2)]; }
        b.lineWidth = Math.max(minW || 0.6, wYd * sc((a[1] + c[1]) / 2));
        b.beginPath(); b.moveTo(sx(a[0], a[1]), sy(0, a[1])); b.lineTo(sx(c[0], c[1]), sy(0, c[1])); b.stroke();
    }
    function ftext(b, text, u, v, sizeYd, color) {
        if (view.s < 0) return;                  // it would read mirrored from behind the posts
        var p = toCam(u, v);
        if (front(p[1]) < 1) return;
        var s = sc(p[1]), fs = s * sizeYd;
        if (fs < 4) return;
        var squash = clamp01((sy(0, p[1]) - sy(0, p[1] + sizeYd)) / fs);   // lie it flat on the turf
        b.save(); b.translate(sx(p[0], p[1]), sy(0, p[1] + sizeYd / 2)); b.scale(1, Math.max(0.1, squash));
        b.font = 'bold ' + Math.round(fs) + 'px ' + FD;
        b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillStyle = color;
        b.fillText(text, 0, 0); b.restore();
    }

    function paintField(b) {
        var gl = dist - 10, back = -CAM_Z - 20, L = -26.67, R = 26.67;   // goal line, behind the holder, sidelines

        // grass to the fence, mowing stripes every 5 yd, the Rams' end zone (they were home)
        var fence = view.s > 0 ? sy(0, postsZ + 14) : sy(0, back);
        b.fillStyle = C.green; b.fillRect(0, fence, W, H);
        for (var v = gl, j = 0; v > back; v -= 5, j++) {
            b.fillStyle = j % 2 === 0 ? rgba(C.white, 0.05) : rgba(C.dark, 0.07);
            if (fpoly(b, [[L, v - 5], [R, v - 5], [R, v], [L, v]])) b.fill();
        }
        b.fillStyle = rgba(LAR.royal, 0.95);
        if (fpoly(b, [[L, gl], [R, gl], [R, dist], [L, dist]])) b.fill();
        ftext(b, 'RAMS', 0, gl + 3, 3.4, LAR.sol);

        // sidelines, goal line, end line, yard lines, hash ticks, numbers
        b.strokeStyle = rgba(C.white, 0.9);
        fline(b, L, back, L, dist, 0.12, 1); fline(b, R, back, R, dist, 0.12, 1);
        fline(b, L, gl, R, gl, 0.22); fline(b, L, dist, R, dist, 0.15);
        for (var yd = 5; gl - yd > back; yd += 5) {
            var vv = gl - yd;
            fline(b, L, vv, R, vv, 0.1);
            if (yd % 10 === 0 && yd <= 50) {
                ftext(b, String(yd), L + 9, vv - 1, 2, rgba(C.white, 0.8));
                ftext(b, String(yd), R - 9, vv - 1, 2, rgba(C.white, 0.8));
            }
        }
        for (var hv = gl - 1; hv > back; hv -= 1) {
            fline(b, -MODEL.HASH - 0.35, hv, -MODEL.HASH + 0.35, hv, 0.08);
            fline(b, MODEL.HASH - 0.35, hv, MODEL.HASH + 0.35, hv, 0.08);
        }
        b.strokeStyle = rgba(C.pacific, 0.9); fline(b, L, 7, R, 7, 0.16);   // line of scrimmage

        // the stand's shadow across the far turf, sun on the spot, a light vignette
        var fade = b.createLinearGradient(0, fence, 0, fence + 60);
        fade.addColorStop(0, rgba(C.dark, 0.35)); fade.addColorStop(1, rgba(C.dark, 0));
        b.fillStyle = fade; b.fillRect(0, fence, W, 60);
        if (view.s > 0) {
            var pool = b.createRadialGradient(200, sy(0, 0), 8, 200, sy(0, 0), 170);
            pool.addColorStop(0, rgba(NEWS.amber, 0.12)); pool.addColorStop(1, rgba(NEWS.amber, 0));
            b.fillStyle = pool; b.fillRect(0, fence, W, H - fence);
        }
        var vg = b.createRadialGradient(200, 380, 160, 200, 380, 430);
        vg.addColorStop(0, rgba(C.dark, 0)); vg.addColorStop(1, rgba(C.dark, 0.3));
        b.fillStyle = vg; b.fillRect(0, fence, W, H - fence);
    }
    function buildField() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cv = document.createElement('canvas');
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var b = cv.getContext('2d'); b.scale(dpr, dpr);
        paintField(b);
        return cv;
    }

    /* ============================================================
       DRAW
       ============================================================ */
    function onDraw(ctx) {
        if (!bg) bg = buildStadium();
        ctx.save();
        ctx.translate(cam.shakeX, cam.shakeY);
        drawBackdrop(ctx);
        if (atRest()) { if (!field) field = buildField(); ctx.drawImage(field, 0, 0, W, H); }
        else paintField(ctx);

        if (view.s > 0) {
            var behind = ball.z > postsZ;            // the ball has passed the posts
            if (behind) drawBall(ctx);
            drawRefs(ctx);
            drawPosts(ctx);
            drawAim(ctx);
            if (!behind) drawTrail(ctx);
            drawLine(ctx);
            drawHolderAndKicker(ctx);
            if (!behind) drawBall(ctx);
        } else {                                     // from behind the posts: far to near
            drawHolderAndKicker(ctx);
            drawLine(ctx);
            var through = ball.z > postsZ;
            if (!through) drawBall(ctx);
            drawPosts(ctx);
            drawRefs(ctx);
            if (through) drawBall(ctx);
        }
        drawParticles(ctx);
        ctx.restore();
        drawPetals(ctx);

        if (flash.a > 0) {
            ctx.save(); ctx.globalAlpha = flash.a; ctx.fillStyle = flash.color;
            ctx.fillRect(0, HUD_H, W, H - HUD_H); ctx.restore();
        }
        drawPower(ctx);
        drawCallout(ctx);
        drawScoreboard(ctx);
        drawCaption(ctx);
        if (phase === 'replay') drawReplayTag(ctx);
    }

    function drawPosts(ctx) {
        var px = 0, z = postsZ, s = sc(z);
        var base = sy(0, z), bar = sy(MODEL.BAR, z), top = sy(MODEL.TOP, z);
        var xl = sx(px - MODEL.HALF, z), xr = sx(px + MODEL.HALF, z), xm = sx(px, z);
        var lw = Math.max(2.5, s * 0.22), neck = view.s * s * 1.2;
        ctx.save();
        ctx.lineCap = 'round';
        // marker-pen posts in the NFL's yellow, as in the newsletter's hand-drawn goal graphic:
        // dark outline, yellow body, a white highlight. The outline keeps them clear of a pale sky.
        function frame(w, color) {
            ctx.strokeStyle = color; ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(xm, base); ctx.lineTo(xm, bar + s * 0.6);
            ctx.quadraticCurveTo(xm, bar, xm - neck, bar); ctx.lineTo(xl, bar); ctx.lineTo(xl, top);
            ctx.moveTo(xm, bar); ctx.lineTo(xr, bar); ctx.lineTo(xr, top); ctx.stroke();
        }
        frame(lw + 3, C.dark);
        frame(lw, LAR.sol);
        if (lw > 3) {                                    // highlight on the uprights only
            var hx = -lw * 0.22;
            ctx.strokeStyle = rgba(C.white, 0.75); ctx.lineWidth = Math.max(1, lw * 0.25);
            ctx.beginPath(); ctx.moveTo(xl + hx, bar - lw); ctx.lineTo(xl + hx, top);
            ctx.moveTo(xr + hx, bar - lw); ctx.lineTo(xr + hx, top); ctx.stroke();
        }
        // padding on the base post
        ctx.fillStyle = LAR.royal; ctx.fillRect(xm - lw * 1.3, base - s * 2, lw * 2.6, s * 2);
        // wind streamers on top of each upright, streaming downwind
        var len = s * (0.6 + Math.abs(wind) * 0.09), dir = (wind >= 0 ? 1 : -1) * view.s;
        [xl, xr].forEach(function (x) {
            ctx.strokeStyle = NEWS.red; ctx.lineWidth = Math.max(1.5, s * 0.12);
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

    function figure(ctx, z, x, y, s, kit, pose, num) {
        // compact broadcast-distance player in club kit, s = px per yard
        if (front(z) < 0.5) return;
        var h = s * 1.6;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = rgba(C.dark, 0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, h * 0.28, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineCap = 'round'; ctx.lineWidth = h * 0.13;
        ctx.strokeStyle = kit.sock;
        ctx.beginPath(); ctx.moveTo(-h * 0.08, 0); ctx.lineTo(-h * 0.1, -h * 0.3); ctx.moveTo(h * 0.08, 0); ctx.lineTo(h * 0.1, -h * 0.3); ctx.stroke();
        ctx.strokeStyle = kit.pants;
        ctx.beginPath(); ctx.moveTo(-h * 0.1, -h * 0.26); ctx.lineTo(-h * 0.1, -h * 0.45); ctx.moveTo(h * 0.1, -h * 0.26); ctx.lineTo(h * 0.1, -h * 0.45); ctx.stroke();
        if (pose === 'up') {
            ctx.strokeStyle = kit.jersey; ctx.lineWidth = h * 0.09;
            ctx.beginPath(); ctx.moveTo(-h * 0.16, -h * 0.75); ctx.lineTo(-h * 0.26, -h * 1.2);
            ctx.moveTo(h * 0.16, -h * 0.75); ctx.lineTo(h * 0.26, -h * 1.2); ctx.stroke();
        }
        ctx.fillStyle = kit.jersey;
        GameEngine.drawRoundedRect(ctx, -h * 0.2, -h * 0.82, h * 0.4, h * 0.42, h * 0.08); ctx.fill();
        if (kit.jersey === C.white) { ctx.strokeStyle = rgba(C.dark, 0.35); ctx.lineWidth = 1; ctx.stroke(); }
        if (num != null && h > 22) {
            ctx.fillStyle = kit.num; ctx.font = 'bold ' + Math.round(h * 0.26) + 'px ' + FD;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), 0, -h * 0.6);
        }
        ctx.fillStyle = kit.helmet;                  // plain shell: no club mark
        ctx.beginPath(); ctx.arc(0, -h * 0.95, h * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawRefs(ctx) {
        // two officials under the uprights: both arms up = GOOD, arms crossing = NO GOOD
        var z = postsZ + 0.5, s = sc(z);
        if (front(z) < 0.5) return;
        [-MODEL.HALF - 0.8, MODEL.HALF + 0.8].forEach(function (ox) {
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
        // the lines at scrimmage: the Rams' rush beyond, the 49ers' field goal unit in front
        var rush = function () {
            for (var i = -3, n = 0; i <= 3; i++) {
                if (i === 0) continue;
                var r = toCam(hash + i * 1.5 + 0.4, 8.2);
                figure(ctx, r[1], sx(r[0], r[1]), sy(0, r[1]), sc(r[1]), KIT_LAR, 'up', LINE_LAR[n++]);
            }
        };
        var unit = function () {
            for (var j = -3; j <= 3; j++) {
                var o = toCam(hash + j * 1.15, 6.5);
                figure(ctx, o[1], sx(o[0], o[1]), sy(0, o[1]), sc(o[1]), KIT_SF, null, LINE_SF[j + 3]);
            }
        };
        if (view.s > 0) { rush(); unit(); } else { unit(); rush(); }
    }

    /* Name bar in the site's Bebas subset, which has no N-tilde: draw the N, then its tilde. */
    function nameBar(ctx, text, x, y, size, color) {
        var plain = text.replace('Ñ', 'N');
        ctx.font = 'bold ' + Math.round(size) + 'px ' + FD;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
        var w = ctx.measureText(plain).width, x0 = x - w / 2;
        ctx.fillText(plain, x0, y);
        var i = text.indexOf('Ñ');
        if (i < 0) return;
        var nx = x0 + ctx.measureText(plain.slice(0, i)).width, nw = ctx.measureText('N').width, ty = y - size * 0.82;
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.8, size * 0.1); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(nx + nw * 0.12, ty);
        ctx.bezierCurveTo(nx + nw * 0.35, ty - size * 0.14, nx + nw * 0.6, ty + size * 0.14, nx + nw * 0.88, ty - size * 0.02);
        ctx.stroke();
    }

    function drawHolderAndKicker(ctx) {
        if (front(0) < 0.5) return;                 // the ball-cam has flown past them
        var s = sc(0), bx = sx(0, 0), by = sy(0, 0);
        // holder, Corliss Waitman (15): on one knee to the right of the ball, back to camera
        var hx = bx + s * 0.55;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.fillStyle = rgba(C.dark, 0.3);
        ctx.beginPath(); ctx.ellipse(hx, by + s * 0.12, s * 0.62, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = SF.gold; ctx.lineWidth = s * 0.2;
        ctx.beginPath(); ctx.moveTo(hx + s * 0.08, by - s * 0.42); ctx.lineTo(hx + s * 0.2, by + s * 0.02);   // knee down
        ctx.lineTo(hx + s * 0.26, by + s * 0.3); ctx.stroke();                                               // shin on the turf
        ctx.beginPath(); ctx.moveTo(hx - s * 0.08, by - s * 0.42); ctx.lineTo(hx - s * 0.3, by - s * 0.5);    // front thigh
        ctx.lineTo(hx - s * 0.3, by - s * 0.02); ctx.stroke();
        ctx.fillStyle = C.dark;
        ctx.beginPath(); ctx.ellipse(hx - s * 0.3, by, s * 0.14, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx + s * 0.28, by + s * 0.33, s * 0.1, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.white; ctx.strokeStyle = rgba(C.dark, 0.35); ctx.lineWidth = 1;                  // back, leaning in
        ctx.beginPath(); ctx.moveTo(hx - s * 0.26, by - s * 0.4); ctx.lineTo(hx + s * 0.24, by - s * 0.4);
        ctx.lineTo(hx + s * 0.18, by - s * 1.05); ctx.lineTo(hx - s * 0.4, by - s * 1.0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = SF.red; ctx.font = 'bold ' + Math.round(s * 0.36) + 'px ' + FD;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('15', hx - s * 0.08, by - s * 0.72);
        ctx.strokeStyle = C.white; ctx.lineWidth = s * 0.13;                                                // arm to the ball tip
        ctx.beginPath(); ctx.moveTo(hx - s * 0.32, by - s * 0.92);
        if (phase === 'aim' || phase === 'power') ctx.lineTo(bx + s * 0.05, by - s * 0.42);
        else ctx.lineTo(hx - s * 0.5, by - s * 1.3);
        ctx.stroke();
        ctx.fillStyle = SF.gold; ctx.beginPath(); ctx.arc(hx - s * 0.12, by - s * 1.24, s * 0.23, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // kicker, Eddy Pineiro (18): approaches from the left rear, soccer style
        var t = phase === 'kick' || phase === 'outcome' || phase === 'replay' ? outQuart(kicker.t) : 0;
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
        ctx.fillStyle = SF.gold; GameEngine.drawRoundedRect(ctx, -ks * 0.3, -ks * 0.72, ks * 0.6, ks * 0.3, ks * 0.08); ctx.fill();   // gold pants
        ctx.fillStyle = C.white; ctx.strokeStyle = rgba(C.dark, 0.35); ctx.lineWidth = 1;
        GameEngine.drawRoundedRect(ctx, -ks * 0.32, -ks * 1.35, ks * 0.64, ks * 0.75, ks * 0.14); ctx.fill(); ctx.stroke();
        nameBar(ctx, 'PIÑEIRO', 0, -ks * 1.13, ks * 0.15, SF.red);
        ctx.fillStyle = SF.red; ctx.font = 'bold ' + Math.round(ks * 0.4) + 'px ' + FD;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('18', 0, -ks * 0.86);
        ctx.strokeStyle = C.white; ctx.lineWidth = ks * 0.16;
        ctx.beginPath(); ctx.moveTo(-ks * 0.28, -ks * 1.2); ctx.lineTo(-ks * 0.6, -ks * lerp(0.8, 1.1, t));
        ctx.moveTo(ks * 0.28, -ks * 1.2); ctx.lineTo(ks * 0.55, -ks * lerp(0.75, 0.95, t)); ctx.stroke();
        ctx.fillStyle = SF.gold; ctx.beginPath(); ctx.arc(0, -ks * 1.58, ks * 0.26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = SF.red; ctx.lineWidth = ks * 0.06;
        ctx.beginPath(); ctx.moveTo(0, -ks * 1.84); ctx.lineTo(0, -ks * 1.33); ctx.stroke();
        ctx.restore();
    }

    function drawTrail(ctx) {
        if (trail.length < 6) return;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var i = 3; i + 2 < trail.length; i += 3) {       // world points, projected now: the camera moves
            if (front(trail[i - 1]) < 0.5 || front(trail[i + 2]) < 0.5) continue;
            ctx.strokeStyle = rgba(C.white, (i / trail.length) * 0.55); ctx.lineWidth = 1 + 2.5 * i / trail.length;
            ctx.beginPath(); ctx.moveTo(sx(trail[i - 3], trail[i - 1]), sy(trail[i - 2], trail[i - 1]));
            ctx.lineTo(sx(trail[i], trail[i + 2]), sy(trail[i + 1], trail[i + 2])); ctx.stroke();
        }
        ctx.restore();
    }

    function drawBall(ctx) {
        if (phase === 'done' || front(ball.z) < 0.3) return;
        var z = ball.z, s = sc(z), x = sx(ball.x, z), y = sy(ball.y, z);
        var r = Math.min(40, Math.max(3, s * 0.17));
        // ground shadow shrinks as the ball climbs
        ctx.fillStyle = rgba(C.dark, 0.3 * clamp01(1 - ball.y / 12));
        ctx.beginPath(); ctx.ellipse(x, sy(0, z), r * 1.1, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(x, y);
        if (z > 1) {                                   // a halo keeps it findable over the crowd
            var halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 3.2);
            halo.addColorStop(0, rgba(C.white, 0.5)); halo.addColorStop(1, rgba(C.white, 0));
            ctx.fillStyle = halo; ctx.fillRect(-r * 3.2, -r * 3.2, r * 6.4, r * 6.4);
        }
        ctx.rotate(ball.flying || phase === 'kick' ? ball.spin : -0.12);
        var g = ctx.createRadialGradient(-r * 0.4, -r * 0.3, r * 0.1, 0, 0, r * 1.5);
        g.addColorStop(0, '#B8652F'); g.addColorStop(1, '#3E1D0B');      // leather
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
        var y1 = Math.max(HUD_H + 70, top);
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = rgba(C.dark, phase === 'aim' ? 0.7 : 0.4); ctx.lineWidth = 4;   // outline: it crosses a pale sky
        ctx.beginPath(); ctx.moveTo(x, bar + 8); ctx.lineTo(x, y1); ctx.stroke();
        ctx.strokeStyle = rgba(C.white, phase === 'aim' ? 0.95 : 0.6); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, bar + 8); ctx.lineTo(x, y1); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = phase === 'aim' ? C.white : rgba(C.white, 0.6);
        ctx.strokeStyle = rgba(C.dark, 0.7); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, bar + 6); ctx.lineTo(x - 7, bar + 18); ctx.lineTo(x + 7, bar + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
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
        ctx.fillStyle = rgba(NEWS.red, 0.4); ctx.fillRect(mx - 9, y1 - mh * need, 18, mh * need);          // falls short
        ctx.fillStyle = rgba(C.teal, 0.6);
        var sw = MODEL.sweet(dist);
        ctx.fillRect(mx - 9, y1 - mh * (need + sw), 18, mh * sw);                                    // clean
        if (phase === 'power') { ctx.fillStyle = NEWS.amber; ctx.fillRect(mx - 5, y1 - mh * powT, 10, mh * powT); }
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
        ctx.font = 'bold ' + Math.round(size * 1.3) + 'px ' + FD;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(C.dark, 0.6); ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = color; ctx.fillText(text, x, y);
        ctx.restore();
    }

    function drawCallout(ctx) {
        if (!callout.active) return;
        var s = RM ? 1 : 0.4 + outBack(callout.t) * 0.6;
        var a = callout.life > 0.9 ? Math.max(0, 1 - (callout.life - 0.9) / 0.4) : 1;
        if (!tone) tone = buildTone();
        ctx.save();
        ctx.translate(200, 400); ctx.scale(s, s); ctx.globalAlpha = a;
        ctx.drawImage(tone, -tone.W / 2, -tone.H / 2 - 8, tone.W, tone.H);   // halftone burst, as in the print
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px Arial, Helvetica, sans-serif';          // shape channel: tick or cross
        ctx.lineWidth = 5; ctx.strokeStyle = C.white; ctx.strokeText(callout.glyph, 0, -52);
        ctx.fillStyle = callout.color; ctx.fillText(callout.glyph, 0, -52);
        ctx.font = 'bold 58px ' + FD;
        var fs = Math.min(58, 58 * 330 / Math.max(1, ctx.measureText(callout.text).width));   // fit the long ones
        ctx.font = 'bold ' + Math.round(fs) + 'px ' + FD;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8; ctx.strokeStyle = C.dark; ctx.strokeText(callout.text, 0, 0);
        ctx.lineWidth = 5; ctx.strokeStyle = C.white; ctx.strokeText(callout.text, 0, 0);
        ctx.fillStyle = callout.color; ctx.fillText(callout.text, 0, 0);
        ctx.font = 'bold 21px ' + FD;
        ctx.lineWidth = 4; ctx.strokeStyle = rgba(C.dark, 0.85); ctx.strokeText(callout.sub, 0, 36);
        ctx.fillStyle = C.white; ctx.fillText(callout.sub, 0, 36);
        ctx.restore();
    }

    /* A round halftone burst: dots on a grid, shrinking from the centre out.
       Built once; Light Blue like the kicker print behind the MCG story. */
    function buildTone() {
        var RX = 150, RY = 80, dpr = Math.min(window.devicePixelRatio || 1, 2);   // an oval that holds the callout
        var cv = document.createElement('canvas');
        cv.width = Math.round(RX * 2 * dpr); cv.height = Math.round(RY * 2 * dpr); cv.W = RX * 2; cv.H = RY * 2;
        var b = cv.getContext('2d'); b.scale(dpr, dpr);
        b.fillStyle = rgba(C.lightBlue, 0.55);
        for (var y = 4, row = 0; y < RY * 2; y += 7, row++) for (var x = 4 + (row % 2) * 3.5; x < RX * 2; x += 7) {
            var d = Math.sqrt((x - RX) * (x - RX) / (RX * RX) + (y - RY) * (y - RY) / (RY * RY));
            if (d >= 1) continue;
            b.beginPath(); b.arc(x, y, 3.3 * (1 - d), 0, Math.PI * 2); b.fill();
        }
        return cv;
    }

    function drawPetals(ctx) {
        if (RM) return;                    // still petals read as dirt on the lens; the streamers carry the wind
        ctx.save();
        for (var i = 0; i < petals.length; i++) {
            var p = petals[i];
            ctx.fillStyle = p.color;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ph);
            ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    /* our own team chip: an abbreviation on club colour, not a club mark */
    function chip(ctx, x, y, text, bgc, fg) {
        ctx.font = 'bold 15px ' + FD;
        var w = ctx.measureText(text).width + 10;
        ctx.fillStyle = bgc; GameEngine.drawRoundedRect(ctx, x, y - 9, w, 18, 3); ctx.fill();
        ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.fillText(text, x + 5, y + 1);
        return x + w;
    }

    function drawScoreboard(ctx) {
        var y = HUD_H + 4, h = 42;
        ctx.save();
        ctx.fillStyle = rgba(C.dark, 0.9);
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.fill();
        ctx.strokeStyle = SF.gold; ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.stroke();
        ctx.textBaseline = 'middle';
        // row 1: the match, broadcast style
        var r1 = y + 13, x = chip(ctx, 16, r1, 'SF', SF.red, C.white);
        ctx.font = 'bold 18px ' + FD; ctx.fillStyle = C.white; ctx.textAlign = 'left';
        ctx.fillText(String(matchSF), x + 5, r1 + 1);
        x = chip(ctx, x + 32, r1, 'LAR', LAR.royal, LAR.sol);
        ctx.font = 'bold 18px ' + FD; ctx.fillStyle = C.white; ctx.textAlign = 'left';
        ctx.fillText(String(matchLAR), x + 5, r1 + 1);
        ctx.textAlign = 'center';
        ctx.fillStyle = card.bonus ? NEWS.amber : C.white;
        ctx.fillText(card.bonus ? 'BONUS ROUND' : card.q + ' ' + card.clock, 222, r1 + 1);
        ctx.textAlign = 'right'; ctx.fillStyle = C.white;
        ctx.fillText('KICK ' + Math.min(k + 1, MODEL.KICKS.length) + '/' + MODEL.KICKS.length, W - 18, r1 + 1);
        // row 2: this kick, the wind (arrow shape + number, readable without colour), the streak
        var r2 = y + 31;
        ctx.font = 'bold 17px ' + FD; ctx.textAlign = 'left'; ctx.fillStyle = NEWS.amber;
        ctx.fillText(dist + ' YD ' + (card.bonus ? 'FG' : card.fg ? 'FG' : 'PAT'), 18, r2);
        var wv = Math.round(Math.abs(wind));
        ctx.textAlign = 'center'; ctx.fillStyle = C.white;
        ctx.fillText((wind < 0 && wv ? '◀ ' : '') + 'WIND ' + wv + ' KM/H' + (wind > 0 && wv ? ' ▶' : ''), 200, r2);
        ctx.textAlign = 'right';
        ctx.fillStyle = streak > 1 ? NEWS.amber : rgba(C.white, 0.6);
        ctx.fillText(streak > 1 ? 'STREAK X' + streak : (hash < 0 ? 'LEFT HASH' : hash > 0 ? 'RIGHT HASH' : 'MIDDLE'), W - 18, r2);
        ctx.restore();
    }

    /* the moment, as a lower-third under the scoreboard for the first seconds of each kick */
    function drawCaption(ctx) {
        if (phase !== 'aim' && phase !== 'power' || captionT > 3.4) return;
        var text = k === 6 ? 'FULL TIME: SF ' + matchSF + ', LAR ' + matchLAR + '. NOW BEAT THE MCG RECORD OF 56'
                 : card.bonus ? card.note : card.q + ' ' + card.clock + '   ' + card.note;
        var a = RM ? 1 : clamp01(captionT / 0.25) * clamp01((3.4 - captionT) / 0.4);
        ctx.save(); ctx.globalAlpha = a;
        ctx.font = 'bold 15px ' + FD;
        var w = Math.min(W - 24, ctx.measureText(text).width + 22), y = HUD_H + 52;
        ctx.fillStyle = rgba(C.white, 0.95); GameEngine.drawRoundedRect(ctx, 200 - w / 2, y, w, 22, 11); ctx.fill();
        ctx.fillStyle = NEWS.red; GameEngine.drawRoundedRect(ctx, 200 - w / 2, y, 6, 22, 3); ctx.fill();
        ctx.fillStyle = NEWS.navy; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 203, y + 12);
        ctx.restore();
    }

    function drawReplayTag(ctx) {
        ctx.save();
        ctx.fillStyle = NEWS.red; GameEngine.drawRoundedRect(ctx, 14, HUD_H + 54, 64, 20, 3); ctx.fill();
        ctx.fillStyle = C.white; ctx.font = 'bold 15px ' + FD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('REPLAY', 46, HUD_H + 65);
        ctx.restore();
        label(ctx, 'TAP TO SKIP', 200, 668, C.white, 12);
    }

    /* ============================================================
       INIT
       ============================================================ */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 640 });
        // the field layer bakes its text, so rebuild it once the display face arrives;
        // blocked or slow, the game plays on in Arial Black
        if (document.fonts && document.fonts.load) document.fonts.load('bold 20px "Bebas Neue"').then(function () { field = null; }, function () { });
        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: "FIELD GOAL AT THE 'G",
                objective: 'The 49ers beat the Rams 27-7 in the NFL’s first game at the MCG. Take Eddy Piñeiro’s six kicks from the day, then chase the 68-yard NFL record.',
                controls: [
                    'Tap / Space to lock your AIM (it sweeps left and right)',
                    'Tap / Space again to set POWER, just past the white line',
                    'The wind gusts: watch the streamers and the blossom, and aim into it'
                ],
                legend: {
                    collect: [
                        { icon: '\u{1F3AF}', label: 'Down the middle', points: '1.5x' },
                        { icon: '\u{1F3C8}', label: 'Yards kicked', points: '10 each' },
                        { icon: '\u{1F525}', label: 'Streak bonus', points: '50' }
                    ],
                    avoid: [
                        { icon: '\u{1F4A8}', label: 'Gusts' },
                        { icon: '⬇️', label: 'Falling short' }
                    ]
                },
                tip: 'Six kicks from the day, then four to beat his 56-yard MCG record. The green band shrinks with distance. Make all ten for a 1,000 point bonus.'
            },
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: function () { },
            onReset: function () { reset(); },
            onInit: function () { reset(); setupInput(); },
            onCountdownComplete: function () { setupKick(); }
        });
    }

    // read by the tuning harness and the browser checks (read-only); the score bound lives server-side
    window.FieldGoal = {
        MODEL: MODEL,
        peek: function () {
            return { phase: phase, k: k, wind: wind, aimT: aimT, powT: powT, sf: matchSF, lar: matchLAR,
                     viewZ: view.z, viewS: view.s, kind: result ? result.kind : null };
        }
    };

    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
