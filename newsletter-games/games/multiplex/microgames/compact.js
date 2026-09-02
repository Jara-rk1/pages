/**
 * MULTIPLEX microgame - COMPACT.
 *
 * A deterministic, repeating beat: two jaws close together and reopen on a
 * fixed cycle. Tap while the gap is at its narrowest for a crush; tap at any
 * other moment and the crush is mistimed. Rhythm, not reaction - the beat
 * never changes speed or hides, it just repeats.
 *
 * That paragraph described an intention rather than the code until 2026-08-31,
 * when the period was a fraction of the screen's own budget and the jaws closed
 * once. See THE BEAT below for what was wrong, what it measured, and what the
 * period is now. It is a true description of this file as it stands.
 *
 * Styled after the 2008 animated waste-compactor robot film. The title itself is
 * carried by the harness credit table and is deliberately not repeated here, so
 * this screen names no wordmark at all. Design record and area derivation: the
 * internal art direction for compact and dig.
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
    var BRICK_MIN_H = 6;           // a fully crushed brick is a slab, not nothing

    /* THE BEAT. This screen says HIT THE BEAT and its hint says "tap on the beat",
       and until 2026-08-31 there was no beat: the period was a FRACTION of the
       screen's own time budget (0.9 falling to 0.55), so at loop 0 it was 4.5s
       inside a 5.0s screen and the jaws closed exactly ONCE. A rhythm the player
       sees once is not a rhythm, it is a single reaction test with instant death
       on a mistimed tap, and measured against a player with a 250ms reaction it
       lost 26% of seeds at loop 0 and 100% by loop 3.

       The period is now a DURATION clamped into a tappable band, so several
       closures fit and the player can learn the beat and predict the next one,
       which is the entire point of a rhythm screen. Beats seen per screen:
       5 at loop 0, 4 through the mid loops, 1 at the 400ms floor.

       THE DIFFICULTY AXIS IS THE TEMPO, and `stage.difficulty` is deliberately
       not read here. The period falls 0.90 to 0.30 because it is derived from
       stage.timeLeft, which already shrinks 12.5x across the loops, so the beat
       gets faster and there is less time to answer it. Scaling the window by
       stage.difficulty as well would count the same ramp twice.

       The window is a FRACTION of the period, floored in absolute seconds. The
       fraction is what makes the cue mean anything: the old tolerance was a flat
       0.30s, which against the new 0.90s period lit the "on the beat" cue for
       two thirds of every cycle at loop 0 - a signal that is almost always on is
       not a signal, and a mistimed tap ends this screen instantly, so it has to
       be. The floor is what keeps it tappable once the period is short: at 0.30s
       a window narrow enough to stay 20% of the cycle would be 3 frames.
       Resulting half-window: 0.18s at loop 0, 0.13s mid, 0.10s from loop 6. */
    var BEATS_TARGET = 4;          // beats the player should get to SEE and count
    var PERIOD_MIN = 0.30;         // faster than this cannot be tapped deliberately
    var PERIOD_MAX = 0.90;         // slower than this stops reading as a pulse
    var WIN_FRAC = 0.20;           // half-window, as a fraction of the beat period
    var WIN_MIN_S = 0.10;          // ... but never tighter than this in real time

    /* Seconds of grace on the LATE side only, and only where the screen is too
       short for a second closure to exist. With no second beat there is nothing to
       predict from, so the only strategy left is to react to the first one - and a
       reaction cannot land inside a window that closed before the reaction
       finished. This is the same figure and the same argument as
       make-the-gate.js's REACTION_ALLOWANCE; the two screens cannot share a
       module, so they share a name and this note instead. */
    var REACTION_ALLOWANCE = 0.25;

    /* Spread of a hand aiming at a moment it has already decided to hit. Paired
       with REACTION_ALLOWANCE it is what "early enough to react to" has to mean:
       the closure must leave a reaction PLUS this much still inside the screen,
       or the tap lands after the buzzer. Without the spread term the floor loops
       measured clean at a 250ms reaction and still lost 8% of seeds to jitter. */
    var TAP_SPREAD = 0.10;

    /* A guard, not a tuning knob: a half-window wider than this much of the period
       means most of the cycle counts as "on the beat", i.e. there is no beat. It
       does not bind at any shipped loop (the widest is 0.333) and exists so a
       future tolerance change fails visibly instead of quietly. */
    var WINDOW_MAX_FRAC = 0.40;

    /* ONE definition of "on the beat", read by update to JUDGE a tap and by draw
       to CUE it. They used to compute it separately from `phase`, which is the
       kind of duplication that lets the gold jaw and the win test drift apart and
       makes a screen feel arbitrary.

       k is clamped to closures that actually occur inside the screen. Without that
       clamp, a tap in the late grace of the last real closure rounds forward to a
       closure the player never gets to see and scores as early. */
    function beatError(m, t) {
        var k = Math.min(m.maxK, Math.max(0, Math.round((t - m.beat) / m.period)));
        return t - (m.beat + k * m.period);
    }
    function onBeat(m, t) {
        var e = beatError(m, t);
        return e >= -m.tolEarly && e <= m.tolLate;
    }

    /* ---- Art only. Nothing below this line is read by init or update. ----
       Every large mass is `lift` or `deep`, and full-alpha `accent` / `accent2`
       / `ink` is spent only on small high-read detail. That is not taste, it is
       the flashing-area bound derived in the internal art direction, section 3:
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
            var period = Math.min(PERIOD_MAX,
                                  Math.max(PERIOD_MIN, stage.timeLeft / BEATS_TARGET));
            var tol = Math.max(period * WIN_FRAC, WIN_MIN_S);
            var beat = period * 0.5;                       // the first closure
            var maxK = Math.max(0, Math.floor((stage.timeLeft - beat) / period));
            var cap = period * WINDOW_MAX_FRAC;
            var tolEarly, tolLate;

            if (maxK >= 1) {
                tolEarly = Math.min(tol, cap);
                tolLate = Math.min(tol, cap);
            } else {
                /* maxK of 0 means the one closure is all there is: nothing to
                   predict from, so the player can only react to it - and at the
                   400ms floor a reaction to a closure at 150ms lands at 400ms,
                   the buzzer. Measured, 79% of seeds lost at a 250ms reaction.

                   There is no timing element to rescue. 400ms is shorter than a
                   reaction plus a decision, so a window narrow enough to be a test
                   is narrower than the jitter of the hand aiming at it: the only
                   two reachable designs are "free" and "impossible". compact
                   therefore becomes a ONE-INPUT screen at the floor, which is what
                   make-the-gate and incoming already are there. The jaws still
                   slam and then HOLD shut (see draw), so it reads as the same
                   screen played faster rather than as a different one.

                   REACTION_ALLOWANCE is what makes this a derivation and not a
                   special case: the branch is entered exactly when one closure is
                   all that fits, never by loop number. */
                beat = Math.min(beat, Math.max(0.05,
                    stage.timeLeft - REACTION_ALLOWANCE - TAP_SPREAD));
                tolEarly = beat;                           // from the first frame
                tolLate = Math.max(REACTION_ALLOWANCE, stage.timeLeft - beat);
            }
            return {
                period: period,
                beat: beat,
                maxK: maxK,                                // last closure the player sees
                tolEarly: tolEarly,
                tolLate: tolLate,
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            if (input.tapped) {
                if (onBeat(m, stage.t)) {
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
            /* Where there is only ever one closure, the jaws HOLD shut once they
               have closed instead of reopening under a window that is still open.
               The late grace exists precisely so a reaction can land after the
               closure, and a picture that reopens while the cue says "now" is the
               picture contradicting the judgement. Draw-only: update reads the
               true clock through onBeat(). */
            var pt = m.maxK === 0 ? Math.min(stage.t, m.beat) : stage.t;
            var phase = (pt % m.period) / m.period;
            var close = Math.sin(phase * Math.PI);          // 0 open -> 1 closed -> 0 open
            var inWindow = onBeat(m, stage.t);
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

            /* The brick is CRUSHED by the plates, not buried under them. It was a
               fixed 44px square centred in a gap that closes to zero, drawn AFTER
               both jaws and so on top of them: from close > 0.79, which is 42% of
               every cycle and always includes the beat itself, a pale slab sat
               over the press plates at the exact moment the player is looking at
               them. It read as a rendering fault, and on the beat frame it hid the
               one thing the screen is about.

               Filling the gap also makes the brick a second readout of the beat,
               the way the rams and the arms already are. HEIGHT ONLY, never width:
               the drawn area then strictly decreases as the jaws close, so this
               cannot push the frame past the flashing-area bound in section 3. */
            var bob = stage.j(Math.sin(stage.t * 8) * 2);
            var gapTop = topY + JAW_H;
            var gapH = Math.max(0, CLOSED_Y - gapTop);
            var brickH = Math.max(BRICK_MIN_H, Math.min(CUBE_R * 2, gapH));
            var cubeY = gapTop + gapH / 2 + bob;
            stage.rect(JAW_X + JAW_W / 2 - CUBE_R, cubeY - brickH / 2,
                       CUBE_R * 2, brickH, 'accent2');
            /* Crush seams, subtractive and free, spaced off the live height so they
               stay on the brick instead of outside it once it is squashed. */
            if (brickH >= 16) {
                stage.line(JAW_X + JAW_W / 2 - CUBE_R, cubeY - brickH / 3,
                           JAW_X + JAW_W / 2 + CUBE_R, cubeY - brickH / 3,
                           'deep', { width: 2, alpha: 0.55 });
                stage.line(JAW_X + JAW_W / 2 - CUBE_R, cubeY + brickH / 3,
                           JAW_X + JAW_W / 2 + CUBE_R, cubeY + brickH / 3,
                           'deep', { width: 2, alpha: 0.55 });
            }

            if (m.resultPulse > 0) {
                stage.circle(JAW_X + JAW_W / 2, cubeY, CUBE_R + (1 - m.resultPulse) * 30, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
