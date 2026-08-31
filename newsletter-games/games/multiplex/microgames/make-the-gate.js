/**
 * MULTIPLEX microgame - MAKE THE GATE.
 *
 * Tap repeatedly to dash a runner along a track before the gate closes.
 */
(function () {
    'use strict';

    var TRACK_Y = 300;
    var TRACK_X0 = 30;
    var DOOR_W = 40;
    var RUNNER_HALF = 10;          // half the suitcase body
    var FLOOR_Y = TRACK_Y + 12;    // terminal floor, and where the shutter lands
    var LIP_H = 6;

    /* The shutter panel is deliberately below the flash threshold. Measured on this
       screen's surface (#47263A): accent2 at full alpha composites to luminance
       0.239 against a 0.105 threshold, so a 40 x 552 door counted as 10.6% of the
       play rect on its own and the whole frame measured 10.92% against the 7.95%
       area bound every other screen is held to. It went unseen because the
       14-shot sweep photographs this screen at t = 0.50, when the door is a stub,
       and the door is at its TALLEST on the frame the screen cuts away on - which
       is precisely the frame the bound is about. At 0.35 the panel composites to
       0.090 and is free; the read is carried by the leading edge instead, the same
       trade compact.js makes for its body outline. */
    var DOOR_ALPHA = 0.35;

    var NEEDED_EASY = 3;
    var NEEDED_HARD = 7;
    var MIN_TAP_INTERVAL = 0.18;   // a realistic sustained tap rate, used only as a fairness floor

    /* Seconds a player spends reading the screen before the first tap can land.
       maxByTime used to spend the WHOLE budget on taps, which silently assumed a
       player who starts tapping on frame one. Measured against a 250ms reaction,
       that lost 86 to 92% of seeds from loop 8 and 37% at loop 7: at the 400ms
       floor it asked for two taps 180ms apart inside 400ms, so the first had to
       land at 40ms. Same figure and same argument as compact.js's constant of the
       same name; the two screens cannot share a module, so they share a name. */
    var REACTION_ALLOWANCE = 0.25;

    MULTIPLEX.register({
        slug: 'make-the-gate',
        title: 'MAKE THE GATE',
        prompt: 'TAP TO DASH',
        hint: 'Tap / press, repeatedly',
        goal: 'achieve',

        init: function (stage) {
            var baseNeeded = Math.round(NEEDED_EASY + (NEEDED_HARD - NEEDED_EASY) * stage.difficulty);
            /* However hard the difficulty wants to make it, never demand more taps
               than are physically possible in this instance's own time budget -
               the same principle as sizing a fall against stage.timeLeft, applied
               to a tap count instead of a duration. The budget a PLAYER has is the
               screen minus the time they spend realising it is there. */
            var maxByTime = Math.max(1, Math.floor(
                (stage.timeLeft - REACTION_ALLOWANCE) / MIN_TAP_INTERVAL));
            return {
                taps: 0,
                needed: Math.max(1, Math.min(baseNeeded, maxByTime)),
                tapPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            if (m.tapPulse > 0) m.tapPulse = Math.max(0, m.tapPulse - dt * 5);

            /* tapped is a one-frame edge; every landed press counts once. */
            if (input.tapped) {
                m.taps += 1;
                m.tapPulse = 1;
                if (m.taps >= m.needed) {
                    stage.flash(0.7);
                    return 'win';
                }
            }
        },

        draw: function (stage) {
            var m = stage.mem;
            var frac = Math.min(1, m.taps / m.needed);
            var rowY;

            /* THE RUNNER NOW REACHES THE GATE. The track used to stop at a literal
               316 while the door started at stage.w - DOOR_W = 336, so a runner at
               frac = 1 halted 10px short of the door with its own half-width still
               to spare: the premise of the screen was never once satisfied on
               screen, on any loop, including the winning frame (which IS drawn -
               the harness keeps painting the outgoing screen under the wipe until
               the swap). Both ends are derived from the door now, so they cannot
               drift apart again. */
            var doorX = stage.w - DOOR_W;
            var trackX1 = doorX - RUNNER_HALF;      // runner's RIGHT EDGE lands on the door

            /* Track in `lift`, not `deep`. Measured, `lift` composites to 0.082 on
               this surface, under the 0.105 flash threshold, so a track the player
               can actually see is free on the area bound. In `deep` it was 0.019
               against a 0.030 surface and the rendered screen read as empty. */
            stage.line(TRACK_X0, FLOOR_Y, doorX, FLOOR_Y, 'lift');
            stage.rect(TRACK_X0, TRACK_Y - 4, doorX - TRACK_X0, 8, 'lift');
            stage.rect(TRACK_X0, TRACK_Y - 4,
                       (trackX1 - TRACK_X0) * frac + RUNNER_HALF, 8, 'accent');

            /* THE GATE CLOSES DOWNWARD. It used to grow upward out of the floor,
               which reads as a bar filling, not as a gate shutting - and a bar
               filling is the one thing this screen must not look like, because the
               progress fill next to it IS a bar filling and means the opposite.
               Still nothing but a readout of stage.progress, so there is still no
               second clock; it now lands on the terminal floor at progress 1
               instead of covering the whole play area. Stated rather than hidden:
               the shutter reaches the runner's head at progress 0.87, so for the
               last 13% it looks shut while a win is still possible. */
            var doorH = FLOOR_Y * stage.progress;
            /* The backlight is a halo BESIDE the shutter, not a wash under it.
               Measured: with the glow underneath, the 0.35 panel composited to
               0.1124 against the 0.1053 threshold and the whole 40 x 310 panel
               counted as flashing area, which put the frame at 7.05% - inside the
               7.95% bound but on a 1.13x margin, from a rect the player cannot
               even see through the panel on top of it. Off the glow the panel
               composites to 0.0897 and is free. */
            stage.rect(doorX - 10, 0, 10, doorH + 8, 'accent', { alpha: 0.15 });
            stage.rect(doorX, 0, DOOR_W, doorH, 'accent2', { alpha: DOOR_ALPHA });
            for (rowY = doorH - 16; rowY > 6; rowY -= 12) {
                stage.line(doorX + 6, rowY, doorX + DOOR_W - 6, rowY, 'ink', { alpha: 0.25 });
            }
            /* The leading edge is the only full-alpha thing on the door: 240 px2
               against a 16,500 px2 budget, spent where the eye actually goes. */
            if (doorH > LIP_H) {
                stage.rect(doorX, doorH - LIP_H, DOOR_W, LIP_H, 'accent2');
            }

            /* Runner: a rolling suitcase in place of the plain circle, same
               centre and the same j()-wrapped bump on each tap. */
            var bump = stage.j(m.tapPulse * 6);
            var sx = TRACK_X0 + (trackX1 - TRACK_X0) * frac;
            var sy = TRACK_Y - 20 - bump;
            stage.roundRect(sx - 10, sy - 9, 20, 16, 3, 'ink');
            stage.line(sx - 4, sy - 9, sx - 4, sy - 14, 'ink');
            stage.line(sx + 4, sy - 9, sx + 4, sy - 14, 'ink');
            stage.line(sx - 4, sy - 14, sx + 4, sy - 14, 'ink');
            stage.circle(sx - 5, sy + 9, 2.5, 'deep');
            stage.circle(sx + 5, sy + 9, 2.5, 'deep');

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60, { size: 22, role: 'ink', display: true });
        }
    });
})();
