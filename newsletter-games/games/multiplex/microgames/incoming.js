/**
 * MULTIPLEX microgame - ASSEMBLE.
 *
 * Objects spawn at random points around the edge of the screen and fly
 * straight toward a fixed core in the centre. Tap near an in-flight object to
 * deflect it before it arrives. One that completes its flight undeflected
 * ends the screen. Survive the clock with nothing getting through and the
 * screen resolves as a win.
 *
 * THEMING (2026-08-28). The deflector the player aims is drawn as a
 * circular star shield with concentric rings. That was cosmetic and DRAW-ONLY:
 * no tuning constant, no win or lose condition and no line of update changed,
 * which is why the headless census came out byte-identical at the time.
 * Rationale, the authorisation it rests on and the measured colour figures: the
 * internal art direction.
 *
 * ACCESSIBILITY (2026-08-31). A thrown shield now stays live for SHIELD_T rather
 * than deflecting only on the tap frame. That IS behavioural and deliberately
 * breaks the byte-identical census: see the SHIELD_T note below for the measured
 * defect it fixes, which was a 100% unwinnable screen from loop 7 at a human tap
 * rate.
 *
 * LEGIBILITY (2026-09-02). Raised from live play, "the deflection game doesn't
 * seem to work", and investigated before anything was changed. The finding was
 * that the screen is not harder than the ones beside it - a latency sweep put it
 * at 0.0% unwinnable on every prediction arm, level with both control screens -
 * but that three things made it read as broken. Each has its own note at the
 * point it is fixed: the core is drawn larger than the reticle that sat on top of
 * it, a thrown shield is now solid against a hollow aim so a MISS has a signal of
 * its own, and the shield resolves before the loss loop so the arrival frame can
 * be saved. The first two are draw-only; the third is not, and is measured rather
 * than claimed neutral.
 *
 * THE ARRIVAL SCHEDULE (D1, 2026-09-02, the pass after those three). The screen
 * asked difficulty for up to seven objects and created one from loop 7, and it
 * opened on an empty field for a fifth to a quarter of every screen, because the
 * scheduling loop truncated a window instead of filling it. Both are fixed by
 * arithmetic, with NO tuning constant moved - see the arrival-window note in
 * init(). The count still falls at loops 7-12 and that is forced by MIN_GAP, not
 * chosen: a 400ms screen holds exactly one fair arrival. This moved the
 * simulation, so it is measured rather than claimed neutral, and the one thing it
 * broke on the way (a lone arrival placed early is unwinnable at a 250ms reaction
 * time) is recorded in init() beside the rule that prevents it.
 */
