/**
 * MULTIPLEX reference microgame - "MARK".
 *
 * This is the worked example for MICROGAME-CONTRACT.md. Copy this file, rename
 * it, and replace the three lifecycle bodies. It is deliberately a dull game:
 * everything interesting about it is the CONTRACT, not the design.
 *
 * MARK: a target sits somewhere along the bar. Steer the marker over it and
 * press. Steer with drag / mouse / arrow keys, press with tap / click / SPACE.
 *
 * It is registered under the slug "_reference", which is not in the gauntlet
 * order, so it never appears in a real round. Play it with:
 *
 *     index.html?only=_reference
 *
 * Every rule this file follows, and why, is in the contract. The five that bite
 * hardest:
 *
 *   1. ALL mutable state lives in the object init() returns, reachable as
 *      stage.mem. There is no module-level `var` holding game state, because a
 *      screen is registered once and replayed dozens of times per session and
 *      leftover state would only misbehave from loop 2 onward.
 *   2. No colour hex anywhere. Colours are named ROLES and the harness resolves
 *      them from the per-screen tint, which carries verified contrast figures.
 *   3. No clock, no randomness, no timers of its own: stage.t, stage.timeLeft
 *      and stage.rand() only. That is what lets the whole gauntlet be stepped
 *      headlessly and a failure be replayed exactly.
 *   4. update() RETURNS the verdict. It never calls into the harness to end a
 *      screen, so a double verdict is not expressible.
 *   5. Flashes are requested, never painted: stage.flash() goes through the one
 *      shared photosensitivity budget that also pays for the transitions.
 */
(function () {
    'use strict';

    /* Module-level CONSTANTS are fine, and are the right home for tuning that
       belongs to this screen rather than to the gauntlet. Module-level mutable
       state is not: it would survive into the next replay. */
    var BAR_Y = 300;              // the track, in stage coords (0..551)
    var MARKER_W = 46;
    var TARGET_W_EASY = 74;
    var TARGET_W_HARD = 30;
    var MARGIN = 30;

    MULTIPLEX.register({
        /* ---------- identity ---------- */
        slug: '_reference',
        title: 'MARK',                       // shown in the chrome band all screen
        prompt: 'LINE IT UP',                // the big verb, first third of the screen
        hint: 'Steer left / right, then press',

        /* 'achieve' loses on timeout, 'survive' wins on timeout. Declaring it
           here means no screen has to special-case its own clock. */
        goal: 'achieve',

        /* ---------- lifecycle ---------- */

        /**
         * Called once per screen instance, before the first update. Return the
         * screen's entire mutable state. stage.difficulty (0..1) and
         * stage.rand() are both already valid here.
         */
        init: function (stage) {
            /* The only place difficulty is read: the band narrows as the loops
               climb. Every screen scales itself this way rather than the harness
               guessing what "harder" means for nine different verbs. */
            var w = TARGET_W_EASY + (TARGET_W_HARD - TARGET_W_EASY) * stage.difficulty;
            return {
                targetX: MARGIN + stage.rand() * (stage.w - MARGIN * 2),
                targetW: w,
                markerX: stage.w / 2,
                pressed: false,
                hitPulse: 0
            };
        },

        /**
         * Called every frame while the screen is live. dt is seconds, already
         * clamped by the engine. Return 'win', 'lose', or nothing to carry on.
         * The harness ignores anything returned after the first verdict.
         */
        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            /* stage.input.axis is an absolute -1..+1 position that both the
               pointer and the arrow keys drive, so the control feels identical
               on a phone and on a desktop and this screen never asks which. */
            m.markerX = (input.axis + 1) / 2 * (stage.w - MARKER_W) + MARKER_W / 2;

            if (m.hitPulse > 0) m.hitPulse = Math.max(0, m.hitPulse - dt * 4);

            /* input.tapped is a one-frame edge, true only on the frame the
               press landed. No listeners, no callbacks, nothing to clean up. */
            if (input.tapped && !m.pressed) {
                m.pressed = true;
                if (Math.abs(m.markerX - m.targetX) <= m.targetW / 2) {
                    stage.flash(0.7);        // requested, budgeted, painted by the harness
                    return 'win';
                }
                stage.shake(6);              // already zeroed under reduced motion
                m.hitPulse = 1;              // latched here, read in draw
                return 'lose';
            }

            /* Returning nothing means "still playing". Running the clock out
               resolves as a loss here, because goal is 'achieve'. */
        },

        /**
         * Called every frame, after update. Draw only; never mutate state here,
         * because a balance run steps update() without ever calling draw().
         *
         * The surface is already painted, the coordinate space is already
         * translated so (0,0) is the top-left of this screen's own 376 x 552
         * rectangle, and everything is clipped to it. Nothing drawn here can
         * reach the HUD, the film-strip gutters or the footer.
         */
        draw: function (stage) {
            var m = stage.mem;

            /* Track. Colour roles only: 'deep' and 'accent' are derived from this
               screen's own tint, so the whole screen stays inside its verified
               contrast figures without naming a single hex. */
            stage.rect(MARGIN, BAR_Y - 3, stage.w - MARGIN * 2, 6, 'deep');

            /* Target zone. */
            stage.roundRect(m.targetX - m.targetW / 2, BAR_Y - 26, m.targetW, 52, 4, 'accent', { alpha: 0.28 });
            stage.line(m.targetX, BAR_Y - 26, m.targetX, BAR_Y + 26, 'accent', { width: 2 });

            /* Marker. j() is the one reduced-motion multiplier: under reduced
               motion it returns 0, so the wobble vanishes and the position,
               which is the information, does not. */
            var lift = stage.j(Math.sin(stage.t * 6) * 3);
            stage.roundRect(m.markerX - MARKER_W / 2, BAR_Y - 12 + lift, MARKER_W, 24, 4, 'ink');

            if (m.hitPulse > 0) {
                stage.circle(m.markerX, BAR_Y, 20 + (1 - m.hitPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.hitPulse * 0.6 });
            }

            /* Text is a facade call too: no font control, no image loading, so
               there is no route through this interface to render an asset. */
            stage.text('PRESS INSIDE THE BAND', stage.w / 2, BAR_Y + 90, { size: 13, role: 'dim' });
            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60, { size: 26, role: 'ink', display: true });
        }
    });
})();
