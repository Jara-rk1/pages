/**
 * FLASH! Red Carpet Rush - "MIFF Opening Night, Melbourne"
 * KPMG Newsletter Minigame · August 2026 paparazzi-magazine edition.
 *
 * You are a paparazzo in the pit. Ten subjects come past. HOLD to rack focus,
 * RELEASE to fire the shutter. Three axes score every frame: FRAMING (is the
 * subject centred), FOCUS (where the lens sweep was at release) and THE MOMENT
 * (did you catch the pose). Best frame of the night makes the cover.
 *
 * Plan: docs/plans/2026-07-26-red-carpet-rush.md (repo root, NOT inside
 * newsletter-games/: this tree is rsynced to a public Pages repo on merge to
 * main, and the plan carries internal-only material. See the exclude in
 * .github/workflows/news-dashboard.yml.)
 *
 * ---------------------------------------------------------------------------
 * BRAND DEVIATION (deliberate, approved by Jara 2026-07-26)
 * This game uses a BESPOKE magazine-pink palette that is OFF the mandatory KPMG
 * 8-colour palette, for the August paparazzi-magazine newsletter theme. The
 * deviation is scoped to this directory only: no shared asset is touched, and
 * the page header + engine HUD stay KPMG Blue so the tile still reads as part
 * of the hub. brand_validator.py will flag the hexes in `P` below; that is
 * expected, not a defect.
 * ---------------------------------------------------------------------------
 *
 * Tech: Canvas 2D only, zero new deps, zero asset files. All motion is dt-synced
 * eased lerp against the engine's clamped dt - no second rAF, so GSAP is
 * genuinely optional. Reduced motion is gated through one J() multiplier:
 * information always stays, kinetics drop.
 *
 * ---------------------------------------------------------------------------
 * RENDER ARCHITECTURE (2026-07-28 graphics uplift)
 *
 * The camera is real. FOCUS is one of the three scoring axes, so the viewfinder
 * image genuinely racks between soft and tack-sharp rather than only moving a
 * meter. That is done WITHOUT a per-frame blur, which will not hold 60fps on a
 * phone:
 *
 *   1. The static scene is baked once into FOUR pre-blurred levels (LEVELS
 *      below). Level 0 is full DPR; the blurred levels are stored at
 *      progressively LOWER resolution, because a blurred image carries no high
 *      frequencies to lose. Total ~6.5 MB rather than ~18 MB, and upscaling a
 *      small blit is cheaper than blitting a big one. Per frame the renderer
 *      cross-fades the two levels bracketing the current sharpness: two blits.
 *   2. Figures draw live, so they get a ring-kernel defocus instead - the figure
 *      is drawn once into a reused scratch canvas and blitted back K times
 *      around a small circle. A ring IS the point-spread function of a defocused
 *      lens, so this is the cheap approximation AND the correct one.
 *   3. Out-of-focus point lights become real bokeh discs in the pooled particle
 *      system, blitted from three pre-rendered sprites.
 *
 * Everything else static is cached the same way and blitted: the foreground pit
 * (three parallax layers, each pre-blurred by its distance, since the pit is
 * beyond the near focus limit at every rack position) and the lens vignette
 * (half resolution - it is a smooth gradient, so nobody can tell).
 *
 * Lighting is a three-source model baked into the fills as gradients rather
 * than composited as extra passes: a low frontal KEY from the photographers'
 * pit, a champagne RIM off the step-and-repeat behind, and pink BOUNCE up off
 * the carpet. The player's own flash relights the subject for those frames.
 * ---------------------------------------------------------------------------
 *
 * ACCESSIBILITY - PHOTOSENSITIVITY. This is a game about camera flashes, so
 * WCAG 2.3.1 is a hard constraint, not a nicety. A single global scheduler
 * (`canFlash`) rate-limits EVERY flash source to at most 3 per second; ambient
 * pit flashes are small, offset and soft; the player's own flash blooms inward
 * from the frame edges rather than whiting out the canvas; and reduced-motion
 * replaces all of it with a static edge glow. No red flashes anywhere.
 *
 * The uplift added FOUR new light sources and every one of them is derived,
 * not scheduled independently: the subject relight, the carpet specular band
 * and the flashgun glow all read `flashGlow`, which only ever rises inside
 * triggerFlash() behind canFlash(); and the pit lens glints are STEADY
 * speculars that never blink, so they are not a flash source at all. Nothing
 * new calls canFlash() except the two callers that already did. Set
 * `window.__rcrFlashAudit = []` before load to have the scheduler record every
 * granted flash for an empirical rate audit.
 */
