/**
 * MULTIPLEX microgame - NOTHING BUT NET.
 *
 * Hold to charge a shot up a vertical track toward a hoop rim. Release inside
 * the target band for a made shot; release outside it, or hold too long, and
 * the shot is blown.
 *
 * THEMING (2026-08-28). A rabbit-eared cartoon character, a cartoon
 * court and a cartoon hoop, plus a basketball instead of a plain disc and a
 * legible release band. All of it is DRAW-ONLY: the release-window arithmetic
 * in init (chargeTime, bandW, bandLo, and the reason bandW is clamped against
 * chargeTime rather than moving BAND_HI_MAX) is untouched, as is every line of
 * update, which is why the headless census comes out byte-identical. NO
 * REAL-PERSON LIKENESS: no player, no jersey, no number, no name. Rationale,
 * the authorisation it rests on and the measured colour figures: the internal
 * art direction.
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

    /* Draw-only scenery constants: read by draw() alone, never by init or
       update, so they cannot move a verdict or a digest. */
    var FLOOR_Y = 505;             // the court floor line
    var NET_DX = [-24, -12, 0, 12, 24];

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
            var i, k, t, y, xa, xb;

            /* THE COURT. A darker floor band with pale board seams, so the
               character below is standing on something rather than floating.
               Behind everything else and deliberately low contrast. */
            stage.rect(0, FLOOR_Y, stage.w, stage.h - FLOOR_Y, 'deep');
            for (i = 0; i < 6; i++) {
                stage.line(30 + i * 63, FLOOR_Y, 30 + i * 63, stage.h, 'lift', { width: 2 });
            }
            stage.line(0, FLOOR_Y, stage.w, FLOOR_Y, 'dim', { width: 3 });

            /* THE CHARACTER: a rabbit-eared cartoon silhouette, reaching toward
               the ball. Grey (dim) rather than white so it stays below the ball
               and the band in the visual hierarchy, and because it is the right
               colour for the character. The ear flick is the screen's only new
               animated quantity and it goes through j(), so reduced motion
               freezes the ears without losing the silhouette. */
            var flick = stage.j(Math.sin(stage.t * 2.4) * 3);
            stage.poly([82, 438, 92, 434, 86 + flick, 372, 76 + flick, 378], 'dim');
            stage.poly([96, 434, 106, 440, 110 + flick * 1.4, 386, 100 + flick * 1.4, 376], 'dim');
            stage.line(85, 430, 81 + flick, 382, 'deep', { width: 3 });
            stage.line(101, 432, 105 + flick * 1.4, 388, 'deep', { width: 3 });
            stage.roundRect(68, 458, 48, 48, 16, 'dim');
            stage.line(112, 474, 160, 464, 'dim', { width: 9 });
            stage.circle(92, 448, 22, 'dim');
            stage.circle(106, 452, 12, 'dim');
            stage.circle(101, 441, 3, 'ink');
            stage.circle(115, 448, 2.5, 'ink');
            stage.roundRect(105, 460, 5, 9, 1.5, 'ink');
            stage.roundRect(111, 460, 5, 9, 1.5, 'ink');

            /* THE HOOP, cartoon-styled: a backboard outline, a heavier rim and
               a five-strand net with two cross rows. The board is an OUTLINE,
               not a fill, because the timer readout sits inside it and a filled
               board would drop white-on-surface text from 11.67:1 to 7.19:1.
               The rim keeps its shipped centre and radius, so where the shot has
               to arrive has not moved. */
            var nTop = TRACK_TOP - 40, nBot = nTop + 36;
            stage.rect(TRACK_X - 56, 32, 112, 70, 'dim', { stroke: true, width: 3 });
            stage.circle(TRACK_X, nTop, HOOP_R, 'accent', { stroke: true, width: 5 });
            for (i = 0; i < NET_DX.length; i++) {
                stage.line(TRACK_X + NET_DX[i], nTop, TRACK_X + NET_DX[i] * 0.4, nBot,
                           'dim', { width: 2 });
            }
            for (i = 0; i < 2; i++) {
                t = 0.36 + i * 0.34;
                y = nTop + (nBot - nTop) * t;
                for (k = 0; k < NET_DX.length - 1; k++) {
                    xa = TRACK_X + NET_DX[k] * (1 - t * 0.6);
                    xb = TRACK_X + NET_DX[k + 1] * (1 - t * 0.6);
                    stage.line(xa, y, xb, y, 'dim', { width: 1.5 });
                }
            }

            /* Charge track. */
            stage.rect(TRACK_X - 5, TRACK_TOP, 10, TRACK_BOTTOM - TRACK_TOP, 'deep');

            /* THE RELEASE BAND. Same edges as shipped, derived from the same two
               mem values: only its drawn WIDTH and colour change, from a 10px
               35%-alpha accent sliver on the track to a 34px pale zone with a
               bright tick line on each edge, because the sliver was the part
               nobody could see. 18% alpha is not a taste figure: it puts the
               zone's composite luminance at 0.1042, just under the 0.1053
               surface bound, which a 1.9%-area element never had to meet. */
            var bandTop = TRACK_BOTTOM - m.bandHi * (TRACK_BOTTOM - TRACK_TOP);
            var bandH = (m.bandHi - m.bandLo) * (TRACK_BOTTOM - TRACK_TOP);
            stage.rect(TRACK_X - 17, bandTop, 34, bandH, 'ink', { alpha: 0.18 });
            stage.line(TRACK_X - 22, bandTop, TRACK_X + 22, bandTop, 'ink',
                       { width: 2, alpha: 0.85 });
            stage.line(TRACK_X - 22, bandTop + bandH, TRACK_X + 22, bandTop + bandH, 'ink',
                       { width: 2, alpha: 0.85 });

            /* THE BALL: an orange basketball with two seams, rather than a plain
               white disc. Position and radius are exactly as shipped. */
            var ballY = TRACK_BOTTOM - m.fill * (TRACK_BOTTOM - TRACK_TOP);
            stage.circle(TRACK_X, ballY, BALL_R, 'accent');
            stage.line(TRACK_X, ballY - BALL_R + 2, TRACK_X, ballY + BALL_R - 2, 'deep',
                       { width: 2 });
            stage.line(TRACK_X - BALL_R + 2, ballY, TRACK_X + BALL_R - 2, ballY, 'deep',
                       { width: 2 });

            if (m.resultPulse > 0) {
                stage.circle(TRACK_X, ballY, BALL_R + (1 - m.resultPulse) * 30, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
