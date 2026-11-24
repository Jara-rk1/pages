/**
 * Gate Change: art (canvas only, no game rules).
 *
 * window.GCArt = { PALETTE, layout, draw(ctx, state, view), drawHUD(ctx, engineState, state, view), debug }
 *   state: the model round (model.js). view: { now (ms), rm (bool), fx (array from game.js), copy, live, model }
 *   fx = [{type, t0, ...}]: 'sent' {dir, result, reason, points, traveller, correct, recovered}, 'missed' {traveller, correct},
 *        'step', 'change' {a, b}, 'cancel' {gate, dest}, 'rollover' {gate}, 'lastcall', 'press' {dir}. Unknown types are ignored.
 *   debug: frames (running), travel and fades (this frame), counted for the motion gate: in reduced motion nothing
 *   moves (travel stays 0) and fades still run.
 *
 * Type: the newsletter's heavy geometric sans (Montserrat 700-900, OFL, vendored) for every heading, label and
 * message; Bebas Neue only for the signage (departures board rows, banners and the pass destination, so the
 * city on the pass matches the city on the board by eye).
 * Palette: the issue's own (plan D3), declared in game.js and the decision file. Hex only, alpha via globalAlpha.
 * Text pairs (WCAG 2.x, measured in python, see the decision file), one per line for G10:
 *   pair: CREAM on KYOTO (HUD score, header)
 *   pair: BUTTER on KYOTO (HUD labels, banners, bad toasts)
 *   pair: INK on AMBER (streak chip, upgrade pass header)
 *   pair: AMBER on BOARD (clock, destinations, FINAL CALL)
 *   pair: BUTTER on BOARD (board title)
 *   pair: CREAM on BOARD (flight codes, NOW BOARDING)
 *   pair: SKY_LT on BOARD (column labels, BOARDING status)
 *   pair: INK on BUTTER (gate letter tiles, GATE CHANGE status, score popups)
 *   pair: INK on PASS (CANCELLED status, 24 px only: large text)
 *   pair: CREAM on ROYAL (gate signs)
 *   pair: CREAM on OLIVE (service desk, good toasts)
 *   pair: WHITE on PASS (boarding-pass header, 19 px heavy only: large text)
 *   pair: INK on WHITE (pass body, speech bubble)
 *   pair: SLATE on WHITE (pass labels)
 *   pair: OLIVE on WHITE (ANNUAL LEAVE stamp)
 *   pair: ROYAL on WHITE (CLIENT SITE stamp)
 *   pair: SLATE on CREAM (NEXT label)
 */
