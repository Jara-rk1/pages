# MULTIPLEX microgame contract

**Read this before you write a line. You should not need to open `harness.js`.**

MULTIPLEX is a nine-screen gauntlet. Each screen is a few seconds long, teaches one verb, and
resolves win or lose. The harness (`harness.js`) owns the clock, lives, scoring, the transition,
input normalisation, the flash budget and the reduced-motion gate. **You own one rectangle,
376 x 552 logical pixels, and nothing else.**

Everything the harness gives you arrives on a single `stage` object. Everything you give back is a
return value. There are no callbacks to register, no listeners to attach, no cleanup to remember,
and no way to end a screen except by returning a verdict.

The worked example is `microgames/_reference.js`. It is a complete, playable, conforming screen and
is excerpted in full in section 13 below. Copy it, rename it, replace the three lifecycle bodies.

---

## 1. Where your file goes and how it loads

One screen, one file, at `microgames/<slug>.js`. The file is a single IIFE that calls
`MULTIPLEX.register(...)` at load time.

```js
(function () {
    'use strict';
    /* module-level CONSTANTS only, see section 9.1 */
    MULTIPLEX.register({ /* ... */ });
})();
```

`index.html` loads `harness.js` first, then every microgame, then boots on `DOMContentLoaded`. That
ordering is why `window.MULTIPLEX` already exists when your file runs, and why every screen has
registered before the first frame. Add your `<script>` tag to `index.html` only if it is not
already there; all nine are pre-wired.

**A missing or broken file is not silent.** A slug in the running order with no registration is
reported with `console.error` at start and the gauntlet runs short. A malformed registration throws
at load, naming your slug. Neither fails quietly, which is deliberate.

---

## 2. The registration object

```js
MULTIPLEX.register({
    slug:   'food-falls',        // required, must match your filename and the running order
    title:  'FOOD FALLS',        // required, shown in the chrome band for the whole screen
    prompt: 'CATCH IT',          // required, the big verb over the play area for the first ~600ms
    hint:   'Move left / right', // required, the small control line in the footer
    goal:   'achieve',           // required, exactly 'achieve' or 'survive'
    init:   function (stage) {}, // optional but strongly recommended
    update: function (dt, stage) {}, // required
    draw:   function (stage) {}      // required
});
```

Every one of these is validated at load and throws a named error if wrong: a non-string or empty
`slug` / `title` / `prompt` / `hint`, an `update` or `draw` that is not a function, an `init` that
is present but not a function, a `goal` that is not one of the two literals, or a slug that is
already registered.

### `goal` decides what a timeout means

| `goal` | Clock runs out | Use it when |
|---|---|---|
| `'achieve'` | **lose** | The player has to do something: catch it, land it, make the gate |
| `'survive'` | **win** | The player has to avoid something for the whole screen |

This exists so no screen writes its own timeout branch. Declare it once and the harness resolves
the clock for you.

### Writing `prompt` and `hint`

`prompt` is the whole instruction. It is two or three words, imperative, and it is the only thing
most players will read. `hint` names the control, not the goal. Keep `title` to the stage name
exactly as assigned in section 14.

---

## 3. The lifecycle

Three functions, called in this order, for every instance of your screen.

```
                 init(stage)  ->  returns your state object
                       |
        +--------------+--------------------------------+
        |                                               |
   update(dt, stage)  ->  'win' | 'lose' | undefined     |
        |                                               |
    draw(stage)  ->  nothing                             |
        |                                               |
        +---- every frame until a verdict or the clock --+
```

### `init(stage)` - once, before the first frame

Return an object. That object becomes `stage.mem` for the life of the screen. `stage.rand()`,
`stage.difficulty`, `stage.loop`, `stage.w` and `stage.h` are all already valid here.

```js
init: function (stage) {
    return { x: stage.w / 2, targets: [], fired: false };
}
```

You may instead mutate the empty `stage.mem` the harness hands you, but returning is preferred: it
is the reason a screen never needs module-level mutable state, because there is nowhere for state
to leak to.

### `update(dt, stage)` - every frame while the screen is live

Note the argument order: **`dt` first, `stage` second.** `dt` is elapsed seconds, already clamped
to a 0.1s maximum by the engine, so a tab-out cannot produce a giant step.

Return `'win'` or `'lose'` to end the screen immediately. Return nothing (or anything else) to keep
playing. That is the only way to end a screen. There is no `stage.win()`, and there is nothing to
call into the harness with, so a double verdict is not expressible.

