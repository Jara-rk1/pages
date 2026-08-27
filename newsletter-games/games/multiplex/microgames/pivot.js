/**
 * MULTIPLEX microgame - PIVOT.
 *
 * A long bar descends toward a gap in a wall. The gap sits at a random
 * angle; rotate the bar to match it before it arrives.
 */
(function () {
    'use strict';

    var BAR_START_Y = 70;
    var GAP_Y = 420;               // the wall/gap line, in stage coords
    var BAR_LEN = 130;
    var BAR_THICK = 22;
    var WALL_THICK = 14;
    var MARGIN = 24;

    var MAX_ANGLE = 65 * Math.PI / 180;    // full sweep the bar can be steered through
    var TARGET_MAX = 50 * Math.PI / 180;   // random target always stays inside MAX_ANGLE
    var TOL_EASY = 22 * Math.PI / 180;
    var TOL_HARD = 8 * Math.PI / 180;
    var FALL_FRAC_EASY = 0.85;     // fall duration as a fraction of the screen's own time budget
    var FALL_FRAC_HARD = 0.45;

    MULTIPLEX.register({
        slug: 'pivot',
        title: 'PIVOT',
        prompt: 'ROTATE TO FIT',
        hint: 'Tilt left / right',
        goal: 'achieve',

        init: function (stage) {
            var tol = TOL_EASY + (TOL_HARD - TOL_EASY) * stage.difficulty;
            var frac = FALL_FRAC_EASY + (FALL_FRAC_HARD - FALL_FRAC_EASY) * stage.difficulty;
            /* Size the descent against THIS instance's own time budget, same technique
               as the fall in food-falls: fair whether this is loop 1 or the floor loop. */
            var fallTime = Math.max(0.2, stage.timeLeft * frac);
            return {
                y: BAR_START_Y,
                fallSpeed: (GAP_Y - BAR_START_Y) / fallTime,
                angle: 0,
                target: (stage.rand() * 2 - 1) * TARGET_MAX,
                tol: tol,
                corridorHalf: stage.w / 2 - MARGIN,
                /* The opening tightens with the tolerance, but only its CLEARANCE
                   scales: the bar's own half-length is the floor, because a bar
                   that just cleared the gap must be drawn fitting through it.
                   Scaling the whole opening drew a hole 2.45x narrower than the
                   bar at full difficulty, so the winning frame showed the bar
                   overlapping both walls. Win check unchanged, this is what the
                   player is shown. */
                gapHalf: BAR_LEN / 2 + 8 * (tol / TOL_EASY),
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            /* axis is an absolute -1..+1 position; map it straight onto the bar's
               rotation so the same input reads identically on pointer and keyboard. */
            m.angle = input.axis * MAX_ANGLE;

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            m.y += m.fallSpeed * dt;

            if (m.y >= GAP_Y) {
                m.y = GAP_Y;
                if (Math.abs(m.angle - m.target) <= m.tol) {
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
            var c = stage.ctx;

            /* The gap: two wall segments drawn in a frame rotated to the target
               angle, leaving an opening between them. Facade calls still resolve
               colour by role inside a raw ctx transform. */
            c.save();
            c.translate(stage.w / 2, GAP_Y);
            c.rotate(m.target);
            stage.rect(-m.corridorHalf, -WALL_THICK / 2, m.corridorHalf - m.gapHalf, WALL_THICK, 'deep');
            stage.rect(m.gapHalf, -WALL_THICK / 2, m.corridorHalf - m.gapHalf, WALL_THICK, 'deep');
            c.restore();

            /* The bar itself, rotated by the player's own angle. A small draw-only
               wobble under j() gives it life without touching the value the win
               check actually reads. */
            var wob = stage.j(Math.sin(stage.t * 8) * 2);
            c.save();
            c.translate(stage.w / 2, m.y + wob);
            c.rotate(m.angle);
            stage.roundRect(-BAR_LEN / 2, -BAR_THICK / 2, BAR_LEN, BAR_THICK, 6, 'accent');
            c.restore();

            if (m.resultPulse > 0) {
                stage.circle(stage.w / 2, m.y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 40, { size: 22, role: 'ink', display: true });
        }
    });
})();
