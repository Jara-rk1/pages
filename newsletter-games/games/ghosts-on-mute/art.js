/**
 * Ghosts on Mute: art (canvas only, no game rules).
 *
 * window.GOMArt = { PALETTE, layout, draw(ctx, state, view), drawHUD(ctx, engineState), debug }
 *   state: the model round (model.js createRound/step): t, calm, score, streak, tiles[12], presenter, glitch.
 *          tiles[i] = {state: 'idle'|'haunted'|'muted'|'muddled', ghost: {kind, age, life, pairId}} (model.js);
 *          kind is 'normal'|'pair'|'replyall'|'emoji'|'echo'. Missing fields fall back to a plain look.
 *   view:  { now (ms, performance.now), rm (bool, reduced motion), focus (tile index or null), fx, copy }
 *          fx   = [{type, tile, t0 (ms), flash (bool)}] (game.js). Types drawn: spawn|hop|spread (arrival),
 *                 mute|echo|pair (poof; flash false = plain 300 ms fade), expire, leave, presenter (rotation),
 *                 glitch, tap (press feedback), miss|oops (wrong tap). Unknown types are ignored.
 *          fx[].onset: the model's ledger ask id; fx sharing one onset are one flash.
 *          copy = { title, handles[12], presenting, glitch, captions } from game.js COPY; fallbacks below.
 *          captions drawn: mute|echo|pair (muted tile), replyAll|laugh (haunted tile), presenter (oops toast),
 *          escaped (expire toast),
 *          calmLow (Calm <= 30 toast), dropped (Calm 0 toast), calm and secondsLeft (call bar labels).
 *   debug: frames (running), travel and fades (this frame), flashes (running count of distinct flash onsets).
 *
 * Palette: the newsletter's own (plan D2), declared in game.js and the decision file. Hex only, alpha
 * through globalAlpha, so the brand validator sees exactly these nine.
 * Text pairs (WCAG 2.x, python, 2026-10-14), one per line for G10:
 *   pair: GHOST on INK 15.03 (HUD, handle plates, presenting label)
 *   pair: GHOST on PLUM 10.57 (call bar title, seconds left, replyAll/laugh tile caption)
 *   pair: PERIWINKLE on PLUM 6.25 (calm label and value, seconds-left label)
 *   pair: PUMPKIN on INK 7.05 (streak pill)
 *   pair: INK on PUMPKIN 7.05 (glitch banner)
 *   pair: INK on GHOST 15.03 (muted caption, call-bar caption toast)
 *   pair: PLUM on CREAM 5.95 (muddled caption)
 * Banned: GHOST on PUMPKIN 2.13, MAUVE on LILAC 4.40.
 */