(function () {
    'use strict';

    /* THE CORE IS DRAWN LARGER THAN THE RETICLE, and that is the whole of it.
       Measured 2026-09-02: the aim reticle sat 0.00px from the core's centre with
       a radius (24) exceeding the core's half-extent (22), so the cursor overhung
       the thing it protects and a player saw one object where there were two. Not
       only on the first frame either: the SHIELD_T note below states the optimal
       strategy as "cover the centre", so the reticle is SUPPOSED to sit where it
       could not be told apart. 64 leaves 8px of plate visible around a thrown
       shield and 12px around the aim reticle. DRAW-ONLY: there is no core hitbox
       at all, a loss is an object's flight reaching progress >= 1, which is a
       point at the centre. */
    var CORE_SIZE = 64;            // width/height of the core square
    var OBJ_R = 11;
    var COUNT_EASY = 4;
    var COUNT_HARD = 7;
    var FLIGHT_EASY = 1.6;         // seconds from spawn to the core
    var FLIGHT_HARD = 0.75;
    var FLIGHT_FRAC = 0.62;        // ceiling on that, as a fraction of the screen's own time budget
    var MIN_GAP = 0.3;             // seconds between two arrivals, a fairness floor only
    var ARRIVE_TAIL = 0.08;        // seconds of clear air held back after the last arrival
    var DEFLECT_R_EASY = 50;
    var DEFLECT_R_HARD = 28;
    var RECOIL_T = 0.3;            // seconds a deflected object takes to fade out
    var SHIELD_R = 24;             // the deflector, drawn where the next tap lands
    var AIM_R = 20;                // the aim reticle, smaller so a throw READS as a change

    /* HOW LONG A THROWN SHIELD STAYS LIVE, and why this screen needs one at all.
       ==========================================================================
       Deflection used to resolve only on the `tapped` edge, i.e. inside a SINGLE
       frame. Measured 2026-08-31 by the blind keyboard census: at loops 8 to 12 the
       deflect radius is only 1.25x the distance an object covers in one 60Hz
       frame, so an object is inside the disc for about one frame and sometimes
       less. A bot tapping every frame clears every seed; a player caps out near
       make-the-gate's own realistic sustained tap rate of 0.18s, and at that rate
       the screen measured 100% unwinnable from loop 7. That is a target that
       cannot be operated rather than one that is merely hard, so it is the same
       class of defect as the WCAG 2.1.1 note in harness.js, not a difficulty
       choice.

       0.18s is taken from that same sustained tap rate, so a player tapping as
       fast as a person can holds CONTINUOUS cover at one point. It does not
       change the optimal strategy, which was already "cover the centre, where
       every trajectory terminates" - it makes that strategy executable by hand
       instead of only by a 60Hz bot.

       PINNED, NOT DRAGGED. The live shield stays where it was thrown rather than
       following the aim. Following the aim would let a pointer flick sweep the
       whole field inside one shield's life and deflect everything, which is a
       bigger change to the ceiling than this is meant to be. Pinned, the reach is
       the deflect radius and nothing more. */
    var SHIELD_T = 0.18;           // seconds a thrown shield keeps deflecting

    /* A five-pointed star, point up, as the flat [x, y, x, y, ...] list
       stage.poly takes. Pure: no state, no time, no RNG, draw-time only. */
    function starPoints(cx, cy, rOut, rIn) {
        var pts = [], i, a, r;
        for (i = 0; i < 10; i++) {
            a = -Math.PI / 2 + i * Math.PI / 5;
            r = (i % 2 === 0) ? rOut : rIn;
            pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        return pts;
    }

    /* The shield: concentric rings and a star, built entirely from roles this
       screen's tint already registers, so it introduces no colour and cannot
       move a contrast or luminance figure. Draw-time only.

       SOLID VERSUS HOLLOW IS THE MISS SIGNAL (2026-09-02). Measured, with a
       positive control so a null reading could not be the probe failing to look:
       a tap 631px from the only object in flight, against a 50px deflect radius,
       gives 0 flash() calls, hitPulse 0.00 to 0.00 and 0 deflected; the same tap
       on the object gives 1 flash, hitPulse 1.00 and 1 deflected. It is NOT that
       nothing happens - shieldT goes 0.000 to 0.163, so the reticle does relocate
       to the tap and fade. What was missing is a change a player can SEE, and at
       the centre the relocation is zero-distance and the fade lands on top of the
       core, so THERE it really was nothing, and a missed tap was indistinguishable
       from a dead control.

       Solid is a thrown shield, hollow is the aim, and m.shieldT > 0 already tells
       those apart, so this carries NO new state and cannot move the memory gate's
       per-screen stableJSON byte figures. Hollow paints strictly less area than
       solid, so the flashing-area budget stays where it was measured. The star
       motif stays in both, so the art direction is unchanged and only the STATE
       becomes legible.

       Two designs rejected, so they are not re-invented. A GREY RIM on a shield
       that hit nothing: it would have to read "nothing was hit" off
       m.hitPulse <= 0, but hitPulse is also set on a breach and decays over 0.25s
       while SHIELD_T is 0.18s, so a missed tap within 0.25s of a hit would show
       the HIT rim, and a false signal is worse than a missing one. A new
       m.missPulse field: it would move the memory gate's reported byte figures for
       a cue existing state already supports. */
    function drawShield(stage, cx, cy, r, alpha, solid) {
        var o = { alpha: alpha };
        if (solid) {
            stage.circle(cx, cy, r, 'accent', o);
            stage.circle(cx, cy, r * 0.83, 'accent2', o);
            stage.circle(cx, cy, r * 0.66, 'accent', o);
            stage.circle(cx, cy, r * 0.49, 'deep', o);
            stage.poly(starPoints(cx, cy, r * 0.46, r * 0.19), 'ink', o);
            /* A pale rim, so an incoming object crossing the shield never merges
               into its red outer ring at the moment it matters most. */
            stage.circle(cx, cy, r, 'accent2', { stroke: true, width: 1.5, alpha: alpha });
            return;
        }
        /* The aim: the same three motifs, stroked and dimmer. */
        var h = { stroke: true, width: 1.5, alpha: alpha * 0.7 };
        stage.circle(cx, cy, r, 'accent', h);
        stage.circle(cx, cy, r * 0.66, 'accent2', h);
        stage.poly(starPoints(cx, cy, r * 0.46, r * 0.19), 'ink',
                   { stroke: true, width: 1, alpha: alpha * 0.7 });
    }

    MULTIPLEX.register({
        slug: 'incoming',
        title: 'ASSEMBLE',
        prompt: 'DEFLECT INCOMING',
        hint: 'Tap near an object',
        goal: 'survive',

        init: function (stage) {
            var count = Math.round(COUNT_EASY + (COUNT_HARD - COUNT_EASY) * stage.difficulty);
            var deflectR = DEFLECT_R_EASY + (DEFLECT_R_HARD - DEFLECT_R_EASY) * stage.difficulty;
            /* Cap the flight against THIS instance's own time budget as well as
               difficulty. Difficulty saturates at loop 6 while the screen keeps
               shortening to the floor, and a flight longer than the screen means
               nothing can arrive at all, which on a 'survive' screen hands over a
               win for zero input. */
            var flightT = Math.min(FLIGHT_EASY + (FLIGHT_HARD - FLIGHT_EASY) * stage.difficulty,
                                   stage.timeLeft * FLIGHT_FRAC);

            /* Schedule the ARRIVALS and derive each spawn from the flight, rather
               than spreading spawns across the whole budget: once the flight is a
               large share of a short screen, a spawn-spread schedule lands every
               object after the clock has already run out. Arrival spacing is
               floored at MIN_GAP because each arrival costs the player a separate
               aimed tap, and spacing that against a shrinking screen alone asked
               for three of them inside 150ms at the floor loop. make-the-gate
               uses 0.18 for a bare re-tap; this is longer because a tap here has
               to be aimed as well as landed.

               THE ARRIVAL WINDOW, and why this is computed rather than walked
               (D1, 2026-09-02). This loop used to start at `flightT + gap` and
               step forward until it ran past `lastArrive`, dropping every
               remaining object on the stated grounds that an object which cannot
               reach the core is a distraction rather than a threat. That is sound
               about ONE object. Measured over 200 seeds per loop, it was doing it
               to six of seven: the screen asked for 7 and created 1 from loop 7,
               and it opened on an EMPTY FIELD for 14% to 28% of every screen
               because the first arrival was a whole `gap` later than it needed to
               be. Two consequences a player feels: a `survive` screen that shows
               nothing for its first fifth reads as broken before it reads as
               hard, and the load it demands FELL from 1.50 aimed taps per second
               at loop 5 to 0.71 at loop 6, so the screen got easier exactly as
               the gauntlet sped up.

               Both come from truncating a window instead of filling it. The
               earliest an object can possibly arrive is one full flight after
               t = 0; the latest is `lastArrive`. So the window is a known width,
               its capacity at the fairness floor is a division, and the arrivals
               are spread across the whole of it:

                   capacity = floor(window / gap) + 1
                   scheduled = min(wanted, capacity)

               NO TUNING CONSTANT MOVES. This only stops the screen discarding
               slots it already had: 3 objects become 4 at loops 0-2, 4 become 5
               at loops 3-4, 3 become 4 at loop 5, 1 becomes 2 at loop 6, and the
               first object is now on screen from frame one at every loop.

               THE COUNT STILL FALLS AT LOOPS 7-12, and that is forced rather than
               chosen. At the 400ms duration floor the window is 0.072s wide and
               MIN_GAP is 0.3s, so the screen holds exactly ONE arrival however the
               flight is capped - even a zero-length flight only reaches two. Seven
               aimed taps in 400ms is not a difficulty setting, it is a target that
               cannot be operated, which is the same class of defect MIN_GAP and
               SHIELD_T both exist to prevent. So `count` is a DESIRE that the
               window clamps, the clamp is stated here rather than left to look like
               a bug, and the ramp past loop 6 is carried by the two dimensions that
               can still move: the deflect radius tightens 50px to 28px and the
               flight shortens 1.6s to 0.248s, so objects cross about 6x faster. */
            var lastArrive = stage.timeLeft - ARRIVE_TAIL;
            var gap = Math.max(MIN_GAP, stage.timeLeft / (count + 1));
            var arriveWindow = lastArrive - flightT;
            var capacity = arriveWindow >= 0 ? Math.floor(arriveWindow / gap + 1e-9) + 1 : 0;
            var n = Math.min(count, capacity);
            /* Even spacing across the whole span, with the first object at the
               earliest arrival the flight allows, so the field is never empty at
               t = 0 and the last object still arrives at lastArrive.

               A LONE ARRIVAL IS THE EXCEPTION, and it is a fairness rule rather
               than a rhythm one (measured 2026-09-02). Reaction time from the
               screen's start IS the arrival time, and dead air is the arrival time
               minus the flight, so the two move together and cannot both be
               minimised: the only freedom is where the arrival sits. With two or
               more arrivals the earliest slot costs nothing, because a later
               object still occupies the tail of the screen. With exactly ONE it
               costs everything, and placing it early measured as a real
               regression: at the 400ms floor the single object arrived at 0.248s
               instead of 0.320s, which is inside a 250ms reaction time, and the
               latency sweep went from 0.0% to 100.0% unwinnable at loops 8 and 12
               on the `predict` arm - the UPPER bound on a person, so that is not a
               pessimistic reading. So a lone arrival goes as late as the span
               allows. The cost is 72ms of empty field at the floor and 224ms at
               loop 7, which is 4 and 13 frames: the opening this fix exists to
               remove was a FULL SECOND at loop 0, and an unwinnable screen is a
               worse defect than four frames of quiet. */
            var step = n > 1 ? arriveWindow / (n - 1) : 0;
            var first = n > 1 ? flightT : lastArrive;
            /* Jitter so the rhythm is not a metronome, bounded at half the slack
               above MIN_GAP so the fairness floor survives it: two neighbours can
               close on each other by at most (step - MIN_GAP), leaving MIN_GAP. */
            var jitter = Math.max(0, (step - MIN_GAP) / 2);

            var objects = [];
            for (var i = 0; i < n; i++) {
                /* Random point on the rectangle's own perimeter, so objects read
                   as arriving from off-screen rather than from a fixed side. */
                var side = Math.floor(stage.rand() * 4);
                var sx, sy;
                if (side === 0) { sx = 0; sy = stage.rand() * stage.h; }
                else if (side === 1) { sx = stage.w; sy = stage.rand() * stage.h; }
                else if (side === 2) { sx = stage.rand() * stage.w; sy = 0; }
                else { sx = stage.rand() * stage.w; sy = stage.h; }

                /* Clamped to the window, so a jittered first arrival can never
                   ask for a negative spawn time and the last can never land
                   after the clock. */
                var arriveT = first + step * i + (stage.rand() * 2 - 1) * jitter;
                if (arriveT < flightT) arriveT = flightT;
                if (arriveT > lastArrive) arriveT = lastArrive;

                objects.push({
                    sx: sx, sy: sy,
                    spawnT: arriveT - flightT,
                    deflected: false,
                    deflectT: 0,
                    deflectX: 0, deflectY: 0
                });
            }

            return {
                objects: objects,
                flightT: flightT,
                deflectR: deflectR,
                hitPulse: 0,
                hitX: 0, hitY: 0,
                shieldT: 0,            // seconds of life left on the thrown shield
                shieldX: 0, shieldY: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;
            var cx = stage.w / 2;
            var cy = stage.h / 2;

            if (m.hitPulse > 0) m.hitPulse = Math.max(0, m.hitPulse - dt * 4);

            /* THE SHIELD RESOLVES BEFORE THE LOSS LOOP, and the order is the fix
               (2026-09-02). It used to run after, so the frame an object reached
               the core was a frame nothing could save: measured, a tap on the
               arrival frame at the object's exact position gave verdict 'lose' and
               0 deflected, while the same tap one frame (16.7ms) earlier deflected
               and the screen survived. One frame is narrow, but it is precisely
               the frame a player reacts on, and worse, a shield ALREADY THROWN was
               not consulted either, because the whole block sat after the
               `return 'lose'` - so a player who had correctly covered the core in
               advance still lost to an object crossing it on that frame. Resolved
               first, an arriving object is still un-deflected when the shield is
               tested, can be deflected, and the loss loop then skips it on its
               existing `if (o.deflected) continue`.

               This is the ONLY part of the 2026-09-02 legibility pass that is not
               draw-only, so it is not claimed to be census-neutral: it is measured
               against gates-baseline.txt and what moved is reported. */

            /* tapped is a one-frame edge, so it ARMS the shield rather than being
               the only frame that can deflect. See the SHIELD_T note above. The
               shield is pinned at the tap point for its whole life. */
            if (input.tapped) {
                m.shieldT = SHIELD_T;
                m.shieldX = input.tapX;
                m.shieldY = input.tapY;
            }

            /* Resolve while the shield is live, including the frame it was thrown,
               so a tap that already lands on an object behaves exactly as before. */
            if (m.shieldT > 0) {
                var best = -1;
                var bestDist = m.deflectR;
                for (var j = 0; j < m.objects.length; j++) {
                    var ob = m.objects[j];
                    if (ob.deflected || stage.t < ob.spawnT) continue;
                    var p = Math.min(1, (stage.t - ob.spawnT) / m.flightT);
                    var ox = ob.sx + (cx - ob.sx) * p;
                    var oy = ob.sy + (cy - ob.sy) * p;
                    var d = Math.sqrt((ox - m.shieldX) * (ox - m.shieldX) + (oy - m.shieldY) * (oy - m.shieldY));
                    if (d <= bestDist) {
                        bestDist = d;
                        best = j;
                    }
                }
                m.shieldT = Math.max(0, m.shieldT - dt);
                if (best >= 0) {
                    var hit = m.objects[best];
                    var hp = Math.min(1, (stage.t - hit.spawnT) / m.flightT);
                    hit.deflected = true;
                    hit.deflectT = stage.t;
                    hit.deflectX = hit.sx + (cx - hit.sx) * hp;
                    hit.deflectY = hit.sy + (cy - hit.sy) * hp;
                    stage.flash(0.4);
                    m.hitPulse = 1;
                    m.hitX = hit.deflectX;
                    m.hitY = hit.deflectY;
                }
            }

            /* Advance every in-flight object; the first one to complete its
               flight undeflected ends the screen. */
            for (var i = 0; i < m.objects.length; i++) {
                var o = m.objects[i];
                if (o.deflected || stage.t < o.spawnT) continue;

                var progress = (stage.t - o.spawnT) / m.flightT;
                if (progress >= 1) {
                    stage.shake(6);
                    /* Mark the breach where it happened. Every DEFLECTED object
                       already gets a precise two-ring marker at its impact point
                       (see the hitPulse block below), and the one object that
                       actually ends the screen used to get a camera shake and
                       nothing else: the screen was more informative about the
                       hits that did not matter than about the one that did.
                       The core is the impact point, so the same latched fields
                       and the same draw path cover this with no new state. */
                    m.hitPulse = 1;
                    m.hitX = stage.w / 2;
                    m.hitY = stage.h / 2;
                    return 'lose';
                }
            }

            /* Returning nothing means "still playing". Running the clock out
               resolves as a win here, because goal is 'survive'. */
        },

        draw: function (stage) {
            var m = stage.mem;
            var cx = stage.w / 2;
            var cy = stage.h / 2;

            /* Core: a plain rounded square, never a ringed circle. A distinct
               class of object from the incoming ones, so it gets the second
               accent role. */
            stage.roundRect(cx - CORE_SIZE / 2, cy - CORE_SIZE / 2, CORE_SIZE, CORE_SIZE, 8, 'accent2');

            /* THE SHIELD, drawn where the next tap will land, on BOTH control
               schemes: harness.js:685 turns a keyboard press into
               ((axis + 1) / 2 * w, (axisY + 1) / 2 * h), and axisFromEvent sets
               both axes from every pointermove as well as every press, so this
               one formula is the pointer position and the keyboard aim at once.
               Deliberately NOT wrapped in j(): where the player is aiming is
               information, and only kinetics go through j(). Drawn UNDER the
               objects, so the thing being aimed at is never hidden by the thing
               aiming at it. Its radius is a fixed 20 aiming and 24 thrown against
               a real deflect radius of 50 down to 28, so it understates the
               tolerance at every difficulty rather than promising one. */
            /* While a shield is LIVE it is drawn where it was thrown, SOLID and
               fading over its life; the aim is the same motifs HOLLOW and smaller.
               Two shields on screen would be a lie about where the tolerance is,
               and drawing exactly one either way keeps the flashing-area budget
               where it was measured. An invisible 0.18s hitbox would be the worse
               defect: the player has to be able to see that a thrown shield is
               still holding - and, per the drawShield note, that a tap happened at
               all when it hit nothing. */
            var input = stage.input;
            if (m.shieldT > 0) {
                drawShield(stage, m.shieldX, m.shieldY, SHIELD_R, m.shieldT / SHIELD_T, true);
            } else {
                drawShield(stage,
                           (input.axis + 1) / 2 * stage.w,
                           (input.axisY + 1) / 2 * stage.h,
                           AIM_R, 1, false);
            }

            for (var i = 0; i < m.objects.length; i++) {
                var o = m.objects[i];

                if (o.deflected) {
                    /* Recoil away from the core and fade out at the point of
                       deflection; still the same class of object as in flight. */
                    var rp = Math.min(1, (stage.t - o.deflectT) / RECOIL_T);
                    if (rp >= 1) continue;
                    var dx = o.deflectX - cx;
                    var dy = o.deflectY - cy;
                    var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                    var rx = o.deflectX + (dx / len) * rp * 30;
                    var ry = o.deflectY + (dy / len) * rp * 30;
                    stage.circle(rx, ry, OBJ_R * (1 - rp * 0.5), 'accent', { alpha: 1 - rp });
                    continue;
                }

                if (stage.t < o.spawnT) continue;
                var p = Math.min(1, (stage.t - o.spawnT) / m.flightT);
                var ox = o.sx + (cx - o.sx) * p;
                var oy = o.sy + (cy - o.sy) * p;
                stage.circle(ox, oy, OBJ_R, 'accent');
            }

            if (m.hitPulse > 0) {
                var pr = 16 + (1 - m.hitPulse) * 22;
                stage.circle(m.hitX, m.hitY, pr, 'ink',
                             { stroke: true, width: 3, alpha: m.hitPulse * 0.6 });
                /* A second, inner ring in the shield's own red, so a deflect
                   reads as the shield having done it rather than as a generic
                   ping. Driven by the same latched m.hitPulse the outer ring
                   already uses, so it adds no state and no flash source. */
                stage.circle(m.hitX, m.hitY, pr * 0.62, 'accent',
                             { stroke: true, width: 2, alpha: m.hitPulse * 0.5 });
            }

            var bob = stage.j(Math.sin(stage.t * 6) * 2);
            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60 + bob,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