`update` is **not** called during the gap between screens, and not while the game is paused.

### `draw(stage)` - every frame, after update

Draw only. **Never mutate state in `draw`.** A balance run steps `update` thousands of times
without ever calling `draw`, so anything you change here does not exist as far as tuning and
verification are concerned.

Before `draw` is called the harness has already:

- filled your rectangle with your screen's surface colour, so you do not need a background,
- clipped the canvas to your rectangle, so nothing you paint can reach the HUD, the film-strip
  gutters, the chrome band or the footer,
- translated the origin so `(0, 0)` is the top-left of **your** rectangle, and
- applied any screen shake to that translation, so you never see the shake in your own coordinates.

**`draw` can be called before the first `update`.** The incoming screen is initialised mid-way
through the transition and paints, hidden, behind the wipe for a few frames before it goes live. So
`draw` must render a sane frame straight out of `init`, with `stage.t === 0`. Do not assume
`update` has run at least once.

---

## 4. The `stage` object

One object, handed to all three lifecycle functions.

| Property | Type | Meaning |
|---|---|---|
| `stage.w` | number | **376.** Width of your rectangle. Use this, never a literal. |
| `stage.h` | number | **552.** Height of your rectangle. |
| `stage.mem` | object | Your state, the object `init` returned. |
| `stage.t` | number | Seconds since this screen started. Your clock. |
| `stage.timeLeft` | number | Seconds remaining, floored at 0. |
| `stage.progress` | number | 0 at the start, 1 at the deadline. `stage.t` normalised. |
| `stage.difficulty` | number | 0..1. See section 10. |
| `stage.loop` | number | Which pass through the nine, 0-based. |
| `stage.rm` | boolean | True if the player has asked for reduced motion. |
| `stage.input` | object | See section 5. |
| `stage.ctx` | context | Raw 2D context. **Valid only inside `draw`.** See section 8. |
| `stage.j(n)` | function | Returns `n` normally, `0` under reduced motion. See section 7. |
| `stage.rand()` | function | Seeded 0..1. See section 7. |
| `stage.flash(i)` | function | Request a flash. See section 7. |
| `stage.shake(px)` | function | Request a shake. See section 7. |

Plus the drawing facade in section 6.

### Three rules about `stage` itself

1. **`stage` is one shared object, reused by every screen.** Do not stash a reference to it and
   read it later, and do not add properties to it. Treat it as valid only for the duration of the
   call you are in.
2. **Mutate `stage.mem`'s properties, never reassign `stage.mem`.** The harness re-points
   `stage.mem` at your state object every frame, so `stage.mem = {...}` inside `update` is silently
   discarded on the next frame. `stage.mem.x = 4` is correct; `stage.mem = { x: 4 }` is a bug that
   looks like it works for exactly one frame.
3. **`stage.ctx` is `null` outside `draw`.** Calling a drawing method from `update` throws.

---

## 5. Input

All nine verbs read one normalised control state at `stage.input`. There is nothing else. You never
attach a listener, so there is no listener lifecycle to leak between the dozens of replays in a
session.

| Field | Type | Meaning |
|---|---|---|
| `input.axis` | number | **Absolute** position, -1 (left edge) to +1 (right edge). |
| `input.held` | boolean | True while the pointer or the press key is down. |
| `input.holdT` | number | Seconds the current hold has lasted. 0 when not held. |
| `input.tapped` | boolean | **One-frame edge.** True only on the frame a press landed. |
| `input.released` | boolean | **One-frame edge.** True only on the frame a press ended. |
| `input.tapX` | number | Last press x, in your coordinates, 0..`stage.w`. |
| `input.tapY` | number | Last press y, in your coordinates, 0..`stage.h`. |

### `axis` is a position, not a rate

Drag or move the pointer and `axis` is set directly from where it is. Hold an arrow key and `axis`
eases toward the edge at a fixed rate. Both drive the identical variable, so the same code plays
correctly with a thumb and with a keyboard, and your screen never asks which one is in use. Map it
to your own coordinate space yourself:

```js
var x = (input.axis + 1) / 2 * (stage.w - WIDTH) + WIDTH / 2;   // inset by the object's own width
```

### Every screen starts with the press state clear