(function () {
    'use strict';

    var P = {
        INK: '#151726', PLUM: '#462B41', LILAC: '#EDDCF3', LAVENDER: '#EEECFA', PERIWINKLE: '#AFB7D1',
        PUMPKIN: '#F2882D', GHOST: '#ECECEC', CREAM: '#C0B19B', MAUVE: '#6E6463'
    };
    var W = 400, HUD_H = 48;
    var FD = '"Bebas Neue", "Arial Black", Arial, sans-serif';
    var FB = 'Arial, Helvetica, sans-serif';
    var GRID = { x: 16, y: 112, w: 368, h: 540 }, COLS = 3, ROWS = 4, GAP = 10;
    var TW = (GRID.w - GAP * (COLS - 1)) / COLS;       // 116
    var TH = (GRID.h - GAP * (ROWS - 1)) / ROWS;       // 127.5
    var TINTS = [P.PERIWINKLE, P.MAUVE, P.CREAM, P.PLUM];
    var DUR = { spawn: 250, hop: 250, spread: 250, mute: 520, echo: 520, pair: 520, expire: 600, leave: 300,
        presenter: 400, glitch: 5000, tap: 120, miss: 360, oops: 360 };

    var debug = { frames: 0, travel: 0, fades: 0, flashes: 0 };
    // flashes count distinct ledger onsets: fx sharing an onset id (a pair, one reply-all spread) are one.
    // Onset ids restart each round, so the id set is reset when the round state object changes.
    var seen = new WeakSet(), seenOnsets = new Set(), seenRound = null;
    function countFlash(f, state) {
        if (f.onset == null) { if (!seen.has(f)) { seen.add(f); debug.flashes++; } return; }   // no id: one per fx
        if (state !== seenRound) { seenRound = state; seenOnsets = new Set(); }
        if (!seenOnsets.has(f.onset)) { seenOnsets.add(f.onset); debug.flashes++; }
    }

    var layout = {
        tileRect: function (i) {
            var c = i % COLS, r = Math.floor(i / COLS);
            return { x: GRID.x + c * (TW + GAP), y: GRID.y + r * (TH + GAP), w: TW, h: TH };
        },
        gridRect: GRID,
        callBar: { x: 0, y: 48, w: W, h: 56 },
        footer: { x: 0, y: 660, w: W, h: 40 }
    };

    /* ---- helpers ---- */
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function tileOf(state, i) {
        var t = state && state.tiles ? state.tiles[i] : null;
        return t || { state: 'idle' };
    }
    function kindOf(t) {
        var k = String(t.kind || '').toLowerCase();
        if (k.indexOf('laugh') >= 0 || k.indexOf('emoji') >= 0 || k.indexOf('joy') >= 0 || k === '\u{1F602}') return 'laugh';
        if (k.indexOf('reply') >= 0) return 'replyall';
        if (k === 'echo') return 'echo';
        return 'normal';
    }
    function presenterIdx(state) {
        var p = state ? state.presenter : null;
        return p && typeof p === 'object' ? p.tile : p;
    }
    // COPY.captions (game.js) with neutral fallbacks; every caption is a Bebas display string (G15)
    var CAP = { mute: 'Muted!', echo: 'Echo muted', pair: 'No, you go ahead!', presenter: 'Oops, they were presenting',
        replyAll: 'Reply-all ghost', laugh: 'Giggle ghost', calmLow: 'Keep it calm', dropped: 'The call dropped',
        escaped: 'A ghost got away', calm: 'Calm', secondsLeft: 'Left' };
    var CAPTION_MS = 1200, CALM_LOW = 30;
    function cap(view, key) {
        var c = view && view.copy && view.copy.captions;
        return (c && c[key]) || CAP[key];
    }
    function glitchOn(state) {
        var g = state ? state.glitch : null;
        return !!(g && (g === true || g.active));
    }

    /* ---- chalk grain, seeded, rendered once ---- */
    var grain = null;
    function getGrain() {
        if (grain || typeof document === 'undefined') return grain;
        var c = document.createElement('canvas'); c.width = W; c.height = 700;
        var g = c.getContext('2d'), s = 0x9e3779b9;
        function rnd() { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
        for (var n = 0; n < 2600; n++) {
            g.globalAlpha = 0.15 + rnd() * 0.35;
            g.fillStyle = rnd() < 0.8 ? P.PERIWINKLE : P.CREAM;
            g.fillRect(rnd() * W, rnd() * 700, 1 + rnd() * 1.6, 1 + rnd() * 1.2);
        }
        grain = c;
        return grain;
    }

    /* ---- icons ---- */
    function sparkle(ctx, x, y, r) {
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    }
    function mic(ctx, x, y, s, col, slash) {
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
        rr(ctx, -3.5, -9, 7, 12, 3.5); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -1, 6.5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 5.5); ctx.lineTo(0, 9); ctx.moveTo(-4, 9); ctx.lineTo(4, 9); ctx.stroke();
        if (slash) { ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, 10); ctx.stroke(); }
        ctx.restore();
    }
    function screenIcon(ctx, x, y, col) {
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
        rr(ctx, x - 9, y - 6, 18, 12, 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x, y - 3); ctx.lineTo(x + 4, y + 2); ctx.stroke();
    }
    function avatar(ctx, cx, cy, i, tint, alpha) {
        var shape = i % 4;
        ctx.save(); ctx.globalAlpha *= alpha;
        ctx.fillStyle = tint; ctx.strokeStyle = P.PLUM; ctx.lineWidth = 2;
        // shoulders
        ctx.beginPath(); ctx.moveTo(cx - 36, cy + 44); ctx.quadraticCurveTo(cx - 34, cy + 16, cx, cy + 14);
        ctx.quadraticCurveTo(cx + 34, cy + 16, cx + 36, cy + 44); ctx.closePath(); ctx.fill(); ctx.stroke();
        // hair behind the head
        if (shape === 1) { rr(ctx, cx - 22, cy - 18, 44, 36, 14); ctx.fill(); ctx.stroke(); }
        if (shape === 2) { ctx.beginPath(); ctx.arc(cx, cy - 16, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        // head
        ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (shape === 0) { ctx.beginPath(); ctx.arc(cx, cy - 2, 17, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(cx + 10, cy - 9); ctx.lineTo(cx - 14, cy - 6); ctx.closePath(); ctx.globalAlpha *= 0.55; ctx.fillStyle = P.PLUM; ctx.fill(); }
        if (shape === 3) { ctx.beginPath(); ctx.arc(cx, cy - 4, 18, Math.PI, 0); ctx.closePath(); ctx.fillStyle = P.PLUM; ctx.globalAlpha *= 0.7; ctx.fill(); ctx.fillRect(cx - 19, cy - 6, 38, 4); }
        ctx.restore();
    }
    // the kawaii ghost: dome, wavy hem, nubs, dot eyes, blush
    function ghost(ctx, cx, cy, s, kind, alpha) {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.globalAlpha *= alpha;
        ctx.beginPath();
        ctx.moveTo(-24, -4); ctx.arc(0, -4, 24, Math.PI, 0); ctx.lineTo(25, 30);   // dome, then a wavy hem of 3 scallops
        for (var k = 0; k < 3; k++) { var x0 = 25 - k * 50 / 3; ctx.quadraticCurveTo(x0 - 4.2, 41, x0 - 8.3, 34); ctx.quadraticCurveTo(x0 - 12.5, 27, x0 - 16.7, 34); }
        ctx.lineTo(-25, 30);
        ctx.closePath();
        ctx.fillStyle = P.GHOST; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = P.INK;
        if (kind === 'echo') ctx.setLineDash([5, 4]);
        ctx.stroke(); ctx.setLineDash([]);
        // nubs
        ctx.beginPath(); ctx.ellipse(-25, 10, 5, 3.5, -0.5, 0, Math.PI * 2); ctx.ellipse(25, 10, 5, 3.5, 0.5, 0, Math.PI * 2);
        ctx.fillStyle = P.GHOST; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        if (kind === 'laugh') {
            ctx.strokeStyle = P.INK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-8, -7); ctx.lineTo(-4, -2);
            ctx.moveTo(4, -2); ctx.lineTo(8, -7); ctx.lineTo(12, -2); ctx.stroke();
            ctx.fillStyle = P.INK; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(6, 2); ctx.arc(0, 2, 6, 0, Math.PI); ctx.fill();
            ctx.fillStyle = P.PERIWINKLE; ctx.beginPath();
            ctx.ellipse(-15, 2, 2.2, 3.2, 0, 0, Math.PI * 2); ctx.ellipse(15, 2, 2.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = P.INK;
            ctx.beginPath(); ctx.ellipse(-8, -4, 3, 4.2, 0, 0, Math.PI * 2); ctx.ellipse(8, -4, 3, 4.2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, 4, 3, 0, Math.PI); ctx.fill();
            ctx.globalAlpha *= 0.55; ctx.fillStyle = P.PUMPKIN;
            ctx.beginPath(); ctx.ellipse(-14, 3, 4, 2.5, 0, 0, Math.PI * 2); ctx.ellipse(14, 3, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        if (kind === 'replyall') {           // an envelope with a fan of three arrows: it copies everyone in
            ctx.save(); ctx.translate(cx + 22 * s, cy + 20 * s); ctx.globalAlpha *= alpha;
            ctx.fillStyle = P.GHOST; ctx.strokeStyle = P.INK; ctx.lineWidth = 2;
            rr(ctx, -10, -7, 20, 14, 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(0, 1); ctx.lineTo(10, -7); ctx.stroke();
            ctx.strokeStyle = P.PUMPKIN; ctx.lineWidth = 2.2;
            for (var a = -1; a <= 1; a++) { ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(22, a * 8); ctx.stroke(); }
            ctx.restore();
        }
    }

    /* ---- one tile ---- */
    function drawTile(ctx, i, state, view, ctxFx) {
        var r = layout.tileRect(i), t = tileOf(state, i), st = t.state || 'idle';
        var isPres = presenterIdx(state) === i, now = view.now || 0, rm = !!view.rm;
        var cx = r.x + r.w / 2, avY = r.y + r.h * 0.42;
        var press = ctxFx.press[i], miss = ctxFx.miss[i];
        ctx.save();
        // tap feedback: full = scale 0.96 for 120 ms; reduce = a brightness change in place
        if (press != null && !rm) {
            var sc = 1 - 0.04 * (1 - easeOut(press));
            ctx.translate(cx, r.y + r.h / 2); ctx.scale(sc, sc); ctx.translate(-cx, -(r.y + r.h / 2));
        }
        if (miss != null && !rm) { ctx.translate(Math.sin(miss * Math.PI * 6) * 3 * (1 - miss), 0); debug.travel++; }

        var fill = st === 'haunted' ? P.PLUM : st === 'muted' ? P.GHOST : st === 'muddled' ? P.CREAM : P.LILAC;
        rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = isPres ? 4 : 3; ctx.strokeStyle = isPres ? P.PERIWINKLE : st === 'haunted' ? P.INK : P.PLUM; ctx.stroke();

        // the caller
        var tint = TINTS[(i * 3 + 1) % 4];
        if (st === 'haunted' && tint === P.PLUM) tint = P.MAUVE;
        avatar(ctx, cx, avY, i, tint, st === 'haunted' ? 0.55 : st === 'muddled' ? 0.6 : 1);

        // muddled: a scribble over the head and a caption
        if (st === 'muddled') {
            ctx.strokeStyle = P.PLUM; ctx.lineWidth = 2.2; ctx.beginPath();
            for (var a = 0; a <= 26; a++) { var ang = a * 0.75, rad = 6 + a * 0.55; ctx.lineTo(cx + Math.cos(ang) * rad, avY - 28 + Math.sin(ang) * rad * 0.45); }
            ctx.stroke();
            ctx.font = 'bold 14px ' + FB; ctx.fillStyle = P.PLUM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('?!', cx + 36, avY - 30);
        }
        // muted: a big mic-slash badge
        if (st === 'muted') {
            ctx.beginPath(); ctx.arc(cx + 34, r.y + 26, 15, 0, Math.PI * 2); ctx.fillStyle = P.INK; ctx.fill();
            mic(ctx, cx + 34, r.y + 26, 1.05, P.GHOST, true);
        }

        // presenter strip: dark label at the top, screen-share badge
        if (isPres) {
            rr(ctx, r.x + 6, r.y + 6, r.w - 12, 22, 7); ctx.fillStyle = P.INK; ctx.fill();
            screenIcon(ctx, r.x + 20, r.y + 17, P.GHOST);
            ctx.font = '17px ' + FD; ctx.fillStyle = P.GHOST; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText((view.copy && view.copy.presenting) || 'PRESENTING', r.x + 34, r.y + 18);
        }

        // the ghost
        if (st === 'haunted') {
            var g = t.ghost || {}, kind = kindOf(g), age = typeof g.age === 'number' ? g.age * 1000 : null;
            var arr = age != null ? clamp01(age / 250) : (ctxFx.arrive[i] != null ? ctxFx.arrive[i] : 1);
            var gy = avY + 2, s = kind === 'echo' ? 0.82 : 1, a = easeOut(arr);
            if (arr < 1) { debug.fades++; if (!rm) { gy += 8 * (1 - a); debug.travel++; } }
            // glow: full = steady; reduce = slow colour crossfade (0.6 s)
            ctx.save();
            var gk = rm ? 0.5 + 0.5 * Math.sin(now / 600 * Math.PI) : 0;
            ctx.globalAlpha = 0.45 * a; ctx.fillStyle = P.PERIWINKLE;
            ctx.beginPath(); ctx.arc(cx, gy, 40, 0, Math.PI * 2); ctx.fill();
            if (rm) { ctx.globalAlpha = 0.4 * a * gk; ctx.fillStyle = P.GHOST; ctx.fill(); debug.fades++; }
            ctx.restore();
            if (!rm && arr >= 1) { gy += Math.sin(now / 1000 * Math.PI * 2 * 0.9) * 3; debug.travel++; }
            ghost(ctx, cx, gy, s, kind, a * (kind === 'echo' ? 0.8 : 1));
            if (kind === 'replyall' || kind === 'laugh') {   // the special's name, top left
                ctx.font = '16px ' + FD; ctx.fillStyle = P.GHOST; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(cap(view, kind === 'laugh' ? 'laugh' : 'replyAll'), r.x + 10, r.y + 18, r.w - 20);
            }
            if (g.kind === 'pair') {   // "No, you go ahead": a speech bubble with an ellipsis
                ctx.fillStyle = P.GHOST; ctx.strokeStyle = P.INK; ctx.lineWidth = 2;
                rr(ctx, r.x + 8, r.y + 8, 30, 20, 8); ctx.fill(); ctx.stroke();
                ctx.fillStyle = P.INK;
                for (var d = 0; d < 3; d++) { ctx.beginPath(); ctx.arc(r.x + 16 + d * 7, r.y + 18, 2, 0, Math.PI * 2); ctx.fill(); }
            }
        }

        // the handle plate, the mic and the life bar
        var py = r.y + r.h - 30;
        rr(ctx, r.x + 5, py, r.w - 10, 25, 7); ctx.fillStyle = P.INK; ctx.fill();
        var handle = (view.copy && view.copy.handles && view.copy.handles[i]) || ('Caller ' + (i + 1));
        ctx.font = 'bold 14px ' + FB; ctx.fillStyle = P.GHOST; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(handle, r.x + 12, py + 13, r.w - 46);
        var mx = r.x + r.w - 20, my = py + 12;
        if (st === 'haunted') {
            var pulse = rm ? 1 : 1 + 0.12 * Math.sin(now / 1000 * Math.PI * 2 * 1.8);
            ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = P.PUMPKIN;
            ctx.beginPath(); ctx.arc(mx, my, 10 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            mic(ctx, mx, my, 0.85, P.INK, false);
            ctx.strokeStyle = P.PUMPKIN; ctx.lineWidth = 2;
            for (var w = 1; w <= 2; w++) { ctx.beginPath(); ctx.arc(mx, my, 10 + w * 3, -0.6, 0.6); ctx.stroke(); }
            if (typeof g.age === 'number' && g.life > 0) {
                var left = clamp01(1 - g.age / g.life);
                ctx.fillStyle = P.PUMPKIN; rr(ctx, r.x + 10, py - 7, (r.w - 20) * left, 4, 2); ctx.fill();
            }
        } else {
            mic(ctx, mx, my, 0.85, st === 'muted' ? P.CREAM : P.PERIWINKLE, st === 'muted');
        }
        if (st === 'muted') {      // the caption names how it was muted: plain, echo or the pair
            var how = ctxFx.result[i] || 'mute';
            ctx.font = '16px ' + FD; ctx.fillStyle = P.INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            var txt = cap(view, how), mw = r.w - 56, sp = txt.lastIndexOf(' ', Math.ceil(txt.length / 2));
            if (ctx.measureText(txt).width <= mw || sp < 0) ctx.fillText(txt, r.x + 10, r.y + 18, mw);
            else { ctx.fillText(txt.slice(0, sp), r.x + 10, r.y + 13, mw); ctx.fillText(txt.slice(sp + 1), r.x + 10, r.y + 29, mw); }
        }
        // reduce-tier tap feedback: brightness
        if (press != null && rm) {
            ctx.save(); ctx.globalAlpha = 0.35 * (1 - press); ctx.fillStyle = P.GHOST;
            rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.restore(); debug.fades++;
        }
        if (miss != null && rm) {
            ctx.save(); ctx.globalAlpha = 0.3 * (1 - miss); ctx.fillStyle = P.INK;
            rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.restore(); debug.fades++;
        }
        ctx.restore();

        // keyboard focus ring
        if (view.focus === i) {
            ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = P.PUMPKIN; rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 15); ctx.stroke();
            ctx.lineWidth = 1.5; ctx.strokeStyle = P.GHOST; rr(ctx, r.x - 6.5, r.y - 6.5, r.w + 13, r.h + 13, 17); ctx.stroke(); ctx.restore();
        }
    }

    /* ---- transient effects on top of tiles ---- */
    function drawPoof(ctx, i, k, flash, rm) {
        var r = layout.tileRect(i), cx = r.x + r.w / 2, cy = r.y + r.h * 0.42 + 2;
        ctx.save();
        if (!flash) {                         // ledger denied: a plain 300 ms fade, no bright frame
            var kf = clamp01(k * 520 / 300);
            ghost(ctx, cx, cy, 1, 'normal', 1 - kf); debug.fades++;
        } else if (rm) {                      // reduce: an opacity-only ring in place
            ctx.globalAlpha = 0.8 * (1 - k); ctx.strokeStyle = P.GHOST; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke(); debug.fades++;
        } else if (k * 520 < 120) {           // full: squash to 0.96 first
            ghost(ctx, cx, cy, 0.96, 'normal', 1);
        } else {                              // then a poof of 8 particles
            k = (k * 520 - 120) / 400;
            var e = easeOut(k);
            if (k < 0.15) { ctx.globalAlpha = 0.5 * (1 - k / 0.15); ctx.fillStyle = P.GHOST; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = 1 - k; ctx.fillStyle = P.GHOST; ctx.strokeStyle = P.INK; ctx.lineWidth = 1.5;
            for (var n = 0; n < 8; n++) {
                var ang = n * Math.PI / 4 + 0.3, d = 14 + 36 * e, pr = 6 * (1 - 0.6 * k);
                ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, pr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            }
            debug.travel++;
        }
        ctx.restore();
    }

    function collectFx(view, state) {
        var out = { press: {}, miss: {}, arrive: {}, result: {}, list: [], presenter: null, glitch: null, oops: false, escaped: false };
        var fx = view.fx || [], now = view.now || 0;
        for (var n = 0; n < fx.length; n++) {
            var f = fx[n]; if (!f) continue;
            if (f.type === 'oops' && now - (f.t0 || 0) < CAPTION_MS) out.oops = true;   // the caption outlives the shake
            if (f.type === 'expire' && now - (f.t0 || 0) < CAPTION_MS) out.escaped = true;
            var dur = DUR[f.type]; if (!dur) continue;
            var k = (now - (f.t0 || 0)) / dur;
            if (k < 0 || k >= 1) continue;
            if (f.flash) countFlash(f, state);
            var i = f.tile;
            if (f.type === 'tap') out.press[i] = k;
            else if (f.type === 'miss' || f.type === 'oops') out.miss[i] = k;
            else if (f.type === 'spawn' || f.type === 'hop' || f.type === 'spread') out.arrive[i] = k;

            else if (f.type === 'presenter') out.presenter = { tile: i, k: k, flash: !!f.flash };
            else if (f.type === 'glitch') out.glitch = { k: k, flash: !!f.flash };
            else {
                if (f.type === 'mute' || f.type === 'echo' || f.type === 'pair') out.result[i] = f.type;
                out.list.push({ f: f, k: k });
            }
        }
        return out;
    }

    /* ---- call bar ---- */
    function drawCallBar(ctx, state, view, gk, oops, escaped) {
        var b = layout.callBar, now = view.now || 0, copy = view.copy || {};
        ctx.fillStyle = P.PLUM; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = P.INK; ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
        var gl = glitchOn(state);
        // live dot: a slow breathing opacity in both tiers (the call is live)
        ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 900 * Math.PI); ctx.fillStyle = P.PUMPKIN;
        ctx.beginPath(); ctx.arc(18, b.y + 17, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); debug.fades++;
        // a ledger-denied glitch crossfades title to banner over 1 s (gk < 1) instead of a bright step
        if (gl) {
            ctx.save(); ctx.globalAlpha = gk;
            rr(ctx, 30, b.y + 5, 204, 24, 6); ctx.fillStyle = P.PUMPKIN; ctx.fill();
            ctx.font = '20px ' + FD; ctx.fillStyle = P.INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(copy.glitch || 'SIGNAL WOBBLE', 38, b.y + 18, 190);
            ctx.restore(); if (gk < 1) debug.fades++;
        }
        if (!gl || gk < 1) {
            ctx.save(); ctx.globalAlpha = gl ? 1 - gk : 1;
            ctx.font = '22px ' + FD; ctx.fillStyle = P.GHOST; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(copy.title || 'THE WEEKLY CATCH-UP', 30, b.y + 18, 204);
            ctx.restore();
        }
        // calm meter: the number is printed too, so colour is never the only signal
        var calm = Math.max(0, Math.min(100, state && typeof state.calm === 'number' ? state.calm : 100));
        // a caption toast over the title slot: dropped, then a presenter tap, then an escape, then low Calm
        var toast = calm <= 0 && state && state.ended ? cap(view, 'dropped') : oops ? cap(view, 'presenter') :
            escaped ? cap(view, 'escaped') : calm > 0 && calm <= CALM_LOW && !gl ? cap(view, 'calmLow') : null;   // the glitch banner outranks calmLow
        if (toast) {
            rr(ctx, 26, b.y + 4, 212, 26, 6); ctx.fillStyle = P.GHOST; ctx.fill();
            ctx.font = '20px ' + FD; ctx.fillStyle = P.INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(toast, 34, b.y + 18, 196);
        }
        ctx.font = '16px ' + FD; ctx.fillStyle = P.PERIWINKLE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(cap(view, 'calm'), 12, b.y + 42, 40);
        rr(ctx, 56, b.y + 35, 140, 12, 6); ctx.fillStyle = P.INK; ctx.fill();
        if (calm > 0) { rr(ctx, 58, b.y + 37, 136 * calm / 100, 8, 4); ctx.fillStyle = calm <= 30 ? P.PUMPKIN : P.PERIWINKLE; ctx.fill(); }
        ctx.fillStyle = P.PERIWINKLE; ctx.fillText(String(Math.round(calm)), 202, b.y + 41);
        // streak pill
        var streak = state && state.streak ? state.streak : 0;
        rr(ctx, 244, b.y + 10, 70, 36, 8); ctx.fillStyle = P.INK; ctx.fill();
        ctx.textAlign = 'center'; ctx.fillStyle = P.PUMPKIN;
        ctx.font = 'bold 14px ' + FB; ctx.fillText('STREAK', 279, b.y + 20);
        ctx.font = '20px ' + FD; ctx.fillText(String(streak), 279, b.y + 36);
        // seconds left
        var roundS = view.roundS || 60, left = Math.max(0, Math.ceil(roundS - (state && state.t ? state.t : 0)));
        ctx.textAlign = 'right'; ctx.fillStyle = P.GHOST; ctx.font = '34px ' + FD;
        ctx.fillText(String(left), 388, b.y + 24);
        ctx.font = '16px ' + FD; ctx.fillStyle = P.PERIWINKLE; ctx.fillText(cap(view, 'secondsLeft'), 388, b.y + 46);
    }

    function drawFooter(ctx) {
        var f = layout.footer, icons = ['mic', 'cam', 'hand'];
        ctx.fillStyle = P.CREAM;
        sparkle(ctx, 40, f.y + 18, 5); sparkle(ctx, 70, f.y + 30, 3); sparkle(ctx, 340, f.y + 14, 4); sparkle(ctx, 366, f.y + 28, 6);
        for (var n = 0; n < 3; n++) {
            var x = 160 + n * 40, y = f.y + 20;
            ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fillStyle = P.PLUM; ctx.fill();
            ctx.strokeStyle = P.GHOST; ctx.fillStyle = P.GHOST; ctx.lineWidth = 2;
            if (icons[n] === 'mic') mic(ctx, x, y, 0.8, P.GHOST, false);
            else if (icons[n] === 'cam') { rr(ctx, x - 8, y - 5, 11, 10, 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 4, y - 1); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x + 4, y + 1); ctx.closePath(); ctx.fill(); }
            else { rr(ctx, x - 5, y - 2, 10, 9, 3); ctx.fill(); for (var d = 0; d < 4; d++) { rr(ctx, x - 5 + d * 2.7, y - 8 + (d === 0 || d === 3 ? 2 : 0), 2.2, 8, 1); ctx.fill(); } }
        }
    }

    /* ---- the frame ---- */
    function draw(ctx, state, view) {
        view = view || {};
        debug.frames++; debug.travel = 0; debug.fades = 0;
        var rm = !!view.rm, now = view.now || 0;
        ctx.save();
        ctx.fillStyle = P.INK; ctx.fillRect(0, HUD_H, W, 700 - HUD_H);
        var gr = getGrain();
        if (gr) { ctx.globalAlpha = 0.75; ctx.drawImage(gr, 0, HUD_H, W, 700 - HUD_H, 0, HUD_H, W, 700 - HUD_H); ctx.globalAlpha = 1; }
        var fx = collectFx(view, state);
        // one flash ledger (plan 2.7): a denied glitch onset ramps in over 1 s (glitch fx lives 1.5 s in game.js)
        var gk = fx.glitch && !fx.glitch.flash ? clamp01(fx.glitch.k * DUR.glitch / 1000) : 1;
        drawCallBar(ctx, state, view, gk, fx.oops, fx.escaped);

        // glitch: full = tint wave plus 2 px jitter; reduce = tint crossfade only (2 s or longer)
        var gOn = glitchOn(state), jx = 0;
        if (gOn && !rm) { jx = Math.round(Math.sin(now / 47) * 2); debug.travel++; }
        ctx.save(); if (jx) ctx.translate(jx, 0);
        for (var i = 0; i < 12; i++) drawTile(ctx, i, state, view, fx);
        for (var n = 0; n < fx.list.length; n++) {
            var e = fx.list[n], ty = e.f.type;
            if (ty === 'mute' || ty === 'echo' || ty === 'pair') drawPoof(ctx, e.f.tile, e.k, !!e.f.flash, rm);
            else if (ty === 'leave') { var lr = layout.tileRect(e.f.tile); ghost(ctx, lr.x + lr.w / 2, lr.y + lr.h * 0.42 - (rm ? 0 : 10 * e.k), 0.82, 'echo', 0.7 * (1 - e.k)); debug.fades++; if (!rm) debug.travel++; }
        }
        // presenter rotation: the new presenter's frame fades up from a soft ring
        if (fx.presenter && fx.presenter.flash) {   // ledger denied: no ring, the badge just moves
            var pr = layout.tileRect(fx.presenter.tile);
            ctx.save(); ctx.globalAlpha = 0.7 * (1 - fx.presenter.k); ctx.strokeStyle = P.PERIWINKLE; ctx.lineWidth = 8;
            rr(ctx, pr.x - 2, pr.y - 2, pr.w + 4, pr.h + 4, 14); ctx.stroke(); ctx.restore(); debug.fades++;
        }
        ctx.restore();
        if (gOn) {
            ctx.save(); var G = GRID; ctx.beginPath(); ctx.rect(G.x - 6, G.y - 6, G.w + 12, G.h + 12); ctx.clip();
            if (rm) {
                ctx.globalAlpha = gk * (0.18 + 0.12 * Math.sin(now / 2400 * Math.PI * 2));
                ctx.fillStyle = P.PERIWINKLE; ctx.fillRect(G.x, G.y, G.w, G.h); debug.fades++;
            } else {
                var bandY = G.y + ((now / 1600) % 1) * (G.h + 160) - 80;
                ctx.globalAlpha = 0.28 * gk; ctx.fillStyle = P.PERIWINKLE;
                ctx.fillRect(G.x, bandY, G.w, 80); ctx.globalAlpha = 0.14 * gk; ctx.fillRect(G.x, bandY - 60, G.w, 40);
                debug.travel++;
            }
            ctx.restore();
        }
        drawFooter(ctx);
        ctx.restore();
    }

    /* ---- the page-local HUD (game.js sets GameEngine.renderHUD to call this) ---- */
    function drawHUD(ctx, es) {
        if (!ctx) return;
        es = es || {};
        var h = HUD_H, max = (typeof GameEngine !== 'undefined' && GameEngine.MAX_ATTEMPTS) || 3;
        ctx.save();
        ctx.fillStyle = P.INK; ctx.fillRect(0, 0, W, h);
        ctx.fillStyle = P.PLUM; ctx.fillRect(0, h - 2, W, 2);
        ctx.textBaseline = 'middle';
        ctx.font = '24px ' + FD; ctx.fillStyle = P.GHOST; ctx.textAlign = 'left';
        ctx.fillText('SCORE ' + (es.score || 0), 12, h / 2 + 1);
        if (es.startTime) {
            var el = Math.floor((performance.now() - es.startTime) / 1000), m = Math.floor(el / 60), s = el % 60;
            ctx.textAlign = 'center'; ctx.fillText(m + ':' + (s < 10 ? '0' : '') + s, W / 2, h / 2 + 1);
        }
        for (var i = 0; i < max; i++) {
            var cx = W - 12 - (max - i) * 18 + 6;
            ctx.beginPath(); ctx.arc(cx, h / 2, 6, 0, Math.PI * 2);
            if (i < (es.attemptsRemaining == null ? max : es.attemptsRemaining)) { ctx.fillStyle = P.PUMPKIN; ctx.fill(); }
            else { ctx.strokeStyle = P.PERIWINKLE; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
        ctx.restore();
    }

    var api = { PALETTE: P, layout: layout, draw: draw, drawHUD: drawHUD, debug: debug };
    if (typeof window !== 'undefined') window.GOMArt = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