(function () {
    'use strict';

    var P = {
        SKY: '#467BCF', SKY_LT: '#A2C2F2', ROYAL: '#2E72C6', ROYAL_DK: '#1D4F94', KYOTO: '#890202', KYOTO_DK: '#5A0101',
        PASS: '#E43D3D', OLIVE: '#597643', CREAM: '#FFF6E6', BUTTER: '#FFF2B0', BOARD: '#13213F', BOARD2: '#1E3158',
        AMBER: '#FFC94A', INK: '#1B1F2A', SLATE: '#4A5263', WHITE: '#FFFFFF', RUST: '#892F02'
    };
    var W = 400, H = 700, HUD_H = 48;
    var FM = '"Montserrat", "Arial Black", Arial, sans-serif';     // the newsletter's voice
    var FS = '"Bebas Neue", "Arial Narrow", Arial, sans-serif';    // signage
    var LOOK = [P.SKY, P.OLIVE, P.KYOTO, P.ROYAL, P.RUST, P.PASS];
    var GL = ['A', 'B', 'C'];

    var layout = {
        board: { x: 10, y: 56, w: 380, h: 170 },
        doors: [
            { x: 6, y: 356, w: 60, h: 186 },      // A, left
            { x: 120, y: 234, w: 160, h: 56 },    // B, top
            { x: 334, y: 356, w: 60, h: 186 },    // C, right
            { x: 8, y: 616, w: 318, h: 76 }       // the service desk, bottom
        ],
        pass: { x: 72, y: 444, w: 256, h: 150 },
        figure: { x: 200, y: 356 }
    };
    // where the "+points" lands for each door (beside it, clear of the counter)
    var POP = [[36, 340], [312, 262], [364, 340], [360, 604]];
    // exit travel toward each door (px), and the toast line
    var EXIT = [[-130, 0], [0, -80], [130, 0], [0, 50]];
    var TOAST_Y = 304;

    var debug = { frames: 0, travel: 0, fades: 0 };

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
    function easeOutQuart(k) { return 1 - Math.pow(1 - k, 4); }
    function easeOutBack(k) { var c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function text(ctx, s, x, y, font, col, align) {
        ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(s, x, y);
    }
    // the newsletter's display treatment: heavy type with a hard offset shadow in a darker tone of the ground
    function stext(ctx, s, x, y, font, col, align, shadow, off) {
        text(ctx, s, x + off, y + off, font, shadow, align);
        text(ctx, s, x, y, font, col, align);
    }
    // largest size (from max down) that fits w
    function fit(ctx, s, weightFam, max, w) {
        var px = max;
        for (; px > 10; px--) { ctx.font = weightFam.replace('{px}', px); if (ctx.measureText(s).width <= w) break; }
        return weightFam.replace('{px}', px);
    }
    function softShadow(ctx, blur, oy, alpha) {
        ctx.shadowColor = 'rgba(19,33,63,' + alpha + ')'; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = oy;
    }
    function noShadow(ctx) { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
    function arrow(ctx, cx, cy, dir, s, col) {   // dir 0 left, 1 up, 2 right, 3 down
        var a = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][dir];
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.8); ctx.lineTo(-s * 0.6, s * 0.8); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    function plane(ctx, cx, cy, s, col) {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 10, s / 10); ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(6, -1.2); ctx.lineTo(-1, -1.2); ctx.lineTo(-5, -7); ctx.lineTo(-7, -7);
        ctx.lineTo(-4, -1.2); ctx.lineTo(-7, -1.2); ctx.lineTo(-9, -4); ctx.lineTo(-10, -4); ctx.lineTo(-9, 0);
        ctx.lineTo(-10, 4); ctx.lineTo(-9, 4); ctx.lineTo(-7, 1.2); ctx.lineTo(-4, 1.2); ctx.lineTo(-7, 7);
        ctx.lineTo(-5, 7); ctx.lineTo(-1, 1.2); ctx.lineTo(6, 1.2); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    function laptop(ctx, x, y, s) {
        ctx.fillStyle = P.SLATE; rr(ctx, x, y, 26 * s, 17 * s, 2 * s); ctx.fill();
        ctx.fillStyle = P.SKY_LT; ctx.fillRect(x + 3 * s, y + 3 * s, 20 * s, 11 * s);
        ctx.fillStyle = P.INK; rr(ctx, x - 4 * s, y + 17 * s, 34 * s, 4 * s, 2 * s); ctx.fill();
    }
    function cloud(ctx, x, y, s) {
        ctx.beginPath();
        ctx.arc(x, y, 12 * s, 0, Math.PI * 2); ctx.arc(x + 14 * s, y - 7 * s, 15 * s, 0, Math.PI * 2);
        ctx.arc(x + 30 * s, y - 2 * s, 12 * s, 0, Math.PI * 2); ctx.arc(x + 44 * s, y + 2 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
    }
    function ageOf(view, f) { return (view.now || 0) - f.t0; }

    /* ---- background: the cover's sky over the terminal floor ---- */
    var skyGrad = null, skyCtx = null;
    function drawBackground(ctx) {
        if (skyCtx !== ctx) {
            skyGrad = ctx.createLinearGradient(0, HUD_H, 0, 240);
            skyGrad.addColorStop(0, P.SKY); skyGrad.addColorStop(1, P.SKY_LT);
            skyCtx = ctx;
        }
        ctx.fillStyle = skyGrad; ctx.fillRect(0, HUD_H, W, 240 - HUD_H);
        ctx.fillStyle = P.CREAM; ctx.fillRect(0, 240, W, H - 240);
        ctx.fillStyle = P.WHITE;   // the cloud bank the board floats on, melting into the floor
        cloud(ctx, -18, 238, 1.1); cloud(ctx, 40, 242, 0.8); cloud(ctx, 268, 240, 0.9); cloud(ctx, 330, 236, 1.2);
        ctx.fillRect(0, 238, W, 4);
    }

    /* ---- the departures board ---- */
    var SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function statusOf(state, g) {
        if (state.gates[g] === state.cancelled) return 'cancelled';
        if (state.t - state.changedAt[g] < 4) return 'change';     // actionable news beats the last-call label
        if (state.t - state.rolledAt[g] < 4) return 'new';
        if (state.lastCall) return 'final';
        return 'boarding';
    }
    function rowY(g) { return layout.board.y + 50 + g * 38; }
    function drawBoard(ctx, state, view, model, copy) {
        var b = layout.board, rm = view.rm, now = view.now || 0;
        ctx.save(); softShadow(ctx, 14, 5, 0.35);
        ctx.fillStyle = P.BOARD; rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.fill();
        ctx.restore();
        text(ctx, copy.board.title, b.x + 14, b.y + 19, '900 15px ' + FM, P.BUTTER);
        ctx.font = '900 15px ' + FM;
        plane(ctx, b.x + 26 + ctx.measureText(copy.board.title).width, b.y + 18, 8, P.BUTTER);
        text(ctx, model.clockText(state), b.x + b.w - 14, b.y + 20, '26px ' + FS, P.AMBER, 'right');
        var cols = [b.x + 14, b.x + 62, b.x + 132, b.x + 268];
        var lab = copy.board.columns;
        for (var c = 0; c < 4; c++) text(ctx, lab[c], cols[c], b.y + 39, '700 10px ' + FM, P.SKY_LT);
        for (var g = 0; g < 3; g++) {
            var ry = rowY(g), d = model.DESTS[state.gates[g]], st = statusOf(state, g);
            ctx.fillStyle = P.BOARD2; rr(ctx, b.x + 8, ry, b.w - 16, 34, 6); ctx.fill();
            ctx.fillStyle = P.BOARD; ctx.fillRect(b.x + 8, ry + 17, b.w - 16, 1);   // flap seam, under the text
            ctx.globalAlpha = st === 'cancelled' ? 0.45 : 1;
            ctx.fillStyle = P.BUTTER; rr(ctx, cols[0], ry + 4, 30, 26, 5); ctx.fill();
            text(ctx, GL[g], cols[0] + 15, ry + 18, '24px ' + FS, P.INK, 'center');
            ctx.globalAlpha = 1;
            text(ctx, d.flight, cols[1], ry + 18, '18px ' + FS, P.CREAM);
            // split-flap flip on a change or a new flight: full = letters cycle, reduce = crossfade in place
            var since = Math.min(state.t - state.changedAt[g], state.t - state.rolledAt[g]);
            var city = d.city, alpha = 1;
            if (since < 0.45) {
                if (rm) { alpha = clamp01(since / 0.45); debug.fades++; }
                else {
                    var n = Math.floor(now / 45), out = '';
                    for (var i = 0; i < city.length; i++) out += city[i] === ' ' ? ' ' : (since > 0.45 * (i + 1) / (city.length + 1) ? city[i] : SCRAMBLE[(n * 7 + i * 13 + g * 5) % 26]);
                    city = out; debug.travel++;
                }
            }
            ctx.globalAlpha = st === 'cancelled' ? 0.5 : alpha;
            text(ctx, city, cols[2], ry + 18, '24px ' + FS, P.AMBER);
            if (st === 'cancelled') { ctx.fillRect(cols[2] - 2, ry + 17, ctx.measureText(city).width + 4, 2); }   // struck through
            ctx.globalAlpha = 1;
            // status cell
            var sx = cols[3] - 4, sw = b.x + b.w - 14 - sx, mid = sx + sw / 2;
            // every status at 24 px (large text): CANCELLED's INK on PASS needs the 3.0 large-text bar
            if (st === 'cancelled') { ctx.fillStyle = P.PASS; rr(ctx, sx, ry + 4, sw, 26, 5); ctx.fill(); text(ctx, copy.board.cancelled, mid, ry + 18, '24px ' + FS, P.INK, 'center'); }
            else if (st === 'change') { ctx.fillStyle = P.BUTTER; rr(ctx, sx, ry + 4, sw, 26, 5); ctx.fill(); text(ctx, copy.board.change, mid, ry + 18, '24px ' + FS, P.INK, 'center'); }
            else if (st === 'final') { ctx.strokeStyle = P.AMBER; ctx.lineWidth = 1.5; rr(ctx, sx + 0.75, ry + 4.75, sw - 1.5, 24.5, 5); ctx.stroke(); text(ctx, copy.board.final, mid, ry + 18, '24px ' + FS, P.AMBER, 'center'); }
            else if (st === 'new') text(ctx, copy.board.fresh, sx + 4, ry + 18, fit(ctx, copy.board.fresh, '{px}px ' + FS, 24, sw - 6), P.CREAM);
            else text(ctx, copy.board.boarding, sx + 4, ry + 18, '24px ' + FS, P.SKY_LT);
        }
    }

    /* ---- doors and desk ---- */
    function pressK(view, dir) {
        var fx = view.fx || [];
        for (var i = fx.length - 1; i >= 0; i--) if (fx[i].type === 'press' && fx[i].dir === dir) { var a = ageOf(view, fx[i]); if (a < 140) return 1 - a / 140; break; }
        return 0;
    }
    function pressIn(ctx, view, r, k) {
        if (!k || view.rm) return;
        var sc = 1 - 0.04 * k, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy); debug.travel++;
    }
    function pressFlash(ctx, r, k, rad) {
        if (!k) return;
        ctx.globalAlpha = 0.3 * k; ctx.fillStyle = P.WHITE; rr(ctx, r.x, r.y, r.w, r.h, rad); ctx.fill(); ctx.globalAlpha = 1; debug.fades++;
    }
    function drawDoors(ctx, view, copy) {
        var D = layout.doors;
        for (var g = 0; g < 3; g++) {
            var r = D[g], k = pressK(view, g);
            ctx.save(); pressIn(ctx, view, r, k);
            ctx.save(); softShadow(ctx, 10, 4, 0.22); ctx.fillStyle = P.ROYAL; rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.restore();
            if (g === 1) {   // across the top: the same sign and doorway, laid on its side
                text(ctx, copy.gate, r.x + 30, r.y + 15, '700 10px ' + FM, P.CREAM, 'center');
                stext(ctx, GL[g], r.x + 30, r.y + 36, '900 26px ' + FM, P.CREAM, 'center', P.ROYAL_DK, 2);
                ctx.fillStyle = P.BOARD; rr(ctx, r.x + 58, r.y + 8, r.w - 66, r.h - 16, 7); ctx.fill();
                arrow(ctx, r.x + 58 + (r.w - 66) / 2, r.y + r.h / 2, 1, 10, P.CREAM);
            } else {
                text(ctx, copy.gate, r.x + r.w / 2, r.y + 16, '700 10px ' + FM, P.CREAM, 'center');
                stext(ctx, GL[g], r.x + r.w / 2, r.y + 43, '900 30px ' + FM, P.CREAM, 'center', P.ROYAL_DK, 2);
                ctx.fillStyle = P.BOARD; rr(ctx, r.x + 8, r.y + 68, r.w - 16, r.h - 76, 7); ctx.fill();   // the doorway
                arrow(ctx, r.x + r.w / 2, r.y + 68 + (r.h - 76) / 2, g === 0 ? 0 : 2, 11, P.CREAM);
            }
            pressFlash(ctx, r, k, 12);
            ctx.restore();
        }
        var d = D[3], kd = pressK(view, 3);
        ctx.save(); pressIn(ctx, view, d, kd);
        ctx.save(); softShadow(ctx, 10, 4, 0.22); ctx.fillStyle = P.OLIVE; rr(ctx, d.x, d.y, d.w, d.h, 14); ctx.fill(); ctx.restore();
        laptop(ctx, d.x + 18, d.y + 26, 1.1);
        text(ctx, copy.desk.title, d.x + 64, d.y + 22, '900 17px ' + FM, P.CREAM);
        text(ctx, copy.desk.sub[0], d.x + 64, d.y + 44, '700 11px ' + FM, P.CREAM);
        text(ctx, copy.desk.sub[1], d.x + 64, d.y + 59, '700 11px ' + FM, P.CREAM);
        ctx.fillStyle = P.CREAM; ctx.beginPath(); ctx.arc(d.x + d.w - 30, d.y + d.h / 2, 15, 0, Math.PI * 2); ctx.fill();
        arrow(ctx, d.x + d.w - 30, d.y + d.h / 2 + 1, 3, 8, P.OLIVE);
        pressFlash(ctx, d, kd, 14);
        ctx.restore();
    }
    // after a mistake: ring the door that was right, so the lesson lands where the eye goes next
    function drawRing(ctx, view, dir, a) {
        var r = layout.doors[dir], k = a / 1000;
        if (k >= 1) return;
        ctx.save(); ctx.globalAlpha = 1 - k * k; debug.fades++;
        ctx.strokeStyle = P.AMBER; ctx.lineWidth = 4; rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 15); ctx.stroke();
        ctx.restore();
    }

    /* ---- traveller and pass ---- */
    function drawFigure(ctx, tr, cx, cy, s, model) {
        var col = LOOK[tr.look % LOOK.length];
        ctx.fillStyle = P.INK; ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.ellipse(cx + 8 * s, cy + 84 * s, 46 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        if (tr.upgrade) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = P.AMBER; ctx.beginPath(); ctx.arc(cx, cy + 30 * s, 58 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = col; rr(ctx, cx - 24 * s, cy + 18 * s, 48 * s, 64 * s, 16 * s); ctx.fill();   // body
        ctx.fillStyle = P.SLATE; ctx.beginPath(); ctx.arc(cx, cy, 19 * s, 0, Math.PI * 2); ctx.fill();   // head
        ctx.fillStyle = P.CREAM; ctx.beginPath(); ctx.arc(cx - 6 * s, cy - 2 * s, 2.6 * s, 0, Math.PI * 2); ctx.arc(cx + 6 * s, cy - 2 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill();
        if (tr.kind === 'leave') {   // sun hat and suitcase
            ctx.fillStyle = P.BUTTER; ctx.beginPath(); ctx.ellipse(cx, cy - 15 * s, 28 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
            rr(ctx, cx - 13 * s, cy - 30 * s, 26 * s, 16 * s, 7 * s); ctx.fill();
            ctx.fillStyle = P.KYOTO; ctx.fillRect(cx - 13 * s, cy - 19 * s, 26 * s, 3 * s);
            ctx.fillStyle = P.AMBER; rr(ctx, cx + 30 * s, cy + 46 * s, 30 * s, 38 * s, 5 * s); ctx.fill();
            ctx.fillStyle = P.RUST; ctx.fillRect(cx + 30 * s, cy + 60 * s, 30 * s, 4 * s);
            ctx.strokeStyle = P.INK; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx + 39 * s, cy + 46 * s); ctx.lineTo(cx + 39 * s, cy + 38 * s); ctx.lineTo(cx + 51 * s, cy + 38 * s); ctx.lineTo(cx + 51 * s, cy + 46 * s); ctx.stroke();
        } else {                     // client site: lanyard and laptop bag
            ctx.strokeStyle = P.BUTTER; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx - 10 * s, cy + 19 * s); ctx.lineTo(cx, cy + 44 * s); ctx.lineTo(cx + 10 * s, cy + 19 * s); ctx.stroke();
            ctx.fillStyle = P.WHITE; ctx.fillRect(cx - 5 * s, cy + 44 * s, 10 * s, 12 * s);
            ctx.fillStyle = P.INK; rr(ctx, cx + 28 * s, cy + 50 * s, 36 * s, 26 * s, 4 * s); ctx.fill();
            ctx.strokeStyle = P.INK; ctx.beginPath(); ctx.moveTo(cx + 18 * s, cy + 22 * s); ctx.lineTo(cx + 34 * s, cy + 50 * s); ctx.stroke();
        }
        if (model.laptopOnLeave(tr)) laptop(ctx, cx - 18 * s, cy + 36 * s, 1.35 * s);   // the laptop they are sneaking on leave
    }
    // the issue's boarding pass (page 7): red header, barcode, a tear line with punched notches, the gate on the stub
    function drawPass(ctx, tr, x, y, state, model, copy, k) {
        var p = layout.pass, w = p.w, h = p.h, d = model.DESTS[tr.dest], stub = x + w - 76;
        ctx.save(); softShadow(ctx, 16, 6, 0.2); ctx.fillStyle = P.WHITE; rr(ctx, x, y, w, h, 12); ctx.fill(); ctx.restore();
        ctx.save(); rr(ctx, x, y, w, h, 12); ctx.clip();
        ctx.fillStyle = tr.upgrade ? P.AMBER : P.PASS; ctx.fillRect(x, y, w, 34);
        // boarding timer: a fuse along the bottom edge, sky while there is time, amber, then red
        var left = k == null ? clamp01(1 - tr.age / tr.patience) : k;
        ctx.fillStyle = P.CREAM; ctx.fillRect(x, y + h - 8, w, 8);
        ctx.fillStyle = left > 0.5 ? P.SKY : left > 0.25 ? P.AMBER : P.PASS;
        if (left > 0) ctx.fillRect(x, y + h - 8, w * left, 8);
        ctx.restore();
        var head = tr.upgrade ? copy.pass.upgrade : copy.pass.title;   // 19 px heavy is large text: WHITE on PASS needs 3.0
        text(ctx, head, x + 14, y + 18, fit(ctx, head, '900 {px}px ' + FM, 19, w - 56), tr.upgrade ? P.INK : P.WHITE);
        plane(ctx, x + w - 22, y + 17, 9, tr.upgrade ? P.INK : P.WHITE);
        // barcode down the left edge (fixed per traveller)
        ctx.fillStyle = P.PASS; ctx.globalAlpha = 0.55;
        for (var i = 0, bx = 0; i < 11; i++) { var bw = 1 + ((tr.id * 7 + i * 5) % 3); ctx.fillRect(x + 10, y + 46 + bx, 9, bw); bx += bw + 2 + ((tr.id + i) % 2) * 2; }
        ctx.globalAlpha = 1;
        text(ctx, copy.pass.to, x + 28, y + 48, '700 10px ' + FM, P.SLATE);
        text(ctx, d.city, x + 28, y + 75, (d.city.length > 9 ? '32px ' : '38px ') + FS, P.INK);
        text(ctx, d.flight + '  ' + d.code, x + 28, y + 101, '700 11px ' + FM, P.SLATE);
        // stamp
        ctx.save(); ctx.translate(x + 84, y + 124); ctx.rotate(-0.06);
        var sc = tr.kind === 'leave' ? P.OLIVE : P.ROYAL;
        ctx.strokeStyle = sc; ctx.lineWidth = 2; rr(ctx, -56, -10, 112, 20, 4); ctx.stroke();
        text(ctx, tr.kind === 'leave' ? copy.pass.leave : copy.pass.client, 0, 1, '900 11px ' + FM, sc, 'center');
        ctx.restore();
        // tear line and punched notches, then the stub with the printed gate (may be stale: the board is the truth)
        ctx.strokeStyle = P.SLATE; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(stub, y + 40); ctx.lineTo(stub, y + h - 14); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        var gx = stub + 38;
        text(ctx, copy.pass.gate, gx, y + 50, '700 10px ' + FM, P.SLATE, 'center');
        ctx.strokeStyle = P.SLATE; ctx.lineWidth = 1.5; rr(ctx, gx - 22, y + 60, 44, 44, 7); ctx.stroke();
        text(ctx, GL[tr.passGate], gx, y + 83, '36px ' + FS, P.INK, 'center');
    }
    function bubble(ctx, s, x, y) {   // right of the head, tail back toward it (clear of the toast line and the doors)
        ctx.font = '700 12px ' + FM; var w = ctx.measureText(s).width + 22;
        ctx.save(); softShadow(ctx, 8, 2, 0.18); ctx.fillStyle = P.WHITE; rr(ctx, x - w / 2, y - 14, w, 28, 13); ctx.fill(); ctx.restore();
        ctx.fillStyle = P.WHITE; ctx.beginPath(); ctx.moveTo(x - w / 2 + 12, y + 10); ctx.lineTo(x - w / 2 - 4, y + 22); ctx.lineTo(x - w / 2 + 24, y + 12); ctx.fill();
        text(ctx, s, x, y + 1, '700 12px ' + FM, P.INK, 'center');
    }
    function drawCounter(ctx, state, view, model, copy) {
        var tr = state.cur, f = layout.figure, p = layout.pass;
        if (!tr) return;
        var st = null, fx = view.fx || [];
        for (var i = fx.length - 1; i >= 0; i--) if (fx[i].type === 'step' && fx[i].id === tr.id) { st = fx[i]; break; }
        var k = st ? clamp01(ageOf(view, st) / 170) : 1, dx = 0, dy = 0;
        ctx.save();
        if (k < 1) {   // steps up from the queue (bottom right): a short ease-out slide; reduce = fade only
            ctx.globalAlpha = clamp01(k / 0.6); debug.fades++;
            if (!view.rm) { var e = easeOutQuart(k); dx = 26 * (1 - e); dy = 6 * (1 - e); debug.travel++; }
        }
        ctx.translate(dx, dy);
        drawFigure(ctx, tr, f.x, f.y, 1, model);
        drawPass(ctx, tr, p.x, p.y, state, model, copy);
        if (model.laptopOnLeave(tr)) bubble(ctx, copy.pass.sneaky, f.x + 100, f.y - 18);
        ctx.restore();
    }
    function drawQueue(ctx, state, model, copy) {
        text(ctx, copy.next, 363, 628, '700 10px ' + FM, P.SLATE, 'center');
        for (var i = 0; i < state.queue.length; i++) drawFigure(ctx, state.queue[i], 350 + i * 28, 652, 0.3, model);
    }

    /* ---- effects ---- */
    function verdict(e, model, copy) {   // {s, good, dur} or null
        var city = model.DESTS[e.traveller.dest].city;
        if (e.type === 'missed') return { s: copy.captions.missed, good: false, dur: 1300 };
        if (e.result === 'wrong') return { s: (e.reason === 'cancelled' ? copy.captions.notFlying : copy.captions.wrong).replace('{city}', city).replace('{gate}', GL[e.correct]), good: false, dur: 1300 };
        if (e.result === 'laptop') return { s: copy.captions.laptop, good: false, dur: 1300 };
        if (e.result === 'nodesk') return { s: e.traveller.kind === 'client' ? copy.captions.clientDesk : copy.captions.nodesk.replace('{gate}', GL[e.correct]), good: false, dur: 1300 };
        if (e.recovered) return { s: copy.captions.recovered, good: true, dur: 1300 };
        if (e.result === 'desk') return { s: e.reason === 'cancelled' ? copy.captions.rebooked : copy.captions.laptopLeft, good: true, dur: 900 };
        return null;
    }
    function drawLeaving(ctx, e, a, view, state, model, copy) {
        var f = layout.figure, p = layout.pass, rm = view.rm;
        var ok = e.type === 'sent' && (e.result === 'correct' || e.result === 'desk' || e.result === 'laptop');
        var dur = ok ? 220 : 700;
        if (a >= dur) return;
        ctx.save();
        if (ok) {   // through the door: a quick ease-out toward it, shrinking and fading
            var k = a / dur;
            ctx.globalAlpha = 1 - k; debug.fades++;
            if (!rm) {
                var e4 = easeOutQuart(k), v = EXIT[e.dir], sc = 1 - 0.12 * e4, cx = 200, cy = 470;
                ctx.translate(v[0] * e4 + cx, v[1] * e4 + cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy); debug.travel++;
            }
        } else {    // held at the counter so the verdict lands on them: a shake (wrong) or a sag (missed), then fade
            ctx.globalAlpha = a < 450 ? 1 : 1 - (a - 450) / 250; debug.fades++;
            if (!rm) {
                if (e.type === 'missed') ctx.translate(0, 10 * easeOut(clamp01(a / 400)));
                else { var ks = clamp01(a / 320); ctx.translate(Math.sin(ks * Math.PI * 6) * 7 * (1 - ks), 0); }
                debug.travel++;
            }
        }
        drawFigure(ctx, e.traveller, f.x, f.y, 1, model);
        drawPass(ctx, e.traveller, p.x, p.y, state, model, copy, e.type === 'missed' ? 0 : null);
        if (!ok) { ctx.globalAlpha *= 0.28; ctx.fillStyle = e.type === 'missed' ? P.SLATE : P.PASS; rr(ctx, p.x, p.y, p.w, p.h, 12); ctx.fill(); }
        ctx.restore();
    }
    function drawPop(ctx, e, a, rm) {
        if (!(e.type === 'sent' && e.points > 0) || a >= 650) return;
        var k = a / 650, pos = POP[e.dir], s = '+' + e.points, doubled = e.traveller.upgrade || e.lastCall;
        ctx.save(); ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; debug.fades++;
        var py = pos[1] - (rm ? 0 : 18 * easeOut(k)); if (!rm) debug.travel++;
        ctx.font = '900 14px ' + FM; var w = ctx.measureText(s).width + 18;
        ctx.fillStyle = doubled ? P.AMBER : P.BUTTER; rr(ctx, pos[0] - w / 2, py - 12, w, 24, 12); ctx.fill();
        text(ctx, s, pos[0], py + 1, '900 14px ' + FM, P.INK, 'center');
        ctx.restore();
    }
    function drawToast(ctx, t, rm) {
        var k = t.a / t.dur, al = t.a < 140 ? t.a / 140 : t.a > t.dur - 220 ? (t.dur - t.a) / 220 : 1;
        ctx.save(); ctx.globalAlpha = clamp01(al); debug.fades++;
        if (!rm && t.a < 140) { var sc = 0.96 + 0.04 * easeOut(t.a / 140); ctx.translate(W / 2, TOAST_Y); ctx.scale(sc, sc); ctx.translate(-W / 2, -TOAST_Y); debug.travel++; }
        var font = fit(ctx, t.s, '800 {px}px ' + FM, 14, 344), tw;
        ctx.font = font; tw = ctx.measureText(t.s).width + 36;
        softShadow(ctx, 10, 3, 0.25);
        ctx.fillStyle = t.good ? P.OLIVE : P.KYOTO; rr(ctx, W / 2 - tw / 2, TOAST_Y - 15, tw, 30, 15); ctx.fill();
        noShadow(ctx);
        text(ctx, t.s, W / 2, TOAST_Y + 1, font, t.good ? P.CREAM : P.BUTTER, 'center');
        ctx.restore();
        return k;
    }
    function drawBanner(ctx, bn, rm) {
        var B = layout.board, w = B.w - 100, al = bn.a < 160 ? bn.a / 160 : bn.a > bn.dur - 240 ? (bn.dur - bn.a) / 240 : 1;
        ctx.save(); ctx.globalAlpha = clamp01(al); debug.fades++;
        if (!rm && bn.a < 160) { ctx.translate(0, -5 * (1 - easeOut(bn.a / 160))); debug.travel++; }
        ctx.fillStyle = P.KYOTO; rr(ctx, B.x, B.y, w, 32, 12); ctx.fill();   // over the board title, never the labels, rows or clock
        text(ctx, bn.s, B.x + w / 2, B.y + 17, fit(ctx, bn.s, '{px}px ' + FS, 26, w - 20), P.BUTTER, 'center');
        ctx.restore();
    }
    function drawFx(ctx, state, view, model, copy) {
        var fx = view.fx || [], rm = view.rm, toast = null, banner = null;
        for (var i = 0; i < fx.length; i++) {
            var e = fx[i], a = ageOf(view, e);
            if (e.type === 'sent' || e.type === 'missed') {
                drawLeaving(ctx, e, a, view, state, model, copy);
                drawPop(ctx, e, a, rm);
                var ok = e.type === 'sent' && (e.result === 'correct' || e.result === 'desk');
                if (!ok) drawRing(ctx, view, e.correct, a);
                var v = verdict(e, model, copy);
                if (v && a < v.dur) toast = { s: v.s, good: v.good, a: a, dur: v.dur };
            } else if (e.type === 'cancel' && a < 400) {   // the row flashes red as it is cancelled
                var B = layout.board;
                ctx.save(); ctx.globalAlpha = 0.4 * (1 - a / 400); debug.fades++;
                ctx.fillStyle = P.PASS; rr(ctx, B.x + 8, rowY(e.gate), B.w - 16, 34, 6); ctx.fill(); ctx.restore();
            }
            // one banner at a time: a cancellation (it changes the rule) beats last call, which beats a gate change
            var bn = null;
            if (e.type === 'change' && a < 1800) bn = { s: copy.captions.change, a: a, dur: 1800, rank: 1 };
            else if (e.type === 'lastcall' && a < 2200) bn = { s: copy.captions.lastcall, a: a, dur: 2200, rank: 2 };
            else if (e.type === 'cancel' && a < 2400) bn = { s: copy.captions.cancel.replace('{city}', model.DESTS[e.dest].city), a: a, dur: 2400, rank: 3 };
            if (bn && (!banner || bn.rank >= banner.rank)) banner = bn;
        }
        if (banner) drawBanner(ctx, banner, rm);
        if (toast) drawToast(ctx, toast, rm);
    }

    /* ---- the frame ---- */
    function draw(ctx, state, view) {
        view = view || {};
        debug.frames++; debug.travel = 0; debug.fades = 0;
        var model = view.model, copy = view.copy;
        ctx.save();
        drawBackground(ctx);
        drawBoard(ctx, state, view, model, copy);
        drawDoors(ctx, view, copy);
        drawQueue(ctx, state, model, copy);
        drawCounter(ctx, state, view, model, copy);
        drawFx(ctx, state, view, model, copy);
        ctx.restore();
    }

    /* ---- the page-local HUD (game.js sets GameEngine.renderHUD to call this): score, streak, strikes ---- */
    function drawHUD(ctx, es, state, view) {
        if (!ctx) return;
        es = es || {}; view = view || {};
        var copy = view.copy, model = view.model, h = HUD_H, now = view.now || 0, rm = view.rm;
        ctx.save();
        ctx.fillStyle = P.KYOTO; ctx.fillRect(0, 0, W, h);
        if (!copy || !model) { ctx.restore(); return; }
        text(ctx, copy.hud.score, 14, 13, '700 9px ' + FM, P.BUTTER);
        var sc = String(es.score || 0);
        stext(ctx, sc, 14, 31, '900 20px ' + FM, P.CREAM, 'left', P.KYOTO_DK, 2);
        if (state && state.streak > 1) {
            ctx.font = '900 20px ' + FM; var x0 = 14 + ctx.measureText(sc).width + 10;
            var m = 'x' + (model.multTenths(state.streak) / 10).toFixed(1);
            ctx.font = '900 12px ' + FM; var mw = ctx.measureText(m).width + 14;
            ctx.fillStyle = P.AMBER; rr(ctx, x0, 22, mw, 19, 10); ctx.fill();
            text(ctx, m, x0 + mw / 2, 32, '900 12px ' + FM, P.INK, 'center');
        }
        text(ctx, copy.hud.strikes, W - 14, 13, '700 9px ' + FM, P.BUTTER, 'right');
        var strikes = state ? state.strikes : 0, max = model.TUNING.MAX_STRIKES, fx = view.fx || [];
        // the newest strike pops in; a cleared one flashes out
        var popA = -1, clearA = -1;
        for (var i = fx.length - 1; i >= 0; i--) {
            var e = fx[i], a = now - e.t0;
            if (a > 600) break;
            if (popA < 0 && (e.type === 'missed' || (e.type === 'sent' && (e.result === 'wrong' || e.result === 'nodesk')))) popA = a;
            if (clearA < 0 && e.type === 'sent' && e.recovered) clearA = a;
        }
        for (var s = 0; s < max; s++) {
            var cx = W - 22 - (max - 1 - s) * 24, cy = 31, taken = s < strikes;
            ctx.save();
            if (taken && s === strikes - 1 && popA >= 0 && popA < 260) {
                var kk = popA / 260;
                if (!rm) { var z = 1.5 - 0.5 * easeOutBack(kk); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); debug.travel++; }
                else { ctx.globalAlpha = kk; debug.fades++; }
            }
            if (taken) {
                ctx.fillStyle = P.PASS; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = P.CREAM; ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx - 3.5, cy - 3.5); ctx.lineTo(cx + 3.5, cy + 3.5); ctx.moveTo(cx + 3.5, cy - 3.5); ctx.lineTo(cx - 3.5, cy + 3.5); ctx.stroke();
            } else {
                ctx.globalAlpha = 0.6; ctx.strokeStyle = P.CREAM; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
                if (s === strikes && clearA >= 0 && clearA < 600) { ctx.globalAlpha = 1 - clearA / 600; ctx.fillStyle = P.BUTTER; ctx.fill(); debug.fades++; }
            }
            ctx.restore();
        }
        ctx.restore();
    }

    var api = { PALETTE: P, layout: layout, draw: draw, drawHUD: drawHUD, debug: debug };
    if (typeof window !== 'undefined') window.GCArt = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
