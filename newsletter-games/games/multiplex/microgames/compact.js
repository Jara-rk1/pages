/**
 * MULTIPLEX microgame - COMPACT.
 *
 * A deterministic, repeating beat: two jaws close together and reopen on a
 * fixed cycle. Tap while the gap is at its narrowest for a crush; tap at any
 * other moment and the crush is mistimed. Rhythm, not reaction - the beat
 * never changes speed or hides, it just repeats.
 */
(function () {
    'use strict';

    var JAW_X = 108;
    var JAW_W = 160;
    var JAW_H = 20;
    var OPEN_Y = 150;
    var CLOSED_Y = 380;
    var CUBE_R = 22;
    var PERIOD_FRAC_EASY = 0.9;    // beat period as a fraction of the screen's own time budget
    var PERIOD_FRAC_HARD = 0.55;
    var TOL_EASY = 0.30;           // seconds either side of the beat that count as "on it"
    var TOL_HARD = 0.10;

    MULTIPLEX.register({
        slug: 'compact',
        title: 'COMPACT',
        prompt: 'HIT THE BEAT',
        hint: 'Tap on the beat',
        goal: 'achieve',

        init: function (stage) {
            var frac = PERIOD_FRAC_EASY + (PERIOD_FRAC_HARD - PERIOD_FRAC_EASY) * stage.difficulty;
            var period = Math.max(0.3, stage.timeLeft * frac);
            var tol = TOL_EASY + (TOL_HARD - TOL_EASY) * stage.difficulty;
            return {
                period: period,
                windowHalf: Math.min(0.24, tol / period),
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            var phase = (stage.t % m.period) / m.period;
            var inWindow = Math.abs(phase - 0.5) <= m.windowHalf;

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            if (input.tapped) {
                if (inWindow) {
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

            var phase = (stage.t % m.period) / m.period;
            var close = Math.sin(phase * Math.PI);          // 0 open -> 1 closed -> 0 open
            var inWindow = Math.abs(phase - 0.5) <= m.windowHalf;
            var topY = OPEN_Y + close * (CLOSED_Y - OPEN_Y - JAW_H);

            stage.roundRect(JAW_X, topY, JAW_W, JAW_H, 4, inWindow ? 'accent' : 'ink');
            stage.roundRect(JAW_X, CLOSED_Y, JAW_W, JAW_H, 4, 'ink');

            var bob = stage.j(Math.sin(stage.t * 8) * 2);
            var cubeY = (topY + JAW_H + CLOSED_Y) / 2 + bob;
            stage.rect(JAW_X + JAW_W / 2 - CUBE_R, cubeY - CUBE_R, CUBE_R * 2, CUBE_R * 2, 'accent2');

            if (m.resultPulse > 0) {
                stage.circle(JAW_X + JAW_W / 2, cubeY, CUBE_R + (1 - m.resultPulse) * 30, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
