/**
 * MULTIPLEX microgame - MAKE THE GATE.
 *
 * Tap repeatedly to dash a runner along a track before the gate closes.
 */
(function () {
    'use strict';

    var TRACK_Y = 300;
    var TRACK_X0 = 30;
    var TRACK_X1 = 316;            // leaves room for the closing gate door
    var DOOR_W = 40;

    var NEEDED_EASY = 3;
    var NEEDED_HARD = 7;
    var MIN_TAP_INTERVAL = 0.18;   // a realistic sustained tap rate, used only as a fairness floor

    MULTIPLEX.register({
        slug: 'make-the-gate',
        title: 'MAKE THE GATE',
        prompt: 'TAP TO DASH',
        hint: 'Tap / press, repeatedly',
        goal: 'achieve',

        init: function (stage) {
            var baseNeeded = Math.round(NEEDED_EASY + (NEEDED_HARD - NEEDED_EASY) * stage.difficulty);
            /* However hard the difficulty wants to make it, never demand more taps
               than are physically possible in this instance's own time budget -
               the same principle as sizing a fall against stage.timeLeft, applied
               to a tap count instead of a duration. */
            var maxByTime = Math.max(1, Math.floor(stage.timeLeft / MIN_TAP_INTERVAL));
            return {
                taps: 0,
                needed: Math.max(1, Math.min(baseNeeded, maxByTime)),
                tapPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            if (m.tapPulse > 0) m.tapPulse = Math.max(0, m.tapPulse - dt * 5);

            /* tapped is a one-frame edge; every landed press counts once. */
            if (input.tapped) {
                m.taps += 1;
                m.tapPulse = 1;
                if (m.taps >= m.needed) {
                    stage.flash(0.7);
                    return 'win';
                }
            }
        },

        draw: function (stage) {
            var m = stage.mem;
            var frac = Math.min(1, m.taps / m.needed);
            var rowY;

            /* Terminal floor line, then the same track/progress fill as before. */
            stage.line(TRACK_X0, TRACK_Y + 12, TRACK_X1, TRACK_Y + 12, 'deep');
            stage.rect(TRACK_X0, TRACK_Y - 4, TRACK_X1 - TRACK_X0, 8, 'deep');
            stage.rect(TRACK_X0, TRACK_Y - 4, (TRACK_X1 - TRACK_X0) * frac, 8, 'accent');

            /* The gate door, closing purely as a function of stage.progress -
               the same rect and the same reasoning as before, a readout of the
               same clock that already governs the timeout, not a second,
               independent countdown - dressed as a departures board: a warm
               backlight, a header rule and a few row ticks, all keyed off the
               same doorH so nothing added here is a second clock. */
            var doorH = stage.h * stage.progress;
            stage.rect(stage.w - DOOR_W - 10, stage.h - doorH - 10, DOOR_W + 20, doorH + 10, 'accent', { alpha: 0.15 });
            stage.rect(stage.w - DOOR_W, stage.h - doorH, DOOR_W, doorH, 'accent2', { alpha: 0.8 });
            if (doorH > 14) {
                stage.line(stage.w - DOOR_W + 4, stage.h - doorH + 8, stage.w - 4, stage.h - doorH + 8, 'ink', { alpha: 0.5 });
            }
            for (rowY = stage.h - 18; rowY > stage.h - doorH + 14; rowY -= 12) {
                stage.line(stage.w - DOOR_W + 6, rowY, stage.w - 8, rowY, 'ink', { alpha: 0.25 });
            }

            /* Runner: a rolling suitcase in place of the plain circle, same
               centre and the same j()-wrapped bump on each tap. */
            var bump = stage.j(m.tapPulse * 6);
            var sx = TRACK_X0 + (TRACK_X1 - TRACK_X0) * frac;
            var sy = TRACK_Y - 20 - bump;
            stage.roundRect(sx - 10, sy - 9, 20, 16, 3, 'ink');
            stage.line(sx - 4, sy - 9, sx - 4, sy - 14, 'ink');
            stage.line(sx + 4, sy - 9, sx + 4, sy - 14, 'ink');
            stage.line(sx - 4, sy - 14, sx + 4, sy - 14, 'ink');
            stage.circle(sx - 5, sy + 9, 2.5, 'deep');
            stage.circle(sx + 5, sy + 9, 2.5, 'deep');

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60, { size: 22, role: 'ink', display: true });
        }
    });
})();