`held`, `holdT`, `tapped` and `released` are all cleared on your screen's first `update`, so a press
the player never let go of on the previous screen is not your input: `held` stays false until a
press lands inside your screen. `axis` is the exception and deliberately survives the cut, because
it is an absolute position rather than an event and the player is still pointing there. Never treat
`held === true` on frame one as something a screen can arrange.

### The edges are cleared immediately after `update`

`tapped` and `released` are true for exactly one call to `update` and are **always false by the
time `draw` runs.** If you want to draw a press reaction, latch it into `stage.mem` during `update`
and read the latch in `draw`. This is the single most common way to get a press effect that never
appears.

### Controls, both schemes

| Intent | Pointer | Keyboard |
|---|---|---|
| Steer | Drag or move left / right | Left / Right arrow, A / D |
| Press | Tap or click | Space, Enter, Up arrow, W |

A keyboard press reports `tapX` at wherever the player has steered `axis` to, and `tapY` at the
vertical centre, so a tap-position screen is playable without a pointer. Do not build a screen that
needs a press at a specific `tapY`.

### What each screen is expected to read

The union below is what the input state was designed to cover. Staying inside your row is what
keeps the control scheme legible across a nine-screen run.

| Screen | Verb | Reads |
|---|---|---|
| FOOD FALLS | Catch it before it lands | `axis` |
| PIVOT | Rotate to clear the gap | `axis` |
| SUNNIES ON | Lean out of the way | `tapped` |
| NOTHING BUT NET | Time the release | `held` + `holdT` + `released` |
| THE CHASE | Chase a darting target | `axis` |
| INCOMING | Deflect what is incoming | `tapped` + `tapX` / `tapY` |
| DIG | Tunnel, grab, get out | `axis` + `held` |
| MAKE THE GATE | Dash before it closes | `tapped` |
| COMPACT | Crush on the beat | `tapped` |

---

## 6. Drawing

### 6.1 Colour is a role, never a hex

**You may not write a colour value anywhere in your file.** Name a role and the harness resolves it
from your screen's own tint, which carries verified WCAG contrast figures. This is why nine screens
built by three people cannot drift off palette or break contrast.

| Role | What it is | Use it for |
|---|---|---|
| `'surface'` | Your screen's background | Rarely: it is already painted for you |
| `'deep'` | Surface darkened toward film black | Tracks, wells, shadows, recesses |
| `'lift'` | Surface lightened | Raised panels, subtle separation |
| `'accent'` | Your screen's bright accent | The thing the player is aiming at or controlling |
| `'accent2'` | Second accent where the tint has one, otherwise `accent` | A second class of object |
| `'ink'` | Marquee white | Body text, the player's own avatar |
| `'dim'` | Spotlight grey | Secondary and instructional text |

An unknown role logs a warning once and falls back to `ink`, so a typo is visible but not fatal.

Four screens have a real `accent2`: **INCOMING**, **DIG**, **MAKE THE GATE** and **COMPACT**. On the
other five, `accent2` silently returns `accent`, so do not rely on it to distinguish two things on a
screen that does not have it. Check section 14.

Ticket gold and ticket cream are deliberately unreachable from a screen. They belong to the
interface, so the chrome never reads as a tenth screen.

### 6.2 The facade calls

All of these are legal **only inside `draw`**. Coordinates are in your rectangle, `0..376` by
`0..552`.

```js
stage.rect(x, y, w, h, role, opts)
stage.roundRect(x, y, w, h, radius, role, opts)
stage.circle(x, y, r, role, opts)
stage.line(x1, y1, x2, y2, role, opts)
stage.poly(points, role, opts)        // points is a FLAT array [x1,y1,x2,y2,...], auto-closed
stage.text(str, x, y, opts)
```

`opts` is optional everywhere.

| Option | Applies to | Default | Notes |
|---|---|---|---|
| `alpha` | all | `1` | 0..1 |
| `stroke` | shapes | `false`, except `line` where it is `true` | |
| `width` | shapes when stroked | `2` | Line width in px |
| `size` | `text` | `16` | Font size in px |
| `role` | `text` | `'ink'` | Colour role, as above |
| `align` | `text` | `'center'` | Canvas `textAlign` |
| `baseline` | `text` | `'middle'` | Canvas `textBaseline` |
| `display` | `text` | `false` | `true` selects the heavy display face |

Two things to know. `poly` needs at least three points (six numbers) and draws nothing at all below
that, silently. And passing an `opts` object to `line` without an explicit `stroke` leaves it
stroked, which is what you want; passing `{ stroke: false }` to a `line` fills its own path and
draws nothing visible.

