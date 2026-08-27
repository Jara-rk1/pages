/**
 * MULTIPLEX microgame - NOTHING BUT NET.
 *
 * Hold to charge a shot up a vertical track toward a generic hoop rim.
 * Release inside the target band for a made shot; release outside it, or
 * hold too long, and the shot is blown.
 */
(function () {
    'use strict';

    var TRACK_X = 188;
    var TRACK_TOP = 130;
    var TRACK_BOTTOM = 470;
    var BALL_R = 14;
    var HOOP_R = 26;
    var CHARGE_TIME_EASY = 1.6;    // seconds of hold to fill the track
    var CHARGE_TIME_HARD = 0.8;
    var BAND_W_EASY = 0.34;        // fraction of the track's 0..1 fill range
    var BAND_W_HARD = 0.14;
    var BAND_HI_MAX = 0.75;        // highest the band's top edge is ever placed in that range
    var RELEASE_REACT = 0.15;      // seconds of reaction room held clear before the screen ends
    var RELEASE_WINDOW_MIN = 0.12; // seconds the band is worth, however short the screen gets

    MULTIPLEX.register({
        slug: 'nothing-but-net',
        title: 'NOTHING BUT NET',
        prompt: 'TIME THE SHOT',
        hint: 'Hold, then release',
        goal: 'achieve',

        init: function (stage) {
            /* The latest release that can still score is at BAND_HI_MAX of the
               charge, so the charge has to be short enough that that instant,
               plus a beat of reaction room, still fits inside THIS instance's
               own time budget. Difficulty alone saturates at loop 6 while the
               screen keeps shortening to the floor, which left the band opening
               after the clock had already run out for a third of the seeds.
               Same technique as food-falls sizing its fall against timeLeft. */
            var chargeTime = Math.min(
                CHARGE_TIME_EASY + (CHARGE_TIME_HARD - CHARGE_TIME_EASY) * stage.difficulty,
                (stage.timeLeft - RELEASE_REACT) / BAND_HI_MAX);
            /* The band is worth bandW * chargeTime SECONDS of release window, and
               both terms shrink with difficulty, so the two ramps multiplied left
               46.7ms at the floor: under three frames at 60Hz, and under any
               plausible human release precision, which makes the screen a coin flip
               rather than a timing test. The width is therefore clamped UP against
               this instance's own charge time, the same technique used on the charge
               itself above, so the window never drops below RELEASE_WINDOW_MIN.
               It bites at loop 6 and harder at the floor; loops 0 to 5 are untouched.
               chargeTime cannot fall below 0.333s while MIN_SCREEN_MS holds, so bandW
               cannot exceed 0.36 and the bandLo range below stays positive. */
            var bandW = Math.max(BAND_W_EASY + (BAND_W_HARD - BAND_W_EASY) * stage.difficulty,
                                 RELEASE_WINDOW_MIN / chargeTime);
            var bandLo = 0.25 + stage.rand() * (BAND_HI_MAX - bandW - 0.25);
            return {
                chargeTime: chargeTime,
                bandLo: bandLo,
                bandHi: bandLo + bandW,
                fill: 0,
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            if (input.held) {
                /* Derived straight from holdT rather than accumulated by hand, and
                   latched into mem every held frame so the release-frame check
                   below never depends on whether holdT has already reset. */
                m.fill = Math.min(1, input.holdT / m.chargeTime);
                if (m.fill >= 1) {
                    stage.shake(6);
                    m.resultPulse = 1;
                    return 'lose';
                }
            }

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            if (input.released) {
                if (m.fill >= m.bandLo && m.fill <= m.bandHi) {
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

            /* Hoop rim + a short net, both generic. */
            stage.circle(TRACK_X, TRACK_TOP - 40, HOOP_R, 'accent', { stroke: true, width: 3 });
            stage.line(TRACK_X - 16, TRACK_TOP - 40, TRACK_X - 10, TRACK_TOP - 18, 'dim', { width: 2 });
            stage.line(TRACK_X, TRACK_TOP - 34, TRACK_X, TRACK_TOP - 14, 'dim', { width: 2 });
            stage.line(TRACK_X + 16, TRACK_TOP - 40, TRACK_X + 10, TRACK_TOP - 18, 'dim', { width: 2 });

            /* Charge track. */
            stage.rect(TRACK_X - 5, TRACK_TOP, 10, TRACK_BOTTOM - TRACK_TOP, 'deep');

            var bandTop = TRACK_BOTTOM - m.bandHi * (TRACK_BOTTOM - TRACK_TOP);
            var bandH = (m.bandHi - m.bandLo) * (TRACK_BOTTOM - TRACK_TOP);
            stage.rect(TRACK_X - 5, bandTop, 10, bandH, 'accent', { alpha: 0.35 });

            var ballY = TRACK_BOTTOM - m.fill * (TRACK_BOTTOM - TRACK_TOP);
            stage.circle(TRACK_X, ballY, BALL_R, 'ink');

            if (m.resultPulse > 0) {
                stage.circle(TRACK_X, ballY, BALL_R + (1 - m.resultPulse) * 30, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
