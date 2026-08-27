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
            return {
                itemX: 24 + stage.rand() * (stage.w - 48),
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

            /* Catch line: a plate/catch-zone reads clearest as a shallow well. */
            stage.rect(0, CATCH_Y + CATCHER_H / 2, stage.w, 4, 'deep');

            var bob = stage.j(Math.sin(stage.t * 5) * 2);
            stage.circle(m.itemX, m.itemY + bob, ITEM_R, 'accent');

            stage.roundRect(m.catcherX - m.catcherW / 2, CATCH_Y - CATCHER_H / 2,
                             m.catcherW, CATCHER_H, 5, 'ink');

            if (m.resultPulse > 0) {
                stage.circle(m.catcherX, CATCH_Y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