(function () {
    'use strict';

    var GAME_ID = 'red-carpet-rush';
    var W = 400, H = 700;
    var HUD_H = GameEngine.HUD_HEIGHT;      // 48 - keep critical art below this

    /* ============================================================
       BESPOKE MAGAZINE PALETTE (see deviation note above)
       ============================================================ */
    var P = {
        hot:    '#FF2D8E',   // primary magenta-pink: carpet, masthead
        bubble: '#FF6FB5',   // mid pink: highlights, brackets
        blush:  '#FFB3D9',   // soft pink: glow, gradient falloff
        champ:  '#FFE0F0',   // near-white pink: flash bloom core
        rose:   '#C0116B',   // shadow, carpet depth, backdrop wall
        ink:    '#2B0A1E',   // night background (near-black plum)
        gold:   '#F5D06B',   // star accents, trophy, bonuses
        white:  '#FFFFFF'
    };
    /* Team / costume colours - needed for subject readability. */
    var T = {
        spain:  '#C8102E', spainAlt: '#FFC400',
        france: '#1F3A93', arg: '#8FC3E8', keeper: '#7BD389',
        aus:    '#0B6E3F', ausAlt: '#FFCD00',
        black:  '#171018', charcoal: '#3A2A34', silver: '#C9C4CC',
        skinA:  '#F0C8A8', skinB: '#C98A62', skinC: '#8A5A3C',
        blonde: '#E8CE8A', brown: '#5A3A28', dark: '#241820', auburn: '#A8492A',
        plat:   '#EDE6D8'
    };

    /* ---- typography ----
       Zero asset files, so every face below is a system font with a documented
       fallback. Weight is SYNTHETIC (stroke + fill through heavy()) rather than
       a loaded weight, which means the display treatment survives intact even
       where the stack falls all the way back to plain Arial. */
    var F_UI = 'Arial, Helvetica, sans-serif';
    var F_DISPLAY = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';
    var F_SERIF = 'Georgia, "Times New Roman", Times, serif';

    /* ---- geometry (logical px) ---- */
    var STRIP_Y = HUD_H + 4, STRIP_H = 28;
    var SCENE_TOP = STRIP_Y + STRIP_H + 6;   // 84
    var HORIZON = 300;                       // backdrop wall meets carpet
    var WALK_Y = 442;                        // subject feet baseline
    var PIT_TOP = 598;                       // foreground paparazzi pit
    var FRAME_CX = 200;                      // viewfinder centre
    var FRAME_CY = 352;
    var FRAME_HW = 132, FRAME_HH = 150;      // viewfinder half-extents
    var METER_Y = 646;                       // focus meter baseline

    /* ---- rules ----
       Tuned 2026-07-27 against a Monte-Carlo harness that drives this file's own
       onUpdate / beginHold / releaseHold at 1/60 s across three human timing
       profiles (novice / average / expert) plus a frame-perfect oracle. Every
       number below carries what it was measured against. */
    var TOTAL_SUBJECTS = 10;
    var FOCUS_SWEEP = 1.15;                  // seconds to traverse the rack 0..1
    var FOCUS_PEAK = 0.60;                   // sharpest point of the sweep
    /* 0.32, was 0.28: widens every focus band by ~14% in wall-clock terms. The
       novice profile was landing BLURRY or worse on 48% of its shots. */
    var FOCUS_HALF = 0.32;                   // half-width of the usable band
    var FRAME_TOL = 112;                     // px from centre at which framing hits 0
    var VERDICT_HOLD = 1.45;                 // seconds the verdict card stays up

    /* Verdict gates, as 0-100 scores on each axis. Named, because the focus meter
       now draws its bands from them and the ambush mark and pair tolerance are
       derived from them. The affordance and the scoring can no longer drift apart
       the way they had: the old gold band's edge was worth a sharpness of 55,
       i.e. PAGE SIX, while the band said "aim here". */
    /* 94, was an unnamed 90 on both axes. At 90 the top tier was not rare: it took
       41% of expert shots and 20% of average ones, i.e. two a round for a median
       player. 94 puts the focus window at +/- 22 ms and the drive-by framing window
       at +/- 7 px, so FRONT PAGE reads as an event again without becoming a lottery
       (a frame-perfect run still lands ten of them). */
    var F_FRONT = 94, K_FRONT = 94;
    var F_EXCL = 75, K_EXCL = 75;
    var F_PAGE = 50, K_PAGE = 50;
    var AXIS_MIN = 25;                       // below this on both axes: nothing usable

    /* px each partner may sit from centre. Derived so that "both in frame" demands
       at least EXCLUSIVE framing of the pair midpoint. At the old flat 138 it was
       satisfied whenever framing scored at all (any |x-200| < 104), so the marquee
       3x fired on 99.7% of expert finale shots: free, and worth only +20% over the
       tier multiplier it replaced. */
    var PAIR_SPREAD = 34;
    var PAIR_TOL = PAIR_SPREAD + FRAME_TOL * (1 - F_EXCL / 100);
    var PAIR_MULT = 3.5;                     // replaces the S tier 2.5x, now that it is earned

    /* An ambush subject stops slightly off the mark. Bounded so the offset alone
       can never put FRONT PAGE out of reach: at the old +/-20 px a frame-perfect
       oracle still lost the top tier on 44% of ambushes, and since the newlyweds
       are always an ambush, the climax was a coin toss decided before the player
       touched anything. */
    var AMBUSH_OFF = FRAME_TOL * (1 - F_FRONT / 100) * 0.85;

    var STREAK_CAP = 2.5;
    /* Sized so a flawless issue (all ten PAGE SIX or better) lands exactly on the
       cap. At the old flat 0.15 the cap needed a streak of 11 in a 10-subject
       round, so the advertised 2.5x was unreachable and the real ceiling was 2.35. */
    var STREAK_STEP = (STREAK_CAP - 1) / (TOTAL_SUBJECTS - 1);

    /* ---- reduced motion ---- */
    var RM = false;
    function J(m) { return RM ? 0 : m; }

    /* ---- colour helpers ----
       Every tone the uplift needed is DERIVED from P and T at draw/build time
       rather than added as a new literal hex, so the documented palette
       exception still enumerates every colour constant in the file and does not
       need widening. mix()/shade()/rgba() all go through one parse cache, so a
       repeated call is a lookup and two string joins, not a parseInt. */
    var _rgbCache = {};
    function hx(hex) {
        var v = _rgbCache[hex];
        if (v) return v;
        var h = hex.replace('#', '');
        v = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        _rgbCache[hex] = v;
        return v;
    }
    function rgba(hex, a) {
        var c = hx(hex);
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    }
    /** Blend two palette hexes. `a` may carry an alpha; omit it for opaque. */
    function mix(h1, h2, t, a) {
        var c1 = hx(h1), c2 = hx(h2);
        var r = (c1[0] + (c2[0] - c1[0]) * t) | 0;
        var g = (c1[1] + (c2[1] - c1[1]) * t) | 0;
        var b = (c1[2] + (c2[2] - c1[2]) * t) | 0;
        return a == null ? 'rgb(' + r + ',' + g + ',' + b + ')'
                         : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    /** k < 0 darkens toward ink, k > 0 lifts toward champagne. */
    function shade(hex, k, a) {
        return k < 0 ? mix(hex, P.ink, -k, a) : mix(hex, P.champ, k, a);
    }
    /** Rec.601 luma, 0..1. Used to decide which WAY to shade a detail: a fixed
        direction loses the tux lapels entirely on the white dinner jackets
        (Swift & Kelce), where lifting a near-white toward champagne is no
        change at all. */
    function lum(hex) {
        var c = hx(hex);
        return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
    }
    /** Shade a detail AWAY from its ground, whichever way that is. */
    function contrast(hex, amt) {
        return shade(hex, lum(hex) > 0.55 ? -amt : amt);
    }
    function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function outQuart(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 4); }
    function inQuad(t) { t = clamp01(t); return t * t; }
    function outBack(t) { t = clamp01(t); var s = 1.70158, s1 = s + 1; return 1 + s1 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
    function linear(t) { return clamp01(t); }
    function ri(n) { return (Math.random() * n) | 0; }

    /* Cosmetic randomness runs on its OWN generator, deliberately.
       Math.random is one shared stream, so anything that draws from it shifts
       every later draw. The uplift added bokeh and confetti, both of which
       would draw several numbers per frame, and on the shared stream that
       would change which subjects, modes and obstructions a given run
       produces - a graphics change silently rewriting the gameplay. Splitting
       the streams keeps the uplift provably gameplay-neutral, and as a bonus
       makes the decoration reproducible frame for frame. */
    var _cseed = 0;
    function crnd() {
        _cseed = (_cseed * 1664525 + 1013904223) >>> 0;
        return _cseed / 4294967296;
    }

    /* ---- typographic helpers ----
       Synthetic weight: an outward stroke behind the fill thickens a face
       without loading one.

       `size` is the px size already set on ctx.font, NOT a stroke width. The
       stroke is derived from it rather than hand-tuned per call because a
       fixed width closes the counters of small type: at 11px a 3.5px stroke
       filled the bowl of an O solidly enough that "POSE" rendered as "PPSE".
       0.15 of the size is the most weight the counters survive at 9-11px, and
       it still reads as a heavy display face at 30px and up. */
    function heavy(ctx, text, x, y, size, fill, outline) {
        var w = Math.min(size * 0.15, 5);
        if (w > 0.4) {
            ctx.lineJoin = 'round';
            ctx.lineWidth = w;
            ctx.strokeStyle = outline || fill;
            ctx.strokeText(text, x, y);
        }
        ctx.fillStyle = fill;
        ctx.fillText(text, x, y);
    }
    /** Letter-spaced run. ctx.letterSpacing is Chromium-only, so it is measured
        and placed by hand: the masthead is the one place tracking has to be
        exact and identical on every engine. Honours the incoming textAlign -
        without that, a right-aligned tracked run silently centres itself and
        overhangs (ISSUE PRICE ran past the cover trim and printed as
        "ISSUE PRI"). Returns the drawn width. */
    function tracked(ctx, text, x, y, sp, draw) {
        var i, w = 0;
        for (i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width + sp;
        w -= sp;
        if (draw) {
            var prev = ctx.textAlign;
            var cx2 = prev === 'right' ? x - w : prev === 'left' ? x : x - w / 2;
            ctx.textAlign = 'left';
            for (i = 0; i < text.length; i++) {
                draw(text[i], cx2);
                cx2 += ctx.measureText(text[i]).width + sp;
            }
            ctx.textAlign = prev;
        }
        return w;
    }

    /* ---- lighting model ----
       Three sources, all baked into fills as gradients rather than composited
       as extra passes. KEY is low and frontal because that is where the
       photographers are; RIM comes off the lit step-and-repeat behind; BOUNCE
       is the carpet throwing pink up onto undersides. */
    var LIGHT_KEY = P.champ;      // pit flashguns: cool near-white
    var LIGHT_RIM = P.blush;      // backdrop spill
    var LIGHT_BOUNCE = P.hot;     // carpet bounce

    /* ============================================================
       ROSTER
       Every entry is anchored to a verified event from 2026 - see §3/§3A of
       the plan. `look` drives the procedural figure; `pose` picks the arm
       archetype; `headline` feeds the magazine cover.
       ============================================================ */
    /* Every field defaults, so an entry that predates a new attribute keeps
       working untouched. The five added in the 2026-07-28 uplift (`beard`,
       `mouth`, `brow`, `build`, `ht`) exist because identity was resting
       entirely on the name tag: at an 11px head radius, silhouette
       differentiation and expression carry recognition far better than facial
       detail does, and more marks than this read as noise. */
    function look(o) {
        return {
            skin: o.skin || T.skinA, hair: o.hair || T.brown,
            hairStyle: o.hairStyle || 'short', outfit: o.outfit || 'suit',
            c1: o.c1 || T.charcoal, c2: o.c2 || P.white,
            pose: o.pose || 'wave', prop: o.prop || null, num: o.num || null,
            shades: !!o.shades,
            beard: o.beard || null,        // 'full' | 'stubble' | 'goatee'
            mouth: o.mouth || 'smile',     // 'smile' | 'grin' | 'flat' | 'open' | 'pout'
            brow: o.brow || 0,             // -1 furrowed .. +1 raised
            build: o.build || 1,           // shoulder-width multiplier
            ht: o.ht || 1                  // overall height multiplier
        };
    }

    var ROSTER = [
        /* ---- Tier S - the newlyweds (3 July 2026, Madison Square Garden) ---- */
        {
            id: 'swift-kelce', name: 'SWIFT & KELCE', tier: 'S',
            headline: "SWIFT'S FIRST CARPET AS A KELCE",
            figures: [
                look({ skin: T.skinA, hair: T.blonde, hairStyle: 'long', outfit: 'gown', c1: P.white, c2: P.champ, pose: 'heart', mouth: 'smile', brow: 0.35, ht: 0.99 }),
                look({ skin: T.skinA, hair: T.brown, hairStyle: 'quiff', outfit: 'tux', c1: P.white, c2: P.champ, pose: 'wave', beard: 'full', mouth: 'grin', build: 1.24, ht: 1.06 })
            ]
        },

        /* ---- Tier A - World Cup champions (Spain 1-0 Argentina, 19 July) ---- */
        { id: 'yamal', name: 'LAMINE YAMAL', tier: 'A', headline: 'YAMAL BRINGS THE CUP TO SOUTHBANK',
          figures: [look({ skin: T.skinB, hair: T.dark, hairStyle: 'curls', outfit: 'kit', c1: T.spain, c2: T.spainAlt, pose: 'point', num: '19', mouth: 'grin', brow: 0.3, build: 0.94, ht: 0.97 })] },
        { id: 'rodri', name: 'RODRI', tier: 'A', headline: 'RODRI PARADES THE GOLDEN BALL',
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'kit', c1: T.spain, c2: T.spainAlt, pose: 'armsUp', prop: 'trophy', num: '16', beard: 'stubble', mouth: 'open', build: 1.12, ht: 1.07 })] },
        { id: 'mbappe', name: 'KYLIAN MBAPPÉ', tier: 'A', headline: 'MBAPPÉ, TWICE A GOLDEN BOOT',
          figures: [look({ skin: T.skinC, hair: T.dark, hairStyle: 'buzz', outfit: 'kit', c1: T.france, c2: P.white, pose: 'cross', prop: 'boot', num: '10', mouth: 'flat', brow: 0.2 })] },
        { id: 'messi', name: 'LIONEL MESSI', tier: 'A', headline: "MESSI: 'THE BATON PASSES'",
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'kit', c1: T.arg, c2: P.white, pose: 'point', num: '10', beard: 'full', mouth: 'flat', build: 0.93, ht: 0.91 })] },
        { id: 'simon', name: 'UNAI SIMÓN', tier: 'A', headline: "SIMÓN'S SEVEN CLEAN SHEETS",
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'kit', c1: T.keeper, c2: T.charcoal, pose: 'armsUp', num: '1', beard: 'full', mouth: 'open', build: 1.16, ht: 1.08 })] },

        /* ---- Tier A - Socceroos (out to Egypt on penalties, 3 July) ---- */
        { id: 'herrington', name: 'LUCAS HERRINGTON', tier: 'A', headline: 'HERRINGTON, 18, STEALS THE NIGHT',
          figures: [look({ skin: T.skinA, hair: T.blonde, hairStyle: 'quiff', outfit: 'kit', c1: T.aus, c2: T.ausAlt, pose: 'wave', num: '2', mouth: 'grin', brow: 0.45, build: 0.96, ht: 0.98 })] },
        { id: 'irvine', name: 'JACKSON IRVINE', tier: 'A', headline: 'IRVINE HOLDS HIS NERVE',
          figures: [look({ skin: T.skinA, hair: T.auburn, hairStyle: 'quiff', outfit: 'kit', c1: T.aus, c2: T.ausAlt, pose: 'cross', num: '22', beard: 'full', mouth: 'flat', brow: -0.25, build: 1.08, ht: 1.05 })] },
        { id: 'mabil', name: 'AWER MABIL', tier: 'A', headline: 'MABIL SALUTES THE PIT',
          figures: [look({ skin: T.skinC, hair: T.dark, hairStyle: 'buzz', outfit: 'kit', c1: T.aus, c2: T.ausAlt, pose: 'point', num: '7', mouth: 'grin', brow: 0.3, ht: 1.02 })] },

        /* ---- Tier B - The Odyssey (London 6 July, NY 14 July, release 17 July) ---- */
        { id: 'zendaya', name: 'ZENDAYA', tier: 'B', headline: 'ZENDAYA TAKES FLIGHT AT MIFF',
          figures: [look({ skin: T.skinB, hair: T.dark, hairStyle: 'wavy', outfit: 'wings', c1: P.champ, c2: P.blush, pose: 'wings', mouth: 'pout', brow: 0.2, ht: 1.03 })] },
        { id: 'damon', name: 'MATT DAMON', tier: 'B', headline: "DAMON'S ODYSSEY LANDS IN MELBOURNE",
          figures: [look({ skin: T.skinA, hair: T.blonde, outfit: 'tux', c1: T.black, c2: P.white, pose: 'wave', mouth: 'grin', build: 1.12 })] },
        { id: 'holland', name: 'TOM HOLLAND', tier: 'B', headline: 'HOLLAND WORKS THE BARRIER',
          figures: [look({ skin: T.skinA, hair: T.brown, hairStyle: 'quiff', outfit: 'suit', c1: T.charcoal, c2: P.white, pose: 'point', mouth: 'grin', brow: 0.35, build: 0.96, ht: 0.93 })] },
        { id: 'hathaway', name: 'ANNE HATHAWAY', tier: 'B', headline: 'HATHAWAY, EVERY INCH PENELOPE',
          figures: [look({ skin: T.skinA, hair: T.dark, hairStyle: 'long', outfit: 'gown', c1: T.charcoal, c2: P.rose, pose: 'heart', mouth: 'smile', brow: 0.4 })] },
        { id: 'pattinson', name: 'ROBERT PATTINSON', tier: 'B', headline: 'PATTINSON, HANDS IN POCKETS',
          figures: [look({ skin: T.skinA, hair: T.brown, hairStyle: 'slick', outfit: 'suit', c1: T.black, c2: T.silver, pose: 'pockets', beard: 'stubble', mouth: 'flat', brow: -0.35 })] },
        { id: 'theron', name: 'CHARLIZE THERON', tier: 'B', headline: 'THERON OWNS THE CARPET',
          figures: [look({ skin: T.skinA, hair: T.plat, hairStyle: 'bob', outfit: 'gown', c1: T.silver, c2: P.champ, pose: 'hipcock', mouth: 'flat', brow: -0.1, ht: 1.04 })] },
        { id: 'nolan', name: 'CHRISTOPHER NOLAN', tier: 'B', noTell: true, headline: "NOLAN STILL WON'T SMILE",
          /* the one figure whose expression is the joke: flat mouth, furrowed brow */
          figures: [look({ skin: T.skinA, hair: T.silver, hairStyle: 'slick', outfit: 'suit', c1: T.charcoal, c2: T.silver, pose: 'pockets', mouth: 'flat', brow: -0.7 })] },

        /* ---- Tier B - awards season & the Met ("Fashion Is Art", 4 May) ---- */
        { id: 'mbj', name: 'MICHAEL B. JORDAN', tier: 'B', headline: 'BEST ACTOR, BEST DRESSED',
          figures: [look({ skin: T.skinC, hair: T.dark, hairStyle: 'buzz', outfit: 'tux', c1: T.black, c2: P.gold, pose: 'cross', beard: 'full', mouth: 'smile', build: 1.18, ht: 1.02 })] },
        { id: 'buckley', name: 'JESSIE BUCKLEY', tier: 'B', headline: "BUCKLEY'S QUIET TRIUMPH",
          figures: [look({ skin: T.skinA, hair: T.auburn, hairStyle: 'wavy', outfit: 'gown', c1: P.blush, c2: P.champ, pose: 'wave', mouth: 'smile', brow: 0.15, ht: 0.98 })] },
        { id: 'beyonce', name: 'BEYONCÉ', tier: 'B', headline: 'BEYONCÉ IN BONE COUTURE',
          figures: [look({ skin: T.skinB, hair: T.blonde, hairStyle: 'updo', outfit: 'gown', c1: T.black, c2: T.silver, pose: 'hipcock', mouth: 'pout', brow: 0.1, ht: 1.02 })] },
        { id: 'rihanna', name: 'RIHANNA', tier: 'B', headline: 'RIHANNA, MONOCHROME AND UNBOTHERED',
          figures: [look({ skin: T.skinB, hair: T.dark, hairStyle: 'bob', outfit: 'gown', c1: T.silver, c2: P.white, pose: 'hipcock', shades: true, mouth: 'flat' })] },

        /* ---- Tier C - Australian home crowd ---- */
        /* gold, not pink: a pink gown on a pink carpet disappears */
        { id: 'robbie', name: 'MARGOT ROBBIE', tier: 'C', headline: 'ROBBIE COMES HOME',
          figures: [look({ skin: T.skinA, hair: T.blonde, hairStyle: 'long', outfit: 'gown', c1: P.gold, c2: P.champ, pose: 'hipcock', mouth: 'grin', brow: 0.3 })] },
        { id: 'hemsworth', name: 'CHRIS HEMSWORTH', tier: 'C', headline: 'HEMSWORTH BRINGS THE HAMMER',
          figures: [look({ skin: T.skinA, hair: T.blonde, hairStyle: 'slick', outfit: 'tux', c1: T.charcoal, c2: P.white, pose: 'armsUp', beard: 'stubble', mouth: 'grin', build: 1.32, ht: 1.09 })] },
        { id: 'kidman', name: 'NICOLE KIDMAN', tier: 'C', headline: 'KIDMAN, RALPH LAUREN, RADIANT',
          figures: [look({ skin: T.skinA, hair: T.auburn, hairStyle: 'wavy', outfit: 'gown', c1: P.champ, c2: P.white, pose: 'wave', mouth: 'smile', brow: 0.25, ht: 1.05 })] },
        { id: 'snook', name: 'SARAH SNOOK', tier: 'C', headline: "SNOOK'S WRY HALF-SMILE",
          figures: [look({ skin: T.skinA, hair: T.blonde, hairStyle: 'bob', outfit: 'suit', c1: T.charcoal, c2: P.blush, pose: 'pockets', mouth: 'wry', brow: 0.15, ht: 0.97 })] },
        { id: 'jackman', name: 'HUGH JACKMAN', tier: 'C', headline: 'JACKMAN GIVES THEM A SHOW',
          figures: [look({ skin: T.skinA, hair: T.brown, hairStyle: 'quiff', outfit: 'tux', c1: T.black, c2: P.white, pose: 'armsUp', beard: 'stubble', mouth: 'open', build: 1.22, ht: 1.05 })] }
    ];

    /* Traps - deliberately generic figures, no real-person likeness. The uplift
       pushed their silhouettes FURTHER from the roster, not closer: shooting one
       costs 500 points, so anything that makes the read harder is a regression. */
    var TRAPS = [
        { id: 'publicist', name: 'PUBLICIST', trap: true,
          figures: [look({ outfit: 'suit', c1: T.charcoal, c2: T.silver, pose: 'phone', mouth: 'flat', brow: -0.2, ht: 0.98 })] },
        { id: 'security', name: 'SECURITY', trap: true,
          figures: [look({ skin: T.skinC, hair: T.dark, hairStyle: 'buzz', outfit: 'suit', c1: T.black, c2: T.charcoal, pose: 'cross', shades: true, mouth: 'flat', brow: -0.5, build: 1.38, ht: 1.07 })] },
        { id: 'rival', name: 'RIVAL PAP', trap: true,
          figures: [look({ outfit: 'suit', c1: T.dark, c2: T.charcoal, pose: 'camera', mouth: 'flat', build: 1.04 })] },
        { id: 'volunteer', name: 'MIFF VOLUNTEER', trap: true,
          figures: [look({ skin: T.skinB, hair: T.dark, hairStyle: 'pony', outfit: 'suit', c1: P.rose, c2: P.blush, pose: 'lanyard', mouth: 'smile', brow: 0.4, build: 0.94 })] },
        { id: 'finance', name: 'SOMEONE FROM FINANCE', trap: true,
          figures: [look({ outfit: 'suit', c1: '#4A5A6A', c2: P.white, pose: 'lanyard', mouth: 'flat', brow: -0.1 })] }
    ];

    var TIER_MULT = { S: 2.5, A: 2.0, B: 1.5, C: 1.0 };
    var TIER_COLOUR = { S: P.gold, A: P.hot, B: P.bubble, C: P.blush };

    /* ============================================================
       STATE
       ============================================================ */
    var phase;            // 'walk' | 'verdict' | 'cover' | 'done'
    var queue, qi, subject, realDone, score, streak, bestShot, shotLog;
    var holding, focusT, focusActive;
    var verdictT, verdictCard;
    var obstruction, ambient, coverT, coverReady;
    var flashes, flashGlow, shutterWipe, camShake;

    /* Displayed sharpness of the viewfinder image, 0 = fully soft, 1 = tack
       sharp. It is RATE-LIMITED toward sharpness(focusT), not exponentially
       chased. Both need explaining:

       Rate-limited, because the target jumps 1 -> 0 the instant a hold begins
       (focusT starts at the near stop) and a hard cut there reads as a glitch,
       where a throw over SHARP_THROW seconds reads as the lens being thrown.

       Rate-limited rather than chased, because an exponential chase LAGS. The
       rack itself only moves sharpness at 1/(FOCUS_HALF*FOCUS_SWEEP) = 2.7 per
       second, and a chase fast enough not to lag that is too fast to smooth the
       throw. Measured: a 0.075 s chase left the image at 0.82 sharp at the
       moment the meter said 0.97, i.e. the picture disagreed with the score on
       the one frame that matters. A rate limit tracks the ramp exactly (it is
       well inside the limit) and still spreads the throw over 6 frames.

       Not gated by J(): the rack IS the FOCUS axis made visible, so it is
       information, not kinetics. */
    var sceneSharp = 1;
    var SHARP_THROW = 0.10;      // seconds for a full 0..1 lens throw
    /* Photographers' sway. Pure kinetics, so J()-gated. */
    var panX = 0;

    function reset() {
        RM = GameEngine.prefersReducedMotion();
        phase = 'walk';
        queue = buildQueue();
        qi = -1; subject = null; realDone = 0;
        score = 0; streak = 0; bestShot = null; shotLog = [];
        GameEngine.state.score = 0;
        holding = false; focusT = 0; focusActive = false;
        verdictT = 0; verdictCard = null;
        obstruction = null;
        ambient = { t: 0, pops: [] };
        coverT = 0; coverReady = false;
        flashes = []; flashGlow = 0; shutterWipe = 0; camShake = 0;
        sceneSharp = 1; panX = 0; coverArt = null; _cseed = 0x9E3779B9;
        particlesClear();
        nextSubject();
    }

    /* Ten real subjects, weighted by tier, newlyweds always last. Traps are
       interleaved as extra figures and do NOT consume one of the ten. */
    function buildQueue() {
        var byTier = { S: [], A: [], B: [], C: [] };
        ROSTER.forEach(function (r) { byTier[r.tier].push(r); });

        var pick = [];
        var newlyweds = byTier.S[0];
        pick = pick
            .concat(sample(byTier.A, 4))
            .concat(sample(byTier.B, 3))
            .concat(sample(byTier.C, 2));
        shuffle(pick);
        pick.push(newlyweds);                       // always the climax

        // Mode escalates with position (§2.6 of the plan).
        var q = [];
        for (var i = 0; i < pick.length; i++) {
            q.push({ celeb: pick[i], mode: modeFor(i), index: i });
            // interleave up to 3 traps, never adjacent to the finale
            if (i < 7 && i > 0 && Math.random() < 0.34) {
                q.push({ celeb: TRAPS[ri(TRAPS.length)], mode: 'walk', index: -1 });
            }
        }
        return q;
    }

    /* Each mode stresses one axis: walk = FOCUS (framing is free at the mark),
       drive = FRAMING (constant-speed crossing, wide pose window), ambush = THE
       MOMENT (no runway, no tell, shortest pose window). The old mix ran ~4.8
       walks a round, i.e. half the issue on the one-dimensional mode; this lands
       at roughly 3.6 walk / 3.2 drive / 3.2 ambush. Subjects 1-2 stay walk as the
       tutorial rung. */
    function modeFor(i) {
        if (i <= 1) return 'walk';
        if (i <= 3) return Math.random() < 0.55 ? 'drive' : 'walk';
        if (i <= 6) { var r = Math.random(); return r < 0.40 ? 'drive' : (r < 0.75 ? 'ambush' : 'walk'); }
        if (i === 9) return 'ambush';               // the newlyweds
        return Math.random() < 0.45 ? 'drive' : 'ambush';
    }

    function sample(arr, n) {
        var c = arr.slice(); shuffle(c); return c.slice(0, Math.min(n, c.length));
    }
    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    }

    /* ---- difficulty by position ---- */
    function diffFor(i) {
        if (i <= 1) return { speed: 1.00, pose: 1.40, obst: 0.00 };
        if (i <= 4) return { speed: 1.15, pose: 1.10, obst: 0.30 };
        if (i <= 7) return { speed: 1.35, pose: 0.85, obst: 0.55 };
        return { speed: 1.55, pose: 0.65, obst: 0.70 };
    }

    /* ============================================================
       SUBJECTS
       ============================================================ */
    function nextSubject() {
        qi++;
        if (qi >= queue.length) { beginCover(); return; }

        var e = queue[qi];
        var d = diffFor(e.index < 0 ? Math.max(0, realDone) : e.index);
        var dir = Math.random() < 0.5 ? 1 : -1;     // 1 = enters from left
        var pair = e.celeb.figures.length > 1;

        var s = {
            celeb: e.celeb, mode: e.mode, trap: !!e.celeb.trap, dir: dir, pair: pair,
            life: 0, x: 0, shot: false, spread: pair ? PAIR_SPREAD : 0,
            easeIn: outQuart, easeOut: inQuad
        };

        if (e.mode === 'walk') {
            s.spawnX = dir > 0 ? -70 : W + 70;
            s.markX = FRAME_CX;
            s.exitX = dir > 0 ? W + 70 : -70;
            /* 1.90, was 1.55: the extra approach is planning room, which is the
               one thing the focus rack needs (peak is 0.69 s into a hold). */
            s.tIn = 1.90 / d.speed;
            s.dwell = 0.35 + d.pose;
            s.tOut = 1.25 / d.speed;
            s.poseStart = s.tIn + 0.18;
            s.poseEnd = s.poseStart + d.pose;
        } else if (e.mode === 'drive') {
            /* A car does not decelerate to a standstill on its mark. The old
               outQuart / inQuad easing parked it dead centre for ~0.4 s, which is
               why the oracle scored FRONT PAGE on 100% of drive-bys and mean
               framing sat at 98 even for average players: framing was not an axis.
               Constant speed makes the crossing a genuine knife edge. */
            s.easeIn = linear; s.easeOut = linear;
            s.spawnX = dir > 0 ? -110 : W + 110;
            s.markX = FRAME_CX;
            s.exitX = dir > 0 ? W + 110 : -110;
            /* 2.05, was 1.30: slowed to keep the linear f>50 window (~0.5-0.65 s)
               comparable to the focus bands rather than half their width. */
            s.tIn = 2.05 / d.speed;
            s.dwell = 0;                             // never stops
            s.tOut = 2.05 / d.speed;
            /* pose window deliberately wider than the framing window: on a
               drive-by the moment is easy and the centring is the test */
            s.poseStart = s.tIn - 0.32;
            s.poseEnd = s.tIn + 0.32;
        } else { // ambush: already close, no runway
            s.spawnX = FRAME_CX + (dir > 0 ? -150 : 150);
            s.markX = FRAME_CX + (Math.random() * (AMBUSH_OFF * 2) - AMBUSH_OFF);
            s.exitX = dir > 0 ? W + 70 : -70;
            /* 1.20, was 0.70. The runway has a hard floor: the player cannot press
               before they see the subject, and the rack then needs
               FOCUS_PEAK * FOCUS_SWEEP = 0.69 s to peak. Any runway shorter than
               (reaction + 0.69 - half the pose window) forces the release instant,
               and the mode collapses into a step function on reaction speed rather
               than a skill gradient. Measured at 0.70, 0.85 and 1.00 the finale
               was unwinnable for the novice profile (FRONT PAGE 0.0%) while the
               expert cleared it half the time. 1.20 puts the required press at
               ~0.24 s even at the 1.55x speed rung, just clear of a slow reaction.
               Difficulty here belongs in the pose window, which scales smoothly
               with skill; the runway does not. */
            s.tIn = 1.20 / d.speed;
            s.dwell = 0.20 + d.pose * 0.55;
            s.tOut = 1.05 / d.speed;
            s.poseStart = s.tIn + 0.05;
            /* 0.33 of the pose budget: the tightest moment of the three modes and
               the gate that separates ambush from walk. At 0.55 and 0.42 it barely
               bit (expert FRONT within 3 points of walk's), because the window was
               still wider than a no-tell anticipation error. Note it costs novices
               little, since the pose window gates FRONT PAGE only: EXCLUSIVE and
               PAGE SIX still resolve on framing and focus alone. */
            s.poseEnd = s.poseStart + d.pose * 0.33;
        }
        s.total = s.tIn + s.dwell + s.tOut;
        /* Ambush means ambush: no wind-up to read, per §2.3 of the plan. This is
           what makes THE MOMENT the binding axis there rather than decoration. */
        s.tellAt = (e.celeb.noTell || e.mode === 'ambush') ? -1 : Math.max(0.05, s.poseStart - 0.40);

        /* Traps are a recognition test, not a timing test. At full walk pace an
           ignored trap burned ~3.9 s of dead air, and with 2-3 a round that was
           14-19% of the whole issue spent watching a publicist. */
        if (s.trap) {
            s.tIn *= 0.55; s.dwell *= 0.30; s.tOut *= 0.55;
            s.poseStart = s.tIn + 0.10;
            s.poseEnd = s.poseStart + 0.40;
            s.total = s.tIn + s.dwell + s.tOut;
            s.tellAt = -1;
        }

        subject = s;
        obstruction = (Math.random() < d.obst && !s.trap) ? makeObstruction(d, s) : null;

        rca('crowd', s.trap ? 0.15 : (s.celeb.tier === 'S' ? 1 : 0.45));
    }

    function makeObstruction(d, s) {
        var kinds = ['umbrella', 'arm', 'nophotos'];
        var k = kinds[ri(kinds.length)];
        var dir = Math.random() < 0.5 ? 1 : -1;
        var w = k === 'umbrella' ? 86 : k === 'nophotos' ? 46 : 34;
        var speed = 95 + 70 * d.speed;

        /* Phase the crossing against the pose window instead of spawning blind at
           life 0. Blind spawning only ever worked by accident: once drive-bys were
           slowed to make framing a real axis, the blocker started arriving dead on
           the money window and a frame-perfect oracle was eating an unavoidable
           BLOCKED 1.2 times a round, which broke its streak too. A blocker should
           narrow the moment, not delete it, so it is aimed at ONE END of the pose
           window and takes at most 40% of it. The middle of the window is always
           shootable, and drifting off it is what gets you blocked. */
        var half = (w * 0.5 + 14) / speed;             // seconds the frame centre is covered
        var bite = Math.min(0.40 * Math.max(0.05, s.poseEnd - s.poseStart), half);
        var runIn = 260 / speed;                       // seconds from the offscreen edge to centre
        var early = s.poseStart - half + bite;         // covers the opening of the window
        var late = s.poseEnd + half - bite;            // covers its close
        var cross;
        if (early >= runIn && late >= runIn) cross = Math.random() < 0.5 ? early : late;
        else if (late >= runIn) cross = late;
        else return null;                              // no room to run in: no blocker

        return {
            kind: k, dir: dir,
            x: dir > 0 ? -60 : W + 60,
            wait: cross - runIn,                       // parked offscreen until its cue
            speed: speed * dir,
            y: k === 'nophotos' ? WALK_Y - 110 : WALK_Y - 70,
            w: w
        };
    }

    /** Subject x at the current life, plus whether the pose is live. */
    function subjectX(s) {
        if (s.life < s.tIn) return lerp(s.spawnX, s.markX, s.easeIn(s.life / s.tIn));
        if (s.life < s.tIn + s.dwell) return s.markX;
        var t = (s.life - s.tIn - s.dwell) / s.tOut;
        return lerp(s.markX, s.exitX, s.easeOut(t));
    }
    function inPose(s) { return s.life >= s.poseStart && s.life <= s.poseEnd; }
    function inTell(s) { return s.tellAt > 0 && s.life >= s.tellAt && s.life < s.poseStart; }

    /* ============================================================
       FOCUS + SCORING
       ============================================================ */
    /** Sharpness 0..1 from the rack position - a sweep, not a fill. */
    function sharpness(t) {
        var raw = 1 - Math.abs(t - FOCUS_PEAK) / FOCUS_HALF;
        return clamp01(raw);
    }

    /** Inverse of sharpness: the rack offset either side of FOCUS_PEAK that scores
        exactly k (0-100). The focus meter draws every band through this, so what
        the player is told to aim at is the same number resolveShot grades. */
    function rackOffsetFor(k) { return FOCUS_HALF * (1 - k / 100); }

    function beginHold() {
        if (phase !== 'walk' || !subject || subject.shot || holding) return;
        holding = true; focusActive = true; focusT = 0;
        rca('focus');
    }

    /* No `auto` parameter: an auto-fire at the end of the rack and a player
       release are scored identically (the auto-fire simply lands at focusT 1,
       which scores itself as fully soft). The old signature took one and passed
       it to fireShutter, which never declared it. */
    function releaseHold() {
        if (!holding) return;
        holding = false;
        rca('focusStop');
        fireShutter();
    }

    function fireShutter() {
        if (!subject || subject.shot) return;
        var s = subject;
        s.shot = true;
        focusActive = false;

        var k = sharpness(focusT) * 100;
        var x = subjectX(s);

        /* framing: distance of the subject (or pair midpoint) from frame centre */
        var f, bothIn = false;
        if (s.pair) {
            var xa = x - s.spread, xb = x + s.spread;
            bothIn = Math.abs(xa - FRAME_CX) < PAIR_TOL && Math.abs(xb - FRAME_CX) < PAIR_TOL;
            f = clamp01(1 - Math.abs(x - FRAME_CX) / FRAME_TOL) * 100;
        } else {
            f = clamp01(1 - Math.abs(x - FRAME_CX) / FRAME_TOL) * 100;
        }

        /* an obstruction across the frame centre kills the shot outright */
        var blocked = obstruction && Math.abs(obstruction.x - FRAME_CX) < obstruction.w * 0.5 + 14;
        var pose = inPose(s);

        var res = resolveShot(s, f, k, pose, bothIn, blocked);
        applyResult(res, s, f, k);
    }

    function resolveShot(s, f, k, pose, bothIn, blocked) {
        if (s.trap) return { kind: 'wrong', label: 'NOT A CELEBRITY', glyph: '✘', base: -500, colour: P.rose };
        if (blocked) return { kind: 'miss', label: 'BLOCKED', glyph: '⛔', base: 0, colour: P.rose };

        if (f > F_FRONT && k > K_FRONT && pose) {
            return { kind: 'front', label: 'FRONT PAGE', glyph: '★', base: 2500, colour: P.gold, bothIn: bothIn };
        }
        if (f > F_EXCL && k > K_EXCL) {
            return { kind: 'exclusive', label: 'EXCLUSIVE', glyph: '◆', base: 1500, colour: P.hot, bothIn: bothIn };
        }
        if (f > F_PAGE && k > K_PAGE) {
            return { kind: 'page', label: 'PAGE SIX', glyph: '●', base: 800, colour: P.bubble, bothIn: bothIn };
        }
        if (f > AXIS_MIN || k > AXIS_MIN) {
            // name the axis that failed, so players learn which one to fix
            var why = k <= f ? 'SOFT FOCUS' : 'OFF FRAME';
            return { kind: 'blurry', label: why, glyph: '○', base: 250, colour: P.blush };
        }
        return { kind: 'miss', label: 'MISSED', glyph: '×', base: 0, colour: P.rose };
    }

    function applyResult(res, s, f, k) {
        var mult = TIER_MULT[s.celeb.tier] || 1;
        var bonus = 0, notes = [];

        if (res.base > 0) {
            /* signature moments (§2.4a) */
            if (s.pair && res.bothIn) { mult = PAIR_MULT; notes.push('NEWLYWEDS ' + PAIR_MULT + 'x'); }
            /* prop bonuses gate on the same framing standard as EXCLUSIVE, rather
               than the orphan 70 they used to carry */
            if (s.celeb.figures[0].prop === 'trophy' && f > F_EXCL) { bonus += 1500; notes.push('SILVERWARE +1500'); }
            if (s.celeb.figures[0].prop === 'boot' && f > F_EXCL) { bonus += 1000; notes.push('GOLDEN BOOT +1000'); }
        }

        var streakMult = 1;
        if (res.base >= 800) {
            streak++;
            streakMult = Math.min(STREAK_CAP, 1 + STREAK_STEP * (streak - 1));
        } else {
            streak = 0;
        }

        var gained = Math.round(res.base * mult * streakMult) + (res.base > 0 ? bonus : 0);
        score += gained;
        if (score < 0) score = 0;
        GameEngine.state.score = score;

        if (!s.trap) {
            realDone++;
            shotLog.push({ name: s.celeb.name, label: res.label, kind: res.kind, points: gained });
            if (res.base > 0 && (!bestShot || gained > bestShot.points)) {
                bestShot = {
                    celeb: s.celeb, points: gained, label: res.label, kind: res.kind,
                    focus: k, framing: f, headline: s.celeb.headline
                };
            }
        }

        /* presentation */
        verdictCard = {
            label: res.label, glyph: res.glyph, colour: res.colour,
            points: gained, notes: notes, focus: k, framing: f,
            name: s.celeb.name, kind: res.kind
        };
        verdictT = 0;
        phase = 'verdict';

        triggerFlash(res.kind);
        rca('shutter');
        setTimeout(function () { rca('verdict', res.kind); }, 120);

        if (res.kind === 'front') { burst(FRAME_CX, FRAME_CY, 26, P.gold); camShake = J(7); }
        else if (res.kind === 'exclusive') { burst(FRAME_CX, FRAME_CY, 14, P.hot); camShake = J(4); }
        else if (res.kind === 'wrong') { camShake = J(5); }
    }

    /** A subject left frame without being photographed. */
    function subjectEscaped(s) {
        /* Drop any hold still in progress. Without this a hold carried across the
           escape re-entered fireShutter on a subject that had already been logged
           MISSED, scoring it twice and taking a second slot out of the ten. */
        holding = false; focusActive = false; focusT = 0;
        if (s.trap) { nextSubject(); return; }       // correctly ignored - no penalty
        streak = 0;
        realDone++;
        shotLog.push({ name: s.celeb.name, label: 'MISSED', kind: 'miss', points: 0 });
        verdictCard = {
            label: 'MISSED', glyph: '×', colour: P.rose, points: 0, notes: [],
            focus: 0, framing: 0, name: s.celeb.name, kind: 'miss'
        };
        verdictT = 0; phase = 'verdict';
        rca('verdict', 'miss');
    }

    /* ============================================================
       FLASH SCHEDULER - WCAG 2.3.1 (max 3 flashes/sec, globally)
       ============================================================ */
    var flashTimes = [];
    function canFlash() {
        if (RM) return false;                        // reduced motion: never strobe
        var now = performance.now();
        while (flashTimes.length && now - flashTimes[0] > 1000) flashTimes.shift();
        if (flashTimes.length >= 3) return false;
        flashTimes.push(now);
        /* Audit hook. A harness sets window.__rcrFlashAudit = [] before load and
           reads back every granted flash, so the 3/s claim is measured against
           the running game rather than asserted from the code. One truthiness
           test on a path that fires at most three times a second. */
        if (window.__rcrFlashAudit) window.__rcrFlashAudit.push(now);
        return true;
    }

    function triggerFlash(kind) {
        shutterWipe = 1;                             // always: the shape channel
        if (canFlash()) {
            flashGlow = kind === 'front' ? 1 : 0.72; // edge bloom, never a full white-out
            rca('flashPop');
        } else {
            flashGlow = Math.max(flashGlow, 0.28);   // soft, sub-threshold fallback
        }
    }

    /* Ambient pit flashes - small, offset, and rate-limited through the same
       scheduler so they can never combine with the player's flash to exceed 3/s. */
    function updateAmbient(dt) {
        ambient.t -= dt;
        if (ambient.t <= 0) {
            ambient.t = 0.55 + Math.random() * 0.9;
            if (canFlash()) {
                var px2 = 20 + Math.random() * (W - 40);
                var py2 = PIT_TOP + 6 + Math.random() * 30;
                ambient.pops.push({ x: px2, y: py2, life: 0.22, max: 0.22, r: 16 + Math.random() * 12 });
                /* a rival's flash seen through a defocused lens is a disc, and
                   it is the same already-scheduled event, not a new one */
                if (sceneSharp < 0.75) bokeh(px2, py2 - 8, 1 - sceneSharp, 3);
            }
        }
        for (var i = ambient.pops.length - 1; i >= 0; i--) {
            ambient.pops[i].life -= dt;
            if (ambient.pops[i].life <= 0) ambient.pops.splice(i, 1);
        }
    }

    /* ============================================================
       PARTICLES (pooled Float32 - x, y, vx, vy, life, max, size, colourIdx)
       ============================================================ */
    /* Stride 11: x, y, vx, vy, life, max, size, colourIdx, kind, rot, spin.
       KIND_BOKEH is what an out-of-focus point light actually looks like, so
       the defocus effect and the particle system are the same feature. */
    var PMAX = 220, PSTRIDE = 11;
    var pdata = new Float32Array(PMAX * PSTRIDE);
    var pcount = 0;
    var PCOLS = [P.gold, P.hot, P.bubble, P.champ, P.white];
    var KIND_SPARK = 0, KIND_BOKEH = 1, KIND_CONFETTI = 2;

    function particlesClear() { pcount = 0; }

    function pspawn(x, y, vx, vy, life, size, ci, kind, rot, spin) {
        if (pcount >= PMAX) return;
        var o = pcount * PSTRIDE;
        pdata[o] = x; pdata[o + 1] = y;
        pdata[o + 2] = vx; pdata[o + 3] = vy;
        pdata[o + 4] = pdata[o + 5] = life;
        pdata[o + 6] = size; pdata[o + 7] = ci; pdata[o + 8] = kind;
        pdata[o + 9] = rot || 0; pdata[o + 10] = spin || 0;
        pcount++;
    }

    function burst(x, y, n, colour) {
        if (RM) n = Math.min(n, 6);
        var ci = PCOLS.indexOf(colour); if (ci < 0) ci = 0;
        for (var i = 0; i < n && pcount < PMAX; i++) {
            var a = Math.random() * Math.PI * 2;
            var sp = 60 + Math.random() * 190;
            pspawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40,
                   0.5 + Math.random() * 0.7, 2 + Math.random() * 3.5, ci, KIND_SPARK);
        }
    }

    /** Paper confetti: flat rectangles that tumble. Cover screen only.
        Cosmetic, so it draws from crnd(), not Math.random - see crnd(). */
    function confetti(x, y, n) {
        if (RM) n = Math.min(n, 8);
        for (var i = 0; i < n && pcount < PMAX; i++) {
            var a = -Math.PI / 2 + (crnd() - 0.5) * 2.1;
            var sp = 120 + crnd() * 220;
            pspawn(x + (crnd() - 0.5) * 120, y,
                   Math.cos(a) * sp, Math.sin(a) * sp,
                   1.2 + crnd() * 1.1, 4 + crnd() * 4,
                   (crnd() * PCOLS.length) | 0, KIND_CONFETTI,
                   crnd() * Math.PI, J((crnd() - 0.5) * 14));
        }
    }

    /** One out-of-focus highlight. `soft` sets the disc radius, because that is
        exactly what defocus does to a point source. Drifts rather than falls.
        Cosmetic, so it draws from crnd(), not Math.random - see crnd(). */
    function bokeh(x, y, soft, ci) {
        pspawn(x + (crnd() - 0.5) * 14, y + (crnd() - 0.5) * 10,
               J((crnd() - 0.5) * 12), J(-6 - crnd() * 10),
               0.55 + crnd() * 0.7,
               5 + soft * (13 + crnd() * 10), ci, KIND_BOKEH);
    }

    function particlesUpdate(dt) {
        for (var i = pcount - 1; i >= 0; i--) {
            var o = i * PSTRIDE;
            pdata[o + 4] -= dt;
            if (pdata[o + 4] <= 0) {
                var l = (pcount - 1) * PSTRIDE;
                for (var j = 0; j < PSTRIDE; j++) pdata[o + j] = pdata[l + j];
                pcount--;
                continue;
            }
            var kind = pdata[o + 8];
            if (kind === KIND_BOKEH) {
                /* no gravity and no drag: a highlight is not a physical object,
                   it is the lens rendering one */
                pdata[o] += pdata[o + 2] * dt;
                pdata[o + 1] += pdata[o + 3] * dt;
                continue;
            }
            pdata[o + 3] += (kind === KIND_CONFETTI ? 180 : 340) * dt;
            pdata[o] += pdata[o + 2] * dt;
            pdata[o + 1] += pdata[o + 3] * dt;
            pdata[o + 2] *= (1 - (kind === KIND_CONFETTI ? 2.4 : 1.4) * dt);
            pdata[o + 9] += pdata[o + 10] * dt;
        }
    }

    function particlesDraw(ctx) {
        var i, o, a, sz, hadAdditive = false;
        /* Two passes so the composite mode is set twice per frame rather than
           once per particle. Bokeh is additive because light adds; spark and
           confetti are not. */
        for (i = 0; i < pcount; i++) {
            o = i * PSTRIDE;
            if (pdata[o + 8] !== KIND_BOKEH) continue;
            if (!hadAdditive) { ctx.globalCompositeOperation = 'lighter'; hadAdditive = true; }
            a = clamp01(pdata[o + 4] / pdata[o + 5]);
            sz = pdata[o + 6];
            ctx.globalAlpha = a * 0.72;
            ctx.drawImage(bokehSprite(pdata[o + 7] | 0),
                          pdata[o] - sz, pdata[o + 1] - sz, sz * 2, sz * 2);
        }
        if (hadAdditive) ctx.globalCompositeOperation = 'source-over';

        for (i = 0; i < pcount; i++) {
            o = i * PSTRIDE;
            var kind = pdata[o + 8];
            if (kind === KIND_BOKEH) continue;
            a = clamp01(pdata[o + 4] / pdata[o + 5]);
            sz = pdata[o + 6];
            ctx.globalAlpha = a;
            ctx.fillStyle = PCOLS[pdata[o + 7] | 0];
            if (kind === KIND_CONFETTI) {
                /* The tumble is a cos() on one axis, so a flat sheet edges on
                   and briefly vanishes.

                   save/restore, NOT setTransform. The engine applies its DPR
                   scale ONCE in initCanvas and never re-applies it per frame,
                   so a setTransform(1,0,0,1,0,0) to "reset" here does not
                   restore the base transform, it destroys it: every later
                   draw, in this frame and all frames after it, renders at half
                   size on a 2x display. Caught in a cover screenshot where the
                   HUD and the cover plate had both collapsed into the top-left
                   quadrant from the first confetti particle onward. */
                var fl = Math.cos(pdata[o + 9]);
                ctx.save();
                ctx.translate(pdata[o], pdata[o + 1]);
                ctx.rotate(pdata[o + 9] * 0.4);
                ctx.fillRect(-sz / 2, -sz * 0.35 * Math.abs(fl), sz, sz * 0.7 * Math.abs(fl) + 0.8);
                ctx.restore();
            } else {
                /* streak along travel: a spark photographed at 1/250 is a line,
                   not a dot, and the direction sells the burst */
                var vx = pdata[o + 2], vy = pdata[o + 3];
                var sp = Math.sqrt(vx * vx + vy * vy);
                if (sp > 40) {
                    var k = Math.min(9, sp * 0.022) / sp;
                    ctx.lineCap = 'round';
                    ctx.lineWidth = sz * 0.8;
                    ctx.strokeStyle = PCOLS[pdata[o + 7] | 0];
                    ctx.beginPath();
                    ctx.moveTo(pdata[o], pdata[o + 1]);
                    ctx.lineTo(pdata[o] - vx * k, pdata[o + 1] - vy * k);
                    ctx.stroke();
                } else {
                    ctx.fillRect(pdata[o] - sz / 2, pdata[o + 1] - sz / 2, sz, sz);
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    /* ============================================================
       AUDIO SHIM - every call is optional and safe
       ============================================================ */
    function rca(fn, arg) {
        var A = window.RCAudio;
        if (!A || typeof A[fn] !== 'function') return;
        try { A[fn](arg); } catch (_) {}
    }

    /* ============================================================
       UPDATE
       ============================================================ */
    var bokehT = 0;

    function onUpdate(dt) {
        updateAmbient(dt);
        particlesUpdate(dt);

        /* ---- the rack ---- see SHARP_THROW */
        var wantSharp = focusActive ? sharpness(focusT) : 1;
        var throwStep = dt / SHARP_THROW;
        sceneSharp += clamp(wantSharp - sceneSharp, -throwStep, throwStep);
        var soft = 1 - sceneSharp;

        /* Out-of-focus point lights ARE bokeh discs; there is nothing to fake.
           Spawned from the practical lights baked into the scene plate, only
           while the lens is genuinely off the plane. */
        if (soft > 0.22 && PRACTICALS.length) {
            bokehT -= dt;
            if (bokehT <= 0) {
                /* A third of the rate under reduced motion. The discs carry no
                   information (the defocus itself does), and at the full rate
                   they appear and fade often enough to read as twinkling,
                   which is the sort of thing this mode exists to remove. */
                bokehT = (RM ? 0.20 : 0.06) + crnd() * 0.08;
                var pi2 = ((crnd() * (PRACTICALS.length >> 1)) | 0) * 2;
                bokeh(PRACTICALS[pi2], PRACTICALS[pi2 + 1], soft, 3);
            }
        } else {
            bokehT = 0;
        }

        /* photographers' sway, driving the pit parallax */
        var wantPan = subject ? clamp((subject.x - FRAME_CX) / FRAME_HW, -1, 1) * J(5) : 0;
        panX += (wantPan - panX) * Math.min(1, dt * 3.2);

        if (flashGlow > 0) flashGlow = Math.max(0, flashGlow - dt * 2.6);
        if (shutterWipe > 0) shutterWipe = Math.max(0, shutterWipe - dt * 3.4);
        if (camShake > 0) camShake = Math.max(0, camShake - dt * 22);

        if (obstruction) {
            if (obstruction.wait > 0) obstruction.wait -= dt;   // holding offscreen for its cue
            else {
                obstruction.x += obstruction.speed * dt;
                if (obstruction.x < -120 || obstruction.x > W + 120) obstruction = null;
            }
        }

        if (phase === 'walk') {
            var s = subject;
            if (!s) return;
            s.life += dt;
            s.x = subjectX(s);

            if (holding) {
                focusT += dt / FOCUS_SWEEP;
                if (focusT >= 1) { focusT = 1; releaseHold(); return; }  // auto-fire at the end of the rack
            }

            if (!s.shot && s.life > s.total) subjectEscaped(s);

        } else if (phase === 'verdict') {
            verdictT += dt;
            if (verdictT >= VERDICT_HOLD) {
                verdictCard = null;
                focusT = 0;
                if (realDone >= TOTAL_SUBJECTS) beginCover();
                else { phase = 'walk'; nextSubject(); }
            }

        } else if (phase === 'cover') {
            coverT += dt;
            if (coverT > 2.2) coverReady = true;   // long enough to actually be read
            if (coverT > 6.0) finish();
        }
    }

    function beginCover() {
        phase = 'cover'; coverT = 0; coverReady = false;
        subject = null; obstruction = null;
        /* full-issue bonus: every one of the ten landed PAGE SIX or better */
        var clean = shotLog.length >= TOTAL_SUBJECTS && shotLog.every(function (l) {
            return l.kind === 'front' || l.kind === 'exclusive' || l.kind === 'page';
        });
        if (clean) {
            score += 5000;
            GameEngine.state.score = score;
            burst(FRAME_CX, 300, 30, P.gold);
        }
        /* the issue goes to press: a popper from the bottom of the frame */
        confetti(FRAME_CX, H - 30, clean ? 48 : 26);
        coverClean = clean;
        sceneSharp = 1;
        rca('fanfare');
    }
    var coverClean = false;

    var finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        GameEngine.state.score = score;
        GameEngine.endGame();
    }

    /* ============================================================
       OFFSCREEN CACHES
       Everything static is baked once here and blitted per frame. This is what
       buys the focus rack: see the RENDER ARCHITECTURE note at the top.
       ============================================================ */
    var DPR = 1;

    /** Canvas 2D filters carry the whole blur cache. Detect rather than assume:
        without them the game still runs, it just does not rack. */
    var CAN_FILTER = (function () {
        try {
            var g = document.createElement('canvas').getContext('2d');
            g.filter = 'blur(2px)';
            return g.filter === 'blur(2px)';
        } catch (_) { return false; }
    })();

    function surface(w, h, res) {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * res));
        c.height = Math.max(1, Math.round(h * res));
        var g = c.getContext('2d');
        g.scale(res, res);
        return g;
    }

    /** Blur `src` into a NEW canvas of `w`x`h` logical px at resolution `res`.
        Canvas filter lengths are backing-store px and ignore the transform, so
        the identity transform is kept and the radius is scaled by hand.
        The destination-over pass afterwards fills the bleed margin: without it
        the blur samples transparent pixels past the canvas edge and leaves a
        dark fringe all the way round the frame. */
    function blurCopy(src, w, h, res, blurLogical) {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * res));
        c.height = Math.max(1, Math.round(h * res));
        var g = c.getContext('2d');
        var bpx = blurLogical * res;
        if (CAN_FILTER && bpx > 0.05) g.filter = 'blur(' + bpx.toFixed(2) + 'px)';
        g.drawImage(src, 0, 0, c.width, c.height);
        g.filter = 'none';
        if (bpx > 0.05) {
            var m = Math.ceil(bpx * 1.6);
            g.globalCompositeOperation = 'destination-over';
            g.drawImage(src, -m, -m, c.width + m * 2, c.height + m * 2);
            g.globalCompositeOperation = 'source-over';
        }
        return c;
    }

    /* Rack levels. Level 0 is the sharp plate at full DPR; the rest fall away in
       resolution as fast as they gain blur, because a blurred image has no high
       frequencies left to store. ~6.5 MB all in, against ~18 MB if every level
       were full size - and a small blit upscaled is CHEAPER to draw, not just
       cheaper to hold. `at` is the sharpness each level represents. */
    var LEVELS = [
        { at: 1.00, blur: 0,    res: 1.00 },
        { at: 0.62, blur: 2.4,  res: 0.50 },
        { at: 0.28, blur: 6.0,  res: 0.34 },
        { at: 0.00, blur: 13.0, res: 0.22 }
    ];
    var bgLevels = null;         // canvases, index-aligned to LEVELS
    var pitLayers = null;        // [{canvas, par}] back to front
    var uiPlate = null;          // vignette + all static camera chrome
    var bloomPlate = null;       // full-strength flash bloom, blitted at alpha
    var builtDPR = 0;

    /* Practical lights strung along the top of the step-and-repeat. They are
       the point sources the bokeh discs come from, so they live here rather
       than being invented at spawn time. */
    var PRACTICALS = [];

    /* ---- bokeh sprites ----
       One soft disc per particle colour, pre-rendered once. A real defocused
       highlight is brighter at the rim than the centre (the aperture edge), and
       that ring is most of why bokeh reads as bokeh rather than as a blob. */
    var _bokeh = [];
    function bokehSprite(ci) {
        var s = _bokeh[ci];
        if (s) return s;
        var R = 32;
        var g = surface(R * 2, R * 2, 1);
        var col = PCOLS[ci];
        var rg = g.createRadialGradient(R, R, 0, R, R, R);
        rg.addColorStop(0, rgba(col, 0.42));
        rg.addColorStop(0.62, rgba(col, 0.46));
        rg.addColorStop(0.88, rgba(col, 0.85));   // the aperture rim
        rg.addColorStop(0.97, rgba(col, 0.30));
        rg.addColorStop(1, rgba(col, 0));
        g.fillStyle = rg;
        g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
        _bokeh[ci] = s = g.canvas;
        return s;
    }

    /* ---- print tiles (cover screen) ---- */
    var _halftone = null, _grain = null;
    /* res 1 on both tiles: createPattern repeats the BACKING STORE, so a tile
       built at DPR would halve its apparent pitch on a retina screen and the
       screen ruling would change with the device. */
    function halftoneTile(ctx) {
        if (_halftone) return _halftone;
        var S = 5;
        var g = surface(S, S, 1);
        g.fillStyle = rgba(P.ink, 0.5);
        g.beginPath(); g.arc(S / 2, S / 2, 1.25, 0, Math.PI * 2); g.fill();
        g.fillStyle = rgba(P.ink, 0.3);
        g.beginPath(); g.arc(0, 0, 0.85, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(S, S, 0.85, 0, Math.PI * 2); g.fill();
        _halftone = ctx.createPattern(g.canvas, 'repeat');
        return _halftone;
    }
    function grainTile(ctx) {
        if (_grain) return _grain;
        var S = 72;
        var g = surface(S, S, 1);
        var img = g.createImageData(S, S);
        var d = img.data;
        for (var i = 0; i < d.length; i += 4) {
            var v = 128 + (crnd() - 0.5) * 190;
            d[i] = d[i + 1] = d[i + 2] = v;
            d[i + 3] = 26 + crnd() * 22;
        }
        g.putImageData(img, 0, 0);
        _grain = ctx.createPattern(g.canvas, 'repeat');
        return _grain;
    }

    /* ============================================================
       STATIC SCENE PLATE
       ============================================================ */
    function buildScenePlate() {
        var g = surface(W, H, DPR);

        /* Opaque base. The plate has to cover the whole canvas, not just the
           scene band: the blurred levels are blitted with no fill underneath,
           and a transparent top strip would smear the sky upward into it. */
        g.fillStyle = P.ink;
        g.fillRect(0, 0, W, H);

        /* night sky, with the city glow the flashguns are lighting up */
        var sky = g.createLinearGradient(0, SCENE_TOP, 0, HORIZON);
        sky.addColorStop(0, shade(P.ink, -0.28));
        sky.addColorStop(0.72, mix(P.ink, P.rose, 0.22));
        sky.addColorStop(1, mix(P.ink, P.rose, 0.42));
        g.fillStyle = sky;
        g.fillRect(0, SCENE_TOP, W, HORIZON - SCENE_TOP);

        /* Melbourne skyline behind the wall - three flat bands of towers, each
           dimmer and cooler than the one in front. Costs nothing and it is the
           difference between "night" and "a dark rectangle". */
        drawSkyline(g, SCENE_TOP + 14, HORIZON, 0.30, 26, 7);
        drawSkyline(g, SCENE_TOP + 30, HORIZON, 0.46, 34, 11);

        /* step-and-repeat backdrop wall - kept DARK and low-contrast so the
           subjects in front of it read. It is scenery, not a feature. */
        var wallL = 28, wallT = SCENE_TOP + 22, wallW = W - 56, wallH = HORIZON - SCENE_TOP - 22;
        var wall = g.createLinearGradient(0, wallT, 0, HORIZON);
        wall.addColorStop(0, mix(P.rose, P.ink, 0.42));
        wall.addColorStop(1, mix(P.rose, P.ink, 0.72));
        g.fillStyle = wall;
        g.fillRect(wallL, wallT, wallW, wallH);

        /* vinyl sheen: the wall is a printed banner, so it catches the pit
           lights in a broad vertical band rather than uniformly */
        var vinyl = g.createLinearGradient(wallL, 0, wallL + wallW, 0);
        vinyl.addColorStop(0, rgba(P.champ, 0));
        vinyl.addColorStop(0.42, rgba(P.champ, 0.055));
        vinyl.addColorStop(0.58, rgba(P.champ, 0.055));
        vinyl.addColorStop(1, rgba(P.champ, 0));
        g.fillStyle = vinyl;
        g.fillRect(wallL, wallT, wallW, wallH);

        /* repeating logos - clipped to the wall, and laid out so no cell is
           sliced by the clip edge */
        g.save();
        g.beginPath(); g.rect(wallL, wallT, wallW, wallH); g.clip();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        var cols = 4, rows = 6;
        var cellW = wallW / cols, cellH = wallH / rows;
        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {
                var lx = wallL + cellW * (col + 0.5) + (row % 2 ? cellW * 0.5 : 0);
                if (lx > wallL + wallW - 6) lx -= wallW;      // wrap, never clip
                var ly = wallT + cellH * (row + 0.5);
                var alt = (row + col) % 2 === 0;
                g.globalAlpha = 0.20;
                g.fillStyle = alt ? P.blush : P.hot;
                g.font = 'bold ' + (alt ? 12 : 10) + 'px ' + F_UI;
                g.fillText(alt ? 'FLASH!' : 'MIFF 26', lx, ly);
            }
        }
        g.globalAlpha = 1;
        g.restore();

        /* Practical lights along the top rail of the banner. Small, warm and
           STEADY - they never blink, so they are decor, not a flash source. */
        PRACTICALS.length = 0;
        for (var pl = 0; pl < 7; pl++) {
            var lx2 = wallL + 16 + (wallW - 32) * (pl / 6);
            var ly2 = wallT + 7;
            PRACTICALS.push(lx2, ly2);
            var lampG = g.createRadialGradient(lx2, ly2, 0, lx2, ly2, 15);
            lampG.addColorStop(0, rgba(P.champ, 0.75));
            lampG.addColorStop(0.32, rgba(P.blush, 0.30));
            lampG.addColorStop(1, rgba(P.blush, 0));
            g.fillStyle = lampG;
            g.beginPath(); g.arc(lx2, ly2, 15, 0, Math.PI * 2); g.fill();
            g.fillStyle = rgba(P.champ, 0.95);
            g.beginPath(); g.arc(lx2, ly2, 1.7, 0, Math.PI * 2); g.fill();
        }

        /* a soft pool of light spilling down the wall onto the carpet */
        var spill = g.createRadialGradient(W / 2, HORIZON, 10, W / 2, HORIZON, 190);
        spill.addColorStop(0, rgba(P.hot, 0.34));
        spill.addColorStop(1, rgba(P.hot, 0));
        g.fillStyle = spill;
        g.fillRect(0, wallT, W, HORIZON - wallT + 90);

        g.strokeStyle = rgba(P.blush, 0.3); g.lineWidth = 2;
        g.strokeRect(wallL, wallT, wallW, wallH);

        buildCarpet(g);

        /* ---- atmosphere ----
           Three haze planes, one per depth interval. Air between the camera and
           the wall is what stops a flat fill reading as a flat fill, and at a
           night event lit by flashguns there is a lot of it. */
        var hazeA = g.createLinearGradient(0, HORIZON - 46, 0, HORIZON + 30);
        hazeA.addColorStop(0, rgba(P.blush, 0));
        hazeA.addColorStop(0.55, rgba(P.blush, 0.11));
        hazeA.addColorStop(1, rgba(P.blush, 0));
        g.fillStyle = hazeA;
        g.fillRect(0, HORIZON - 46, W, 76);

        var hazeB = g.createLinearGradient(0, WALK_Y - 60, 0, WALK_Y + 44);
        hazeB.addColorStop(0, rgba(P.hot, 0));
        hazeB.addColorStop(0.5, rgba(P.hot, 0.07));
        hazeB.addColorStop(1, rgba(P.hot, 0));
        g.fillStyle = hazeB;
        g.fillRect(0, WALK_Y - 60, W, 104);

        buildBarrier(g);
        return g.canvas;
    }

    /** Flat skyline band. `seed`-free: the shape is deterministic from the loop
        so the plate is identical every build and nothing shimmers on a rebuild. */
    function drawSkyline(g, top, base, alpha, maxH, n) {
        g.fillStyle = rgba(P.rose, alpha);
        var x = -10;
        for (var i = 0; i < n; i++) {
            var w = 14 + ((i * 37) % 5) * 7;
            var h = 8 + ((i * 53) % 7) / 6 * maxH;
            g.fillRect(x, base - h, w, h);
            /* two lit windows per tower, the only warm thing back there */
            g.fillStyle = rgba(P.gold, alpha * 0.5);
            g.fillRect(x + 4, base - h + 5, 2, 2);
            g.fillRect(x + w - 7, base - h + 11, 2, 2);
            g.fillStyle = rgba(P.rose, alpha);
            x += w + 4 + ((i * 29) % 3) * 5;
        }
    }

    /** The carpet. Was a flat trapezoid with a grid; it is now a lit surface
        with pile, a perspective sheen and wear where ten thousand people have
        walked the centre line. */
    function buildCarpet(g) {
        var carpet = g.createLinearGradient(0, HORIZON, 0, PIT_TOP);
        carpet.addColorStop(0, mix(P.hot, P.rose, 0.42));
        carpet.addColorStop(0.35, P.hot);
        carpet.addColorStop(0.62, mix(P.hot, P.rose, 0.62));
        carpet.addColorStop(1, mix(P.rose, P.ink, 0.62));

        g.save();
        g.beginPath();
        g.moveTo(64, HORIZON); g.lineTo(W - 64, HORIZON);
        g.lineTo(W + 40, PIT_TOP); g.lineTo(-40, PIT_TOP);
        g.closePath();
        g.clip();
        g.fillStyle = carpet; g.fillRect(-40, HORIZON, W + 80, PIT_TOP - HORIZON);

        /* Pile. Short strokes whose length and spacing follow the perspective,
           so the nap gets coarser as the carpet comes toward the lens. ~900
           strokes, all at build time, so the runtime cost is exactly zero. */
        var span = PIT_TOP - HORIZON;
        for (var row2 = 0; row2 < 46; row2++) {
            var fy = row2 / 45;
            var yy = HORIZON + span * fy * fy * 0.72 + span * fy * 0.28;
            var step = 5 + fy * 13;
            var len = 2 + fy * 6;
            for (var xx = -40; xx < W + 40; xx += step) {
                var jitter = ((xx * 7 + row2 * 13) % 11) / 11;
                g.globalAlpha = 0.05 + jitter * 0.07;
                g.strokeStyle = jitter > 0.5 ? P.champ : P.ink;
                g.lineWidth = 1 + fy * 1.2;
                g.beginPath();
                g.moveTo(xx + jitter * step, yy);
                g.lineTo(xx + jitter * step + (jitter - 0.5) * 3, yy + len);
                g.stroke();
            }
        }
        g.globalAlpha = 1;

        /* Specular sheen. A carpet lit from the pit throws a broad highlight
           back along the axis of the light, narrowing with distance - so it is
           an ellipse in perspective, not a band. */
        var sheen = g.createRadialGradient(W / 2, PIT_TOP - 40, 10, W / 2, PIT_TOP - 40, 250);
        sheen.addColorStop(0, rgba(P.blush, 0.20));
        sheen.addColorStop(0.45, rgba(P.blush, 0.09));
        sheen.addColorStop(1, rgba(P.blush, 0));
        g.save();
        g.translate(W / 2, PIT_TOP - 40); g.scale(1, 0.42); g.translate(-W / 2, -(PIT_TOP - 40));
        g.fillStyle = sheen;
        g.fillRect(-80, HORIZON - 200, W + 160, 700);
        g.restore();

        /* perspective lanes converging on the vanishing point */
        g.strokeStyle = rgba(P.rose, 0.22); g.lineWidth = 1;
        for (var v = -3; v <= 3; v++) {
            g.beginPath();
            g.moveTo(W / 2 + v * 22, HORIZON);
            g.lineTo(W / 2 + v * 128, PIT_TOP);
            g.stroke();
        }
        /* two cross bands to sell the recede */
        g.strokeStyle = rgba(P.blush, 0.10);
        [0.34, 0.68].forEach(function (f2) {
            var yy2 = HORIZON + span * f2;
            g.beginPath(); g.moveTo(-40, yy2); g.lineTo(W + 40, yy2); g.stroke();
        });

        /* the walked-in centre line, darker and flattened */
        var wear = g.createLinearGradient(0, 0, W, 0);
        wear.addColorStop(0, rgba(P.rose, 0));
        wear.addColorStop(0.5, rgba(P.rose, 0.20));
        wear.addColorStop(1, rgba(P.rose, 0));
        g.fillStyle = wear;
        g.fillRect(0, HORIZON, W, span);
        g.restore();

        /* carpet edge trim */
        g.strokeStyle = rgba(P.champ, 0.5); g.lineWidth = 2;
        g.beginPath(); g.moveTo(64, HORIZON); g.lineTo(-40, PIT_TOP); g.stroke();
        g.beginPath(); g.moveTo(W - 64, HORIZON); g.lineTo(W + 40, PIT_TOP); g.stroke();

        /* floor behind the carpet */
        g.fillStyle = mix(P.ink, P.rose, 0.20);
        g.beginPath(); g.moveTo(0, HORIZON); g.lineTo(64, HORIZON); g.lineTo(-40, PIT_TOP); g.lineTo(0, PIT_TOP); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(W, HORIZON); g.lineTo(W - 64, HORIZON); g.lineTo(W + 40, PIT_TOP); g.lineTo(W, PIT_TOP); g.closePath(); g.fill();
    }

    /** Crowd barrier: posts, rope, and the reflected highlight the pit throws
        along the top edge of every one of them. */
    function buildBarrier(g) {
        for (var i = 0; i < 5; i++) {
            var px = 18 + i * 92;
            var pg = g.createLinearGradient(px, 0, px + 5, 0);
            pg.addColorStop(0, rgba(P.champ, 0.16));
            pg.addColorStop(0.4, rgba(P.champ, 0.42));
            pg.addColorStop(1, rgba(P.champ, 0.14));
            g.fillStyle = pg;
            g.fillRect(px, WALK_Y + 22, 5, 46);
            g.fillStyle = rgba(P.gold, 0.45);
            g.fillRect(px - 2, WALK_Y + 18, 9, 6);
            g.fillStyle = rgba(P.champ, 0.55);
            g.fillRect(px - 2, WALK_Y + 18, 9, 1.5);
        }
        /* the rope: a dark core with a lit upper edge, which is the whole
           difference between a rope and a drawn line */
        g.strokeStyle = rgba(P.gold, 0.42); g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, WALK_Y + 30); g.lineTo(W, WALK_Y + 30); g.stroke();
        g.strokeStyle = rgba(P.champ, 0.34); g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, WALK_Y + 29); g.lineTo(W, WALK_Y + 29); g.stroke();
    }

    /* ============================================================
       FOREGROUND PIT CACHE
       Three parallax layers. Each is pre-blurred by ITS OWN distance and never
       racks: the pit is inside the near focus limit at every rack position, so
       a fixed defocus per layer is the physically right answer as well as the
       cheap one. Was 5 arcs + 5 ellipses + 20 rects per frame; now three blits.
       ============================================================ */
    var PIT_CACHE_TOP = 520, PIT_CACHE_M = 30;
    var PIT_CACHE_H = H - PIT_CACHE_TOP;

    function buildPit() {
        var layers = [
            { par: 0.22, blur: 1.6, n: 7, sc: 0.62, dy: 6,  dark: 0.42 },
            { par: 0.55, blur: 3.2, n: 5, sc: 1.00, dy: 40, dark: 0.16 },
            { par: 1.00, blur: 7.0, n: 2, sc: 1.55, dy: 96, dark: 0.00 }
        ];
        var out = [];
        for (var li = 0; li < layers.length; li++) {
            var L = layers[li];
            var g = surface(W + PIT_CACHE_M * 2, PIT_CACHE_H, DPR);
            g.translate(PIT_CACHE_M, -PIT_CACHE_TOP);   // draw in scene coords

            if (li === 0) {
                /* the scrim that separates pit from carpet lives on the back
                   layer so it sits behind every silhouette */
                var sg = g.createLinearGradient(0, PIT_TOP - 26, 0, H);
                sg.addColorStop(0, rgba(P.ink, 0));
                sg.addColorStop(0.34, rgba(P.ink, 0.90));
                sg.addColorStop(1, P.ink);
                g.fillStyle = sg;
                g.fillRect(-PIT_CACHE_M, PIT_TOP - 26, W + PIT_CACHE_M * 2, H - PIT_TOP + 26);
            }
            for (var i = 0; i < L.n; i++) {
                var t = L.n === 1 ? 0.5 : i / (L.n - 1);
                var hx2 = -14 + t * (W + 28) + ((i * 47) % 13) - 6;
                var hy2 = PIT_TOP + L.dy + ((i % 2) * 16) - 10;
                drawPapSilhouette(g, hx2, hy2, L.sc * (0.88 + ((i * 31) % 5) / 16), i, L.dark);
            }
            out.push({
                canvas: blurCopy(g.canvas, W + PIT_CACHE_M * 2, PIT_CACHE_H,
                                 DPR * (li === 2 ? 0.55 : 0.8), L.blur),
                par: L.par
            });
        }
        return out;
    }

    /** One photographer in the pit. Five body archetypes so the row stops
        reading as the same blob repeated, and a lens whose barrel length and
        hood shape vary - a long white tele among black bodies is what a real
        pit looks like from the front. */
    function drawPapSilhouette(g, x, y, s, i, dark) {
        var kind = i % 5;
        var body = mix(P.ink, P.rose, 0.10 + dark * 0.5);
        var rig = mix(P.ink, P.blush, 0.10 + dark * 0.4);

        g.save();
        g.translate(x, y);
        g.scale(s, s);

        /* shoulders + head */
        g.fillStyle = body;
        g.beginPath(); g.ellipse(0, 44, 36, 32, 0, Math.PI, 0, true); g.fill();
        if (kind === 3) {                                   // hood up
            g.beginPath(); g.ellipse(0, -2, 23, 24, 0, 0, Math.PI * 2); g.fill();
        } else {
            g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
        }
        if (kind === 1) {                                   // cap
            g.beginPath(); g.arc(0, -4, 18, Math.PI, 0); g.fill();
            g.fillRect(-22, -6, 30, 4);
        }

        if (kind === 4) {
            /* one of them is filming on a phone, held high, arms up */
            g.strokeStyle = body; g.lineWidth = 9; g.lineCap = 'round';
            g.beginPath(); g.moveTo(-16, 30); g.lineTo(-9, -22); g.stroke();
            g.beginPath(); g.moveTo(16, 30); g.lineTo(9, -22); g.stroke();
            g.fillStyle = rig;
            GameEngine.drawRoundedRect(g, -6, -40, 12, 20, 2); g.fill();
            g.fillStyle = rgba(P.blush, 0.30);
            g.fillRect(-4.5, -38, 9, 16);
        } else {
            /* camera body, grip and lens barrel */
            var lens = kind === 2 ? 22 : kind === 0 ? 13 : 9;
            var pale = kind === 2;                          // the white tele
            g.fillStyle = rig;
            GameEngine.drawRoundedRect(g, -17, -33, 34, 19, 3); g.fill();
            GameEngine.drawRoundedRect(g, 11, -37, 9, 8, 2); g.fill();   // grip hump
            g.fillStyle = pale ? mix(P.ink, P.champ, 0.30) : rig;
            GameEngine.drawRoundedRect(g, -8, -30, 16, lens, 3); g.fill();
            g.fillStyle = mix(P.ink, P.rose, 0.04);
            g.beginPath(); g.arc(0, -30 + lens - 3, 6.4, 0, Math.PI * 2); g.fill();
            /* STEADY specular on the front element - a glint that never blinks
               is decor; a glint that blinks is a flash source */
            g.fillStyle = rgba(P.blush, 0.34);
            g.beginPath(); g.arc(-2.2, -32 + lens - 3, 2.1, 0, Math.PI * 2); g.fill();
            g.fillStyle = rgba(P.champ, 0.5);
            g.beginPath(); g.arc(-2.6, -32.6 + lens - 3, 0.9, 0, Math.PI * 2); g.fill();
            /* arms bracing the body */
            g.strokeStyle = body; g.lineWidth = 8; g.lineCap = 'round';
            g.beginPath(); g.moveTo(-20, 26); g.lineTo(-12, -22); g.stroke();
            g.beginPath(); g.moveTo(20, 26); g.lineTo(12, -22); g.stroke();
        }
        g.restore();
    }

    /* ============================================================
       STATIC UI PLATE
       One transparent full-canvas overlay holding EVERY part of the camera
       chrome that never changes: the lens vignette, the focusing screen, the
       corner brackets, the top strip and the focus meter rail. It replaces the
       vignette blit that was already being paid for, so it costs no extra fill
       rate, and it removes roughly sixty vector ops and twenty-four text ops
       from every frame. Measured under 4x CPU throttling, fillText +
       strokeText + measureText alone were 6% of samples, and almost all of it
       was redrawing the same static masthead and meter scale sixty times a
       second.
       ============================================================ */
    function buildUI() {
        var g = surface(W, H, DPR);
        var l = FRAME_CX - FRAME_HW, r = FRAME_CX + FRAME_HW;
        var t = FRAME_CY - FRAME_HH, b = FRAME_CY + FRAME_HH;
        var i;

        /* Soft lens vignette. Deliberately NOT four hard rectangles - that read
           as a bright UI panel pasted over the scene rather than as optics. */
        var vig = g.createRadialGradient(FRAME_CX, FRAME_CY, 90, FRAME_CX, FRAME_CY, 330);
        vig.addColorStop(0, rgba(P.ink, 0));
        vig.addColorStop(0.55, rgba(P.ink, 0.18));
        vig.addColorStop(1, rgba(P.ink, 0.78));
        g.fillStyle = vig;
        g.fillRect(0, SCENE_TOP, W, H - SCENE_TOP);

        /* rule of thirds, barely there - it is a focusing screen, not a grid */
        g.strokeStyle = rgba(P.champ, 0.08); g.lineWidth = 1;
        g.beginPath();
        for (i = 1; i <= 2; i++) {
            g.moveTo(l + (r - l) * i / 3, t + 6); g.lineTo(l + (r - l) * i / 3, b - 6);
            g.moveTo(l + 6, t + (b - t) * i / 3); g.lineTo(r - 6, t + (b - t) * i / 3);
        }
        g.stroke();

        /* Corner brackets, with a dark under-stroke. At their old single weight
           they dissolved wherever they crossed the bright band of the carpet,
           which is precisely where they matter. */
        var c = 22;
        var K4 = [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]];
        for (var pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass ? P.bubble : rgba(P.ink, 0.62);
            g.lineWidth = pass ? 2.5 : 5;
            g.lineCap = 'square';
            for (var ci = 0; ci < 4; ci++) {
                var k = K4[ci];
                g.beginPath();
                g.moveTo(k[0] + k[2] * c, k[1]);
                g.lineTo(k[0], k[1]);
                g.lineTo(k[0], k[1] + k[3] * c);
                g.stroke();
            }
        }

        /* AF point array across the focusing screen */
        g.strokeStyle = rgba(P.champ, 0.24); g.lineWidth = 1;
        for (var af = -2; af <= 2; af++) {
            if (!af) continue;
            g.strokeRect(FRAME_CX + af * 34 - 3.5, FRAME_CY - 3.5, 7, 7);
        }

        /* centre reticle */
        g.strokeStyle = rgba(P.champ, 0.7); g.lineWidth = 1;
        g.beginPath();
        g.moveTo(FRAME_CX - 12, FRAME_CY); g.lineTo(FRAME_CX - 4, FRAME_CY);
        g.moveTo(FRAME_CX + 4, FRAME_CY); g.lineTo(FRAME_CX + 12, FRAME_CY);
        g.moveTo(FRAME_CX, FRAME_CY - 12); g.lineTo(FRAME_CX, FRAME_CY - 4);
        g.moveTo(FRAME_CX, FRAME_CY + 4); g.lineTo(FRAME_CX, FRAME_CY + 12);
        g.stroke();

        /* the fixed half of the camera readout */
        g.font = 'bold 9px ' + F_UI;
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillStyle = rgba(P.blush, 0.85);
        g.fillText('ISO 3200   f/2.8   1/250', l, b + 16);

        buildStripPlate(g);
        buildMeterRail(g);
        return g.canvas;
    }

    function buildStripPlate(g) {
        var y = STRIP_Y, h = STRIP_H;
        var sg = g.createLinearGradient(0, y, 0, y + h);
        sg.addColorStop(0, mix(P.ink, P.rose, 0.20, 0.94));
        sg.addColorStop(1, rgba(P.ink, 0.94));
        g.fillStyle = sg;
        GameEngine.drawRoundedRect(g, 8, y, W - 16, h, 5); g.fill();
        g.strokeStyle = rgba(P.hot, 0.9); g.lineWidth = 1.5;
        GameEngine.drawRoundedRect(g, 8, y, W - 16, h, 5); g.stroke();

        /* the live dot every broadcast strip has, plus its halo */
        g.fillStyle = rgba(P.hot, 0.3);
        g.beginPath(); g.arc(21, y + h / 2, 6.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = P.hot;
        g.beginPath(); g.arc(21, y + h / 2, 3.5, 0, Math.PI * 2); g.fill();

        var cy2 = y + h / 2 + 0.5;
        g.font = 'bold 8px ' + F_UI;
        g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillStyle = rgba(P.blush, 0.72);
        g.fillText('MIFF OPENING NIGHT', 32, cy2);

        /* masthead, letter-spaced and given synthetic weight */
        g.font = 'bold 14px ' + F_DISPLAY;
        g.textAlign = 'center';
        tracked(g, 'FLASH!', W / 2 + 16, cy2, 1.6, function (ch, px3) {
            heavy(g, ch, px3, cy2, 14, P.white, rgba(P.hot, 0.85));
        });
    }

    function buildMeterRail(g) {
        var mx = 46, mw = W - 92, my = METER_Y;

        /* machined rail rather than a flat pill */
        var rail = g.createLinearGradient(0, my, 0, my + 14);
        rail.addColorStop(0, rgba(P.ink, 0.94));
        rail.addColorStop(0.5, mix(P.ink, P.rose, 0.22, 0.94));
        rail.addColorStop(1, rgba(P.ink, 0.94));
        g.fillStyle = rail;
        GameEngine.drawRoundedRect(g, mx, my, mw, 14, 7); g.fill();

        /* Bands ARE the scoring gates. Each edge is the exact rack position at
           which sharpness() crosses that verdict's threshold, so the band the
           player is told to aim at is the band they are graded against. The gold
           band previously sat at +/- 0.45 of the half-width, whose edge scored 55:
           it promised the top tier and paid PAGE SIX. */
        var oPage = rackOffsetFor(K_PAGE), oExcl = rackOffsetFor(K_EXCL), oFront = rackOffsetFor(K_FRONT);
        g.fillStyle = rgba(P.bubble, 0.28);                 // scores at all
        g.fillRect(mx + mw * (FOCUS_PEAK - oPage), my + 5, mw * oPage * 2, 4);
        g.fillStyle = rgba(P.gold, 0.45);                   // EXCLUSIVE or better
        g.fillRect(mx + mw * (FOCUS_PEAK - oExcl), my + 2, mw * oExcl * 2, 10);
        g.fillStyle = rgba(P.champ, 0.9);                   // FRONT PAGE
        g.fillRect(mx + mw * (FOCUS_PEAK - oFront), my + 2, mw * oFront * 2, 10);

        /* distance scale, engraved on the barrel */
        g.strokeStyle = rgba(P.blush, 0.30); g.lineWidth = 1;
        g.beginPath();
        for (var ti = 0; ti <= 8; ti++) {
            var tx2 = mx + mw * (ti / 8);
            g.moveTo(tx2, my + 14); g.lineTo(tx2, my + 14 + (ti % 2 === 0 ? 4 : 2));
        }
        g.stroke();
        g.font = 'bold 7px ' + F_UI;
        g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillStyle = rgba(P.blush, 0.5);
        g.fillText('∞', mx - 1, my + 19);
        g.textAlign = 'right';
        g.fillText('0.9m', mx + mw + 1, my + 19);

        g.strokeStyle = rgba(P.bubble, 0.55); g.lineWidth = 1;
        GameEngine.drawRoundedRect(g, mx, my, mw, 14, 7); g.stroke();
    }

    function buildCaches() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        if (builtDPR === DPR && bgLevels) return;
        builtDPR = DPR;
        var plate = buildScenePlate();
        bgLevels = [plate];
        /* Without canvas filters a "blurred" level is only a downscale and an
           upscale, and at these resolutions that reads as aliasing rather than
           defocus: at full rack the step-and-repeat text turns to blocky mush
           and the carpet edge to a sawtooth. So on an engine with no filter
           support, skip the levels entirely and stay on the sharp plate - the
           look this game shipped with. drawScene and figBegin both degrade to
           match, so the frame stays coherent instead of half-racked, and the
           weakest engines also hold ~6 MB less. */
        if (CAN_FILTER) {
            for (var i = 1; i < LEVELS.length; i++) {
                bgLevels.push(blurCopy(plate, W, H,
                                       DPR * LEVELS[i].res, LEVELS[i].blur));
            }
        }
        pitLayers = buildPit();
        uiPlate = buildUI();
        bloomPlate = buildBloom();
        scr = null;                     // scratch is DPR-sized too
    }

    /** Blit the rack. Two levels bracket the current sharpness and cross-fade;
        `hi` is drawn over `lo` at the interpolation weight, both opaque, so the
        result is a straight linear blend between two pre-computed blurs. */
    function drawScene(ctx, sharp) {
        if (bgLevels.length < LEVELS.length) {   // no filter support: sharp only
            ctx.drawImage(bgLevels[0], 0, 0, W, H);
            return;
        }
        var i = 0;
        while (i < LEVELS.length - 2 && sharp < LEVELS[i + 1].at) i++;
        var a = LEVELS[i].at, b = LEVELS[i + 1].at;
        var f = clamp01((a - sharp) / (a - b));            // 0 = level i, 1 = level i+1
        ctx.drawImage(bgLevels[i], 0, 0, W, H);
        if (f > 0.004) {
            ctx.globalAlpha = f;
            ctx.drawImage(bgLevels[i + 1], 0, 0, W, H);
            ctx.globalAlpha = 1;
        }
    }

    /* ============================================================
       FIGURE DEFOCUS - ring kernel
       Figures draw live, so they cannot use the level cache. Instead the whole
       group is drawn ONCE into a reused scratch canvas and blitted back six
       times around two small hexagonal rings. A ring is the point-spread
       function of a defocused lens, and six samples on two radii is a six-blade
       aperture, so the cheap approximation is also the physically honest one.
       Alpha runs 1, 1/2, 1/3 ... 1/n, which composites to an exact mean.
       ============================================================ */
    /* Sized against the WIDEST group that goes through it, which is a drive-by:
       the car body plus its headlight wash spans +/- 168 and hangs 53 below the
       figure baseline. An under-size here would clip art, not merely soften it,
       because these bounds are the blit rectangle. */
    var SCR_W = 400, SCR_H = 340, SCR_AX = 200, SCR_AY = 258;
    var MAX_DEFOCUS = 9;
    var scr = null;
    var RING = (function () {
        var r = [], i;
        for (i = 0; i < 3; i++) {
            var a = i / 3 * Math.PI * 2 + 0.52;
            r.push(Math.cos(a), Math.sin(a));
        }
        for (i = 0; i < 3; i++) {
            var b = i / 3 * Math.PI * 2 + 0.52 + Math.PI / 3;
            r.push(Math.cos(b) * 0.54, Math.sin(b) * 0.54);
        }
        return r;
    })();

    var _fgOn = false, _fgSoft = 0, _fgCX = 0, _fgCY = 0, _fgHW = 0, _fgUp = 0, _fgDn = 0;

    /** Returns the context to draw the group into (scene coordinates work
        unchanged), or null when it is sharp enough to draw straight through.
        Always pair with figEnd(). */
    function figBegin(ctx, soft, cx, cy, hw, up, dn) {
        /* The ring kernel is pure drawImage, so it would still rack on an engine
           with no canvas filter support. It is gated anyway: with the background
           locked sharp there (see buildCaches), a defocused subject in front of a
           pin-sharp world inverts the photographic logic the whole mechanic
           rests on, and reads as a bug rather than as a rack. Either everything
           racks or nothing does. The focus meter still gives the player the
           feedback they aim with. */
        _fgOn = CAN_FILTER && soft >= 0.06;
        if (!_fgOn) return ctx;
        if (!scr) scr = surface(SCR_W, SCR_H, DPR);
        _fgSoft = soft; _fgCX = cx; _fgCY = cy; _fgHW = hw; _fgUp = up; _fgDn = dn;
        var r = soft * MAX_DEFOCUS + 2;
        scr.setTransform(DPR, 0, 0, DPR, 0, 0);
        scr.clearRect(SCR_AX - hw - r, SCR_AY - up - r, (hw + r) * 2, up + dn + r * 2);
        scr.translate(SCR_AX - cx, SCR_AY - cy);
        return scr;
    }

    function figEnd(ctx) {
        if (!_fgOn) return;
        _fgOn = false;
        var r = _fgSoft * MAX_DEFOCUS;
        var m = r + 2;
        var sx = (SCR_AX - _fgHW - m) * DPR, sy = (SCR_AY - _fgUp - m) * DPR;
        var sw = (_fgHW + m) * 2 * DPR, sh = (_fgUp + _fgDn + m * 2) * DPR;
        var dx = _fgCX - _fgHW - m, dy = _fgCY - _fgUp - m;
        var dw = (_fgHW + m) * 2, dh = _fgUp + _fgDn + m * 2;
        var img = scr.canvas;
        /* Sample count scales with the radius. A tight ring needs three
           samples to look continuous; only a wide one shows the gaps between
           them, and at 4x CPU throttling each sample is a real blit of up to
           366K device px. RING is ordered outer-then-inner so a short run
           still spans the full disc rather than clustering in the middle. */
        var n = _fgSoft < 0.34 ? 3 : _fgSoft < 0.7 ? 4 : 6;
        for (var i = 0; i < n; i++) {
            ctx.globalAlpha = 1 / (i + 1);
            ctx.drawImage(img, sx, sy, sw, sh,
                          dx + RING[i * 2] * r, dy + RING[i * 2 + 1] * r, dw, dh);
        }
        ctx.globalAlpha = 1;
    }

    /* ============================================================
       FIGURE DRAWING
       ============================================================ */
    /* Arm colours, set once per figure rather than threaded through twenty
       call sites. */
    var _armSkin = '#000', _armDark = '#000', _armLit = null;

    /** Arm as a quadratic through an elbow control point, drawn three times:
        a dark outline for separation, the limb, then a thin highlight along the
        pit-facing side. Three strokes of a two-segment path is still an order
        of magnitude cheaper than the ctx.shadowBlur pass this replaced. */
    function arm(ctx, sx, sy, hx, hy, bend, wdt) {
        wdt = wdt || 5;
        ctx.lineCap = 'round';
        /* 0.55 damping: at full strength the control point bowed the limb into
           a lasso loop rather than an elbow. */
        bend *= 0.55;
        var mx = (sx + hx) / 2 + bend, my = (sy + hy) / 2 + Math.abs(bend) * 0.18;

        ctx.lineWidth = wdt + 1.7;
        ctx.strokeStyle = _armDark;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();

        ctx.lineWidth = wdt;
        ctx.strokeStyle = _armSkin;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();

        if (_armLit) {
            ctx.lineWidth = wdt * 0.34;
            ctx.strokeStyle = _armLit;
            ctx.beginPath();
            ctx.moveTo(sx, sy + wdt * 0.26);
            ctx.quadraticCurveTo(mx, my + wdt * 0.26, hx, hy + wdt * 0.26);
            ctx.stroke();
        }
        /* hand */
        ctx.fillStyle = _armSkin;
        ctx.beginPath(); ctx.arc(hx, hy, wdt * 0.6, 0, Math.PI * 2); ctx.fill();
    }

    /* ============================================================
       HAIR
       Ten silhouettes. At an 11px head radius the outline is doing nearly all
       of the identification work the render can do, so this is where the
       differentiation budget went rather than into facial detail.
       ============================================================ */
    /** Mass BEHIND the head: the part that reads at distance. */
    function hairBack(ctx, lk, cy, r, s) {
        var st = lk.hairStyle;
        var dark = shade(lk.hair, -0.30);
        ctx.fillStyle = dark;
        if (st === 'long' || st === 'wavy') {
            ctx.beginPath();
            ctx.moveTo(-r * 1.05, cy - r * 0.3);
            if (st === 'wavy') {
                ctx.quadraticCurveTo(-r * 1.85, cy + r * 0.9, -r * 1.15, cy + r * 1.7);
                ctx.quadraticCurveTo(-r * 1.9, cy + r * 2.4, -r * 0.85, cy + r * 3.1);
                ctx.lineTo(r * 0.85, cy + r * 3.1);
                ctx.quadraticCurveTo(r * 1.9, cy + r * 2.4, r * 1.15, cy + r * 1.7);
                ctx.quadraticCurveTo(r * 1.85, cy + r * 0.9, r * 1.05, cy - r * 0.3);
            } else {
                ctx.quadraticCurveTo(-r * 1.62, cy + r * 1.4, -r * 1.02, cy + r * 2.95);
                ctx.lineTo(r * 1.02, cy + r * 2.95);
                ctx.quadraticCurveTo(r * 1.62, cy + r * 1.4, r * 1.05, cy - r * 0.3);
            }
            ctx.arc(0, cy, r * 1.05, 0, Math.PI, true);
            ctx.closePath(); ctx.fill();
        } else if (st === 'bob') {
            ctx.beginPath();
            ctx.arc(0, cy, r * 1.16, Math.PI, 0);
            ctx.lineTo(r * 1.16, cy + r * 1.05);
            ctx.quadraticCurveTo(0, cy + r * 1.35, -r * 1.16, cy + r * 1.05);
            ctx.closePath(); ctx.fill();
        } else if (st === 'updo') {
            ctx.beginPath(); ctx.arc(0, cy - r * 1.18, r * 0.72, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, cy, r * 1.08, Math.PI, 0); ctx.fill();
        } else if (st === 'pony') {
            ctx.beginPath();
            ctx.moveTo(r * 0.5, cy - r * 0.4);
            ctx.quadraticCurveTo(r * 2.1, cy + r * 0.1, r * 1.5, cy + r * 1.9);
            ctx.quadraticCurveTo(r * 1.15, cy + r * 0.7, r * 0.3, cy + r * 0.35);
            ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.arc(0, cy, r * 1.06, Math.PI, 0); ctx.fill();
        } else if (st === 'curls') {
            /* scalloped halo: eight overlapping discs read as volume where a
               single arc reads as a helmet */
            for (var i = 0; i < 8; i++) {
                var a = Math.PI + (i / 7) * Math.PI;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, r * 0.44, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /** The hairline ON the skull, drawn after the face so it frames it. */
    function hairFront(ctx, lk, cy, r, s) {
        var st = lk.hairStyle;
        var lit = ctx.createLinearGradient(0, cy - r * 1.5, 0, cy + r * 0.4);
        lit.addColorStop(0, mix(lk.hair, LIGHT_RIM, 0.30));
        lit.addColorStop(0.5, lk.hair);
        lit.addColorStop(1, shade(lk.hair, -0.28));
        ctx.fillStyle = lit;

        if (st === 'buzz') {
            ctx.beginPath(); ctx.arc(0, cy - r * 0.06, r * 1.0, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
        } else if (st === 'slick') {
            ctx.beginPath();
            ctx.arc(0, cy - r * 0.1, r * 1.06, Math.PI * 1.0, Math.PI * 2.0);
            ctx.quadraticCurveTo(0, cy - r * 0.42, -r * 1.06, cy - r * 0.1);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = shade(lk.hair, -0.45); ctx.lineWidth = 0.9 * s;
            ctx.beginPath();
            ctx.moveTo(-r * 0.42, cy - r * 0.95); ctx.lineTo(-r * 0.3, cy - r * 0.2);
            ctx.stroke();
        } else if (st === 'quiff') {
            ctx.beginPath();
            ctx.arc(0, cy - r * 0.05, r * 1.06, Math.PI * 1.02, Math.PI * 1.98);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();                                   // the tuft
            ctx.moveTo(-r * 0.62, cy - r * 0.78);
            ctx.quadraticCurveTo(-r * 0.2, cy - r * 1.95, r * 0.62, cy - r * 1.22);
            ctx.quadraticCurveTo(r * 0.2, cy - r * 1.02, -r * 0.62, cy - r * 0.78);
            ctx.closePath(); ctx.fill();
        } else if (st === 'curls') {
            for (var i = 0; i < 6; i++) {
                var a = Math.PI * 1.08 + (i / 5) * Math.PI * 0.84;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (st === 'bob') {
            ctx.beginPath();
            ctx.arc(0, cy, r * 1.16, Math.PI, 0);
            ctx.lineTo(r * 1.16, cy + r * 0.2);
            ctx.lineTo(r * 0.78, cy + r * 0.16);
            ctx.quadraticCurveTo(0, cy - r * 0.55, -r * 0.5, cy - r * 0.2);   // sweep across
            ctx.lineTo(-r * 1.16, cy + r * 0.2);
            ctx.closePath(); ctx.fill();
        } else if (st === 'updo' || st === 'pony') {
            ctx.beginPath();
            ctx.arc(0, cy - r * 0.08, r * 1.06, Math.PI * 1.0, Math.PI * 2.0);
            ctx.quadraticCurveTo(0, cy - r * 0.5, -r * 1.06, cy - r * 0.08);
            ctx.closePath(); ctx.fill();
        } else if (st === 'long' || st === 'wavy') {
            /* centre part with the two side falls that frame the face */
            ctx.beginPath();
            ctx.arc(0, cy, r * 1.06, Math.PI, 0);
            ctx.lineTo(r * 1.06, cy + r * 0.85);
            ctx.quadraticCurveTo(r * 0.86, cy - r * 0.1, r * 0.26, cy - r * 0.62);
            ctx.lineTo(-r * 0.26, cy - r * 0.62);
            ctx.quadraticCurveTo(-r * 0.86, cy - r * 0.1, -r * 1.06, cy + r * 0.85);
            ctx.closePath(); ctx.fill();
        } else {
            /* short - the fringe must clear the eye line; at its original depth
               it drew a visor straight across the face */
            ctx.beginPath();
            ctx.arc(0, cy - r * 0.09, r * 1.06, Math.PI * 1.02, Math.PI * 1.98);
            ctx.quadraticCurveTo(r * 0.3, cy - r * 0.52, -r * 1.06, cy - r * 0.24);
            ctx.closePath(); ctx.fill();
        }
    }

    /** Expression. Three marks maximum: brows, eyes, mouth. Anything more at
        this scale reads as noise and drifts toward the uncanny, which the
        stylisation constraint rules out anyway. */
    function drawFace(ctx, lk, cy, r, s, flash) {
        var ink = mix(P.ink, lk.skin, 0.12);
        var eyeY = cy + r * 0.1, eyeX = r * 0.34;

        /* brow: height and tilt both track lk.brow, so one number carries the
           whole range from furrowed to delighted */
        var bw = 1.0 * s + 0.25;
        ctx.strokeStyle = shade(lk.hair, -0.2);
        ctx.lineWidth = bw; ctx.lineCap = 'round';
        var by = eyeY - r * (0.34 + lk.brow * 0.16);
        var tilt = -lk.brow * r * 0.13;
        ctx.beginPath();
        ctx.moveTo(-eyeX - r * 0.22, by - tilt); ctx.lineTo(-eyeX + r * 0.2, by + tilt * 0.4);
        ctx.moveTo(eyeX + r * 0.22, by - tilt); ctx.lineTo(eyeX - r * 0.2, by + tilt * 0.4);
        ctx.stroke();

        if (lk.shades) {
            ctx.fillStyle = mix(P.ink, lk.c1, 0.10);
            GameEngine.drawRoundedRect(ctx, -r * 0.92, eyeY - r * 0.34, r * 1.84, r * 0.62, r * 0.24);
            ctx.fill();
            /* one raking specular - the reason shades read as glass */
            ctx.strokeStyle = rgba(P.champ, 0.55 + 0.35 * flash);
            ctx.lineWidth = 0.9 * s;
            ctx.beginPath();
            ctx.moveTo(-r * 0.74, eyeY + r * 0.14); ctx.lineTo(-r * 0.36, eyeY - r * 0.2);
            ctx.stroke();
        } else {
            ctx.fillStyle = ink;
            ctx.beginPath(); ctx.arc(-eyeX, eyeY, 1.25 * s, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(eyeX, eyeY, 1.25 * s, 0, Math.PI * 2); ctx.fill();
            /* catchlight from the pit, low and frontal like the key */
            ctx.fillStyle = rgba(P.champ, 0.55 + 0.4 * flash);
            ctx.beginPath(); ctx.arc(-eyeX + 0.4 * s, eyeY + 0.4 * s, 0.42 * s, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(eyeX + 0.4 * s, eyeY + 0.4 * s, 0.42 * s, 0, Math.PI * 2); ctx.fill();
        }

        /* beard sits under the mouth line but over the jaw fill */
        if (lk.beard) {
            ctx.save();
            ctx.globalAlpha = lk.beard === 'stubble' ? 0.34 : 0.92;
            ctx.fillStyle = shade(lk.hair, -0.18);
            ctx.beginPath();
            ctx.moveTo(-r * 0.82, cy + r * 0.16);
            ctx.quadraticCurveTo(-r * 0.86, cy + r * 0.95, 0, cy + r * 1.04);
            ctx.quadraticCurveTo(r * 0.86, cy + r * 0.95, r * 0.82, cy + r * 0.16);
            ctx.quadraticCurveTo(r * 0.42, cy + r * 0.5, 0, cy + r * 0.46);
            ctx.quadraticCurveTo(-r * 0.42, cy + r * 0.5, -r * 0.82, cy + r * 0.16);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        /* mouth */
        var my2 = cy + r * (lk.beard === 'full' ? 0.66 : 0.6);
        var mw = r * 0.36;
        ctx.strokeStyle = mix(P.ink, P.rose, 0.35);
        ctx.lineWidth = 1.05 * s; ctx.lineCap = 'round';
        ctx.beginPath();
        if (lk.mouth === 'flat') {
            ctx.moveTo(-mw * 0.85, my2); ctx.lineTo(mw * 0.85, my2);
        } else if (lk.mouth === 'wry') {
            /* one corner up, the other level - a half smile, literally */
            ctx.moveTo(-mw, my2 + r * 0.06);
            ctx.quadraticCurveTo(0, my2 + r * 0.16, mw, my2 - r * 0.14);
        } else if (lk.mouth === 'pout') {
            ctx.lineWidth = 1.7 * s;
            ctx.moveTo(-mw * 0.7, my2); ctx.lineTo(mw * 0.7, my2);
        } else if (lk.mouth === 'grin' || lk.mouth === 'open') {
            ctx.moveTo(-mw * 1.1, my2 - r * 0.1);
            ctx.quadraticCurveTo(0, my2 + r * (lk.mouth === 'open' ? 0.5 : 0.34), mw * 1.1, my2 - r * 0.1);
        } else {  /* smile */
            ctx.moveTo(-mw * 0.9, my2 - r * 0.04);
            ctx.quadraticCurveTo(0, my2 + r * 0.24, mw * 0.9, my2 - r * 0.04);
        }
        ctx.stroke();
        if (lk.mouth === 'open' || lk.mouth === 'grin') {      // a hint of teeth
            ctx.fillStyle = rgba(P.champ, lk.mouth === 'open' ? 0.85 : 0.6);
            ctx.beginPath();
            ctx.moveTo(-mw * 0.9, my2 - r * 0.02);
            ctx.quadraticCurveTo(0, my2 + r * (lk.mouth === 'open' ? 0.42 : 0.26), mw * 0.9, my2 - r * 0.02);
            ctx.quadraticCurveTo(0, my2 + r * 0.02, -mw * 0.9, my2 - r * 0.02);
            ctx.closePath(); ctx.fill();
        }
        if (lk.mouth === 'pout') {
            ctx.fillStyle = rgba(P.champ, 0.3);
            ctx.fillRect(-mw * 0.24, my2 - 1.4 * s, mw * 0.48, 0.7 * s);
        }
    }

    /**
     * Draw one stylised figure. `y` is the feet baseline. Deliberately a
     * caricature silhouette read through hair, outfit and prop - the name tag
     * above the head carries identification (and is gameplay-critical, since
     * the player must tell celebrities from traps).
     */
    function drawFigure(ctx, lk, x, y, s0, poseAmt, flash) {
        var s = s0 * lk.ht;
        flash = flash || 0;
        var headR = 11 * s;
        var headCY = y - 141 * s;
        var shoY = y - 118 * s;
        var hipY = y - 66 * s;
        var shoW = (lk.outfit === 'kit' ? 15 : 16) * s * lk.build;

        /* The three-source model, resolved once per figure. KEY is low and
           frontal (the pit), RIM comes off the lit backdrop above and behind,
           BOUNCE is the carpet throwing pink up. The player's flash raises the
           key and the specular together, which is what actually makes a frame
           look flash-lit rather than merely brighter. */
        var key = 0.22 + 0.5 * flash;
        var rimA = 0.30 + 0.34 * flash;
        var skinLit = mix(lk.skin, LIGHT_KEY, key * 0.55);
        var skinDark = mix(lk.skin, P.ink, 0.42);

        ctx.save();
        ctx.translate(x, 0);

        /* Ground shadow, warmed by the carpet rather than neutral black, plus
           the pit key throwing it backward instead of straight down. */
        var gs = ctx.createRadialGradient(0, y + 4 * s, 1, 0, y + 4 * s, 27 * s);
        gs.addColorStop(0, rgba(P.ink, 0.62));
        gs.addColorStop(0.6, rgba(P.ink, 0.30));
        gs.addColorStop(1, rgba(P.ink, 0));
        ctx.fillStyle = gs;
        ctx.save();
        ctx.translate(0, y + 4 * s); ctx.scale(1, 0.24); ctx.translate(0, -(y + 4 * s));
        ctx.beginPath(); ctx.arc(0, y + 4 * s, 27 * s, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        /* Separation glow. One radial gradient replaces the per-shape
           ctx.shadowBlur the figure used to carry: canvas shadows force a
           blur pass on EVERY draw call, and there are twenty of them here, so
           this was the single most expensive thing in the frame. Lighting the
           edges instead of blurring them behind reads better as well. */
        var sep = ctx.createRadialGradient(0, y - 76 * s, 10 * s, 0, y - 76 * s, 62 * s);
        sep.addColorStop(0, rgba(P.ink, 0.42));
        sep.addColorStop(1, rgba(P.ink, 0));
        ctx.fillStyle = sep;
        ctx.beginPath(); ctx.ellipse(0, y - 76 * s, 46 * s, 84 * s, 0, 0, Math.PI * 2); ctx.fill();

        /* wings sit behind everything */
        if (lk.outfit === 'wings') {
            var spread = 0.55 + poseAmt * 0.45;
            var wingG = ctx.createLinearGradient(0, shoY - 54 * s, 0, shoY + 34 * s);
            wingG.addColorStop(0, rgba(P.champ, 0.72));
            wingG.addColorStop(0.55, rgba(P.blush, 0.42));
            wingG.addColorStop(1, rgba(P.hot, 0.30));
            [-1, 1].forEach(function (sgn) {
                ctx.fillStyle = wingG;
                ctx.strokeStyle = rgba(P.champ, 0.85); ctx.lineWidth = 1.4 * s;
                ctx.beginPath();
                ctx.moveTo(sgn * 6 * s, shoY);
                ctx.quadraticCurveTo(sgn * 74 * s * spread, shoY - 54 * s, sgn * 58 * s * spread, shoY + 34 * s);
                ctx.quadraticCurveTo(sgn * 30 * s, shoY + 20 * s, sgn * 6 * s, shoY);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                /* feather ribs, which is the whole difference between a wing
                   and a translucent blob */
                ctx.strokeStyle = rgba(P.champ, 0.34); ctx.lineWidth = 0.9 * s;
                for (var fw = 1; fw <= 4; fw++) {
                    var ft = fw / 5;
                    ctx.beginPath();
                    ctx.moveTo(sgn * 8 * s, shoY + 2 * s);
                    ctx.quadraticCurveTo(sgn * (40 + 24 * ft) * s * spread, shoY - (34 - 40 * ft) * s,
                                         sgn * (58 - 6 * ft) * s * spread, shoY + (32 * ft - 2) * s);
                    ctx.stroke();
                }
            });
        }

        /* legs / skirt */
        if (lk.outfit === 'gown' || lk.outfit === 'wings') {
            /* Gown fall: a nipped waist and a flared, curved hem rather than a
               straight-sided trapezoid, with the light running top-to-bottom
               through the key. */
            var gown = ctx.createLinearGradient(0, shoY, 0, y);
            gown.addColorStop(0, mix(lk.c1, LIGHT_RIM, 0.16 * rimA * 3));
            gown.addColorStop(0.26, shade(lk.c1, -0.12));
            gown.addColorStop(0.68, mix(lk.c2, P.ink, 0.14));
            gown.addColorStop(1, mix(lk.c2, LIGHT_BOUNCE, 0.24 + 0.22 * flash));
            ctx.fillStyle = gown;
            ctx.beginPath();
            ctx.moveTo(-shoW * 0.84, shoY + 2 * s);
            ctx.quadraticCurveTo(-shoW * 0.5, hipY - 12 * s, -11 * s, hipY + 4 * s);
            ctx.quadraticCurveTo(-20 * s, y - 42 * s, -27 * s, y - 1 * s);
            ctx.quadraticCurveTo(0, y + 8 * s, 27 * s, y - 1 * s);
            ctx.quadraticCurveTo(20 * s, y - 42 * s, 11 * s, hipY + 4 * s);
            ctx.quadraticCurveTo(shoW * 0.5, hipY - 12 * s, shoW * 0.84, shoY + 2 * s);
            ctx.closePath(); ctx.fill();
            /* three fold lines, lit on one side and shadowed on the other */
            for (var fi = -1; fi <= 1; fi++) {
                ctx.strokeStyle = rgba(P.ink, 0.18); ctx.lineWidth = 1.1 * s;
                ctx.beginPath();
                ctx.moveTo(fi * 6 * s, hipY + 4 * s);
                ctx.quadraticCurveTo(fi * 13 * s, y - 34 * s, fi * 19 * s, y - 2 * s);
                ctx.stroke();
                ctx.strokeStyle = rgba(P.champ, 0.16); ctx.lineWidth = 0.7 * s;
                ctx.beginPath();
                ctx.moveTo(fi * 6 * s + 1.4 * s, hipY + 4 * s);
                ctx.quadraticCurveTo(fi * 13 * s + 1.4 * s, y - 34 * s, fi * 19 * s + 1.4 * s, y - 2 * s);
                ctx.stroke();
            }
            ctx.strokeStyle = rgba(P.ink, 0.42); ctx.lineWidth = 1 * s;
            ctx.beginPath();
            ctx.moveTo(-shoW * 0.84, shoY + 2 * s);
            ctx.quadraticCurveTo(-shoW * 0.5, hipY - 12 * s, -11 * s, hipY + 4 * s);
            ctx.quadraticCurveTo(-20 * s, y - 42 * s, -27 * s, y - 1 * s);
            ctx.stroke();
        } else {
            var trouser = lk.outfit === 'kit' ? lk.c2 : lk.c1;
            var legLit = mix(trouser, LIGHT_BOUNCE, 0.14 + 0.18 * flash);
            ctx.lineCap = 'round';
            ctx.strokeStyle = shade(trouser, -0.45); ctx.lineWidth = 9.4 * s;
            ctx.beginPath(); ctx.moveTo(-5 * s, hipY); ctx.lineTo(-7 * s, y - 2 * s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5 * s, hipY); ctx.lineTo(7 * s, y - 2 * s); ctx.stroke();
            ctx.strokeStyle = trouser; ctx.lineWidth = 8 * s;
            ctx.beginPath(); ctx.moveTo(-5 * s, hipY); ctx.lineTo(-7 * s, y - 2 * s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5 * s, hipY); ctx.lineTo(7 * s, y - 2 * s); ctx.stroke();
            /* the crease catching the pit light down the front of each leg */
            ctx.strokeStyle = rgba(P.champ, 0.13 + 0.16 * flash); ctx.lineWidth = 1.6 * s;
            ctx.beginPath(); ctx.moveTo(-5 * s, hipY + 6 * s); ctx.lineTo(-6.4 * s, y - 6 * s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5 * s, hipY + 6 * s); ctx.lineTo(6.4 * s, y - 6 * s); ctx.stroke();
            if (lk.outfit === 'kit') {                       // socks
                ctx.strokeStyle = lk.c1; ctx.lineWidth = 7 * s;
                ctx.beginPath(); ctx.moveTo(-6.5 * s, y - 20 * s); ctx.lineTo(-7 * s, y - 2 * s); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(6.5 * s, y - 20 * s); ctx.lineTo(7 * s, y - 2 * s); ctx.stroke();
                ctx.strokeStyle = rgba(P.champ, 0.22); ctx.lineWidth = 1.6 * s;
                ctx.beginPath(); ctx.moveTo(-8.6 * s, y - 18 * s); ctx.lineTo(-9 * s, y - 6 * s); ctx.stroke();
            }
            /* shoes, with the patent shine that reads as black tie */
            ctx.fillStyle = shade(P.ink, 0.06);
            ctx.fillRect(-11.5 * s, y - 3.4 * s, 10 * s, 4.4 * s);
            ctx.fillRect(1.5 * s, y - 3.4 * s, 10 * s, 4.4 * s);
            ctx.fillStyle = rgba(P.champ, 0.24 + 0.3 * flash);
            ctx.fillRect(-11.5 * s, y - 3.4 * s, 10 * s, 1 * s);
            ctx.fillRect(1.5 * s, y - 3.4 * s, 10 * s, 1 * s);
        }

        /* torso */
        if (lk.outfit !== 'gown' && lk.outfit !== 'wings') {
            /* Sloped shoulder line and a taper to the waist. The old rounded
               rect gave every subject the same rectangular silhouette, which is
               most of why the build attribute now exists. */
            var body = ctx.createLinearGradient(0, shoY - 8 * s, 0, hipY + 8 * s);
            body.addColorStop(0, mix(lk.c1, LIGHT_RIM, 0.16 * rimA * 2.6));
            body.addColorStop(0.42, shade(lk.c1, -0.14));
            body.addColorStop(1, mix(lk.c1, LIGHT_BOUNCE, 0.14 + 0.22 * flash));
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.moveTo(-shoW, shoY + 3 * s);
            ctx.quadraticCurveTo(-shoW * 1.04, shoY - 6 * s, -shoW * 0.62, shoY - 7 * s);
            ctx.lineTo(shoW * 0.62, shoY - 7 * s);
            ctx.quadraticCurveTo(shoW * 1.04, shoY - 6 * s, shoW, shoY + 3 * s);
            ctx.lineTo(shoW * 0.9, hipY + 5 * s);
            ctx.quadraticCurveTo(0, hipY + 10 * s, -shoW * 0.9, hipY + 5 * s);
            ctx.closePath(); ctx.fill();
            /* rim along the shoulder line, from the lit backdrop behind */
            ctx.strokeStyle = rgba(LIGHT_RIM, rimA * 0.7); ctx.lineWidth = 1.2 * s;
            ctx.beginPath();
            ctx.moveTo(-shoW, shoY + 3 * s);
            ctx.quadraticCurveTo(-shoW * 1.04, shoY - 6 * s, -shoW * 0.62, shoY - 7 * s);
            ctx.lineTo(shoW * 0.62, shoY - 7 * s);
            ctx.quadraticCurveTo(shoW * 1.04, shoY - 6 * s, shoW, shoY + 3 * s);
            ctx.stroke();

            if (lk.outfit === 'tux' || lk.outfit === 'suit') {
                /* shirt panel, always contrasting with the jacket */
                var shirt = contrast(lk.c1, 0.42);
                ctx.fillStyle = shirt;
                ctx.beginPath();
                ctx.moveTo(-5.4 * s, shoY - 4 * s); ctx.lineTo(5.4 * s, shoY - 4 * s);
                ctx.lineTo(3.2 * s, hipY - 2 * s); ctx.lineTo(-3.2 * s, hipY - 2 * s);
                ctx.closePath(); ctx.fill();
                /* lapels: shaded AWAY from the jacket, so a white dinner
                   jacket keeps its lapels instead of dissolving into a slab */
                ctx.fillStyle = contrast(lk.c1, 0.26);
                ctx.beginPath();
                ctx.moveTo(-6.2 * s, shoY - 6 * s);
                ctx.lineTo(-0.6 * s, shoY + 19 * s);
                ctx.lineTo(-1.2 * s, shoY - 5 * s);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(6.2 * s, shoY - 6 * s);
                ctx.lineTo(0.6 * s, shoY + 19 * s);
                ctx.lineTo(1.2 * s, shoY - 5 * s);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = rgba(P.champ, 0.26 + 0.3 * flash); ctx.lineWidth = 0.8 * s;
                ctx.beginPath();
                ctx.moveTo(-6.2 * s, shoY - 6 * s); ctx.lineTo(-0.6 * s, shoY + 19 * s);
                ctx.moveTo(6.2 * s, shoY - 6 * s); ctx.lineTo(0.6 * s, shoY + 19 * s);
                ctx.stroke();
                if (lk.outfit === 'tux') {                    // bow tie
                    ctx.fillStyle = contrast(lk.c1, 0.55);
                    ctx.beginPath();
                    ctx.moveTo(-4.6 * s, shoY - 3 * s); ctx.lineTo(-0.7 * s, shoY - 0.4 * s);
                    ctx.lineTo(-4.6 * s, shoY + 2.2 * s);
                    ctx.closePath(); ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(4.6 * s, shoY - 3 * s); ctx.lineTo(0.7 * s, shoY - 0.4 * s);
                    ctx.lineTo(4.6 * s, shoY + 2.2 * s);
                    ctx.closePath(); ctx.fill();
                } else {                                       // pocket square
                    ctx.fillStyle = lk.c2;
                    ctx.fillRect(-shoW * 0.72, shoY + 14 * s, 4.4 * s, 2 * s);
                }
            } else if (lk.outfit === 'kit' && lk.num) {       // collar + squad number
                ctx.strokeStyle = lk.c2; ctx.lineWidth = 1.8 * s;
                ctx.beginPath();
                ctx.moveTo(-5 * s, shoY - 5 * s); ctx.lineTo(0, shoY + 3 * s); ctx.lineTo(5 * s, shoY - 5 * s);
                ctx.stroke();
                ctx.fillStyle = shade(lk.c2, 0.1);
                ctx.font = 'bold ' + (11 * s).toFixed(1) + 'px ' + F_UI;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(lk.num, 0, (shoY + hipY) / 2 + 2 * s);
                /* sleeve cuffs */
                ctx.fillStyle = lk.c2;
                ctx.fillRect(-shoW, shoY - 2 * s, shoW * 0.36, 2.4 * s);
                ctx.fillRect(shoW * 0.64, shoY - 2 * s, shoW * 0.36, 2.4 * s);
            }
        }

        /* arms - pose archetypes */
        _armSkin = lk.skin;
        _armDark = skinDark;
        _armLit = rgba(LIGHT_KEY, 0.16 + 0.3 * flash);
        var lsx = -shoW * 0.9, rsx = shoW * 0.9;
        var pa = poseAmt;
        var pose = lk.pose;

        if (pose === 'armsUp') {
            arm(ctx, lsx, shoY, -30 * s, shoY - (34 + 14 * pa) * s, -12 * s, 5 * s);
            arm(ctx, rsx, shoY, 30 * s, shoY - (34 + 14 * pa) * s, 12 * s, 5 * s);
        } else if (pose === 'heart') {
            var hy = shoY + (16 - 6 * pa) * s;
            arm(ctx, lsx, shoY, -5 * s, hy, -16 * s, 5 * s);
            arm(ctx, rsx, shoY, 5 * s, hy, 16 * s, 5 * s);
            if (pa > 0.15) {                                   // the heart itself
                ctx.fillStyle = P.hot;
                ctx.globalAlpha = clamp01(pa);
                var hs = 6 * s * (0.7 + 0.3 * pa);
                ctx.beginPath();
                ctx.moveTo(0, hy + hs * 0.9);
                ctx.bezierCurveTo(-hs * 1.6, hy - hs * 0.4, -hs * 0.5, hy - hs * 1.5, 0, hy - hs * 0.5);
                ctx.bezierCurveTo(hs * 0.5, hy - hs * 1.5, hs * 1.6, hy - hs * 0.4, 0, hy + hs * 0.9);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        } else if (pose === 'point') {
            arm(ctx, rsx, shoY, (26 + 10 * pa) * s, shoY - (40 + 16 * pa) * s, 14 * s, 5 * s);
            arm(ctx, lsx, shoY, -14 * s, hipY - 2 * s, -8 * s, 5 * s);
        } else if (pose === 'wave') {
            arm(ctx, rsx, shoY, (22 + 6 * pa) * s, shoY - (26 + 12 * pa) * s, 12 * s, 5 * s);
            arm(ctx, lsx, shoY, -13 * s, hipY, -8 * s, 5 * s);
        } else if (pose === 'hipcock') {
            arm(ctx, lsx, shoY, -16 * s, hipY - 6 * s, -22 * s, 5 * s);   // hand on hip
            arm(ctx, rsx, shoY, (14 + 6 * pa) * s, hipY + 4 * s, 12 * s, 5 * s);
        } else if (pose === 'cross') {
            arm(ctx, lsx, shoY, 9 * s, shoY + 22 * s, 4 * s, 5 * s);
            arm(ctx, rsx, shoY, -9 * s, shoY + 26 * s, -4 * s, 5 * s);
        } else if (pose === 'wings') {
            arm(ctx, lsx, shoY, -(28 + 8 * pa) * s, shoY + 6 * s, -8 * s, 5 * s);
            arm(ctx, rsx, shoY, (28 + 8 * pa) * s, shoY + 6 * s, 8 * s, 5 * s);
        } else if (pose === 'phone') {
            arm(ctx, rsx, shoY, 8 * s, shoY - 12 * s, 12 * s, 5 * s);
            ctx.fillStyle = P.ink; ctx.fillRect(5 * s, shoY - 18 * s, 6 * s, 10 * s);
            arm(ctx, lsx, shoY, -13 * s, hipY, -8 * s, 5 * s);
        } else if (pose === 'camera') {
            arm(ctx, lsx, shoY, -8 * s, shoY - 16 * s, -10 * s, 5 * s);
            arm(ctx, rsx, shoY, 8 * s, shoY - 16 * s, 10 * s, 5 * s);
            ctx.fillStyle = T.charcoal;
            GameEngine.drawRoundedRect(ctx, -11 * s, shoY - 26 * s, 22 * s, 13 * s, 3 * s); ctx.fill();
            ctx.fillStyle = P.ink;
            ctx.beginPath(); ctx.arc(0, shoY - 19.5 * s, 4.5 * s, 0, Math.PI * 2); ctx.fill();
        } else if (pose === 'lanyard') {
            arm(ctx, lsx, shoY, -13 * s, hipY, -8 * s, 5 * s);
            arm(ctx, rsx, shoY, 13 * s, hipY, 8 * s, 5 * s);
            ctx.strokeStyle = P.gold; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-6 * s, shoY); ctx.lineTo(0, shoY + 20 * s); ctx.lineTo(6 * s, shoY); ctx.stroke();
            ctx.fillStyle = P.white; ctx.fillRect(-4 * s, shoY + 20 * s, 8 * s, 6 * s);
        } else { /* pockets */
            arm(ctx, lsx, shoY, -12 * s, hipY - 2 * s, -14 * s, 5 * s);
            arm(ctx, rsx, shoY, 12 * s, hipY - 2 * s, 14 * s, 5 * s);
        }

        /* props */
        if (lk.prop === 'trophy') {
            var tx = 30 * s, ty = shoY - (34 + 14 * pa) * s;
            ctx.fillStyle = P.gold;
            ctx.beginPath();
            ctx.moveTo(tx - 7 * s, ty - 10 * s); ctx.lineTo(tx + 7 * s, ty - 10 * s);
            ctx.lineTo(tx + 3 * s, ty + 2 * s); ctx.lineTo(tx - 3 * s, ty + 2 * s);
            ctx.closePath(); ctx.fill();
            ctx.fillRect(tx - 5 * s, ty + 2 * s, 10 * s, 3 * s);
            if (!RM) {                                          // glint cycle
                var gl = 0.5 + 0.5 * Math.sin(performance.now() / 260);
                ctx.globalAlpha = gl * 0.9;
                ctx.fillStyle = P.champ;
                ctx.fillRect(tx - 2 * s, ty - 9 * s, 2 * s, 8 * s);
                ctx.globalAlpha = 1;
            }
        } else if (lk.prop === 'boot') {
            var bx = -16 * s, by = hipY - 4 * s;
            ctx.fillStyle = P.gold;
            ctx.beginPath();
            ctx.moveTo(bx, by); ctx.lineTo(bx + 4 * s, by - 9 * s);
            ctx.lineTo(bx + 9 * s, by - 9 * s); ctx.lineTo(bx + 11 * s, by);
            ctx.closePath(); ctx.fill();
        }

        /* ---- head ----
           Order is back hair, neck, skull, bounce, rim, front hair, face. The
           old code drew hair OVER the head and then punched a skin ellipse back
           through it, which is exactly why every face sat inside a flat oval
           mask with no jaw and no expression. */
        hairBack(ctx, lk, headCY, headR, s);

        /* neck, with the jaw shadow that stops the head reading as a balloon */
        ctx.strokeStyle = skinDark; ctx.lineWidth = 6.4 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, headCY + headR * 0.6); ctx.lineTo(0, shoY - 1 * s); ctx.stroke();
        ctx.strokeStyle = lk.skin; ctx.lineWidth = 5.4 * s;
        ctx.beginPath(); ctx.moveTo(0, headCY + headR * 0.95); ctx.lineTo(0, shoY - 1 * s); ctx.stroke();

        /* Skull and jaw. The jaw widens a little with build, which turns out to
           be the second strongest identity channel after the hair silhouette. */
        var jw = 1 + (lk.build - 1) * 0.42;
        var headG = ctx.createRadialGradient(0, headCY + headR * 0.5, headR * 0.1,
                                             0, headCY - headR * 0.15, headR * 1.75);
        headG.addColorStop(0, mix(lk.skin, LIGHT_KEY, key * 0.62));
        headG.addColorStop(0.42, skinLit);
        headG.addColorStop(0.78, lk.skin);
        headG.addColorStop(1, skinDark);
        ctx.fillStyle = headG;
        ctx.beginPath();
        ctx.ellipse(0, headCY, headR * jw, headR, 0, Math.PI, 0);
        ctx.lineTo(headR * jw, headCY + headR * 0.24);
        ctx.quadraticCurveTo(headR * jw * 0.88, headCY + headR * 1.0, 0, headCY + headR * 1.12);
        ctx.quadraticCurveTo(-headR * jw * 0.88, headCY + headR * 1.0, -headR * jw, headCY + headR * 0.24);
        ctx.closePath(); ctx.fill();

        /* carpet bounce up under the chin - the tell that this is a night frame
           shot over a hot pink floor and not a studio portrait */
        ctx.fillStyle = rgba(LIGHT_BOUNCE, 0.15 + 0.14 * flash);
        ctx.beginPath();
        ctx.moveTo(-headR * jw * 0.8, headCY + headR * 0.52);
        ctx.quadraticCurveTo(0, headCY + headR * 1.32, headR * jw * 0.8, headCY + headR * 0.52);
        ctx.quadraticCurveTo(0, headCY + headR * 0.8, -headR * jw * 0.8, headCY + headR * 0.52);
        ctx.closePath(); ctx.fill();

        /* rim off the lit backdrop, upper left only */
        ctx.strokeStyle = rgba(LIGHT_RIM, rimA * 0.9); ctx.lineWidth = 1.25 * s;
        ctx.beginPath();
        ctx.ellipse(0, headCY, headR * jw, headR, 0, Math.PI * 1.04, Math.PI * 1.72);
        ctx.stroke();

        hairFront(ctx, lk, headCY, headR, s);
        drawFace(ctx, lk, headCY, headR, s, flash);

        ctx.restore();
    }

    /** Name tag above the subject. Identification is gameplay-critical - a
        misread trap costs 500 points - so the uplift made the tag MORE legible
        rather than prettier: an opaque plate, a hairline drop shadow so it
        holds against the brightest part of the carpet, and a notch pointing at
        whoever it is labelling.

        It also fixes the deferred crowding bug. "NOT A CELEBRITY" used to be a
        separate centred string ~100px wide floating above a plate as narrow as
        60px, so on a short name near the frame edge it overhung the plate and
        ran off canvas. It is now a line INSIDE the plate and the plate is sized
        to the wider of the two strings, so it can never overhang and the
        clamp() that keeps the plate on screen now keeps the warning on screen
        too. */
    var _tagW = {};

    function drawNameTag(ctx, s, x, topY) {
        var name = s.celeb.name;
        var trap = s.trap;
        var col = trap ? P.rose : (TIER_COLOUR[s.celeb.tier] || P.blush);
        var warn = '✘ NOT A CELEBRITY';

        ctx.save();
        /* Plate width is measured once per name, not sixty times a second.
           There are 30-odd names in the roster, so the cache never grows. */
        var w = _tagW[name];
        if (w === undefined) {
            ctx.font = 'bold 10px ' + F_UI;
            var nw = ctx.measureText(name).width;
            ctx.font = 'bold 9px ' + F_UI;
            var ww = trap ? ctx.measureText(warn).width : 0;
            w = _tagW[name] = Math.max(nw + 26, ww + 20);
        }
        var h = trap ? 29 : 17;
        var bottom = topY + 17;
        var ty = bottom - h;
        var tx = clamp(x - w / 2, 4, W - w - 4);
        var nx = clamp(x, tx + 12, tx + w - 12);

        /* drop shadow: one offset plate, no blur */
        ctx.fillStyle = rgba(P.ink, 0.55);
        GameEngine.drawRoundedRect(ctx, tx + 1, ty + 2, w, h, 8); ctx.fill();

        var plate = ctx.createLinearGradient(0, ty, 0, ty + h);
        plate.addColorStop(0, rgba(P.ink, 0.97));
        plate.addColorStop(1, mix(P.ink, col, 0.16, 0.97));
        ctx.fillStyle = plate;
        GameEngine.drawRoundedRect(ctx, tx, ty, w, h, 8); ctx.fill();

        /* notch, so a plate pushed sideways by the clamp still points home */
        ctx.beginPath();
        ctx.moveTo(nx - 4.5, bottom - 1); ctx.lineTo(nx, bottom + 4.5); ctx.lineTo(nx + 4.5, bottom - 1);
        ctx.closePath(); ctx.fill();

        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, tx, ty, w, h, 8); ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (trap) {
            ctx.font = 'bold 9px ' + F_UI;
            ctx.fillStyle = P.rose;
            ctx.fillText(warn, tx + w / 2, ty + 9);
            ctx.strokeStyle = rgba(P.rose, 0.5); ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx + 8, ty + 16); ctx.lineTo(tx + w - 8, ty + 16); ctx.stroke();
        } else {
            /* tier chip: a shape channel for tier, so the tag does not rely on
               its border colour alone */
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(tx + 9, ty + h / 2, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.font = 'bold 10px ' + F_UI;
        ctx.fillStyle = trap ? P.blush : P.white;
        ctx.fillText(name, tx + w / 2 + (trap ? 0 : 4), bottom - 8.5);
        ctx.restore();
    }

    /* ============================================================
       DRAW
       ============================================================ */
    function onDraw(ctx) {
        if (!bgLevels) buildCaches();

        /* The cover fills the canvas itself, so skip the scene blit entirely
           rather than painting it and covering it over. */
        if (phase === 'cover') { drawCover(ctx); return; }

        ctx.save();
        if (camShake > 0.1) {
            ctx.translate((Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake);
        }

        drawScene(ctx, sceneSharp);
        drawCarpetSpecular(ctx);
        drawAmbientPops(ctx);
        if (subject) drawSubject(ctx, subject);
        if (obstruction) drawObstruction(ctx, obstruction);
        drawPit(ctx);
        particlesDraw(ctx);

        ctx.restore();

        drawViewfinder(ctx);
        drawStrip(ctx);
        if (phase === 'verdict' && verdictCard) drawVerdict(ctx);
        drawFlash(ctx);
    }

    /** The specular band the flash lays down the carpet. Driven ENTIRELY by
        flashGlow, which only ever rises inside triggerFlash() behind the
        canFlash() scheduler, so this is not a new flash source - it is the
        existing one made visible on the floor instead of only at the frame
        edge. Perspective-correct: squashed toward the horizon and centred on
        the pit, because that is where the light is. */
    function drawCarpetSpecular(ctx) {
        if (flashGlow <= 0.02) return;
        var a = flashGlow;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(FRAME_CX, PIT_TOP - 30);
        ctx.scale(1, 0.30);
        var g = ctx.createRadialGradient(0, 0, 8, 0, 0, 230);
        g.addColorStop(0, rgba(P.champ, 0.36 * a));
        g.addColorStop(0.4, rgba(P.blush, 0.17 * a));
        g.addColorStop(1, rgba(P.hot, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 230, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawSubject(ctx, s) {
        var x = s.x;
        var pa = 0;
        if (inPose(s)) {
            var pt = (s.life - s.poseStart) / Math.max(0.001, s.poseEnd - s.poseStart);
            pa = clamp01(Math.sin(clamp01(pt) * Math.PI) * 1.6);
        } else if (inTell(s)) {
            pa = 0.18 * ((s.life - s.tellAt) / Math.max(0.001, s.poseStart - s.tellAt));
        }

        /* the tell - a readable wind-up 400ms before the pose */
        if (inTell(s) && !RM) {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = P.champ; ctx.lineWidth = 2;
            var r = 30 + 16 * (1 - (s.life - s.tellAt) / Math.max(0.001, s.poseStart - s.tellAt));
            ctx.beginPath(); ctx.arc(x, WALK_Y - 90, r, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }

        var drive = s.mode === 'drive';
        /* -16, was -34. The drive-by baseline is now set so the subject's HIP
           lands in the open window rather than above the roofline: at -34 the
           whole torso cleared the car and they read as standing in front of
           it, which was invisible while the car was a flat black rectangle and
           obvious the moment it had panels. Rendering only - the scoring axes
           read x, never y. */
        var baseY = drive ? WALK_Y - 16 : WALK_Y;
        var scale = drive ? 0.62 : 1;
        var soft = 1 - sceneSharp;
        /* The subject is what the flash is FOR, so it takes the relight harder
           than the frame edge does. Same source, same scheduler. */
        var flash = clamp01(flashGlow * 1.3);

        /* Spotlight pool on the carpet. Without this the figure sits on a flat
           magenta slab with nothing separating the two. Stays sharp: it is a
           soft gradient already, so defocusing it would cost and show nothing. */
        if (!drive) {
            var pool = ctx.createRadialGradient(x, baseY, 4, x, baseY, 96);
            pool.addColorStop(0, rgba(P.champ, 0.30 + 0.18 * flash));
            pool.addColorStop(0.5, rgba(P.blush, 0.12));
            pool.addColorStop(1, rgba(P.blush, 0));
            ctx.fillStyle = pool;
            ctx.beginPath(); ctx.ellipse(x, baseY, 96, 34, 0, 0, Math.PI * 2); ctx.fill();
        }

        /* Pose halo goes BEHIND the figure - drawn over the top it cut straight
           through the body and fought the focus ring for the same space. */
        var posing = inPose(s) && phase === 'walk';
        if (posing) {
            ctx.save();
            ctx.globalAlpha = 0.22 + 0.20 * pa;
            var hr = (62 + 10 * pa) * scale;
            var hg = ctx.createRadialGradient(x, baseY - 74 * scale, hr * 0.55, x, baseY - 74 * scale, hr);
            hg.addColorStop(0, rgba(P.gold, 0));
            hg.addColorStop(0.8, rgba(P.gold, 0.55));
            hg.addColorStop(1, rgba(P.gold, 0));
            ctx.fillStyle = hg;
            ctx.beginPath(); ctx.arc(x, baseY - 74 * scale, hr, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        /* ---- the defocus group ----
           Car and figures rack together because they are at the same distance.
           Bounds are generous but finite: they set the blit rectangle, so an
           under-estimate would clip the art, not just soften it. */
        var figs = s.celeb.figures;
        var maxHt = figs.length > 1 ? Math.max(figs[0].ht, figs[1].ht) : figs[0].ht;
        var hw = drive ? 172 : (s.pair ? 96 : 84) * scale;
        var up = drive ? 130 : 196 * maxHt * scale;
        var dn = drive ? 60 : 26;

        var g = figBegin(ctx, soft, x, baseY, hw, up, dn);
        /* The car is drawn in two passes with the subject between them, so
           they lean OUT of it. Drawn as one pass behind the figure, the
           subject's legs and shoes painted over the bonnet and the whole
           drive-by read as a person standing in front of a car. */
        if (drive) drawCarBack(g, x, s.dir);
        if (s.pair) {
            drawFigure(g, figs[1], x + s.spread, baseY, scale, pa, flash);
            drawFigure(g, figs[0], x - s.spread, baseY, scale, pa, flash);
        } else {
            drawFigure(g, figs[0], x, baseY, scale, pa, flash);
        }
        if (drive) drawCarFront(g, x, s.dir, flash);
        figEnd(ctx);

        /* "shoot now" affordance, placed on clear carpet below the feet so it
           never collides with the name tag above the head */
        if (posing) {
            ctx.font = 'bold 11px ' + F_DISPLAY;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            heavy(ctx, '★ POSE', x, baseY + 48, 11, P.gold, rgba(P.ink, 0.85));
        }

        /* The verdict card owns the centre of the frame while it is up - the
           tag would sit directly under its glyph. 184 rather than the old flat
           176 because ht now varies: at ht 1.09 a raised-arm pose reaches
           y - 185, which the old constant sat inside. The extra 26 for a prop
           clears Rodri's trophy, which is held above the raised hand and was
           printing behind the tag plate. */
        if (phase === 'walk') {
            var clear = (figs[0].prop ? 210 : 184) * maxHt * scale;
            drawNameTag(ctx, s, x, baseY - clear);
        }
    }

    var CAR_Y = WALK_Y + 6;

    /** Everything behind the subject: the headlight wash, the roof and the
        dark of the open window they are framed in. */
    function drawCarBack(ctx, x, dir) {
        var y = CAR_Y;
        ctx.save();
        var hlg = ctx.createLinearGradient(x + dir * 82, 0, x + dir * 170, 0);
        hlg.addColorStop(0, rgba(P.champ, 0.34));
        hlg.addColorStop(1, rgba(P.champ, 0));
        ctx.fillStyle = hlg;
        ctx.beginPath();
        ctx.moveTo(x + dir * 78, y - 32);
        ctx.lineTo(x + dir * 168, y - 50);
        ctx.lineTo(x + dir * 168, y + 2);
        ctx.lineTo(x + dir * 78, y - 12);
        ctx.closePath(); ctx.fill();

        /* roof and glasshouse */
        var roofG = ctx.createLinearGradient(0, y - 84, 0, y - 50);
        roofG.addColorStop(0, mix(T.black, P.blush, 0.22));
        roofG.addColorStop(1, shade(T.black, -0.5));
        ctx.fillStyle = roofG;
        GameEngine.drawRoundedRect(ctx, x - 60, y - 82, 118, 32, 8); ctx.fill();

        /* the open window, dark, so the subject reads against it */
        ctx.fillStyle = mix(P.ink, T.black, 0.5);
        GameEngine.drawRoundedRect(ctx, x - 34, y - 78, 68, 26, 5); ctx.fill();
        ctx.restore();
    }

    /** Everything in front: the body, which occludes the subject from the
        waist down, plus the chrome and wheels. */
    function drawCarFront(ctx, x, dir, flash) {
        var y = CAR_Y;
        flash = flash || 0;
        ctx.save();

        /* A black car at a night carpet event is essentially a mirror, so it is
           drawn as one: a dark base with a hard horizon reflection line and the
           pink of the carpet coming back up off the lower panels. */
        var bodyG = ctx.createLinearGradient(0, y - 56, 0, y - 8);
        bodyG.addColorStop(0, mix(T.black, P.blush, 0.16));
        bodyG.addColorStop(0.30, T.black);
        bodyG.addColorStop(0.55, mix(T.black, P.champ, 0.10));   // horizon line
        bodyG.addColorStop(0.62, shade(T.black, -0.4));
        bodyG.addColorStop(1, mix(T.black, P.hot, 0.26));        // carpet bounce
        ctx.fillStyle = bodyG;
        GameEngine.drawRoundedRect(ctx, x - 82, y - 54, 164, 44, 10); ctx.fill();

        /* door line and window sill */
        ctx.strokeStyle = rgba(P.ink, 0.7); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x + 6, y - 52); ctx.lineTo(x + 6, y - 14); ctx.stroke();
        ctx.fillStyle = rgba(P.champ, 0.22);
        ctx.fillRect(x - 36, y - 55, 72, 1.6);

        /* the flash coming back off the paintwork */
        if (flash > 0.02) {
            ctx.fillStyle = rgba(P.champ, 0.34 * flash);
            GameEngine.drawRoundedRect(ctx, x - 78, y - 52, 156, 5, 3); ctx.fill();
        }
        /* chrome waistline */
        ctx.fillStyle = rgba(P.champ, 0.30);
        ctx.fillRect(x - 80, y - 30, 160, 1.4);

        /* wheels */
        ctx.fillStyle = shade(P.ink, -0.5);
        ctx.beginPath(); ctx.arc(x - 50, y - 8, 14.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 50, y - 8, 14.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = mix(T.silver, P.ink, 0.35);
        ctx.beginPath(); ctx.arc(x - 50, y - 8, 5.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 50, y - 8, 5.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(P.champ, 0.5);
        ctx.beginPath(); ctx.arc(x - 51.5, y - 9.5, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 48.5, y - 9.5, 1.8, 0, Math.PI * 2); ctx.fill();

        /* headlamp itself */
        ctx.fillStyle = rgba(P.champ, 0.85);
        ctx.beginPath(); ctx.ellipse(x + dir * 76, y - 26, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawObstruction(ctx, o) {
        /* Obstructions sit between the lens and the subject, so they rack with
           everything else - a blocker that stayed razor sharp while the subject
           went soft would read as UI rather than as something in the way. */
        var soft = 1 - sceneSharp;
        /* anchored 24px below o.y so the tall shapes (the placard pole reaches
           o.y + 86) sit inside the scratch canvas rather than off its foot */
        var g = figBegin(ctx, soft, o.x, o.y + 24, 92, 68, 68);
        g.save();
        if (o.kind === 'umbrella') {
            var ug = g.createLinearGradient(o.x, o.y - 44, o.x, o.y);
            ug.addColorStop(0, mix(T.black, P.blush, 0.14));
            ug.addColorStop(1, shade(T.black, -0.4));
            g.fillStyle = ug;
            g.beginPath(); g.arc(o.x, o.y, 44, Math.PI, 0); g.fill();
            /* canopy ribs and the scalloped hem - an umbrella is panels, and
               without them this was a black semicircle */
            g.strokeStyle = rgba(P.ink, 0.7); g.lineWidth = 1.2;
            for (var rb = -2; rb <= 2; rb++) {
                g.beginPath();
                g.moveTo(o.x, o.y - 2);
                g.lineTo(o.x + rb * 21, o.y);
                g.stroke();
            }
            g.strokeStyle = rgba(P.champ, 0.20); g.lineWidth = 1.4;
            g.beginPath();
            for (var sc2 = -2; sc2 <= 1; sc2++) {
                g.moveTo(o.x + sc2 * 22, o.y);
                g.quadraticCurveTo(o.x + sc2 * 22 + 11, o.y + 5, o.x + sc2 * 22 + 22, o.y);
            }
            g.stroke();
            g.strokeStyle = T.charcoal; g.lineWidth = 3;
            g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x, o.y + 62); g.stroke();
            g.fillStyle = rgba(P.champ, 0.14);
            g.beginPath(); g.arc(o.x, o.y, 44, Math.PI, Math.PI * 1.5); g.fill();
        } else if (o.kind === 'arm') {
            g.strokeStyle = shade(T.charcoal, -0.3); g.lineWidth = 17; g.lineCap = 'round';
            g.beginPath();
            g.moveTo(o.x - o.dir * 60, o.y + 54);
            g.quadraticCurveTo(o.x, o.y + 6, o.x + o.dir * 22, o.y + 26);
            g.stroke();
            g.strokeStyle = rgba(P.champ, 0.13); g.lineWidth = 4;
            g.beginPath();
            g.moveTo(o.x - o.dir * 58, o.y + 50);
            g.quadraticCurveTo(o.x, o.y + 2, o.x + o.dir * 21, o.y + 22);
            g.stroke();
            /* the flat palm of a hand shoved at the lens */
            g.fillStyle = T.charcoal;
            GameEngine.drawRoundedRect(g, o.x - 15, o.y - 8, 32, 21, 6); g.fill();
            g.strokeStyle = rgba(P.ink, 0.6); g.lineWidth = 1;
            for (var fg = 0; fg < 3; fg++) {
                g.beginPath();
                g.moveTo(o.x - 8 + fg * 8, o.y - 6); g.lineTo(o.x - 8 + fg * 8, o.y + 10);
                g.stroke();
            }
        } else { /* nophotos - a publicist's placard */
            g.fillStyle = mix(T.skinA, P.ink, 0.14);
            GameEngine.drawRoundedRect(g, o.x - 24, o.y - 27, 48, 54, 9); g.fill();
            g.strokeStyle = rgba(P.rose, 0.75); g.lineWidth = 2;
            GameEngine.drawRoundedRect(g, o.x - 21, o.y - 24, 42, 48, 7); g.stroke();
            g.fillStyle = P.rose;
            g.font = 'bold 9px ' + F_DISPLAY;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('NO', o.x, o.y - 7);
            g.fillText('PHOTOS', o.x, o.y + 5);
            g.strokeStyle = T.charcoal; g.lineWidth = 4;
            g.beginPath(); g.moveTo(o.x, o.y + 27); g.lineTo(o.x, o.y + 84); g.stroke();
        }
        g.restore();
        figEnd(ctx);
    }

    function drawAmbientPops(ctx) {
        if (!ambient.pops.length) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < ambient.pops.length; i++) {
            var p = ambient.pops[i];
            var a = clamp01(p.life / p.max);
            var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, rgba(P.champ, 0.5 * a));
            g.addColorStop(0.5, rgba(P.blush, 0.18 * a));
            g.addColorStop(1, rgba(P.blush, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    /** Foreground paparazzi pit: three cached parallax layers. The sway is
        driven by the subject's position, i.e. the photographer leaning to keep
        them in frame, and is J()-gated because it is pure kinetics. */
    function drawPit(ctx) {
        var w = W + PIT_CACHE_M * 2;
        for (var i = 0; i < pitLayers.length; i++) {
            var L = pitLayers[i];
            ctx.drawImage(L.canvas, -PIT_CACHE_M - panX * L.par, PIT_CACHE_TOP, w, PIT_CACHE_H);
        }
    }

    /* ---- viewfinder chrome ---- */
    function drawViewfinder(ctx) {
        var l = FRAME_CX - FRAME_HW, r = FRAME_CX + FRAME_HW;
        var t = FRAME_CY - FRAME_HH, b = FRAME_CY + FRAME_HH;

        ctx.save();

        /* One blit carries the vignette, the focusing screen, the brackets,
           the top strip and the meter rail. See buildUI(). */
        ctx.drawImage(uiPlate, 0, 0, W, H);

        /* live framing readout - how centred is the subject right now */
        if (subject && !subject.shot && phase === 'walk') {
            var fx = clamp(subject.x, l + 6, r - 6);
            var good = Math.abs(subject.x - FRAME_CX) < 30;
            ctx.strokeStyle = good ? P.gold : rgba(P.bubble, 0.85);
            ctx.lineWidth = good ? 2.5 : 1.5;
            ctx.beginPath(); ctx.moveTo(fx, t + 4); ctx.lineTo(fx, t + 16); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(fx, b - 16); ctx.lineTo(fx, b - 4); ctx.stroke();
            if (good) {                                        // AF lock corners
                ctx.strokeStyle = rgba(P.gold, 0.8); ctx.lineWidth = 1.5;
                ctx.strokeRect(FRAME_CX - 26, FRAME_CY - 26, 52, 52);
            }
        }

        /* Focus ring - deliberately SMALL and locked to the reticle. At its
           original size it sat exactly where the subject's pose halo lands and
           the two read as one confused double ring. Size and position now
           separate the camera channel from the subject channel. */
        if (focusActive) {
            var sh = sharpness(focusT);
            var rad = lerp(40, 13, focusT) + (1 - sh) * 9;
            /* same two gates as the meter: gold from EXCLUSIVE, the callout only
               once FRONT PAGE is actually live */
            ctx.strokeStyle = sh * 100 >= K_EXCL ? P.gold : P.champ;
            ctx.lineWidth = 1 + sh * 2.2;
            ctx.globalAlpha = 0.5 + sh * 0.5;
            ctx.beginPath(); ctx.arc(FRAME_CX, FRAME_CY, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            if (sh * 100 >= K_FRONT) {                         // explicit "sharp" callout
                ctx.font = 'bold 11px ' + F_DISPLAY;
                ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
                heavy(ctx, 'SHARP', FRAME_CX, FRAME_CY - rad - 9, 11, P.gold, rgba(P.ink, 0.9));
            }
        }

        /* the live half of the camera readout (the fixed half is on the plate) */
        ctx.font = 'bold 9px ' + F_UI;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'right';
        /* Focus distance, derived from the rack rather than decorative: the
           lens really is travelling from infinity to the near stop and back. */
        ctx.fillStyle = rgba(P.blush, focusActive ? 0.95 : 0.55);
        ctx.fillText(focusActive
            ? (0.9 + (1 - focusT) * 7.4).toFixed(1) + ' m'
            : 'AF ●', r, b + 16);
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(P.blush, 0.7);
        ctx.fillText('FRAME ' + Math.min(realDone + 1, TOTAL_SUBJECTS) + '/' + TOTAL_SUBJECTS,
                     FRAME_CX, b + 16);

        drawFocusMeter(ctx);
        ctx.restore();
    }

    /** Explicit focus meter with a visible sweet spot - this is what makes the
        core mechanic learnable rather than mysterious. */
    function drawFocusMeter(ctx) {
        var mx = 46, mw = W - 92, my = METER_Y;
        /* The rail, the gate bands and the distance scale are all on the UI
           plate; only the needle and the hint text change. */

        /* marker: a needle with a shadow, so it stays findable over the pale
           FRONT PAGE core it has to be read against */
        if (focusActive) {
            var px = mx + mw * clamp01(focusT);
            var hot = sharpness(focusT) * 100 >= K_EXCL;
            ctx.fillStyle = rgba(P.ink, 0.85);
            ctx.fillRect(px - 2.5, my - 5, 5, 24);
            ctx.fillStyle = hot ? P.gold : P.champ;
            ctx.fillRect(px - 1.5, my - 4, 3, 22);
            ctx.beginPath();
            ctx.moveTo(px - 4, my - 8); ctx.lineTo(px + 4, my - 8); ctx.lineTo(px, my - 3);
            ctx.closePath(); ctx.fill();
        }

        ctx.font = 'bold 9px ' + F_UI;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = holding ? P.champ : rgba(P.blush, 0.9);
        ctx.fillText(holding ? 'RELEASE TO SHOOT' : 'HOLD TO FOCUS', W / 2, my + 33);
    }

    /* ---- top strip (jumbotron) ---- */
    function drawStrip(ctx) {
        /* The plate, the live dot, the location label and the masthead are all
           on the UI plate. Only the counter on the right changes. */
        var cy2 = STRIP_Y + STRIP_H / 2 + 0.5;
        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        if (streak > 1) {
            ctx.font = 'bold 11px ' + F_DISPLAY;
            heavy(ctx, '★ x' + streak, W - 18, cy2, 11, P.gold, rgba(P.ink, 0.8));
        } else {
            ctx.font = 'bold 10px ' + F_UI;
            ctx.fillStyle = rgba(P.blush, 0.7);
            ctx.fillText('SHOTS ' + realDone, W - 18, cy2);
        }
        ctx.restore();
    }

    /* ---- verdict card ---- */
    function drawVerdict(ctx) {
        var v = verdictCard;
        var t = clamp01(verdictT / 0.28);
        var sc = RM ? 1 : (0.5 + outBack(t) * 0.5);
        var fade = verdictT > VERDICT_HOLD - 0.35
            ? clamp01((VERDICT_HOLD - verdictT) / 0.35) : 1;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(FRAME_CX, FRAME_CY - 20);
        ctx.scale(sc, sc);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        /* Backing plate. Every element below still carries its own outline, so
           the card reads identically with the plate removed - the plate is
           contrast, not the legibility mechanism. */
        var pw = 190, ph = 168 + v.notes.length * 14;
        var plate = ctx.createLinearGradient(0, -96, 0, -96 + ph);
        plate.addColorStop(0, rgba(P.ink, 0.82));
        plate.addColorStop(1, mix(P.ink, v.colour, 0.10, 0.72));
        ctx.fillStyle = plate;
        GameEngine.drawRoundedRect(ctx, -pw / 2, -96, pw, ph, 8); ctx.fill();
        ctx.strokeStyle = rgba(v.colour, 0.55); ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, -pw / 2, -96, pw, ph, 8); ctx.stroke();

        /* who it was - the on-subject name tag is suppressed while this is up */
        ctx.font = 'bold 11px ' + F_UI;
        heavy(ctx, v.name, 0, -84, 11, rgba(P.blush, 0.95), P.ink);

        /* Glyph in a badge. The glyph is the colour-independent shape channel
           that carries the outcome when neither colour nor motion is available,
           so it gets MORE emphasis here, not less: a ring around it means the
           silhouette differs per verdict even in greyscale. */
        ctx.strokeStyle = rgba(v.colour, 0.7); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -52, 25, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(P.ink, 0.7);
        ctx.beginPath(); ctx.arc(0, -52, 23.5, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 30px ' + F_UI;
        heavy(ctx, v.glyph, 0, -51, 30, v.colour, P.ink);

        /* Label. Sized to fit rather than fixed at 30px: BLOCKED and NOT A
           CELEBRITY overran the plate at a fixed size on a 400px canvas. The
           fit is solved ONCE per card and cached on it - the card is up for
           1.45 s, and re-running a fifteen-step measure loop on all 87 of
           those frames showed up as 56 ms frames under 4x throttling. */
        if (v.lsz === undefined) {
            var lsz = 30;
            ctx.font = 'bold ' + lsz + 'px ' + F_DISPLAY;
            while (lsz > 15 && ctx.measureText(v.label).width > pw - 22) {
                lsz -= 1;
                ctx.font = 'bold ' + lsz + 'px ' + F_DISPLAY;
            }
            v.lsz = lsz;
        }
        ctx.font = 'bold ' + v.lsz + 'px ' + F_DISPLAY;
        heavy(ctx, v.label, 0, -6, v.lsz, v.colour, P.ink);

        ctx.font = 'bold 15px ' + F_DISPLAY;
        heavy(ctx, (v.points >= 0 ? '+' : '') + v.points, 0, 22, 15, P.white, P.ink);

        /* per-axis feedback so the player learns what to fix, as bars AND
           numbers: the bar is faster to read, the number is unambiguous */
        axisBar(ctx, -66, 40, 62, 'FRAME', v.framing);
        axisBar(ctx, 4, 40, 62, 'FOCUS', v.focus);

        ctx.font = 'bold 10px ' + F_UI;
        for (var i = 0; i < v.notes.length; i++) {
            heavy(ctx, v.notes[i], 0, 64 + i * 14, 10, P.gold, P.ink);
        }
        ctx.restore();
    }

    /** One scoring axis as a labelled bar with its gate ticks marked. */
    function axisBar(ctx, x, y, w, label, val) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 8px ' + F_UI;
        ctx.fillStyle = rgba(P.blush, 0.85);
        ctx.fillText(label, x, y - 6);
        ctx.fillStyle = rgba(P.ink, 0.8);
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = val >= F_EXCL ? P.gold : val >= F_PAGE ? P.bubble : P.blush;
        ctx.fillRect(x, y, w * clamp01(val / 100), 5);
        ctx.fillStyle = rgba(P.champ, 0.6);
        ctx.fillRect(x + w * (F_EXCL / 100), y - 1, 1, 7);
        ctx.fillRect(x + w * (F_FRONT / 100), y - 1, 1, 7);
        ctx.textAlign = 'right';
        ctx.fillStyle = P.white;
        ctx.fillText(String(Math.round(val)), x + w, y - 6);
        ctx.textAlign = 'center';
    }

    /* ---- flash + shutter wipe ---- */
    function drawFlash(ctx) {
        /* shutter blade wipe - always present, carries the event with no strobe */
        if (shutterWipe > 0) {
            var sw = 1 - shutterWipe;
            var hgt = (H - SCENE_TOP) * 0.5;
            var bh = hgt * (1 - sw);
            ctx.fillStyle = rgba(P.ink, 0.88);
            ctx.fillRect(0, SCENE_TOP, W, bh);
            ctx.fillRect(0, H - bh, W, bh);
            /* a lit edge on each blade: a real shutter curtain catches the
               flash on its leading edge, and it also gives the wipe a hard
               boundary in greyscale for the reduced-motion path */
            if (bh > 1) {
                ctx.fillStyle = rgba(P.blush, 0.5);
                ctx.fillRect(0, SCENE_TOP + bh - 1.5, W, 1.5);
                ctx.fillRect(0, H - bh, W, 1.5);
            }
        }

        if (flashGlow <= 0) return;
        /* Cached plate scaled by globalAlpha rather than two per-frame
           gradients. The flash is live for about 23 frames per shot and those
           were the most expensive frames in the game; evaluating two large
           gradients per pixel on every one of them is the sort of thing a
           blit exists to avoid. */
        ctx.globalAlpha = flashGlow;
        ctx.drawImage(bloomPlate, 0, 0, W, H);
        ctx.globalAlpha = 1;
    }

    /** Full-strength flash bloom, blitted at the current flashGlow.
        Half resolution: it is nothing but smooth gradients. */
    function buildBloom() {
        var g = surface(W, H, DPR * 0.5);

        /* Edge bloom inward, NOT a full-screen white-out. Reworked: the old
           gradient reached its peak alpha at r = 300, but the frame corners are
           at r = 403, so everything past 300 sat at full strength and the
           "edge bloom" covered most of the canvas as a flat wash - which is
           exactly how it read in captures. The stops now stay near zero until
           0.78 and the peak is 0.42 rather than 0.62, so the bright band is
           genuinely a band. */
        var rg = g.createRadialGradient(FRAME_CX, FRAME_CY, 60, FRAME_CX, FRAME_CY, 430);
        rg.addColorStop(0, rgba(P.champ, 0));
        rg.addColorStop(0.55, rgba(P.champ, 0.05));
        rg.addColorStop(0.78, rgba(P.champ, 0.20));
        rg.addColorStop(1, rgba(P.white, 0.42));
        g.fillStyle = rg;
        g.fillRect(0, SCENE_TOP, W, H - SCENE_TOP);

        /* The flashgun itself. It is in the player's hands, at the bottom of
           the frame, so the light has a direction - and giving it one lets the
           overall wash come down without losing the sense of a flash firing. */
        var lg = g.createLinearGradient(0, H, 0, H - 150);
        lg.addColorStop(0, rgba(P.champ, 0.46));
        lg.addColorStop(0.45, rgba(P.blush, 0.14));
        lg.addColorStop(1, rgba(P.blush, 0));
        g.fillStyle = lg;
        g.fillRect(0, H - 150, W, 150);
        return g.canvas;
    }

    /* ============================================================
       MAGAZINE COVER (results)
       ============================================================ */
    /* The cover is entirely static once the round ends, so it is rendered ONCE
       to its own plate and then blitted. That is what pays for the print
       treatment: halftone, grain, misregistration and a barcode all cost
       nothing per frame, and the confetti stays live on top. */
    var coverArt = null;

    function drawCover(ctx) {
        if (!coverArt) coverArt = buildCover();
        var t = clamp01(coverT / 0.7);
        var slide = RM ? 0 : (1 - outQuart(t)) * 40;

        ctx.fillStyle = P.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(coverArt, 0, slide, W, H);

        particlesDraw(ctx);

        if (coverReady) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.font = 'bold 11px ' + F_UI;
            heavy(ctx, 'TAP TO FILE YOUR COPY', W / 2, H - 20, 11, rgba(P.blush, 0.95), P.ink);
        }
    }

    /** Deterministic barcode from the score, so two runs that score the same
        print the same and a good night literally looks different on the shelf. */
    function barcode(g, x, y, w, h, seed) {
        var v = ((seed | 0) * 2654435761 + 7919) >>> 0;
        var cx3 = x;
        g.fillStyle = P.ink;
        g.fillRect(x - 2, y - 2, w + 4, h + 4);
        g.fillStyle = mix(P.champ, P.white, 0.6);
        g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.fillStyle = P.ink;
        /* Alternating bar and gap, both 1-3px, rather than a coin flip per
           slot: a real symbology has no runs of blank, and the coin flip left
           the code looking like four stray lines on a white card. */
        while (cx3 < x + w - 1) {
            v = (v * 1103515245 + 12345) >>> 0;
            var bw = 1 + ((v >>> 16) % 3);
            var gw = 1 + ((v >>> 22) % 3);
            if (cx3 + bw > x + w) bw = x + w - cx3;
            g.fillRect(cx3, y, bw, h);
            cx3 += bw + gw;
        }
    }

    function buildCover() {
        var g = surface(W, H, DPR);
        var cx = 18, cy = SCENE_TOP + 4, cw = W - 36, ch = H - SCENE_TOP - 64;
        var i;

        g.fillStyle = P.ink;
        g.fillRect(0, 0, W, H);

        /* ---- cover stock ---- */
        var grad = g.createLinearGradient(0, cy, 0, cy + ch);
        grad.addColorStop(0, P.hot);
        grad.addColorStop(0.42, P.bubble);
        grad.addColorStop(1, P.blush);
        g.fillStyle = grad;
        GameEngine.drawRoundedRect(g, cx, cy, cw, ch, 6); g.fill();

        g.save();
        g.beginPath(); GameEngine.drawRoundedRect(g, cx, cy, cw, ch, 6); g.clip();

        /* ---- masthead ----
           Printed three times a hair apart. Real four-colour work misregisters
           by a fraction of a millimetre and that tiny fringe is most of what
           makes a thing read as PRINTED rather than as rendered. */
        var msY = cy + 46;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 56px ' + F_DISPLAY;
        var plates = [[-1.6, 1.2, rgba(P.rose, 0.55)], [1.5, -1.1, rgba(P.champ, 0.6)], [0, 0, P.white]];
        for (i = 0; i < plates.length; i++) {
            (function (pp) {
                g.fillStyle = pp[2];
                tracked(g, 'FLASH!', W / 2 + pp[0], msY + pp[1], 2.5, function (chr, xx) {
                    g.fillText(chr, xx, msY + pp[1]);
                });
            })(plates[i]);
        }
        /* the exclamation gets a knocked-out counter, like a real masthead */
        g.font = 'bold 9px ' + F_UI;
        g.fillStyle = rgba(P.ink, 0.62);
        tracked(g, 'MIFF OPENING NIGHT SPECIAL', W / 2, cy + 78, 1.5, function (chr, xx) {
            g.fillText(chr, xx, cy + 78);
        });
        g.strokeStyle = rgba(P.ink, 0.4); g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx + 16, cy + 89); g.lineTo(cx + cw - 16, cy + 89); g.stroke();
        g.font = 'bold 8px ' + F_UI;
        g.textAlign = 'left';
        g.fillStyle = rgba(P.ink, 0.55);
        g.fillText('MELBOURNE', cx + 16, cy + 97);
        g.textAlign = 'right';
        g.fillText('AUGUST 2026', cx + cw - 16, cy + 97);

        /* ---- hero frame ---- */
        var px = cx + 20, py = cy + 108, pw = cw - 40, ph = 196;
        g.fillStyle = rgba(P.ink, 0.92);
        g.fillRect(px, py, pw, ph);

        g.save();
        g.beginPath(); g.rect(px, py, pw, ph); g.clip();
        /* The photo's backdrop IS the night, cropped out of the blurred scene
           plate. It is the same wall the shot was taken against, so the cover
           frame and the game agree with each other for free. */
        var k = DPR * LEVELS[2].res;
        g.drawImage(bgLevels[2], 40 * k, 250 * k, 320 * k, 196 * k, px, py, pw, ph);
        g.fillStyle = rgba(P.rose, 0.30);
        g.fillRect(px, py, pw, ph);

        if (bestShot) {
            /* 0.95, sat low in the box: at 1.05 a raised-arm pose (Messi,
               Rodri, Hemsworth) had its hand clipped off by the frame top. */
            /* Feet ABOVE the caption strip, not behind it: at py + ph - 8 the
               subjects stood inside the strip and were cut off at the ankle. */
            var fig = bestShot.celeb.figures;
            var figY = py + ph - 21, sc = 0.95;
            var soft = 1 - clamp01(bestShot.focus / 100);
            var hg2 = figBegin(g, soft, W / 2, figY, 112, 200, 24);
            if (fig.length > 1) {
                drawFigure(hg2, fig[1], W / 2 + 30, figY, sc * 0.92, 1, 0.62);
                drawFigure(hg2, fig[0], W / 2 - 30, figY, sc * 0.92, 1, 0.62);
            } else {
                drawFigure(hg2, fig[0], W / 2, figY, sc, 1, 0.62);
            }
            figEnd(g);
        } else {
            g.textAlign = 'center';
            g.font = 'bold 13px ' + F_DISPLAY;
            heavy(g, 'NO USABLE FRAMES', W / 2, py + ph / 2 - 8, 13, rgba(P.blush, 0.9), P.ink);
            g.font = 'italic 11px ' + F_SERIF;
            g.fillStyle = rgba(P.blush, 0.7);
            g.fillText('the editor is not pleased', W / 2, py + ph / 2 + 12);
        }

        /* halftone screen over the photo only - the cover stock behind it is
           flat ink and would not be screened */
        g.globalAlpha = 0.30;
        g.fillStyle = halftoneTile(g);
        g.fillRect(px, py, pw, ph);
        g.globalAlpha = 1;

        /* caption strip along the foot of the photo */
        if (bestShot) {
            g.fillStyle = rgba(P.ink, 0.72);
            g.fillRect(px, py + ph - 17, pw, 17);
            g.textAlign = 'left'; g.textBaseline = 'middle';
            g.font = 'bold 8px ' + F_UI;
            g.fillStyle = P.gold;
            g.fillText(bestShot.label, px + 7, py + ph - 8.5);
            g.textAlign = 'right';
            g.fillStyle = rgba(P.blush, 0.85);
            g.fillText('FRAME ' + Math.round(bestShot.framing) + '  FOCUS ' + Math.round(bestShot.focus)
                       + '  ' + bestShot.points + ' PTS', px + pw - 7, py + ph - 8.5);
        }
        g.restore();

        g.strokeStyle = rgba(P.champ, 0.75); g.lineWidth = 1.5;
        g.strokeRect(px, py, pw, ph);

        /* ---- typography block ---- */
        var hy2 = py + ph + 26;
        g.textAlign = 'center'; g.textBaseline = 'middle';

        /* kicker: small, tracked, in the accent - the step that gives the
           headline something to be big AGAINST */
        g.font = 'bold 9px ' + F_UI;
        g.fillStyle = rgba(P.rose, 0.95);
        tracked(g, bestShot ? 'WORLD EXCLUSIVE' : 'FROM THE PIT', W / 2, hy2 - 16, 2.2,
                function (chr, xx) { g.fillText(chr, xx, hy2 - 16); });

        g.font = 'bold 21px ' + F_DISPLAY;
        g.fillStyle = P.ink;
        var head = bestShot ? bestShot.headline : 'PAPARAZZO GOES HOME EMPTY-HANDED';
        var nLines = wrapText(g, head, W / 2, hy2, cw - 52, 21);

        /* deck, in the serif, because two voices beat one voice at two sizes */
        var dy = hy2 + nLines * 21 + 4;
        g.font = 'italic 11px ' + F_SERIF;
        g.fillStyle = rgba(P.ink, 0.72);
        g.fillText(bestShot
            ? 'Shot from the barrier at f/2.8. Ten subjects, one issue.'
            : 'Ten subjects. Not one frame worth printing.', W / 2, dy);

        /* ---- cover lines ---- */
        var ly = dy + 22;
        g.strokeStyle = rgba(P.ink, 0.3); g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx + 22, ly - 8); g.lineTo(cx + cw - 22, ly - 8); g.stroke();
        g.textAlign = 'left';
        var lines = shotLog.slice(0, 5);
        for (i = 0; i < lines.length; i++) {
            var row = lines[i];
            var good = row.kind === 'front' || row.kind === 'exclusive';
            g.font = 'bold 9px ' + F_UI;
            g.fillStyle = good ? P.rose : rgba(P.ink, 0.45);
            g.fillText(good ? '★' : '·', cx + 24, ly + i * 14);
            g.fillStyle = rgba(P.ink, 0.86);
            g.fillText(row.name, cx + 36, ly + i * 14);
            g.textAlign = 'right';
            g.font = 'bold 8px ' + F_UI;
            g.fillStyle = rgba(P.ink, good ? 0.8 : 0.5);
            g.fillText(row.label, cx + cw - 24, ly + i * 14);
            g.textAlign = 'left';
        }

        /* ---- footer: barcode left, price right ---- */
        var fy = cy + ch - 54;
        barcode(g, cx + 22, fy, 74, 30, score);
        g.textAlign = 'left'; g.font = 'bold 7px ' + F_UI;
        g.fillStyle = rgba(P.ink, 0.6);
        g.fillText('FLSH ' + String(1000 + (score % 9000)), cx + 22, fy + 38);

        g.textAlign = 'right'; g.textBaseline = 'alphabetic';
        g.font = 'bold 9px ' + F_UI;
        g.fillStyle = rgba(P.ink, 0.7);
        tracked(g, 'ISSUE PRICE', cx + cw - 22, fy + 8, 1.6, function (chr, xx) {
            g.fillText(chr, xx, fy + 8);
        });
        g.font = 'bold 34px ' + F_DISPLAY;
        g.textAlign = 'right';
        heavy(g, String(score), cx + cw - 22, fy + 38, 34, P.white, rgba(P.ink, 0.65));

        if (coverClean) {
            /* a gold starburst, the way a cover flags a giveaway */
            g.save();
            g.translate(cx + cw - 58, fy - 30);
            g.fillStyle = P.gold;
            g.beginPath();
            for (i = 0; i < 24; i++) {
                var a2 = i / 24 * Math.PI * 2;
                var rr = i % 2 ? 22 : 29;
                g[i ? 'lineTo' : 'moveTo'](Math.cos(a2) * rr, Math.sin(a2) * rr * 0.86);
            }
            g.closePath(); g.fill();
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.font = 'bold 8px ' + F_DISPLAY;
            g.fillStyle = P.ink;
            g.fillText('FULL', 0, -7); g.fillText('ISSUE', 0, 1); g.fillText('+5000', 0, 9);
            g.restore();
        }

        /* ---- paper ----
           Grain last, over everything inside the trim, so the whole cover sits
           on one sheet rather than the photo floating on top of it. */
        g.globalAlpha = 0.55;
        g.globalCompositeOperation = 'overlay';
        g.fillStyle = grainTile(g);
        g.fillRect(cx, cy, cw, ch);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.restore();

        g.strokeStyle = rgba(P.champ, 0.8); g.lineWidth = 2;
        GameEngine.drawRoundedRect(g, cx, cy, cw, ch, 6); g.stroke();
        return g.canvas;
    }

    /** Returns the number of lines drawn, so the caller can place what follows. */
    function wrapText(ctx, text, x, y, maxW, lh) {
        var words = String(text).split(' ');
        var line = '', lines = [];
        for (var i = 0; i < words.length; i++) {
            var test = line ? line + ' ' + words[i] : words[i];
            if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
            else line = test;
        }
        if (line) lines.push(line);
        for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], x, y + j * lh);
        return lines.length;
    }

    /* ============================================================
       INPUT - hold / release
       The engine's setupInput only exposes a TAP (it caps at 500ms on
       pointerup), so the hold mechanic needs its own listeners. We still call
       setupInput for Escape-pause, but pass no onTap so nothing double-fires.
       Teardown is idempotent because startGame -> onInit runs again on replay.
       ============================================================ */
    var ownCleanup = null;

    function setupInput() {
        if (ownCleanup) { ownCleanup(); ownCleanup = null; }

        /* keeps the engine's Escape-pause + its own cleanup registration */
        GameEngine.setupInput({});

        var canvas = GameEngine.canvas;
        var listeners = [];
        function on(target, ev, fn, opts) {
            target.addEventListener(ev, fn, opts);
            listeners.push([target, ev, fn, opts]);
        }

        function active() {
            return GameEngine.state.running && !GameEngine.state.paused && !GameEngine.state.gameOver;
        }

        function press(e) {
            if (!active()) return;
            if (e.cancelable) e.preventDefault();
            if (window.RCAudio) window.RCAudio.unlock();   // gesture-gated unlock
            if (phase === 'cover') { if (coverReady) finish(); return; }
            beginHold();
        }
        function release() {
            if (!active()) return;
            releaseHold();
        }

        on(canvas, 'pointerdown', press);
        /* release is bound to the window so a drag off-canvas still fires */
        on(window, 'pointerup', release);
        on(window, 'pointercancel', release);

        if (!window.PointerEvent) {
            on(canvas, 'touchstart', press, { passive: false });
            on(window, 'touchend', release);
        }

        var spaceDown = false;
        on(document, 'keydown', function (e) {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            if (!active()) return;
            e.preventDefault();
            if (spaceDown) return;                          // ignore auto-repeat
            spaceDown = true;
            if (window.RCAudio) window.RCAudio.unlock();
            if (phase === 'cover') { if (coverReady) finish(); return; }
            beginHold();
        });
        on(document, 'keyup', function (e) {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            spaceDown = false;
            if (!active()) return;
            releaseHold();
        });

        ownCleanup = function () {
            listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
            listeners.length = 0;
        };
    }

    /* ============================================================
       TEST SURFACE
       Read-only, and present ONLY if a harness creates window.__rcrDebug
       before this file loads. The shipped page never does, so the deployed
       game exposes nothing. It exists because the verification bar for the
       graphics work is empirical - a capture harness has to know which subject
       is on screen and where the rack is in order to photograph a named state,
       and there is deliberately no way to MUTATE anything through it.
       ============================================================ */
    if (window.__rcrDebug) {
        window.__rcrDebug.state = function () {
            return {
                phase: phase,
                name: subject ? subject.celeb.name : null,
                mode: subject ? subject.mode : null,
                tier: subject ? (subject.celeb.tier || null) : null,
                trap: !!(subject && subject.trap),
                pair: !!(subject && subject.pair),
                life: subject ? subject.life : 0,
                total: subject ? subject.total : 0,
                x: subject ? subject.x : 0,
                inPose: !!(subject && inPose(subject)),
                poseStart: subject ? subject.poseStart : 0,
                poseEnd: subject ? subject.poseEnd : 0,
                holding: holding,
                focusT: focusT,
                sharpness: focusActive ? sharpness(focusT) : 1,
                sceneSharp: sceneSharp,
                verdict: verdictCard ? verdictCard.kind : null,
                verdictLabel: verdictCard ? verdictCard.label : null,
                obstruction: obstruction ? { x: obstruction.x, kind: obstruction.kind, w: obstruction.w } : null,
                realDone: realDone,
                score: score,
                reducedMotion: RM,
                particles: pcount,
                canFilter: CAN_FILTER
            };
        };
        window.__rcrDebug.tuning = {
            FOCUS_SWEEP: FOCUS_SWEEP, FOCUS_PEAK: FOCUS_PEAK, FOCUS_HALF: FOCUS_HALF,
            FRAME_TOL: FRAME_TOL, FRAME_CX: FRAME_CX, VERDICT_HOLD: VERDICT_HOLD,
            K_FRONT: K_FRONT, K_EXCL: K_EXCL, K_PAGE: K_PAGE, TOTAL_SUBJECTS: TOTAL_SUBJECTS
        };
    }

    /* ============================================================
       INIT
       ============================================================ */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 640 });
        /* Bake the caches during page load rather than on the first frame. It
           is ~50 ms of blur work and it would otherwise land as one dropped
           frame at the moment the countdown starts. onDraw keeps a lazy guard
           in case the canvas is not ready yet. */
        buildCaches();
        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'FLASH! RED CARPET RUSH',
                objective: 'MIFF opening night in Melbourne. You are in the paparazzi pit. Ten subjects come past. HOLD to rack focus, RELEASE to fire the shutter. Frame them, focus them, and catch them mid-pose.',
                controls: [
                    'HOLD tap / Space to rack FOCUS',
                    'RELEASE to fire the SHUTTER',
                    'Gold band = exclusive, pale core = front page'
                ],
                legend: {
                    collect: [
                        { icon: '★', label: 'Front page', points: '2500' },
                        { icon: '◆', label: 'Exclusive', points: '1500' },
                        { icon: '●', label: 'Page six', points: '800' }
                    ],
                    avoid: [
                        { icon: '✘', label: 'Non-celebrities' },
                        { icon: '⛔', label: 'Umbrellas & blockers' }
                    ]
                },
                tip: 'The focus rack takes about a second, so start your hold BEFORE they reach the centre. Hold too long and it blurs again. Keep a streak alive for up to 2.5x.'
            },
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: function () {
                if (ownCleanup) { ownCleanup(); ownCleanup = null; }
                rca('focusStop');
            },
            onReset: function () { finished = false; reset(); },
            onInit: function () { finished = false; reset(); setupInput(); },
            onCountdownComplete: function () { /* subjects already queued by reset() */ }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