`text` has no font control and the facade has no image loading. That is not an oversight: there is
no route through this interface to render an asset or set a typeface, which is what keeps a
trademark out of the build by construction.

---

## 7. Services

### `stage.rand()` -> number, 0..1

Your only source of randomness. Seeded per screen, per loop, so a whole run is reproducible and a
failure can be replayed exactly. See the ban in section 9.2.

### `stage.j(n)` -> number

The one reduced-motion multiplier. Returns `n` normally and `0` when the player has asked for
reduced motion. **Wrap every decorative displacement in it**, and nothing else:

```js
var bob = stage.j(Math.sin(stage.t * 6) * 3);   // wobble vanishes under reduced motion
stage.roundRect(x, y + bob, w, h, 4, 'ink');    // the position, which is the information, does not
```

The test for whether something goes through `j()`: if removing it loses information the player
needs to win, it must **not** be wrapped. If removing it only loses sparkle, it must be.

### `stage.flash(intensity)` -> boolean

Requests a flash from the single global photosensitivity ledger, capped at three per second across
the entire game, transitions included. `intensity` is 0..1 and defaults to 0.8.

You cannot paint a flash. The harness paints it, as a bloom inward from the edges of the play area,
capped at ticket cream, never a full-canvas white-out and never red. Screens do not get their own
allowance, because nine independent 3-per-second budgets is 27 per second.

**Ignore the return value.** It reflects the state of a shared, wall-clock ledger, so branching game
state on it would make your screen non-deterministic and would break the headless balance run. Call
it for the effect and carry on.

Use it sparingly: at most one per screen, on the decisive moment.

### `stage.shake(px)` -> undefined

Requests a screen shake, already zeroed under reduced motion. A few pixels is plenty; 4 to 8 is the
working range. It is applied outside your coordinate space, so your own drawing code never sees it.

---

## 8. The `ctx` escape hatch

`stage.ctx` is the raw canvas 2D context, and it is a supported part of the contract, not a
loophole. Nine verbs need real geometry: rotation, clipping, gradients. A facade that covered all
of it would be larger than the games.

**What you are guaranteed when `draw` is called:**

- the context is already clipped to your 376 x 552 rectangle,
- the origin is already translated to your top-left corner,
- your surface colour is already painted, and
- the whole call is wrapped in the harness's own `save()` / `restore()`, so a state change you
  forget to undo cannot corrupt the chrome.

**What you must still do:**

1. **Balance your own `save()` and `restore()`.** The outer wrapper repairs the harness; it does not
   repair your own nesting.
2. **Do not undo the harness's translate.** No `setTransform`, no `resetTransform`, no negative
   translate to reach outside your rectangle. The clip would stop you anyway; the point is not to
   try.
3. **Use the facade for colour even here.** If you need a fill colour under a raw path, still get it
   from a role. Do not type a hex.
4. **Do not use `ctx.drawImage`, `ctx.font` with a named typeface, or any asset load.** See
   section 9.5.

Typical shape:

```js
draw: function (stage) {
    var c = stage.ctx;
    c.save();
    c.translate(cx, cy);
    c.rotate(stage.mem.angle);
    stage.rect(-w / 2, -h / 2, w, h, 'accent');   // facade calls still work inside your transform
    c.restore();
}
```

---

## 9. The bans

Each of these is grep-checkable and will be checked.

### 9.1 No module-level mutable state

A screen is registered **once** and replayed dozens of times per session: nine screens, N loops,
three attempts. Module-level mutable state survives into the next replay and produces a bug that
only appears from loop 2 onward, which is the hardest class of bug to see in testing.

```js
var score = 0;              // BANNED: survives the replay
var BAR_Y = 300;            // fine: a constant, and the right home for your tuning
```

All mutable state goes in the object `init` returns.

### 9.2 No clock, no randomness, no timers of your own

Banned: `Math.random`, `Date.now`, `performance.now`, `new Date`, `setTimeout`, `setInterval`,
`requestAnimationFrame`.

Use `stage.rand()`, `stage.t`, `stage.timeLeft`, `stage.progress` and `dt` instead. Anything you
would have scheduled with a timer is a countdown you decrement by `dt`:

```js
if (m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);
```

