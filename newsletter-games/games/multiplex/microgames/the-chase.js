/**
 * MULTIPLEX microgame - THE CHASE.
 *
 * A target darts between waypoints along a fixed track; steer a marker on the
 * x-axis to sit under it and hold contact until the hold meter fills.
 */
(function () {
    'use strict';

    var TRACK_Y = 300;             // track, in stage coords
    var MARKER_W = 40;
    var MARGIN = 30;               // waypoint x range margin
    var CATCH_R_EASY = 42;
    var CATCH_R_HARD = 20;
    var MIN_LEG_EASY = 130;        // shortest waypoint-to-waypoint leg, in px
    var MIN_LEG_HARD = 70;
    var SEG_T_EASY = 1.2;          // seconds per waypoint-to-waypoint leg
    var SEG_T_HARD = 0.5;
    /* Contact needed to win. It falls in seconds as difficulty rises, because the
       target gets faster and the catch radius smaller at the same time; as a share
       of the screen it RISES, 34% at loop 0 to the 45% ceiling below. It has to
       exceed the longest dwell a parked marker can get by luck: a leg travels at
       least minLeg, so it crosses the 2*catchR band in at most 2*catchR*segT/minLeg,
       and since minLeg > 2*catchR no two waypoints in a row can sit inside the band,
       which caps a contiguous dwell at 4*catchR*segT/minLeg. That bound is 1.55s at
       loop 0 against the 1.7s below and stays under the requirement on every loop
       until the clamp takes over near the 400ms floor. The minimum leg ramps DOWN
       with difficulty for the same reason: the bound scales with catchR and segT,
       both of which shrink, so holding 130px at high difficulty would buy nothing
       and cost a player with any reaction lag a target they can no longer follow. */
    var HOLD_EASY = 1.7;
    var HOLD_HARD = 0.9;
    var HOLD_FRAC = 0.45;          // ceiling on that, as a fraction of the screen's own time budget

    MULTIPLEX.register({
        slug: 'the-chase',
        title: 'THE CHASE',
        prompt: 'CHASE IT DOWN',
        hint: 'Move left / right',
        goal: 'achieve',

        init: function (stage) {
            var catchR = CATCH_R_EASY + (CATCH_R_HARD - CATCH_R_EASY) * stage.difficulty;
            var segT = SEG_T_EASY + (SEG_T_HARD - SEG_T_EASY) * stage.difficulty;
            /* The hold requirement is capped against THIS instance's own time
               budget as well as difficulty, the same technique food-falls uses
               for its fall. Difficulty saturates at loop 6 but the screen keeps
               shortening to the floor, so an uncapped 0.9s of contact is longer
               than the whole screen from loop 7 and the win branch below can
               never be reached. The cap only bites once the screen is short
               enough for it to matter: at loop 0 it is 2.25s against a 1.7s
               requirement, and it first takes over at loop 5. */
            var holdNeeded = Math.min(HOLD_EASY + (HOLD_HARD - HOLD_EASY) * stage.difficulty,
                                      stage.timeLeft * HOLD_FRAC);

            /* Size the waypoint schedule against THIS instance's own time budget,
               same idea as food-falls sizing its fall against stage.timeLeft,
               rather than assuming a fixed screen duration. */
            var segCount = Math.max(2, Math.ceil(stage.timeLeft / segT) + 1);

            /* Every leg is a real journey. Two waypoints drawn close together park
               the target for two legs, which hands the screen to anyone and is the
               single biggest reason a player who never touches the controls used to
               clear it. Each waypoint is drawn from the track MINUS a forbidden zone
               around the one before it, which is still exactly one rand() per
               waypoint, so the stream length and the replay both stay put. */
            var minLeg = MIN_LEG_EASY + (MIN_LEG_HARD - MIN_LEG_EASY) * stage.difficulty;
            var span = stage.w - MARGIN * 2;
            var waypoints = [];
            var prev = stage.rand() * span;
            waypoints.push(MARGIN + prev);
            for (var i = 1; i <= segCount; i++) {
                var lo = Math.max(0, prev - minLeg), hi = Math.min(span, prev + minLeg);
                var pick = stage.rand() * (span - (hi - lo));
                prev = pick < lo ? pick : pick + (hi - lo);
                waypoints.push(MARGIN + prev);
            }

            return {
                waypoints: waypoints,
                segT: segT,
                catchR: catchR,
                holdNeeded: holdNeeded,
                targetX: waypoints[0],
                markerX: stage.w / 2,
                holdT: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            /* axis is an absolute -1..+1 position, identical mapping to
               _reference.js / food-falls.js. */
            m.markerX = (input.axis + 1) / 2 * (stage.w - MARKER_W) + MARKER_W / 2;

            /* Fixed schedule generated once in init, interpolated by stage.t.
               No per-frame randomness, so a headless step matches real play. */
            var wp = m.waypoints;
            var segIndex = Math.floor(stage.t / m.segT);
            if (segIndex >= wp.length - 1) {
                m.targetX = wp[wp.length - 1];
            } else {
                var localT = (stage.t - segIndex * m.segT) / m.segT;
                m.targetX = wp[segIndex] + (wp[segIndex + 1] - wp[segIndex]) * localT;
            }

            var dist = Math.abs(m.markerX - m.targetX);
            if (dist <= m.catchR) {
                m.holdT += dt;
                if (m.holdT >= m.holdNeeded) {
                    stage.flash(0.7);
                    return 'win';
                }
            } else {
                m.holdT = 0;
            }

            /* Returning nothing means "still playing". Running the clock out
               resolves as a loss here, because goal is 'achieve'. */
        },

        draw: function (stage) {
            var m = stage.mem;

            stage.rect(MARGIN, TRACK_Y - 3, stage.w - MARGIN * 2, 6, 'deep');

            /* Catch tolerance, drawn as a translucent disc under the target so
               the margin for error is visible information, not a guess. */
            stage.circle(m.targetX, TRACK_Y, m.catchR, 'accent', { alpha: 0.18 });

            /* The target itself. Pulse is cosmetic only, wrapped in j(); its
               position, which is the information, is not. */
            var pulse = stage.j(Math.sin(stage.t * 8) * 3);
            stage.circle(m.targetX, TRACK_Y, 10 + pulse, 'accent');

            /* Hold-progress ring: its size IS information (how close to the
               win threshold), so it is not wrapped in j(). */
            if (m.holdT > 0) {
                var frac = Math.min(1, m.holdT / m.holdNeeded);
                stage.circle(m.markerX, TRACK_Y, 14 + frac * 18, 'ink',
                             { stroke: true, width: 3, alpha: 0.5 + frac * 0.5 });
            }

            var lift = stage.j(Math.sin(stage.t * 6) * 2);
            stage.roundRect(m.markerX - MARKER_W / 2, TRACK_Y - 12 + lift, MARKER_W, 24, 4, 'ink');

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
