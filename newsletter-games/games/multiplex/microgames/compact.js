/**
 * MULTIPLEX microgame - COMPACT.
 *
 * A deterministic, repeating beat: two jaws close together and reopen on a
 * fixed cycle. Tap while the gap is at its narrowest for a crush; tap at any
 * other moment and the crush is mistimed. Rhythm, not reaction - the beat
 * never changes speed or hides, it just repeats.
 *
 * Styled after the 2008 animated waste-compactor robot film. The title itself is
 * carried by the harness credit table and is deliberately not repeated here, so
 * this screen names no wordmark at all. Design record and area derivation: the
 * ART3 lane record for compact and dig.
 *
 * THE COMPOSITION: THE ROBOT IS THE COMPACTOR. He is a waste allocation load
 * lifter and compacting trash inside his own torso is literally his function in
 * the film, so the shipped geometry already fits it with nothing moved. The two
 * jaws become the press plates inside his open chest cavity, and the existing
 * cube between them becomes one of his compacted bricks. All DRAW-ONLY: no
 * constant, no init, no update and no win test changed.
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

    /* ---- Art only. Nothing below this line is read by init or update. ----
       Every large mass is `lift` or `deep`, and full-alpha `accent` / `accent2`
       / `ink` is spent only on small high-read detail. That is not taste, it is
       the flashing-area bound derived in ART3-compact-dig-art.md section 3:
       bright drawn area must stay under 7.95% of the play rect, about 16,500
       logical px2, because cuts run at 2.38/second and bright drawn content is
       what actually flips by more than the 0.10 luminance delta on a cut from
       the wipe. A solid yellow robot would have been 29% of the rect, 3.6x over.
       On this screen `lift` composites to #594C38 (delta 0.071) and `deep` to
       #261D10 (delta 0.008), so both are free; the silhouette is carried by
       shape and by a 2px outline, not by a bright fill.

       No new colour is proposed. `accent` #D9A83A is already construction
       yellow and `accent2` #A8C4D4 is already the pale grey-blue of a compacted
       brick, so nothing needs registering in TINTS. The dull `lift` body is also
       more accurate than clean yellow: he is filthy for the whole first act. */
    var BODY_X = 88, BODY_W = 200;
    var BODY_Y = 136, BODY_H = 266;      // encloses the cavity and both jaws
    var CAV_X = 100, CAV_W = 176;
    var CAV_Y = 144, CAV_H = 252;
    var HEAD_Y = 106, HEAD_R = 24;       // barrel centres; top at 82 clears the timer text
    var EYE_L = 160, EYE_R = 216;
    var TREAD_Y = 402, TREAD_H = 38;

    /* The head is TWO fused barrels with a waist between them, not one blob.
       Drawing it that way is the whole read: the binocular pair is the
       authorised signature, and a single lozenge would not be it.

       The barrels are `lift`, not `deep`, and that is a correction made after
       looking at the render rather than a preference. `deep` on this screen
       composites to #261D10 against a #3A2A12 surface, a 1.4:1 mass that is
       invisible at 400px: the first version drew the barrels in it and the eye
       whites read as two loose circles floating above the body. `lift` is the
       same tan as the torso, so the head reads as fused hardware, and it is
       free on the area bound where the eye whites are not.

       Nesting barrel -> housing -> white -> pupil is also what the film's eyes
       actually are, and it costs nothing: only the white is above the flash
       threshold, and it is the smallest ring of the four. */
    function drawHead(stage, close, inWindow) {
        var i, ex, gx = close * 3, gy = 2 + close * 6;
        stage.rect(178, HEAD_Y + 10, 20, BODY_Y - HEAD_Y - 10, 'lift');   // neck
        stage.rect(EYE_L, HEAD_Y - 8, EYE_R - EYE_L, 16, 'lift');         // the waist
        for (i = 0; i < 2; i++) {
            ex = i === 0 ? EYE_L : EYE_R;
            stage.circle(ex, HEAD_Y, HEAD_R, 'lift');
            stage.circle(ex, HEAD_Y, HEAD_R - 5, 'deep');                 // lens housing
            stage.circle(ex, HEAD_Y, 13, 'ink');
            stage.circle(ex + gx, HEAD_Y + gy, 6.5, 'deep');
            /* The beat window, encoded a SECOND time and in a second place.
               Shipped, it was the top jaw's colour alone; a ring around each eye
               makes it colour plus shape plus location, which is a real
               accessibility gain rather than decoration. */
            if (inWindow) {
                stage.circle(ex, HEAD_Y, HEAD_R - 2, 'accent', { stroke: true, width: 2 });
            }
        }
    }

    /* Static on purpose. harness.js keeps its sprockets static for the same
       reason: a second motion source costs attention and returns no
       information. Everything on this screen that moves is a readout of the
       beat, which is the one thing the player has to track. */
    function drawTreads(stage) {
        var i;
        stage.roundRect(BODY_X, TREAD_Y, BODY_W, TREAD_H, 8, 'deep');
        for (i = 0; i < 9; i++) {
            stage.rect(BODY_X + 10 + i * 21, TREAD_Y + 5, 9, TREAD_H - 10, 'lift');
        }
        stage.circle(BODY_X + 30, TREAD_Y + TREAD_H / 2, 11, 'accent',
                     { stroke: true, width: 2 });
        stage.circle(BODY_X + BODY_W - 30, TREAD_Y + TREAD_H / 2, 11, 'accent',
                     { stroke: true, width: 2 });
    }

    /* Arms ride the side rails and lift with the jaw phase, so they are a
       readout of the same state topY is, not an animation. That is why they sit
       outside j() exactly as topY does. */
    function drawArms(stage, close) {
        var i, ax, ay = 190 + close * 26;
        for (i = 0; i < 2; i++) {
            ax = i === 0 ? 62 : 302;
            stage.rect(ax, 176, 12, 118, 'deep');            // the rail
            stage.roundRect(ax - 6, ay, 24, 30, 5, 'lift');  // the shoulder block
            stage.line(ax + 6, ay + 30, ax + 6, ay + 54, 'lift', { width: 7 });
            stage.line(ax, ay + 54, ax + 12, ay + 54, 'accent', { width: 4 });
        }
    }

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

            var i;
            var phase = (stage.t % m.period) / m.period;
            var close = Math.sin(phase * Math.PI);          // 0 open -> 1 closed -> 0 open
            var inWindow = Math.abs(phase - 0.5) <= m.windowHalf;
            var topY = OPEN_Y + close * (CLOSED_Y - OPEN_Y - JAW_H);

            drawTreads(stage);
            drawArms(stage, close);

            /* Body, then the recess, then the outline. The masses under the
               outline are deliberately dull, and the outline itself is at alpha
               0.35 on purpose: `accent` composites to a 0.083 delta there, under
               the 0.10 flash threshold, so the whole 930px perimeter is FREE.
               At full alpha it cost 1,860 px2 and took the worst concurrent
               frame to 1.03x of the area bound, which is not a margin worth
               shipping for an outline. The bright edge is spent where the eye
               actually goes instead: a 2px full-alpha shoulder line across the
               top, 400 px2, which is what reads as a machined edge. */
            stage.roundRect(BODY_X, BODY_Y, BODY_W, BODY_H, 14, 'lift');
            stage.roundRect(CAV_X, CAV_Y, CAV_W, CAV_H, 8, 'deep');
            stage.roundRect(BODY_X, BODY_Y, BODY_W, BODY_H, 14, 'accent',
                            { stroke: true, width: 2, alpha: 0.35 });
            stage.line(BODY_X + 14, BODY_Y + 1, BODY_X + BODY_W - 14, BODY_Y + 1,
                       'accent', { width: 2 });

            drawHead(stage, close, inWindow);

            /* Hydraulic rams from the cavity roof down to the moving jaw. Their
               length is derived from topY, so they are a second readout of the
               beat rather than a decoration, and they read as the mechanism
               driving the press. */
            for (i = 0; i < 2; i++) {
                stage.rect(i === 0 ? 130 : 238, CAV_Y, 8, Math.max(0, topY - CAV_Y), 'lift');
            }

            stage.roundRect(JAW_X, topY, JAW_W, JAW_H, 4, inWindow ? 'accent' : 'ink');
            stage.roundRect(JAW_X, CLOSED_Y, JAW_W, JAW_H, 4, 'ink');

            /* Press-plate faces. A single subtractive `deep` inset per jaw, not
               a row of ticks: the first version drew eight ticks per plate and
               the render read as a piano keyboard, which is a worse misread than
               having no detail at all. Free either way, since `deep` subtracts. */
            stage.rect(JAW_X + 8, topY + JAW_H - 4, JAW_W - 16, 4, 'deep');
            stage.rect(JAW_X + 8, CLOSED_Y, JAW_W - 16, 4, 'deep');

            var bob = stage.j(Math.sin(stage.t * 8) * 2);
            var cubeY = (topY + JAW_H + CLOSED_Y) / 2 + bob;
            stage.rect(JAW_X + JAW_W / 2 - CUBE_R, cubeY - CUBE_R, CUBE_R * 2, CUBE_R * 2, 'accent2');
            /* Crush seams on the brick, also subtractive and also free. */
            stage.line(JAW_X + JAW_W / 2 - CUBE_R, cubeY - 7, JAW_X + JAW_W / 2 + CUBE_R, cubeY - 7,
                       'deep', { width: 2, alpha: 0.55 });
            stage.line(JAW_X + JAW_W / 2 - CUBE_R, cubeY + 7, JAW_X + JAW_W / 2 + CUBE_R, cubeY + 7,
                       'deep', { width: 2, alpha: 0.55 });

            if (m.resultPulse > 0) {
                stage.circle(JAW_X + JAW_W / 2, cubeY, CUBE_R + (1 - m.resultPulse) * 30, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
