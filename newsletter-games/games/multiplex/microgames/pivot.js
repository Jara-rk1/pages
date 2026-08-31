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
        title: 'PIVOT!',
        prompt: 'ROTATE TO FIT',
        hint: 'Tilt left / right',
        goal: 'achieve',

        init: function (stage) {
            var tol = TOL_EASY + (TOL_HARD - TOL_EASY) * stage.difficulty;
            var frac = FALL_FRAC_EASY + (FALL_FRAC_HARD - FALL_FRAC_EASY) * stage.difficulty;
            /* Size the descent against THIS instance's own time budget, same technique
               as the fall in food-falls: fair whether this is loop 1 or the floor loop. */
            var fallTime = Math.max(0.2, stage.timeLeft * frac);
            /* target is drawn to EXCLUDE the idle-bar win band (+/- tol around
               angle 0, exactly the tolerance the win check below uses): an
               untouched player must never win. The two remaining segments are
               equal length, so one stage.rand() call still maps uniformly
               across whichever side it lands on, and the excluded width is the
               tolerance itself, so no draw becomes any harder to reach than it
               already was. */
            var tspan = TARGET_MAX - tol;
            var tu = stage.rand();
            var target = (tu < 0.5) ? -TARGET_MAX + tu * 2 * tspan
                                     : tol + (tu - 0.5) * 2 * tspan;
            return {
                y: BAR_START_Y,
                fallSpeed: (GAP_Y - BAR_START_Y) / fallTime,
                angle: 0,
                target: target,
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
            var i, segL, sx;

            /* The gap, drawn as a stairwell landing: the same two wall rects as
               before (they are what m.corridorHalf / m.gapHalf actually define),
               plus a bannister rail and step ticks layered on top, decorative
               only. Facade calls still resolve colour by role inside a raw ctx
               transform. */
            c.save();
            c.translate(stage.w / 2, GAP_Y);
            c.rotate(m.target);
            stage.rect(-m.corridorHalf, -WALL_THICK / 2, m.corridorHalf - m.gapHalf, WALL_THICK, 'deep');
            stage.rect(m.gapHalf, -WALL_THICK / 2, m.corridorHalf - m.gapHalf, WALL_THICK, 'deep');
            stage.line(-m.corridorHalf, -WALL_THICK / 2 - 3, -m.gapHalf, -WALL_THICK / 2 - 3, 'lift');
            stage.line(m.gapHalf, -WALL_THICK / 2 - 3, m.corridorHalf, -WALL_THICK / 2 - 3, 'lift');
            segL = (m.corridorHalf - m.gapHalf) / 4;
            for (i = 1; i < 4; i++) {
                sx = -m.corridorHalf + i * segL;
                stage.line(sx, -WALL_THICK / 2, sx, WALL_THICK / 2, 'ink', { alpha: 0.25 });
                sx = m.gapHalf + i * segL;
                stage.line(sx, -WALL_THICK / 2, sx, WALL_THICK / 2, 'ink', { alpha: 0.25 });
            }
            c.restore();

            /* The couch, rotated by the player's own angle exactly as the bar
               was. Its rendered horizontal extent stays at +/- BAR_LEN / 2, the
               same as the plain bar it replaces, so the gapHalf floor documented
               in init() still fits it at the winning frame: the arms are inset
               within that extent and the back rest only extends perpendicular
               to it. A small draw-only wobble under j() gives it life without
               touching the value the win check actually reads. */
            var wob = stage.j(Math.sin(stage.t * 8) * 2);
            c.save();
            c.translate(stage.w / 2, m.y + wob);
            c.rotate(m.angle);
            stage.roundRect(-BAR_LEN / 2 + 6, -BAR_THICK / 2 - 6, BAR_LEN - 12, 6, 2, 'accent', { alpha: 0.9 });
            stage.roundRect(-BAR_LEN / 2, -BAR_THICK / 2, BAR_LEN, BAR_THICK, 6, 'accent');
            stage.roundRect(-BAR_LEN / 2, -BAR_THICK / 2 - 4, 14, BAR_THICK + 4, 4, 'accent');
            stage.roundRect(BAR_LEN / 2 - 14, -BAR_THICK / 2 - 4, 14, BAR_THICK + 4, 4, 'accent');
            stage.line(0, -BAR_THICK / 2 + 3, 0, BAR_THICK / 2 - 3, 'deep');
            c.restore();

            if (m.resultPulse > 0) {
                stage.circle(stage.w / 2, m.y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 40, { size: 22, role: 'ink', display: true });
        }
    });
})();
