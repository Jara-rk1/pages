/**
 * MULTIPLEX microgame - SUNNIES ON.
 *
 * A fixed avatar faces a line of incoming shots crossing the play area at a
 * steady eye-line height. Tap to lean, ducking the avatar below that line for
 * a short window. A shot that arrives while leaning passes clean; one that
 * arrives while not leaning ends the screen. Survive every scheduled shot and
 * the clock, and the run is won on timeout.
 */
(function () {
    'use strict';

    var LEAN_WINDOW = 0.45;   // seconds a lean lasts after a tap
    var FLIGHT_EASY = 1.1;    // seconds a shot takes to cross from the edge to the avatar
    var FLIGHT_HARD = 0.55;
    var FLIGHT_FRAC = 0.62;   // ceiling on that, as a fraction of the screen's own time budget
    var GAP_EASY = 1.3;       // average seconds between shot spawns
    var GAP_HARD = 0.65;
    var FIRST_DELAY = 0.5;    // seconds before the first shot spawns
    var SAFETY_MARGIN = 0.35; // seconds of clear air held back before the deadline
    var AVATAR_Y = 210;       // fixed eye-line, in stage coords
    var DUCK_OFFSET = 60;
    var LENS_W = 34;
    var LENS_H = 22;
    var LENS_GAP = 10;
    var SHOT_W = 30;
    var SHOT_H = 10;

    MULTIPLEX.register({
        slug: 'sunnies-on',
        title: 'SUNNIES ON',
        prompt: 'LEAN OUT',
        hint: 'Tap to lean',
        goal: 'survive',

        init: function (stage) {
            /* Only place difficulty is read: shots arrive faster and closer
               together as the loops climb. */
            /* The flight is capped against THIS instance's own time budget as
               well as difficulty. Difficulty saturates at loop 6 but the screen
               keeps shortening to the floor, and a flight longer than the screen
               means no shot can land at all: the clock runs out, and because the
               goal is 'survive' the harness hands over a win for zero input.
               Capping here fixes both schedule paths at once, since the fallback
               below takes its resolveT straight from flightTime. */
            var flightTime = Math.min(FLIGHT_EASY + (FLIGHT_HARD - FLIGHT_EASY) * stage.difficulty,
                                      stage.timeLeft * FLIGHT_FRAC);
            var gap = GAP_EASY + (GAP_HARD - GAP_EASY) * stage.difficulty;

            /* Build the whole spawn schedule now, from this instance's own time
               budget, holding a safety margin clear of the deadline so a shot
               always gets a real chance to resolve rather than being bailed out
               by the clock. stage.rand() is only ever called here, never per
               frame, so the random stream length never depends on frame count. */
            var deadline = Math.max(flightTime + 0.1, stage.timeLeft - SAFETY_MARGIN);
            var shots = [];
            var spawnT = FIRST_DELAY;
            while (spawnT + flightTime <= deadline) {
                shots.push({
                    spawnT: spawnT,
                    resolveT: spawnT + flightTime,
                    side: stage.rand() < 0.5 ? -1 : 1,
                    resolved: false
                });
                spawnT += gap * (0.8 + stage.rand() * 0.4);
            }
            if (shots.length === 0) {
                /* A very short late-loop screen still gets one shot to survive,
                   and the cap above is what makes that true: resolveT here is
                   flightTime, now at most FLIGHT_FRAC of the screen's own
                   budget, so this shot always lands before the clock. */
                shots.push({ spawnT: 0, resolveT: flightTime, side: stage.rand() < 0.5 ? -1 : 1, resolved: false });
            }

            return {
                avatarX: stage.w / 2,
                leanT: 0,
                shots: shots,
                flightTime: flightTime,
                dodged: 0,
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            /* input.tapped is a one-frame edge; latch a lean window that ticks
               down by dt, never a timer of our own. */
            if (input.tapped) m.leanT = LEAN_WINDOW;
            if (m.leanT > 0) m.leanT = Math.max(0, m.leanT - dt);

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            for (var i = 0; i < m.shots.length; i++) {
                var s = m.shots[i];
                if (s.resolved || stage.t < s.resolveT) continue;
                s.resolved = true;

                if (m.leanT <= 0) {
                    stage.shake(6);
                    m.resultPulse = 1;
                    return 'lose';
                }

                m.dodged += 1;
                if (m.dodged === m.shots.length) {
                    stage.flash(0.6);    // the decisive moment: every scheduled shot cleared
                }
            }

            /* Returning nothing means "still playing". Running the clock out
               resolves as a win here, because goal is 'survive': the harness
               handles that, this screen never writes its own win branch. */
        },

        draw: function (stage) {
            var m = stage.mem;
            var x = m.avatarX;
            var duck = m.leanT > 0;

            /* Cosmetic idle bob only: removing it loses no information the
               player needs, so it goes through stage.j(). The duck offset
               itself IS the dodge information and is never wrapped. */
            var bob = stage.j(Math.sin(stage.t * 4) * 2);
            var lensY = AVATAR_Y + (duck ? DUCK_OFFSET : 0) + bob;

            /* Incoming shots, travelling from an edge toward the avatar along
               the fixed eye-line. A ducked avatar sits below this line. */
            for (var i = 0; i < m.shots.length; i++) {
                var s = m.shots[i];
                var progress = (stage.t - s.spawnT) / m.flightTime;
                if (progress < 0 || progress >= 1) continue;
                var startX = s.side < 0 ? -SHOT_W : stage.w + SHOT_W;
                var sx = startX + (x - startX) * progress;
                stage.roundRect(sx - SHOT_W / 2, AVATAR_Y - SHOT_H / 2, SHOT_W, SHOT_H, SHOT_H / 2,
                                 'accent', { alpha: 0.85 });
            }

            /* Avatar: a generic pair of sunglasses lenses and a bridge. */
            stage.roundRect(x - LENS_GAP / 2 - LENS_W, lensY - LENS_H / 2, LENS_W, LENS_H, 4, 'ink');
            stage.roundRect(x + LENS_GAP / 2, lensY - LENS_H / 2, LENS_W, LENS_H, 4, 'ink');
            stage.line(x - LENS_GAP / 2, lensY, x + LENS_GAP / 2, lensY, 'ink', { width: 3 });

            if (m.resultPulse > 0) {
                stage.circle(x, AVATAR_Y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text('TAP TO LEAN', x, AVATAR_Y + 90, { size: 13, role: 'dim' });
            stage.text(stage.timeLeft.toFixed(1), x, 60, { size: 26, role: 'ink', display: true });
        }
    });
})();
