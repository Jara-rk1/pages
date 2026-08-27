/**
 * MULTIPLEX microgame - DIG.
 *
 * Descend a single shaft, steering on one axis to dodge a rock, then line up
 * with the loot and be holding when you reach it to grab it and get out.
 */
(function () {
    'use strict';

    var SURFACE_Y = 40;
    var ROCK_Y = 250;              // dodge checkpoint, in stage coords
    var LOOT_Y = 460;              // grab checkpoint
    var MARGIN = 30;
    var DIGGER_R = 14;

    var ROCK_W_EASY = 70;
    var ROCK_W_HARD = 130;         // wider rock, harder to dodge around
    var LOOT_W_EASY = 90;
    var LOOT_W_HARD = 40;          // narrower loot, harder to line up
    var FALL_FRAC_EASY = 0.85;     // descent duration as a fraction of the screen's own time budget
    var FALL_FRAC_HARD = 0.45;

    MULTIPLEX.register({
        slug: 'dig',
        title: 'DIG',
        prompt: 'DODGE, GRAB, OUT',
        hint: 'Steer left / right, hold to grab',
        goal: 'achieve',

        init: function (stage) {
            var rockW = ROCK_W_EASY + (ROCK_W_HARD - ROCK_W_EASY) * stage.difficulty;
            var lootW = LOOT_W_EASY + (LOOT_W_HARD - LOOT_W_EASY) * stage.difficulty;
            var frac = FALL_FRAC_EASY + (FALL_FRAC_HARD - FALL_FRAC_EASY) * stage.difficulty;
            /* Size the descent against THIS instance's own time budget, same
               technique food-falls uses for its drop: fair at any loop. */
            var fallTime = Math.max(0.25, stage.timeLeft * frac);
            return {
                x: stage.w / 2,
                y: SURFACE_Y,
                fallSpeed: (LOOT_Y - SURFACE_Y) / fallTime,
                rockX: MARGIN + stage.rand() * (stage.w - MARGIN * 2),
                rockW: rockW,
                rockChecked: false,
                lootX: MARGIN + stage.rand() * (stage.w - MARGIN * 2),
                lootW: lootW,
                held: false,
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            m.x = (input.axis + 1) / 2 * (stage.w - DIGGER_R * 2) + DIGGER_R;
            m.held = input.held;

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            var prevY = m.y;
            m.y += m.fallSpeed * dt;

            /* Dodge check: an edge-detected one-shot as the digger crosses the
               rock's depth. Missing the dodge ends the screen immediately. */
            if (!m.rockChecked && prevY < ROCK_Y && m.y >= ROCK_Y) {
                m.rockChecked = true;
                if (Math.abs(m.x - m.rockX) <= m.rockW / 2 + DIGGER_R) {
                    stage.shake(6);
                    m.resultPulse = 1;
                    return 'lose';
                }
            }

            if (m.y >= LOOT_Y) {
                m.y = LOOT_Y;
                var aligned = Math.abs(m.x - m.lootX) <= m.lootW / 2;
                if (aligned && m.held) {
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

            /* Dug shaft, behind everything. */
            stage.rect(0, 0, stage.w, LOOT_Y, 'deep', { alpha: 0.35 });

            /* Rock obstacle: dims once passed, purely a readout of state already
               decided in update. */
            stage.roundRect(m.rockX - m.rockW / 2, ROCK_Y - 14, m.rockW, 28, 6, 'accent2',
                             { alpha: m.rockChecked ? 0.35 : 0.85 });

            /* Loot marker. */
            stage.roundRect(m.lootX - m.lootW / 2, LOOT_Y - 16, m.lootW, 32, 6, 'accent', { alpha: 0.5 });
            stage.line(m.lootX, LOOT_Y - 16, m.lootX, LOOT_Y + 16, 'accent', { width: 2 });

            /* Digger. Radius grows while holding: a static readout of current
               input, not a decorative displacement, so it stays outside j(). The
               small bob is decorative and goes through j(). */
            var bob = stage.j(Math.sin(stage.t * 6) * 2);
            stage.circle(m.x, m.y + bob, DIGGER_R + (m.held ? 3 : 0), 'ink');

            if (m.resultPulse > 0) {
                stage.circle(m.x, m.y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60, { size: 22, role: 'ink', display: true });
        }
    });
})();