This is what lets the whole gauntlet be stepped headlessly with no animation frame at all, which is
how the balance pass and the verification pass work. A single `Math.random` in an `update` makes a
failure unreproducible.

`Math.sin`, `Math.abs`, `Math.max` and the rest of `Math` are fine. It is only the clock and the
randomness that are out.

### 9.3 No colour values

No hex, no `rgb()`, no `rgba()`, no named CSS colours, anywhere in your file, including comments and
including under the `ctx` escape hatch. Roles only.

### 9.4 No listeners, no globals, no reaching outside

No `addEventListener`, no `document.` or `window.` access, no touching `GameEngine`, no writing to
`MULTIPLEX` beyond your one `register` call, no `localStorage`, no `fetch`. Your screen is a pure
function of `stage` and `dt`.

### 9.5 No names, no assets, no trademarks

This ships publicly. In any file under `games/multiplex/`, including comments:

- **No colleague names, teams, quotes or attributions.** Attribution lives in the newsletter, not in
  the game.
- **No source material named.** Do not name the film, show, studio, character or franchise your
  screen was inspired by, in a comment, a variable name, a string or a filename.
- **No trademarked assets.** No logos, no character likenesses, no franchise wordmarks, no title
  lettering, no signature visual effect. Abstract silhouettes and colour-coding only.

**Your screen has a specific per-screen MAY / MAY NOT ruling and you must read it before you design
the visuals.** It lives in the internal IP ruling for this build, section 2, indexed by stage name.
Several screens have a single named visual that is off-limits entirely, and one of them is the first
thing an implementer would reach for. Read your row.

### 9.6 No flash painting, no full-canvas fills of a bright colour

You cannot paint a flash. Use `stage.flash()`. Do not approximate one with a full-rectangle white
fill, a rapid alpha ramp, or a colour inversion. Nothing in the build checks this automatically,
which is precisely why it is a rule rather than a preference.

---

## 10. Difficulty and time

**You scale your own screen.** The harness does not guess what "harder" means for nine different
verbs, because for one it is speed, for another it is a margin, and for another it is a count.

`stage.difficulty` runs 0 to 1 and is the only input you need. It climbs by loop and reaches 1
around the seventh pass.

```js
init: function (stage) {
    /* one interpolation, from the easy value to the hard one */
    var window = EASY_W + (HARD_W - EASY_W) * stage.difficulty;
    return { window: window };
}
```

Pick your `EASY` value so a first-time player clears it comfortably, and your `HARD` value so a good
player clears it most of the time but not always. Read `difficulty` in `init`, not every frame,
unless the screen genuinely ramps within itself.

Screen duration shrinks as the loops climb, from five seconds down to a hard floor. **Never
hard-code a duration.** Read `stage.timeLeft` or `stage.progress`. A screen that assumes it has five
seconds breaks on loop 3 and is unplayable on loop 8.

The floor exists for playability and legibility reasons and is enforced by a load-time self-test
that throws if it is ever defeated, so it is not something you can be handed a shorter screen
than. It is **not** what carries the photosensitivity compliance: that is the darkness of the
palette plus the gap floors, both of which have their own load-time self-tests in `harness.js`.

---

## 11. Testing your screen on its own

```
index.html?only=<your-slug>
```

Solo mode runs your screen on repeat, with the loop counter still climbing, so you can play the
difficulty ramp before the gauntlet is assembled. This is the intended way to build a screen: you do
not need the other eight to exist.

Things to check before you hand it back:

- **Loop 2.** Play through at least two repeats and confirm nothing carried over from the first.
  This is the module-state check, and it is the one that bites.
- **Both control schemes.** Play it with the mouse, then play it with the keyboard only.
- **Reduced motion.** Turn on the OS reduced-motion setting and confirm the screen is still winnable
  and still legible with every kinetic effect at zero.
- **A late loop.** Let it run to a short screen and confirm it is still readable and still fair.
- **Timeout.** Do nothing and confirm the verdict matches your declared `goal`.

Two useful handles from the console: `MULTIPLEX.seed(n)` fixes the random stream for a reproducible
run, and `MULTIPLEX.advance(dt)` steps the gauntlet by hand with no animation frame.

---

## 12. Self-review checklist

Before you hand your screen back, confirm every line:

