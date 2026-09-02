/**
 * MULTIPLEX microgame - FOOD FALLS.
 *
 * A STORM of food falls, not one item. Steer the plate along the x-axis and be
 * under every piece as it reaches the catch line. Drop one and the screen ends.
 *
 * WHY IT IS A STORM NOW. It used to drop a single item at a fixed x, and resolve
 * with one comparison at one instant. That is line for line the same verb as the
 * screen that follows it in the running order, which rotates instead of
 * translating, so a player met the same game twice before meeting anything else.
 * A sequence of catches is a route to plan rather than a position to reach, and
 * it is also what the source actually looks like.
 *
 * WHY THE COUNT FALLS AS THE LOOPS GET FASTER. The item count is derived from the
 * time available, not from the difficulty, because at the 400ms floor there is
 * physically room for one arrival and no more. So the early loops, which every
 * player sees, become a storm to work through, and the late loops, which only a
 * good player reaches, stay the pure precision test they already were: one item,
 * falling fast, at a plate that has narrowed. Difficulty still rises, it just
 * rises through the plate and the fall speed rather than through the count.
 *
 * KEYBOARD FAIRNESS IS BY CONSTRUCTION, NOT BY MEASUREMENT AFTER THE FACT. Each
 * item's x is drawn within a bounded step of the previous one, where the bound is
 * what a keyboard player can actually travel in the gap between the two arrivals.
 * See REACH_FRAC. A census that finds this screen unwinnable would therefore be
 * reporting a bug in this arithmetic rather than a tuning question.
 */
