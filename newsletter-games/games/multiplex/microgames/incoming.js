/**
 * MULTIPLEX microgame - ASSEMBLE.
 *
 * Objects spawn at random points around the edge of the screen and fly
 * straight toward a fixed core in the centre. Tap near an in-flight object to
 * deflect it before it arrives. One that completes its flight undeflected
 * ends the screen. Survive the clock with nothing getting through and the
 * screen resolves as a win.
 *
 * THEMING (2026-08-28, ART2). The deflector the player aims is drawn as a
 * circular star shield with concentric rings. That is cosmetic and DRAW-ONLY:
 * no tuning constant, no win or lose condition and no line of update changed,
 * which is why the headless census comes out byte-identical. Rationale, the
 * authorisation it rests on and the measured colour figures: the ART2 lane record.
 */
(function () {
    'use strict';

    var CORE_SIZE = 44;            // width/height of the core square
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
       move a contrast or luminance figure. Draw-time only. */
    function drawShield(stage, cx, cy, r, alpha) {
        var o = { alpha: alpha };
        stage.circle(cx, cy, r, 'accent', o);
        stage.circle(cx, cy, r * 0.83, 'accent2', o);
        stage.circle(cx, cy, r * 0.66, 'accent', o);
        stage.circle(cx, cy, r * 0.49, 'deep', o);
        stage.poly(starPoints(cx, cy, r * 0.46, r * 0.19), 'ink', o);
        /* A pale rim, so an incoming object crossing the shield never merges
           into its red outer ring at the moment it matters most. */
        stage.circle(cx, cy, r, 'accent2', { stroke: true, width: 1.5, alpha: alpha });
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
               to be aimed as well as landed. Objects that would arrive after the
               clock are not scheduled at all: an object that cannot reach the
               core is not a threat, just a distraction the player must ignore. */
            var lastArrive = stage.timeLeft - ARRIVE_TAIL;
            var gap = Math.max(MIN_GAP, stage.timeLeft / (count + 1));
            var arriveT = Math.min(flightT + gap, lastArrive);

            var objects = [];
            for (var i = 0; i < count && arriveT <= lastArrive; i++) {
                /* Random point on the rectangle's own perimeter, so objects read
                   as arriving from off-screen rather than from a fixed side. */
                var side = Math.floor(stage.rand() * 4);
                var sx, sy;
                if (side === 0) { sx = 0; sy = stage.rand() * stage.h; }
                else if (side === 1) { sx = stage.w; sy = stage.rand() * stage.h; }
                else if (side === 2) { sx = stage.rand() * stage.w; sy = 0; }
                else { sx = stage.rand() * stage.w; sy = stage.h; }

                objects.push({
                    sx: sx, sy: sy,
                    spawnT: arriveT - flightT,
                    deflected: false,
                    deflectT: 0,
                    deflectX: 0, deflectY: 0
                });

                /* Jittered so the rhythm is not a metronome, never below 0.85 of
                   the gap, so the fairness floor above survives the jitter. */
                arriveT += gap * (0.85 + stage.rand() * 0.3);
            }

            return {
                objects: objects,
                flightT: flightT,
                deflectR: deflectR,
                hitPulse: 0,
                hitX: 0, hitY: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;
            var cx = stage.w / 2;
            var cy = stage.h / 2;

            if (m.hitPulse > 0) m.hitPulse = Math.max(0, m.hitPulse - dt * 4);

            /* Advance every in-flight object; the first one to complete its
               flight undeflected ends the screen. */
            for (var i = 0; i < m.objects.length; i++) {
                var o = m.objects[i];
                if (o.deflected || stage.t < o.spawnT) continue;

                var progress = (stage.t - o.spawnT) / m.flightT;
                if (progress >= 1) {
                    stage.shake(6);
                    return 'lose';
                }
            }

            /* tapped is a one-frame edge. Resolve the nearest in-flight,
               undeflected object within the deflect radius of the tap. */
            if (input.tapped) {
                var best = -1;
                var bestDist = m.deflectR;
                for (var j = 0; j < m.objects.length; j++) {
                    var ob = m.objects[j];
                    if (ob.deflected || stage.t < ob.spawnT) continue;
                    var p = Math.min(1, (stage.t - ob.spawnT) / m.flightT);
                    var ox = ob.sx + (cx - ob.sx) * p;
                    var oy = ob.sy + (cy - ob.sy) * p;
                    var d = Math.sqrt((ox - input.tapX) * (ox - input.tapX) + (oy - input.tapY) * (oy - input.tapY));
                    if (d <= bestDist) {
                        bestDist = d;
                        best = j;
                    }
                }
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
               aiming at it. Its radius is a fixed 24 against a real deflect
               radius of 50 down to 28, so it understates the tolerance at every
               difficulty rather than promising one. */
            var input = stage.input;
            drawShield(stage,
                       (input.axis + 1) / 2 * stage.w,
                       (input.axisY + 1) / 2 * stage.h,
                       SHIELD_R, 1);

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
