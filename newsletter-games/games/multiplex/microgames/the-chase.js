/**
 * MULTIPLEX microgame - SEEKER.
 *
 * A target darts between waypoints along a fixed track; steer a marker on the
 * x-axis to sit under it and hold contact until the hold meter fills.
 *
 * Styled after Harry Potter (2001): the target is a winged golden ball, the
 * marker is a broomstick, and a castle silhouette sits behind the flight line.
 * All three are DRAW-ONLY. Every constant, the waypoint schedule, the catch
 * test and the hold rule are exactly as they were before the art landed, which
 * is why the census and the determinism digests are unmoved.
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
       and cost a player with any reaction lag a target they can no longer follow.
       TWO CAVEATS ON THAT BOUND, both measured rather than argued, n = 2000.
       First, the clamp really does take over, and the bound stops holding from
       loop 7. The sharp form is a leg length: a parked marker banks holdNeeded off
       one crossing whenever the leg is no longer than 2*catchR*segT/holdNeeded,
       which is 111px at the 400ms floor against a minLeg of 70, so slow legs are
       legal and a park on one wins outright. Measured: 0.0% of seeds at loops 0 to
       6, then 0.8% at loop 7 and 7.1% to 8.2% across loops 8 to 12 at 60Hz. That
       is pre-existing, and the turn rule below cannot touch loops 8 to 12 at all,
       because a 400ms screen is shorter than one 0.5s leg and so contains no turn:
       measured identical to the seed at all four frame deltas. Second, where a
       screen DOES contain a turn the rule joins two band passes into one dwell if
       the waypoint sits within two frames' travel of the band edge, so the cap
       becomes the sum of the passes joined rather than one crossing pair. Measured
       cost, and it is confined to the two loops whose margin was already thin:
       loop 7 idle 0.4% to 0.8% at 60Hz and 0.5% to 2.8% at dt 0.1, loop 6 0.0% to
       0.1% at dt 0.1 only, every other loop unmoved at every dt. A joined frame is
       credited nothing, which is what keeps that cost this small. */
    var HOLD_EASY = 1.7;
    var HOLD_HARD = 0.9;
    var HOLD_FRAC = 0.45;          // ceiling on that, as a fraction of the screen's own time budget

    /* ---- Art only. Nothing below this line is read by init or update. ----
       The castle: a static silhouette in `deep`, which composites to a 1.4:1
       mass against this screen's #234A34 surface. That is what a DISTANT
       silhouette should be, and it is also what keeps it free: `deep` sits
       0.008 above the wipe luminance, well under the 0.10 delta that would make
       it count toward the flashing-area bound (the derivation is in the internal
       art direction, section 3, and it binds every screen in this wave, not just
       the two it was written for).
       The lit windows are `accent` and DO cost area, which is why there are two
       per tower at 4x7px: 392 px2 against a 16,500 px2 budget.
       Static on purpose. The target's motion is the information on this screen,
       and a second moving thing behind it competes with the only thing the
       player has to track. Same argument as the harness keeping its sprockets
       static.
       Tower rows are [centre x, half width, height above base, roof height].
       Base at 236 clears the catch disc, whose widest reach is TRACK_Y - 42
       = 258 at loop 0, and the tallest tower top at 108 clears the timer text,
       which bottoms out near 73. */
    var CASTLE_BASE = 236;
    var TOWERS = [
        [ 42, 15,  58, 26],
        [ 78, 22,  96, 34],
        [128, 17,  72, 28],
        [188, 28, 128, 46],
        [248, 17,  76, 28],
        [292, 23,  92, 34],
        [332, 14,  54, 24]
    ];

    function drawCastle(stage) {
        var i, t, x, top;
        stage.rect(34, CASTLE_BASE - 34, 308, 34, 'deep');
        for (i = 0; i < 14; i++) {
            stage.rect(34 + i * 22, CASTLE_BASE - 42, 12, 10, 'deep');
        }
        for (i = 0; i < TOWERS.length; i++) {
            t = TOWERS[i];
            x = t[0];
            top = CASTLE_BASE - t[2];
            stage.rect(x - t[1], top, t[1] * 2, t[2], 'deep');
            stage.poly([x - t[1] - 3, top, x + t[1] + 3, top, x, top - t[3]], 'deep');
            stage.rect(x - 2, top + 14, 4, 7, 'accent', { alpha: 0.75 });
            stage.rect(x - 2, top + 30, 4, 7, 'accent', { alpha: 0.55 });
        }
    }

    MULTIPLEX.register({
        slug: 'the-chase',
        title: 'SEEKER',
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
                segPrev: 0,            // the leg the target is on at t = 0
                turnedPrev: false,
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

            /* A waypoint is a direction change no player can see coming, and for
               exactly TWO frames after one the target is somewhere the last two
               drawn positions did not point: the frame the turn falls in, and the
               frame after it, whose extrapolation still straddles the turn. From
               the third frame both samples sit on the new leg and a perfect aim is
               exact again. Those two frames, and only those, do not break the hold.
               WHY IT HAS TO EXIST. One frame after a turn the target is
               dt/segT * |legNew - legOld| from the extrapolated aim, at full
               difficulty at least 0.2 * 140 = 28px against a 20px radius at dt 0.1,
               and the reset used to be unconditional. Loop 6 then wanted 0.63s of
               unbroken contact assembled out of 0.5s legs, which is impossible for
               any player rather than merely hard. Measured at n = 2000 on the
               published tree: loop 6 unwinnable for 70.9% of seeds at dt 0.1 and
               30.3% at 30Hz, loop 4 for 73.6% and loop 5 for 68.0%.
               WHY TWO AND NOT ONE. When segT/dt is a whole number the turn lands on
               a frame boundary and only the frame after it is mispredicted. Loop 5
               at dt 0.1 has segT/dt = 5.7, so the turn falls mid-frame and the
               error splits across two frames as a*dt*|dv| and (1-a)*dt*|dv|:
               suspending the reset for one of them still left 36.4% of loop-5 seeds
               unwinnable. Two is also enough for good, because segT is at least
               0.5s and the engine clamps dt at 0.1, so no frame can hold two turns.
               CREDIT IS NOT WIDENED, ONLY THE RESET IS SUSPENDED, and the asymmetry
               is the whole point: holdT still advances only on frames that END in
               contact, so nothing is credited that was not credited before.
               Crediting the partial frame instead, which is the obvious
               alternative, measured the idle free win at the 400ms floor up from
               16.6% to 57.8% at dt 0.1: that is why it is not done. Gating on the
               TURN rather than on "was in contact a frame ago" is what keeps this
               off every ordinary frame, so a keyboard player stepping past the
               target on the lattice is still reset exactly as before, and a floor
               screen, which is shorter than one leg and so contains no turn at all,
               runs the shipped code path unchanged. */
            var turned = segIndex !== m.segPrev;
            var dist = Math.abs(m.markerX - m.targetX);
            if (dist <= m.catchR) {
                m.holdT += dt;
                if (m.holdT >= m.holdNeeded) {
                    stage.flash(0.7);
                    return 'win';
                }
            } else if (!turned && !m.turnedPrev) {
                m.holdT = 0;
            }
            m.turnedPrev = turned;
            m.segPrev = segIndex;

            /* Returning nothing means "still playing". Running the clock out
               resolves as a loss here, because goal is 'achieve'. */
        },

        draw: function (stage) {
            var m = stage.mem;
            var i;

            drawCastle(stage);

            stage.rect(MARGIN, TRACK_Y - 3, stage.w - MARGIN * 2, 6, 'deep');

            /* Catch tolerance, drawn as a translucent disc under the target so
               the margin for error is visible information, not a guess. */
            stage.circle(m.targetX, TRACK_Y, m.catchR, 'accent', { alpha: 0.18 });

            /* The target: a winged golden ball. Its POSITION is the information
               and is untouched. The wing beat is decoration and goes through
               j(), so reduced motion gets still wings rather than no wings -
               the wings are what name the reference, and losing them would make
               the screen mean something different rather than something
               calmer. The seam lines are `deep`, i.e. subtractive, so they cost
               no flashing area at all: the ball is the same lit disc it was. */
            var beat = stage.j(Math.sin(stage.t * 16));
            var pulse = stage.j(Math.sin(stage.t * 8) * 3);
            var r = 10 + pulse;
            var span = 16 + beat * 5, rise = 5 + beat * 4;
            stage.poly([m.targetX - r + 2, TRACK_Y - 1,
                        m.targetX - r - span, TRACK_Y - rise - 4,
                        m.targetX - r - span + 4, TRACK_Y + 3], 'accent', { alpha: 0.5 });
            stage.poly([m.targetX + r - 2, TRACK_Y - 1,
                        m.targetX + r + span, TRACK_Y - rise - 4,
                        m.targetX + r + span - 4, TRACK_Y + 3], 'accent', { alpha: 0.5 });
            stage.circle(m.targetX, TRACK_Y, r, 'accent');
            stage.line(m.targetX - r + 3, TRACK_Y - 4, m.targetX + r - 3, TRACK_Y - 4,
                       'deep', { width: 1.5, alpha: 0.6 });
            stage.line(m.targetX - r + 3, TRACK_Y + 4, m.targetX + r - 3, TRACK_Y + 4,
                       'deep', { width: 1.5, alpha: 0.6 });

            /* Hold-progress ring: its size IS information (how close to the
               win threshold), so it is not wrapped in j(). */
            if (m.holdT > 0) {
                var frac = Math.min(1, m.holdT / m.holdNeeded);
                stage.circle(m.markerX, TRACK_Y, 14 + frac * 18, 'ink',
                             { stroke: true, width: 3, alpha: 0.5 + frac * 0.5 });
            }

            /* The marker: a broomstick, on exactly the shipped footprint. The
               handle passes through m.markerX, which is the value the catch
               test reads, so the drawn thing still shows where the player is.
               Bristles are `dim` straw, handle `ink`, and the whole assembly is
               line work rather than a filled bar, which spends less bright area
               than the roundRect it replaces. */
            var lift = stage.j(Math.sin(stage.t * 6) * 2);
            var by = TRACK_Y + lift;
            var x0 = m.markerX - MARKER_W / 2, x1 = m.markerX + MARKER_W / 2;
            for (i = -2; i <= 2; i++) {
                stage.line(x0 + 11, by + 5, x0 - 4, by + 8 + i * 4, 'dim',
                           { width: 2, alpha: 0.85 });
            }
            stage.line(x0 + 11, by + 5, x1, by - 6, 'ink', { width: 4 });
            stage.line(x0 + 12, by + 4, x0 + 16, by + 3, 'dim', { width: 6 });

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