(function () {
    'use strict';

    var CATCH_Y = 460;             // catch line, in stage coords
    var CATCHER_W_EASY = 100;
    var CATCHER_W_HARD = 46;
    var CATCHER_H = 18;
    var ITEM_R = 14;
    var FALL_FRAC_EASY = 0.82;     // fall duration as a fraction of the screen's own time budget
    var FALL_FRAC_HARD = 0.42;

    var MAX_ITEMS = 4;
    /* Minimum spacing between two arrivals. Below this the second item is
       already at the line before the plate has settled under the first. */
    var MIN_GAP = 0.34;

    /* How much of a keyboard player's achievable travel one hop is allowed to
       use. The plate maps the axis as (axis + 1) / 2 * (w - catcherW), so a
       full-range axis sweep moves it (w - catcherW) px, and the harness drives
       the axis at a fixed units-per-second rate for a held arrow key. Two thirds
       leaves room for the approach to the FIRST item and for a player who is not
       holding the key perfectly. The rate itself is deliberately not read from
       the harness: a screen cannot reach outside itself, so this is a
       conservative constant and the keyboard census is what confirms it. */
    var REACH_FRAC = 0.66;
    var KEY_UNITS_PER_SEC = 2.4;   // conservative mirror of the harness input rate

    MULTIPLEX.register({
        slug: 'food-falls',
        title: 'FOOD FALLS',
        prompt: 'CATCH IT ALL',
        hint: 'Move left / right',
        goal: 'achieve',

        init: function (stage) {
            var catcherW = CATCHER_W_EASY + (CATCHER_W_HARD - CATCHER_W_EASY) * stage.difficulty;
            var frac = FALL_FRAC_EASY + (FALL_FRAC_HARD - FALL_FRAC_EASY) * stage.difficulty;
            var T = stage.timeLeft;
            /* Size the fall against THIS instance's own time budget rather than a
               hard-coded duration, so it always lands with time to react whether
               this is loop 1 (five seconds) or loop 8 (the floor). */
            var fallWanted = Math.max(0.25, T * frac);

            var half = catcherW / 2 + ITEM_R;
            var centre = stage.w / 2;

            /* THE FIRST ARRIVAL IS CAPPED INDEPENDENTLY OF THE FALL DURATION, and
               that separation is the whole reason this screen has more than one
               item on the loops that matter.

               The original single-item screen landed its one piece at exactly
               fallDur, which at loop 0 is 82% of a five-second screen. Building
               the queue forward from that leaves 0.9s of runway and fits exactly
               one more arrival, so the storm silently collapsed back to the old
               one-item screen at loops 0 and 1 - the two loops EVERY player sees,
               and the only two some of them see. Capping the first arrival at 38%
               of the screen leaves room for the rest, and the fall is then sized
               to land on it, so the piece still falls from the top of the frame
               and is still visible for its whole descent. */
            var t0 = Math.max(0.25, Math.min(T * 0.38, fallWanted));
            var fallDur = t0;
            var gap = Math.max(MIN_GAP, T * 0.12);

            /* x0 is drawn to EXCLUDE the idle-catcher win band (centre +/- half,
               exactly the tolerance the win check below uses): an untouched player
               must never win. The two remaining segments are equal length, so one
               stage.rand() call still maps uniformly across whichever side it
               lands on, and the excluded width is the tolerance itself, so no
               draw becomes any harder to reach than it already was. */
            var span = centre - half - 24;
            var u = stage.rand();
            var x = (u < 0.5) ? 24 + u * 2 * span
                              : (centre + half) + (u - 0.5) * 2 * span;

            /* How far the plate can travel per second under the slowest control
               scheme, and therefore how far apart two consecutive items may be. */
            var pxPerSec = KEY_UNITS_PER_SEC * (stage.w - catcherW) / 2;
            var maxStep = REACH_FRAC * pxPerSec * gap;

            var items = [{ x: x, arriveT: t0 }];
            var t = t0 + gap;
            while (items.length < MAX_ITEMS && t <= T * 0.93) {
                var lo = Math.max(half, x - maxStep);
                var hi = Math.min(stage.w - half, x + maxStep);
                x = lo + stage.rand() * (hi - lo);
                items.push({ x: x, arriveT: t });
                t += gap;
            }

            return {
                items: items,
                idx: 0,                       // the item being caught right now
                /* The x of the item currently being aimed at. Kept under this name
                   because it is the field the balance instrument's affine
                   calibration reads for this screen, and because "where the player
                   should be" is exactly what it still means. */
                itemX: items[0].x,
                fallDur: fallDur,
                catcherX: stage.w / 2,
                catcherW: catcherW,
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            m.catcherX = (input.axis + 1) / 2 * (stage.w - m.catcherW) + m.catcherW / 2;

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            var it = m.items[m.idx];
            if (!it) return;

            if (stage.t >= it.arriveT) {
                var half = m.catcherW / 2 + ITEM_R;
                if (Math.abs(it.x - m.catcherX) > half) {
                    stage.shake(6);
                    m.resultPulse = 1;
                    return 'lose';
                }
                m.idx++;
                if (m.idx >= m.items.length) {
                    stage.flash(0.7);
                    return 'win';
                }
                /* Aim moves to the next piece the instant this one is caught, so
                   both the player and the instrument are looking at the same
                   thing. A small pulse marks the catch without a new latch. */
                m.itemX = m.items[m.idx].x;
                m.resultPulse = 0.55;
            }
        },

        draw: function (stage) {
            var m = stage.mem;
            var i, it, prog, cx, cy, a;

            /* Catch line: a plate/catch-zone reads clearest as a shallow well. */
            stage.rect(0, CATCH_Y + CATCHER_H / 2, stage.w, 4, 'deep');

            /* The cloud sits over the piece currently falling, so the eye is led
               to the thing that matters next. */
            cx = m.itemX;
            stage.circle(cx - 16, 20, 12, 'lift');
            stage.circle(cx, 15, 15, 'lift');
            stage.circle(cx + 16, 20, 12, 'lift');
            stage.circle(cx - 8, 27, 10, 'lift', { alpha: 0.9 });
            stage.circle(cx + 8, 27, 10, 'lift', { alpha: 0.9 });

            /* Every piece still to be caught, each on its own descent. A piece
               that has not left the cloud yet is not drawn: it would read as
               already falling and pull the plate away from the live one. */
            for (i = m.idx; i < m.items.length; i++) {
                it = m.items[i];
                prog = (stage.t - (it.arriveT - m.fallDur)) / m.fallDur;
                if (prog < 0) continue;
                if (prog > 1) prog = 1;
                cx = it.x;
                cy = CATCH_Y * prog + stage.j(Math.sin(stage.t * 5 + i) * 2);
                /* The queue behind the live piece is dimmed, so "which one am I
                   catching" never needs working out. */
                a = i === m.idx ? 1 : 0.45;

                /* Bottom bun, dark patty band, domed top bun, three seeds -
                   centred on the same point and the same ITEM_R scale the win
                   check's hit tolerance is built from. */
                stage.roundRect(cx - ITEM_R * 1.05, cy + ITEM_R * 0.15, ITEM_R * 2.1, ITEM_R * 0.75, 4, 'accent', { alpha: a });
                stage.roundRect(cx - ITEM_R * 0.95, cy - ITEM_R * 0.35, ITEM_R * 1.9, ITEM_R * 0.5, 2, 'deep', { alpha: a });
                stage.roundRect(cx - ITEM_R * 1.05, cy - ITEM_R * 0.95, ITEM_R * 2.1, ITEM_R * 0.85, ITEM_R * 0.6, 'accent', { alpha: a });
                stage.circle(cx - ITEM_R * 0.4, cy - ITEM_R * 0.7, 1.6, 'ink', { alpha: 0.85 * a });
                stage.circle(cx + ITEM_R * 0.1, cy - ITEM_R * 0.78, 1.6, 'ink', { alpha: 0.85 * a });
                stage.circle(cx + ITEM_R * 0.45, cy - ITEM_R * 0.6, 1.6, 'ink', { alpha: 0.85 * a });
            }

            /* How many are left, so the player knows whether they are nearly
               through. Shape, not colour: a count is legible to everyone. */
            if (m.items.length > 1) {
                stage.text((m.items.length - m.idx) + ' LEFT', stage.w / 2, 96,
                           { size: 13, role: 'dim' });
            }

            /* Catcher, as a plate: same bar geometry as before, plus a rim
               highlight. */
            stage.roundRect(m.catcherX - m.catcherW / 2, CATCH_Y - CATCHER_H / 2,
                             m.catcherW, CATCHER_H, 5, 'ink');
            stage.line(m.catcherX - m.catcherW / 2 + 5, CATCH_Y - CATCHER_H / 2 + 3,
                       m.catcherX + m.catcherW / 2 - 5, CATCH_Y - CATCHER_H / 2 + 3, 'lift');

            if (m.resultPulse > 0) {
                stage.circle(m.catcherX, CATCH_Y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