- [ ] All mutable state is in the object `init` returns. No module-level `var` holds state.
- [ ] No `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `rAF`.
- [ ] No hex, `rgb()`, `rgba()` or CSS colour name anywhere, comments included.
- [ ] No `addEventListener`, no `document.`, no `window.`, no `GameEngine`.
- [ ] No colleague name, no source material named, no asset, no wordmark, comments included.
- [ ] I have read my row in A3 section 2 and my visuals comply with it.
- [ ] `update` returns `'win'` / `'lose'` and never calls into the harness to end the screen.
- [ ] `draw` mutates nothing.
- [ ] `draw` renders correctly with `stage.t === 0`, before any `update`.
- [ ] Every press reaction is latched in `update`, because the edges are false in `draw`.
- [ ] Every decorative displacement goes through `stage.j()`; no information does.
- [ ] `stage.difficulty` is read and actually changes the difficulty.
- [ ] No hard-coded screen duration; `timeLeft` or `progress` is used instead.
- [ ] Dimensions come from `stage.w` / `stage.h`, not the literals 376 and 552.
- [ ] `stage.mem` properties are mutated; `stage.mem` is never reassigned.
- [ ] Every `ctx.save()` has a matching `ctx.restore()`.
- [ ] `slug`, `title`, `prompt`, `hint` and `goal` all match section 14.
- [ ] Played on loop 2 and on a late short loop, with mouse and with keyboard only, and under
      reduced motion.

---

## 13. Worked example

`microgames/_reference.js`, registered as `_reference`, which is not in the running order, so it
never appears in a real round. Play it with `index.html?only=_reference`.

It is deliberately a dull game. Everything interesting about it is the contract.

**MARK: a target sits somewhere along a bar. Steer the marker over it and press.**

### Constants at module level, state in `init`

```js
(function () {
    'use strict';

    /* Module-level CONSTANTS are fine, and are the right home for tuning that
       belongs to this screen rather than to the gauntlet. Module-level mutable
       state is not: it would survive into the next replay. */
    var BAR_Y = 300;
    var MARKER_W = 46;
    var TARGET_W_EASY = 74;
    var TARGET_W_HARD = 30;
    var MARGIN = 30;

    MULTIPLEX.register({
        slug: '_reference',
        title: 'MARK',
        prompt: 'LINE IT UP',
        hint: 'Steer left / right, then press',
        goal: 'achieve',
```

### `init` returns the whole state, and is the only place difficulty is read

```js
        init: function (stage) {
            /* The band narrows as the loops climb. Every screen scales itself
               this way rather than the harness guessing what "harder" means for
               nine different verbs. */
            var w = TARGET_W_EASY + (TARGET_W_HARD - TARGET_W_EASY) * stage.difficulty;
            return {
                targetX: MARGIN + stage.rand() * (stage.w - MARGIN * 2),
                targetW: w,
                markerX: stage.w / 2,
                pressed: false,
                hitPulse: 0
            };
        },
```

### `update` reads the normalised input and returns the verdict

```js
        update: function (dt, stage) {
            var m = stage.mem;
            var input = stage.input;

            /* axis is an absolute -1..+1 position that both the pointer and the
               arrow keys drive, so the control feels identical on a phone and on
               a desktop and this screen never asks which. */
            m.markerX = (input.axis + 1) / 2 * (stage.w - MARKER_W) + MARKER_W / 2;

            /* A timer, decremented by dt. Never a setTimeout. */
            if (m.hitPulse > 0) m.hitPulse = Math.max(0, m.hitPulse - dt * 4);

            /* tapped is a one-frame edge, true only on the frame the press
               landed. No listeners, no callbacks, nothing to clean up. */
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
```

### `draw` paints by role, mutates nothing, and wraps only the sparkle in `j()`

```js
        draw: function (stage) {
            var m = stage.mem;

            /* Colour roles only: 'deep' and 'accent' are derived from this
               screen's own tint, so the whole screen stays inside its verified
               contrast figures without naming a single hex. */
            stage.rect(MARGIN, BAR_Y - 3, stage.w - MARGIN * 2, 6, 'deep');

            stage.roundRect(m.targetX - m.targetW / 2, BAR_Y - 26, m.targetW, 52, 4,
                            'accent', { alpha: 0.28 });
            stage.line(m.targetX, BAR_Y - 26, m.targetX, BAR_Y + 26, 'accent', { width: 2 });

            /* j() is the one reduced-motion multiplier: under reduced motion it
               returns 0, so the wobble vanishes and the position, which is the
               information, does not. */
            var lift = stage.j(Math.sin(stage.t * 6) * 3);
            stage.roundRect(m.markerX - MARKER_W / 2, BAR_Y - 12 + lift, MARKER_W, 24, 4, 'ink');

            /* The latched press reaction. input.tapped is already false here. */
            if (m.hitPulse > 0) {
                stage.circle(m.markerX, BAR_Y, 20 + (1 - m.hitPulse) * 26, 'ink',
                             { stroke: true, width: 3, alpha: m.hitPulse * 0.6 });
            }

            stage.text('PRESS INSIDE THE BAND', stage.w / 2, BAR_Y + 90, { size: 13, role: 'dim' });
            stage.text(stage.timeLeft.toFixed(1), stage.w / 2, 60,
                       { size: 26, role: 'ink', display: true });
        }
    });
})();
```

---

## 14. Screen assignments

The running order is **fixed**. The adjacent-hue separation between consecutive screens was verified
against this exact sequence, so it is not shuffled and your screen's neighbours are known.

| # | `slug` | `title` | Verb | `goal` | `accent2`? |
|---|---|---|---|---|---|
| 1 | `food-falls` | FOOD FALLS | Catch it before it lands | `achieve` | no |
| 2 | `pivot` | PIVOT! | Rotate to clear the gap | `achieve` | no |
| 3 | `sunnies-on` | SUNNIES ON | Lean out of the way | **`survive`** | no |
| 4 | `nothing-but-net` | NOTHING BUT NET | Time the release | `achieve` | no |
| 5 | `the-chase` | SEEKER | Chase a darting target | `achieve` | no |
| 6 | `incoming` | ASSEMBLE | Deflect what is incoming | **`survive`** | **yes** |
| 7 | `dig` | DIG | Tunnel, grab, get out | `achieve` | **yes** |
| 8 | `make-the-gate` | MAKE THE GATE | Dash before it closes | `achieve` | **yes** |
| 9 | `compact` | COMPACT | Crush on the beat | `achieve` | **yes** |

> **The `goal` column is authoritative. Do not infer it from your verb.** Added by the lead
> 2026-08-26 after B1 reported it was missing and that it had to guess. `goal` decides what a
> TIMEOUT means, and the two values are opposites: under `achieve` running out of time is a LOSS,
> under `survive` running out of time is a WIN.
>
> **`sunnies-on` and `incoming` are the only two `survive` screens, and both sit with the same
> implementer.** Getting either wrong makes the screen unwinnable in a way that still looks like
> correct code: a player who dodges or deflects everything for the full duration would lose at the
> timeout. Declare `goal` exactly as this table states it.

`title` must be exactly the string above, and the screen-verification gate reads this table as its
source of truth, so the two cannot drift apart without the gate saying so.

> **Three of these names changed twice, and this row is the second change.** The internal IP
> assessment renamed `SEEKER` to `THE CHASE`, `ASSEMBLE` to `INCOMING` and dropped the exclamation
> mark from `PIVOT!`. The build owner overrode that assessment in writing on 2026-08-28, choosing to
> name the films explicitly, so all three original names are restored above and are the shipped
> titles. Authorisation and its exposure are recorded internally.
>
> **What the override did NOT touch**, and no screen may add: real people's names and likenesses,
> and any personal-data string on the internal appendix list. Those remain executable blockers in
> the screen-verification gate, which is where the list lives; this file does not restate it.
>
> **Film wordmarks belong in the harness credit table, not in a screen file.** Every screen names
> its film through `CREDITS` in `harness.js`, which is one place to read and one place to change.
> A screen that also spells the title out in a comment gives the gate two things to keep in step
> for no gain, so the gate keeps the wordmarks out of screen files even where the title itself is
> authorised.

`prompt` and `hint` are yours to write, within section 2.

---

## 15. Where to look for what

| Question | Source |
|---|---|
| A complete conforming screen | `microgames/_reference.js` |
| What may and may not be rendered on **my** screen | the internal IP ruling, section 2 |
| My screen's tint, and the contrast figures behind the roles | the internal art direction |
| The reduced-motion plan | the internal art direction, section 5 |
| Why the harness is shaped this way | `harness.js`, and the internal harness design record |

The internal documents named above are held outside this directory and are not published with the
game. Ask the build owner for them.

If something in this contract is wrong, or the harness does not do what it says here, that is a
harness defect and not something to work around inside a screen. Report it rather than patching
around it, because eight other screens are relying on the same behaviour.
