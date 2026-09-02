/**
 * MULTIPLEX microgame - DIG.
 *
 * Descend a single shaft, steering on one axis to dodge a rock, then line up
 * with the loot and be holding when you reach it to grab it and get out.
 *
 * Styled after Fantastic Mr Fox (2009): the digger is the fox in the corduroy
 * suit, the rock is a tree root, the loot is a cider jug, and the shaft is a
 * cutaway burrow. Design record and area derivation: the internal art direction
 * for compact and dig.
 *
 * DRAW-ONLY. The torso circle is drawn at exactly DIGGER_R + (held ? 3 : 0), so
 * the thing on screen still IS the hitbox; no constant, init, update or win
 * test changed, which is why the census and the determinism digests are
 * unmoved.
 */
(function () {
    'use strict';

    var SURFACE_Y = 40;
    var ROCK_Y = 250;              // dodge checkpoint, in stage coords
    var LOOT_Y = 460;              // grab checkpoint
    var MARGIN = 30;
    var DIGGER_R = 14;

    var ROCK_W_EASY = 70;
    var ROCK_W_HARD = 130;         // wider rock, harder to dodge around
    var LOOT_W_EASY = 90;
    var LOOT_W_HARD = 40;          // narrower loot, harder to line up
    var FALL_FRAC_EASY = 0.85;     // descent duration as a fraction of the screen's own time budget
    var FALL_FRAC_HARD = 0.45;

    /* ---- Art only. Nothing below this line is read by init or update. ----
       The area bound that shaped this (bright drawn area under ~16,500 px2, at
       the same 25%-of-field threshold applied to surfaces) is derived in the
       internal art direction, section 3. On this screen `lift` composites over
       the #3A2418 surface to a warm tan-brown, which is why the suit is `lift`
       and not a bright fill: it is free AND it is the right colour. The four
       vertical wale lines in `deep` across it are the corduroy, and they are the
       single detail that names the film. Also free, because they subtract.

       No new colour. `accent2` #C9622A is already fox orange and `accent`
       #8A9440 already reads as cider, so nothing needs registering in TINTS.
       The rock moves from `accent2` to `dim` precisely because the fox now needs
       the orange, and a root in dull grey-brown is what belongs in a burrow
       cross-section anyway. Its two state-encoding alphas are unchanged. */
    var HEAD_DY = -17;             // head centre, relative to the torso centre
    var HEAD_R = 9;

    function drawFox(stage, x, y, r, held) {
        var i, hx = x, hy = y + HEAD_DY;

        /* The stop-motion "boil": the animators left the fur rippling frame to
           frame and it is the film's most distinctive texture. Three states at
           12 per second, one pixel of travel, through j() so reduced motion
           gets a flat, still coat rather than a jitter. */
        var boil = stage.j(Math.floor(stage.t * 12) % 3 - 1);

        /* Bushy tail, trailing up and back. */
        stage.circle(x - 14, y - 6 + boil, 8, 'accent2');
        stage.circle(x - 21, y - 13 - boil, 7, 'accent2');
        stage.circle(x - 27, y - 19 + boil, 5.5, 'accent2');
        stage.circle(x - 31, y - 23, 3.5, 'ink');       // the white tip

        /* Forepaws. The grab is a POSE change as well as the shipped 3px of
           radius, so the readout is shape plus size rather than size alone. */
        if (held) {
            stage.circle(x + r - 1, y - 4, 4, 'lift');
            stage.circle(x + r + 4, y + 3, 4, 'lift');
        }

        /* The suit. This circle is the hitbox, at the radius update decided. */
        stage.circle(x, y, r, 'lift');
        for (i = -1; i <= 2; i++) {
            stage.line(x + i * 6 - 3, y - r + 4, x + i * 6 - 3, y + r - 4,
                       'deep', { width: 1.5, alpha: 0.7 });
        }

        /* Head, ears, muzzle, eyes. */
        stage.poly([hx - 8, hy - 4, hx - 3, hy - 15, hx - 1, hy - 3], 'accent2');
        stage.poly([hx + 8, hy - 4, hx + 3, hy - 15, hx + 1, hy - 3], 'accent2');
        stage.circle(hx, hy, HEAD_R, 'accent2');
        stage.poly([hx + 4, hy + 1, hx + 15, hy + 4, hx + 4, hy + 6], 'accent2');
        stage.circle(hx + 15, hy + 4, 1.6, 'deep');
        stage.circle(hx - 3, hy - 2, 1.6, 'ink');
        stage.circle(hx + 4, hy - 2, 1.6, 'ink');
    }

    MULTIPLEX.register({
        slug: 'dig',
        title: 'DIG',
        /* Was 'DODGE, GRAB, OUT': three separate instructions for a three-stage
           sequence, compressed into one banner that is 600ms at loop 0 and
           132ms at the floor. The contract asks for two or three words carrying
           the WHOLE instruction, and the dodge is already legible from the
           geometry, so the banner only has to name the part that is not. */
        prompt: 'GRAB AND GO',
        hint: 'Steer left / right, hold to grab',
        goal: 'achieve',

        init: function (stage) {
            var rockW = ROCK_W_EASY + (ROCK_W_HARD - ROCK_W_EASY) * stage.difficulty;
            var lootW = LOOT_W_EASY + (LOOT_W_HARD - LOOT_W_EASY) * stage.difficulty;
            var frac = FALL_FRAC_EASY + (FALL_FRAC_HARD - FALL_FRAC_EASY) * stage.difficulty;
            /* Size the descent against THIS instance's own time budget, same
               technique food-falls uses for its drop: fair at any loop. */
            var fallTime = Math.max(0.25, stage.timeLeft * frac);
            return {
                x: stage.w / 2,
                y: SURFACE_Y,
                fallSpeed: (LOOT_Y - SURFACE_Y) / fallTime,
                rockX: MARGIN + stage.rand() * (stage.w - MARGIN * 2),
                rockW: rockW,
                rockChecked: false,
                lootX: MARGIN + stage.rand() * (stage.w - MARGIN * 2),
                lootW: lootW,
                held: false,
                resultPulse: 0
            };
        },

        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            m.x = (input.axis + 1) / 2 * (stage.w - DIGGER_R * 2) + DIGGER_R;
            m.held = input.held;

            if (m.resultPulse > 0) m.resultPulse = Math.max(0, m.resultPulse - dt * 4);

            var prevY = m.y;
            m.y += m.fallSpeed * dt;

            /* Dodge check: an edge-detected one-shot as the digger crosses the
               rock's depth. Missing the dodge ends the screen immediately. */
            if (!m.rockChecked && prevY < ROCK_Y && m.y >= ROCK_Y) {
                m.rockChecked = true;
                if (Math.abs(m.x - m.rockX) <= m.rockW / 2 + DIGGER_R) {
                    stage.shake(6);
                    m.resultPulse = 1;
                    return 'lose';
                }
            }

            if (m.y >= LOOT_Y) {
                m.y = LOOT_Y;
                var aligned = Math.abs(m.x - m.lootX) <= m.lootW / 2;
                if (aligned && m.held) {
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

            /* Dug shaft, behind everything. */
            stage.rect(0, 0, stage.w, LOOT_Y, 'deep', { alpha: 0.35 });

            /* Earth strata, for the cutaway-burrow read. Low-alpha `lift`, so
               free on the area bound. */
            for (i = 1; i < 6; i++) {
                stage.rect(0, i * 78, stage.w, 5, 'lift', { alpha: 0.22 });
            }

            /* Rock obstacle, now a tree root: dims once passed, purely a readout
               of state already decided in update. Both alphas are the shipped
               ones; only the role changed, from accent2 to dim, because the fox
               needs the orange. */
            stage.roundRect(m.rockX - m.rockW / 2, ROCK_Y - 14, m.rockW, 28, 6, 'dim',
                             { alpha: m.rockChecked ? 0.35 : 0.85 });
            for (i = 0; i < 3; i++) {
                stage.circle(m.rockX - m.rockW / 4 + i * m.rockW / 4, ROCK_Y, 4, 'deep',
                             { alpha: m.rockChecked ? 0.3 : 0.7 });
            }

            /* Loot marker, with a cider jug behind the alignment line: Bean's
               cellar is the film's loot. The shelf bar and the centre line are
               untouched, because they are what the player aims at. */
            stage.roundRect(m.lootX - m.lootW / 2, LOOT_Y - 16, m.lootW, 32, 6, 'accent', { alpha: 0.5 });
            stage.roundRect(m.lootX - 7, LOOT_Y - 9, 14, 20, 4, 'accent');
            stage.rect(m.lootX - 3, LOOT_Y - 14, 6, 6, 'accent');
            stage.line(m.lootX + 7, LOOT_Y - 3, m.lootX + 11, LOOT_Y + 2, 'accent', { width: 3 });
            stage.line(m.lootX, LOOT_Y - 16, m.lootX, LOOT_Y + 16, 'accent', { width: 2 });

            /* Digger. Radius grows while holding: a static readout of current
               input, not a decorative displacement, so it stays outside j(). The
               small bob is decorative and goes through j(). */
            var bob = stage.j(Math.sin(stage.t * 6) * 2);
            drawFox(stage, m.x, m.y + bob, DIGGER_R + (m.held ? 3 : 0), m.held);

            if (m.resultPulse > 0) {
                stage.circle(m.x, m.y, 20 + (1 - m.resultPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.resultPulse * 0.6 });
            }

            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60, { size: 22, role: 'ink', display: true });
        }
    });
})();
