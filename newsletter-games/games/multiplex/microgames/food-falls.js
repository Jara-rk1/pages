/**
 * MULTIPLEX microgame - FOOD FALLS.
 *
 * A single generic food item falls straight down; steer a catch-zone on the
 * x-axis to be under it when it reaches the catch line.
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

    MULTIPLEX.register({
        slug: 'food-falls',
        title: 'FOOD FALLS',
        prompt: 'CATCH IT',
        hint: 'Move left / right',
        goal: 'achieve',

        init: function (stage) {
            var catcherW = CATCHER_W_EASY + (CATCHER_W_HARD - CATCHER_W_EASY) * stage.difficulty;
            var frac = FALL_FRAC_EASY + (FALL_FRAC_HARD - FALL_FRAC_EASY) * stage.difficulty;
            /* Size the fall against THIS instance's own time budget rather than a
               hard-coded duration, so it always lands with time to react whether
               this is loop 1 (five seconds) or loop 8 (the floor). */
            var fallTime = Math.max(0.25, stage.timeLeft * frac);
            /* itemX is drawn to EXCLUDE the idle-catcher win band (centre +/- half,
               exactly the tolerance the win check below uses): an untouched player
               must never win. The two remaining segments are equal length, so one
               stage.rand() call still maps uniformly across whichever side it
               lands on, and the excluded width is the tolerance itself, so no
               draw becomes any harder to reach than it already was. */
            var half = catcherW / 2 + ITEM_R;
            var centre = stage.w / 2;
            var span = centre - half - 24;
            var u = stage.rand();
            var itemX = (u < 0.5) ? 24 + u * 2 * span
                                   : (centre + half) + (u - 0.5) * 2 * span;
            return {
                itemX: itemX,
                itemY: 0,
                fallSpeed: CATCH_Y / fallTime,
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

            m.itemY += m.fallSpeed * dt;

            if (m.itemY >= CATCH_Y) {
                var half = m.catcherW / 2 + ITEM_R;
                if (Math.abs(m.itemX - m.catcherX) <= half) {
                    stage.flash(0.7);
                    return 'win';
                }
                stage.shake(6);
                m.resultPulse = 1;
                return 'lose';
            }
        },

        draw: function (stage) {
            var m = stage.mem;
            var cx = m.itemX;
            var cy = m.itemY + stage.j(Math.sin(stage.t * 5) * 2);

            /* Catch line: a plate/catch-zone reads clearest as a shallow well. */
            stage.rect(0, CATCH_Y + CATCHER_H / 2, stage.w, 4, 'deep');

            /* The cloud the food falls out of. Drawn from m.itemX, which init()
               sets once and update() never touches, so this tracks the item's
               fixed column without being a new kinetic effect. */
            stage.circle(cx - 16, 20, 12, 'lift');
            stage.circle(cx, 15, 15, 'lift');
            stage.circle(cx + 16, 20, 12, 'lift');
            stage.circle(cx - 8, 27, 10, 'lift', { alpha: 0.9 });
            stage.circle(cx + 8, 27, 10, 'lift', { alpha: 0.9 });

            /* Giant falling burger in place of the plain circle: bottom bun,
               dark patty band, domed top bun, three seeds - centred on the same
               (m.itemX, m.itemY + bob) point and the same ITEM_R scale the win
               check's hit tolerance is built from. */
            stage.roundRect(cx - ITEM_R * 1.05, cy + ITEM_R * 0.15, ITEM_R * 2.1, ITEM_R * 0.75, 4, 'accent');
            stage.roundRect(cx - ITEM_R * 0.95, cy - ITEM_R * 0.35, ITEM_R * 1.9, ITEM_R * 0.5, 2, 'deep');
            stage.roundRect(cx - ITEM_R * 1.05, cy - ITEM_R * 0.95, ITEM_R * 2.1, ITEM_R * 0.85, ITEM_R * 0.6, 'accent');
            stage.circle(cx - ITEM_R * 0.4, cy - ITEM_R * 0.7, 1.6, 'ink', { alpha: 0.85 });
            stage.circle(cx + ITEM_R * 0.1, cy - ITEM_R * 0.78, 1.6, 'ink', { alpha: 0.85 });
            stage.circle(cx + ITEM_R * 0.45, cy - ITEM_R * 0.6, 1.6, 'ink', { alpha: 0.85 });

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
