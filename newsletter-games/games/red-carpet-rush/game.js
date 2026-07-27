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
 * Tech: Canvas 2D only, zero new deps. One offscreen canvas caches the static
 * scene (capped at DPR 2); line art draws live on top. Pooled Float32 particle
 * system. All motion is dt-synced eased lerp against the engine's clamped dt -
 * no second rAF, so GSAP is genuinely optional. Reduced motion is gated through
 * one J() multiplier: information always stays, kinetics drop.
 *
 * ACCESSIBILITY - PHOTOSENSITIVITY. This is a game about camera flashes, so
 * WCAG 2.3.1 is a hard constraint, not a nicety. A single global scheduler
 * (`canFlash`) rate-limits EVERY flash source to at most 3 per second; ambient
 * pit flashes are small, offset and soft; the player's own flash blooms inward
 * from the frame edges rather than whiting out the canvas; and reduced-motion
 * replaces all of it with a static edge glow. No red flashes anywhere.
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

    /* ---- helpers ---- */
    function rgba(hex, a) {
        var h = hex.replace('#', '');
        var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function outQuart(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 4); }
    function inQuad(t) { t = clamp01(t); return t * t; }
    function outBack(t) { t = clamp01(t); var s = 1.70158, s1 = s + 1; return 1 + s1 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
    function linear(t) { return clamp01(t); }
    function ri(n) { return (Math.random() * n) | 0; }

    /* ============================================================
       ROSTER
       Every entry is anchored to a verified event from 2026 - see §3/§3A of
       the plan. `look` drives the procedural figure; `pose` picks the arm
       archetype; `headline` feeds the magazine cover.
       ============================================================ */
    function look(o) {
        return {
            skin: o.skin || T.skinA, hair: o.hair || T.brown,
            hairStyle: o.hairStyle || 'short', outfit: o.outfit || 'suit',
            c1: o.c1 || T.charcoal, c2: o.c2 || P.white,
            pose: o.pose || 'wave', prop: o.prop || null, num: o.num || null,
            shades: !!o.shades
        };
    }

    var ROSTER = [
        /* ---- Tier S - the newlyweds (3 July 2026, Madison Square Garden) ---- */
        {
            id: 'swift-kelce', name: 'SWIFT & KELCE', tier: 'S',
            headline: "SWIFT'S FIRST CARPET AS A KELCE",
            figures: [
                look({ skin: T.skinA, hair: T.blonde, hairStyle: 'long', outfit: 'gown', c1: P.white, c2: P.champ, pose: 'heart' }),
                look({ skin: T.skinA, hair: T.brown, hairStyle: 'short', outfit: 'tux', c1: P.white, c2: P.champ, pose: 'wave' })
            ]
        },

        /* ---- Tier A - World Cup champions (Spain 1-0 Argentina, 19 July) ---- */
        { id: 'yamal', name: 'LAMINE YAMAL', tier: 'A', headline: 'YAMAL BRINGS THE CUP TO SOUTHBANK',
          figures: [look({ skin: T.skinB, hair: T.dark, outfit: 'kit', c1: T.spain, c2: T.spainAlt, pose: 'point', num: '19' })] },
        { id: 'rodri', name: 'RODRI', tier: 'A', headline: 'RODRI PARADES THE GOLDEN BALL',
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'kit', c1: T.spain, c2: T.spainAlt, pose: 'armsUp', prop: 'trophy', num: '16' })] },
        { id: 'mbappe', name: 'KYLIAN MBAPPÉ', tier: 'A', headline: 'MBAPPÉ, TWICE A GOLDEN BOOT',
          figures: [look({ skin: T.skinC, hair: T.dark, outfit: 'kit', c1: T.france, c2: P.white, pose: 'cross', prop: 'boot', num: '10' })] },
        { id: 'messi', name: 'LIONEL MESSI', tier: 'A', headline: "MESSI: 'THE BATON PASSES'",
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'kit', c1: T.arg, c2: P.white, pose: 'point', num: '10' })] },
        { id: 'simon', name: 'UNAI SIMÓN', tier: 'A', headline: "SIMÓN'S SEVEN CLEAN SHEETS",
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'kit', c1: T.keeper, c2: T.charcoal, pose: 'armsUp', num: '1' })] },

        /* ---- Tier A - Socceroos (out to Egypt on penalties, 3 July) ---- */
        { id: 'herrington', name: 'LUCAS HERRINGTON', tier: 'A', headline: 'HERRINGTON, 18, STEALS THE NIGHT',
          figures: [look({ skin: T.skinA, hair: T.blonde, outfit: 'kit', c1: T.aus, c2: T.ausAlt, pose: 'wave', num: '2' })] },
        { id: 'irvine', name: 'JACKSON IRVINE', tier: 'A', headline: 'IRVINE HOLDS HIS NERVE',
          figures: [look({ skin: T.skinA, hair: T.auburn, outfit: 'kit', c1: T.aus, c2: T.ausAlt, pose: 'cross', num: '22' })] },
        { id: 'mabil', name: 'AWER MABIL', tier: 'A', headline: 'MABIL SALUTES THE PIT',
          figures: [look({ skin: T.skinC, hair: T.dark, outfit: 'kit', c1: T.aus, c2: T.ausAlt, pose: 'point', num: '7' })] },

        /* ---- Tier B - The Odyssey (London 6 July, NY 14 July, release 17 July) ---- */
        { id: 'zendaya', name: 'ZENDAYA', tier: 'B', headline: 'ZENDAYA TAKES FLIGHT AT MIFF',
          figures: [look({ skin: T.skinB, hair: T.dark, hairStyle: 'long', outfit: 'wings', c1: P.champ, c2: P.blush, pose: 'wings' })] },
        { id: 'damon', name: 'MATT DAMON', tier: 'B', headline: "DAMON'S ODYSSEY LANDS IN MELBOURNE",
          figures: [look({ skin: T.skinA, hair: T.blonde, outfit: 'tux', c1: T.black, c2: P.white, pose: 'wave' })] },
        { id: 'holland', name: 'TOM HOLLAND', tier: 'B', headline: 'HOLLAND WORKS THE BARRIER',
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'suit', c1: T.charcoal, c2: P.white, pose: 'point' })] },
        { id: 'hathaway', name: 'ANNE HATHAWAY', tier: 'B', headline: 'HATHAWAY, EVERY INCH PENELOPE',
          figures: [look({ skin: T.skinA, hair: T.dark, hairStyle: 'long', outfit: 'gown', c1: T.charcoal, c2: P.rose, pose: 'heart' })] },
        { id: 'pattinson', name: 'ROBERT PATTINSON', tier: 'B', headline: 'PATTINSON, HANDS IN POCKETS',
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'suit', c1: T.black, c2: T.silver, pose: 'pockets' })] },
        { id: 'theron', name: 'CHARLIZE THERON', tier: 'B', headline: 'THERON OWNS THE CARPET',
          figures: [look({ skin: T.skinA, hair: T.plat, hairStyle: 'bob', outfit: 'gown', c1: T.silver, c2: P.champ, pose: 'hipcock' })] },
        { id: 'nolan', name: 'CHRISTOPHER NOLAN', tier: 'B', noTell: true, headline: "NOLAN STILL WON'T SMILE",
          figures: [look({ skin: T.skinA, hair: T.silver, outfit: 'suit', c1: T.charcoal, c2: T.silver, pose: 'pockets' })] },

        /* ---- Tier B - awards season & the Met ("Fashion Is Art", 4 May) ---- */
        { id: 'mbj', name: 'MICHAEL B. JORDAN', tier: 'B', headline: 'BEST ACTOR, BEST DRESSED',
          figures: [look({ skin: T.skinC, hair: T.dark, outfit: 'tux', c1: T.black, c2: P.gold, pose: 'cross' })] },
        { id: 'buckley', name: 'JESSIE BUCKLEY', tier: 'B', headline: "BUCKLEY'S QUIET TRIUMPH",
          figures: [look({ skin: T.skinA, hair: T.auburn, hairStyle: 'long', outfit: 'gown', c1: P.blush, c2: P.champ, pose: 'wave' })] },
        { id: 'beyonce', name: 'BEYONCÉ', tier: 'B', headline: 'BEYONCÉ IN BONE COUTURE',
          figures: [look({ skin: T.skinB, hair: T.blonde, hairStyle: 'long', outfit: 'gown', c1: T.black, c2: T.silver, pose: 'hipcock' })] },
        { id: 'rihanna', name: 'RIHANNA', tier: 'B', headline: 'RIHANNA, MONOCHROME AND UNBOTHERED',
          figures: [look({ skin: T.skinB, hair: T.dark, hairStyle: 'bob', outfit: 'gown', c1: T.silver, c2: P.white, pose: 'hipcock', shades: true })] },

        /* ---- Tier C - Australian home crowd ---- */
        /* gold, not pink: a pink gown on a pink carpet disappears */
        { id: 'robbie', name: 'MARGOT ROBBIE', tier: 'C', headline: 'ROBBIE COMES HOME',
          figures: [look({ skin: T.skinA, hair: T.blonde, hairStyle: 'long', outfit: 'gown', c1: P.gold, c2: P.champ, pose: 'hipcock' })] },
        { id: 'hemsworth', name: 'CHRIS HEMSWORTH', tier: 'C', headline: 'HEMSWORTH BRINGS THE HAMMER',
          figures: [look({ skin: T.skinA, hair: T.blonde, outfit: 'tux', c1: T.charcoal, c2: P.white, pose: 'armsUp' })] },
        { id: 'kidman', name: 'NICOLE KIDMAN', tier: 'C', headline: 'KIDMAN, RALPH LAUREN, RADIANT',
          figures: [look({ skin: T.skinA, hair: T.auburn, hairStyle: 'long', outfit: 'gown', c1: P.champ, c2: P.white, pose: 'wave' })] },
        { id: 'snook', name: 'SARAH SNOOK', tier: 'C', headline: "SNOOK'S WRY HALF-SMILE",
          figures: [look({ skin: T.skinA, hair: T.blonde, hairStyle: 'bob', outfit: 'suit', c1: T.charcoal, c2: P.blush, pose: 'pockets' })] },
        { id: 'jackman', name: 'HUGH JACKMAN', tier: 'C', headline: 'JACKMAN GIVES THEM A SHOW',
          figures: [look({ skin: T.skinA, hair: T.brown, outfit: 'tux', c1: T.black, c2: P.white, pose: 'armsUp' })] }
    ];

    /* Traps - deliberately generic figures, no real-person likeness. */
    var TRAPS = [
        { id: 'publicist', name: 'PUBLICIST', trap: true,
          figures: [look({ outfit: 'suit', c1: T.charcoal, c2: T.silver, pose: 'phone' })] },
        { id: 'security', name: 'SECURITY', trap: true,
          figures: [look({ skin: T.skinC, hair: T.dark, hairStyle: 'buzz', outfit: 'suit', c1: T.black, c2: T.charcoal, pose: 'cross' })] },
        { id: 'rival', name: 'RIVAL PAP', trap: true,
          figures: [look({ outfit: 'suit', c1: T.dark, c2: T.charcoal, pose: 'camera' })] },
        { id: 'volunteer', name: 'MIFF VOLUNTEER', trap: true,
          figures: [look({ skin: T.skinB, hair: T.dark, outfit: 'suit', c1: P.rose, c2: P.blush, pose: 'lanyard' })] },
        { id: 'finance', name: 'SOMEONE FROM FINANCE', trap: true,
          figures: [look({ outfit: 'suit', c1: '#4A5A6A', c2: P.white, pose: 'lanyard' })] }
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
    var bg = null;

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
                ambient.pops.push({
                    x: 20 + Math.random() * (W - 40),
                    y: PIT_TOP + 6 + Math.random() * 30,
                    life: 0.22, max: 0.22, r: 16 + Math.random() * 12
                });
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
    var PMAX = 160, PSTRIDE = 8;
    var pdata = new Float32Array(PMAX * PSTRIDE);
    var pcount = 0;
    var PCOLS = [P.gold, P.hot, P.bubble, P.champ, P.white];

    function particlesClear() { pcount = 0; }

    function burst(x, y, n, colour) {
        if (RM) n = Math.min(n, 6);
        var ci = PCOLS.indexOf(colour); if (ci < 0) ci = 0;
        for (var i = 0; i < n && pcount < PMAX; i++) {
            var a = Math.random() * Math.PI * 2;
            var sp = 60 + Math.random() * 190;
            var o = pcount * PSTRIDE;
            pdata[o] = x; pdata[o + 1] = y;
            pdata[o + 2] = Math.cos(a) * sp; pdata[o + 3] = Math.sin(a) * sp - 40;
            pdata[o + 4] = pdata[o + 5] = 0.5 + Math.random() * 0.7;
            pdata[o + 6] = 2 + Math.random() * 3.5;
            pdata[o + 7] = ci;
            pcount++;
        }
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
            pdata[o + 3] += 340 * dt;                 // gravity
            pdata[o] += pdata[o + 2] * dt;
            pdata[o + 1] += pdata[o + 3] * dt;
            pdata[o + 2] *= (1 - 1.4 * dt);
        }
    }

    function particlesDraw(ctx) {
        for (var i = 0; i < pcount; i++) {
            var o = i * PSTRIDE;
            var a = clamp01(pdata[o + 4] / pdata[o + 5]);
            ctx.globalAlpha = a;
            ctx.fillStyle = PCOLS[pdata[o + 7] | 0];
            ctx.fillRect(pdata[o] - pdata[o + 6] / 2, pdata[o + 1] - pdata[o + 6] / 2, pdata[o + 6], pdata[o + 6]);
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
    function onUpdate(dt) {
        updateAmbient(dt);
        particlesUpdate(dt);

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
        coverClean = clean;
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
       STATIC SCENE CACHE
       ============================================================ */
    function buildBackground() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var c = document.createElement('canvas');
        c.width = W * dpr; c.height = H * dpr;
        var g = c.getContext('2d');
        g.scale(dpr, dpr);

        /* night sky */
        var sky = g.createLinearGradient(0, SCENE_TOP, 0, HORIZON);
        sky.addColorStop(0, '#1A0512');
        sky.addColorStop(1, '#3A0C26');
        g.fillStyle = sky;
        g.fillRect(0, SCENE_TOP, W, HORIZON - SCENE_TOP);

        /* step-and-repeat backdrop wall - kept DARK and low-contrast so the
           subjects in front of it read. It is scenery, not a feature. */
        var wallL = 28, wallT = SCENE_TOP + 22, wallW = W - 56, wallH = HORIZON - SCENE_TOP - 22;
        var wall = g.createLinearGradient(0, wallT, 0, HORIZON);
        wall.addColorStop(0, '#5A0A33');
        wall.addColorStop(1, '#38061F');
        g.fillStyle = wall;
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
                g.font = 'bold ' + (alt ? 12 : 10) + 'px Arial, Helvetica, sans-serif';
                g.fillText(alt ? 'FLASH!' : 'MIFF 26', lx, ly);
            }
        }
        g.globalAlpha = 1;
        g.restore();

        /* a soft pool of light spilling down the wall onto the carpet */
        var spill = g.createRadialGradient(W / 2, HORIZON, 10, W / 2, HORIZON, 190);
        spill.addColorStop(0, rgba(P.hot, 0.34));
        spill.addColorStop(1, rgba(P.hot, 0));
        g.fillStyle = spill;
        g.fillRect(0, wallT, W, HORIZON - wallT + 90);

        g.strokeStyle = rgba(P.blush, 0.3); g.lineWidth = 2;
        g.strokeRect(wallL, wallT, wallW, wallH);

        /* carpet - mid-tone where the subjects stand, dropping to near-black at
           the front so the foreground pit reads as depth rather than fog */
        var carpet = g.createLinearGradient(0, HORIZON, 0, PIT_TOP);
        carpet.addColorStop(0, '#B01060');
        carpet.addColorStop(0.35, P.hot);
        carpet.addColorStop(0.62, '#9C0C53');
        carpet.addColorStop(1, '#3E0522');
        g.save();
        g.beginPath();
        g.moveTo(64, HORIZON); g.lineTo(W - 64, HORIZON);
        g.lineTo(W + 40, PIT_TOP); g.lineTo(-40, PIT_TOP);
        g.closePath();
        g.clip();
        g.fillStyle = carpet; g.fillRect(-40, HORIZON, W + 80, PIT_TOP - HORIZON);

        /* perspective lanes converging on the vanishing point */
        g.strokeStyle = rgba(P.rose, 0.30); g.lineWidth = 1;
        for (var v = -3; v <= 3; v++) {
            g.beginPath();
            g.moveTo(W / 2 + v * 22, HORIZON);
            g.lineTo(W / 2 + v * 128, PIT_TOP);
            g.stroke();
        }
        /* two cross bands to sell the recede */
        g.strokeStyle = rgba(P.blush, 0.12);
        [0.34, 0.68].forEach(function (f2) {
            var yy = HORIZON + (PIT_TOP - HORIZON) * f2;
            g.beginPath(); g.moveTo(-40, yy); g.lineTo(W + 40, yy); g.stroke();
        });
        g.restore();

        /* carpet edge trim */
        g.strokeStyle = rgba(P.champ, 0.5); g.lineWidth = 2;
        g.beginPath(); g.moveTo(64, HORIZON); g.lineTo(-40, PIT_TOP); g.stroke();
        g.beginPath(); g.moveTo(W - 64, HORIZON); g.lineTo(W + 40, PIT_TOP); g.stroke();

        /* floor behind the carpet */
        g.fillStyle = '#3A0C26';
        g.beginPath(); g.moveTo(0, HORIZON); g.lineTo(64, HORIZON); g.lineTo(-40, PIT_TOP); g.lineTo(0, PIT_TOP); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(W, HORIZON); g.lineTo(W - 64, HORIZON); g.lineTo(W + 40, PIT_TOP); g.lineTo(W, PIT_TOP); g.closePath(); g.fill();

        /* crowd barrier posts */
        for (var i = 0; i < 5; i++) {
            var px = 18 + i * 92;
            g.fillStyle = rgba(P.champ, 0.28);
            g.fillRect(px, WALK_Y + 22, 5, 46);
            g.fillStyle = rgba(P.gold, 0.35);
            g.fillRect(px - 2, WALK_Y + 18, 9, 6);
        }
        g.strokeStyle = rgba(P.gold, 0.4); g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, WALK_Y + 30); g.lineTo(W, WALK_Y + 30); g.stroke();

        return c;
    }

    /* ============================================================
       FIGURE DRAWING
       ============================================================ */
    /** Arm as a quadratic through an elbow control point. */
    function arm(ctx, sx, sy, hx, hy, bend, wdt) {
        ctx.lineWidth = wdt || 5;
        ctx.lineCap = 'round';
        /* 0.55 damping: at full strength the control point bowed the limb into
           a lasso loop rather than an elbow. */
        bend *= 0.55;
        var mx = (sx + hx) / 2 + bend, my = (sy + hy) / 2 + Math.abs(bend) * 0.18;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();
    }

    /**
     * Draw one stylised figure. `y` is the feet baseline. Deliberately a
     * caricature silhouette read through hair, outfit and prop - the name tag
     * above the head carries identification (and is gameplay-critical, since
     * the player must tell celebrities from traps).
     */
    function drawFigure(ctx, lk, x, y, s, poseAmt, sharp) {
        var headR = 11 * s;
        var headCY = y - 141 * s;
        var shoY = y - 118 * s;
        var hipY = y - 66 * s;
        var shoW = (lk.outfit === 'kit' ? 15 : 16) * s;
        var soft = 1 - clamp01(sharp == null ? 1 : sharp);

        ctx.save();
        ctx.translate(x, 0);

        /* ground shadow */
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.beginPath(); ctx.ellipse(0, y + 3, 24 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();

        /* soft-focus halo when the frame was missed - a visual echo of blur */
        if (soft > 0.15) {
            ctx.globalAlpha = 0.22 * soft;
            ctx.fillStyle = P.champ;
            ctx.beginPath(); ctx.ellipse(0, y - 78 * s, 34 * s, 80 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        /* A soft dark contact shadow on every body part. Cheap, and it is what
           actually lifts the figure off the carpet - flat fills alone vanish
           against a saturated pink background. */
        ctx.shadowColor = 'rgba(20,4,12,0.75)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;

        /* wings sit behind everything */
        if (lk.outfit === 'wings') {
            var spread = 0.55 + poseAmt * 0.45;
            ctx.fillStyle = rgba(P.champ, 0.55);
            ctx.strokeStyle = rgba(P.blush, 0.9); ctx.lineWidth = 1.5;
            [-1, 1].forEach(function (sgn) {
                ctx.beginPath();
                ctx.moveTo(sgn * 6 * s, shoY);
                ctx.quadraticCurveTo(sgn * 74 * s * spread, shoY - 54 * s, sgn * 58 * s * spread, shoY + 34 * s);
                ctx.quadraticCurveTo(sgn * 30 * s, shoY + 20 * s, sgn * 6 * s, shoY);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            });
        }

        /* legs / skirt */
        if (lk.outfit === 'gown' || lk.outfit === 'wings') {
            var gown = ctx.createLinearGradient(0, hipY - 30 * s, 0, y);
            gown.addColorStop(0, lk.c1); gown.addColorStop(1, lk.c2);
            ctx.fillStyle = gown;
            ctx.beginPath();
            ctx.moveTo(-shoW * 0.85, shoY + 4 * s);
            ctx.lineTo(shoW * 0.85, shoY + 4 * s);
            ctx.lineTo(26 * s, y);
            ctx.quadraticCurveTo(0, y + 6 * s, -26 * s, y);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = rgba(P.ink, 0.35); ctx.lineWidth = 1; ctx.stroke();
        } else {
            var trouser = lk.outfit === 'kit' ? lk.c2 : lk.c1;
            ctx.strokeStyle = trouser;
            ctx.lineWidth = 8 * s; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-5 * s, hipY); ctx.lineTo(-7 * s, y - 2 * s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5 * s, hipY); ctx.lineTo(7 * s, y - 2 * s); ctx.stroke();
            if (lk.outfit === 'kit') {                       // socks
                ctx.strokeStyle = lk.c1; ctx.lineWidth = 7 * s;
                ctx.beginPath(); ctx.moveTo(-6.5 * s, y - 20 * s); ctx.lineTo(-7 * s, y - 2 * s); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(6.5 * s, y - 20 * s); ctx.lineTo(7 * s, y - 2 * s); ctx.stroke();
            }
            /* shoes */
            ctx.fillStyle = P.ink;
            ctx.fillRect(-11 * s, y - 3 * s, 9 * s, 4 * s);
            ctx.fillRect(2 * s, y - 3 * s, 9 * s, 4 * s);
        }

        /* torso */
        if (lk.outfit !== 'gown' && lk.outfit !== 'wings') {
            ctx.fillStyle = lk.c1;
            ctx.beginPath();
            GameEngine.drawRoundedRect(ctx, -shoW, shoY - 4 * s, shoW * 2, (hipY - shoY) + 8 * s, 5 * s);
            ctx.fill();
            if (lk.outfit === 'tux') {                        // shirt + bow tie
                ctx.fillStyle = lk.c2;
                ctx.beginPath();
                ctx.moveTo(-5 * s, shoY - 2 * s); ctx.lineTo(5 * s, shoY - 2 * s);
                ctx.lineTo(3 * s, hipY - 4 * s); ctx.lineTo(-3 * s, hipY - 4 * s);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = P.ink;
                ctx.fillRect(-4 * s, shoY - 1 * s, 8 * s, 3.5 * s);
            } else if (lk.outfit === 'kit' && lk.num) {       // squad number
                ctx.fillStyle = lk.c2;
                ctx.font = 'bold ' + (11 * s) + 'px Arial, Helvetica, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(lk.num, 0, (shoY + hipY) / 2);
            } else if (lk.outfit === 'suit') {                // lapel hint
                ctx.strokeStyle = rgba(lk.c2, 0.8); ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-4 * s, shoY - 2 * s); ctx.lineTo(0, shoY + 16 * s); ctx.lineTo(4 * s, shoY - 2 * s); ctx.stroke();
            }
        }

        /* arms - pose archetypes */
        ctx.strokeStyle = lk.skin;
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

        /* head */
        ctx.fillStyle = lk.skin;
        ctx.beginPath(); ctx.arc(0, headCY, headR, 0, Math.PI * 2); ctx.fill();
        /* neck */
        ctx.strokeStyle = lk.skin; ctx.lineWidth = 6 * s;
        ctx.beginPath(); ctx.moveTo(0, headCY + headR * 0.7); ctx.lineTo(0, shoY); ctx.stroke();

        /* hair */
        ctx.fillStyle = lk.hair;
        if (lk.hairStyle === 'long') {
            ctx.beginPath();
            ctx.moveTo(-headR, headCY);
            ctx.quadraticCurveTo(-headR * 1.5, headCY + 26 * s, -headR * 0.7, headCY + 30 * s);
            ctx.lineTo(headR * 0.7, headCY + 30 * s);
            ctx.quadraticCurveTo(headR * 1.5, headCY + 26 * s, headR, headCY);
            ctx.arc(0, headCY, headR, 0, Math.PI, true);
            ctx.closePath(); ctx.fill();
        } else if (lk.hairStyle === 'bob') {
            ctx.beginPath();
            ctx.arc(0, headCY, headR * 1.12, Math.PI, 0);
            ctx.lineTo(headR * 1.12, headCY + 10 * s);
            ctx.lineTo(-headR * 1.12, headCY + 10 * s);
            ctx.closePath(); ctx.fill();
        } else if (lk.hairStyle === 'buzz') {
            ctx.beginPath(); ctx.arc(0, headCY, headR * 1.02, Math.PI, 0); ctx.fill();
        } else {
            /* the fringe must clear the eye line - at its original depth it
               drew a visor straight across the face */
            ctx.beginPath(); ctx.arc(0, headCY - 1 * s, headR * 1.06, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
            ctx.fillRect(-headR * 1.02, headCY - 8 * s, headR * 2.04, 5 * s);
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        /* Re-expose the face. The 'long' and 'bob' shapes above deliberately
           overdraw the head so the silhouette reads at distance, but left as-is
           they cover the whole face and the figure becomes a mannequin. Punch
           the features back through, letting the hair frame them. */
        ctx.fillStyle = lk.skin;
        ctx.beginPath();
        ctx.ellipse(0, headCY + 2 * s, headR * 0.74, headR * 0.80, 0, 0, Math.PI * 2);
        ctx.fill();

        /* sunglasses / eyes */
        if (lk.shades) {
            ctx.fillStyle = P.ink;
            GameEngine.drawRoundedRect(ctx, -headR * 0.85, headCY - 2 * s, headR * 1.7, 5 * s, 2 * s); ctx.fill();
        } else {
            ctx.fillStyle = P.ink;
            ctx.beginPath(); ctx.arc(-3.5 * s, headCY + 1 * s, 1.3 * s, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(3.5 * s, headCY + 1 * s, 1.3 * s, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }

    /** Name tag above the subject - identification is gameplay-critical. */
    function drawNameTag(ctx, s, x, topY) {
        var name = s.celeb.name;
        var tier = s.trap ? null : s.celeb.tier;
        var col = s.trap ? P.rose : (TIER_COLOUR[tier] || P.blush);
        ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
        var w = ctx.measureText(name).width + 18;
        var tx = clamp(x - w / 2, 4, W - w - 4);
        ctx.fillStyle = rgba(P.ink, 0.86);
        GameEngine.drawRoundedRect(ctx, tx, topY, w, 16, 8); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, tx, topY, w, 16, 8); ctx.stroke();
        ctx.fillStyle = s.trap ? P.blush : P.white;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name, tx + w / 2, topY + 8);
        if (s.trap) {                                     // unmistakable "do not shoot"
            ctx.fillStyle = P.rose;
            ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
            ctx.fillText('✘ NOT A CELEBRITY', tx + w / 2, topY - 8);
        }
    }

    /* ============================================================
       DRAW
       ============================================================ */
    function onDraw(ctx) {
        if (!bg) bg = buildBackground();

        ctx.save();
        if (camShake > 0.1) {
            ctx.translate((Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake);
        }

        ctx.fillStyle = P.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(bg, 0, 0, W, H);

        if (phase === 'cover') {
            ctx.restore();
            drawCover(ctx);
            return;
        }

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

        var baseY = s.mode === 'drive' ? WALK_Y - 34 : WALK_Y;
        var scale = s.mode === 'drive' ? 0.62 : 1;

        /* Spotlight pool on the carpet. Without this the figure sits on a flat
           magenta slab with nothing separating the two. */
        if (s.mode !== 'drive') {
            var pool = ctx.createRadialGradient(x, baseY, 4, x, baseY, 96);
            pool.addColorStop(0, rgba(P.champ, 0.30));
            pool.addColorStop(0.5, rgba(P.blush, 0.12));
            pool.addColorStop(1, rgba(P.blush, 0));
            ctx.fillStyle = pool;
            ctx.beginPath(); ctx.ellipse(x, baseY, 96, 34, 0, 0, Math.PI * 2); ctx.fill();
        }

        if (s.mode === 'drive') drawCar(ctx, x, s.dir);

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

        if (s.pair) {
            drawFigure(ctx, s.celeb.figures[1], x + s.spread, baseY, scale, pa);
            drawFigure(ctx, s.celeb.figures[0], x - s.spread, baseY, scale, pa);
        } else {
            drawFigure(ctx, s.celeb.figures[0], x, baseY, scale, pa);
        }

        /* "shoot now" affordance, placed on clear carpet below the feet so it
           never collides with the name tag above the head */
        if (posing) {
            ctx.fillStyle = P.gold;
            ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('★ POSE', x, baseY + 48);   // clear of the barrier rope
        }

        /* The verdict card owns the centre of the frame while it is up - the
           tag would sit directly under its glyph. */
        if (phase === 'walk') drawNameTag(ctx, s, x, baseY - 176 * scale);
    }

    function drawCar(ctx, x, dir) {
        var y = WALK_Y + 6;
        ctx.save();
        ctx.fillStyle = T.black;
        GameEngine.drawRoundedRect(ctx, x - 82, y - 54, 164, 44, 10); ctx.fill();
        ctx.fillStyle = '#120A10';
        GameEngine.drawRoundedRect(ctx, x - 60, y - 82, 118, 32, 8); ctx.fill();
        /* open window the subject leans out of */
        ctx.fillStyle = rgba(P.champ, 0.16);
        GameEngine.drawRoundedRect(ctx, x - 34, y - 78, 68, 24, 5); ctx.fill();
        /* wheels */
        ctx.fillStyle = '#0A0508';
        ctx.beginPath(); ctx.arc(x - 50, y - 8, 13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 50, y - 8, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = T.silver;
        ctx.beginPath(); ctx.arc(x - 50, y - 8, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 50, y - 8, 5, 0, Math.PI * 2); ctx.fill();
        /* headlight wash */
        ctx.fillStyle = rgba(P.champ, 0.22);
        ctx.beginPath();
        ctx.moveTo(x + dir * 82, y - 30);
        ctx.lineTo(x + dir * 150, y - 44);
        ctx.lineTo(x + dir * 150, y - 4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    function drawObstruction(ctx, o) {
        ctx.save();
        if (o.kind === 'umbrella') {
            ctx.fillStyle = T.black;
            ctx.beginPath(); ctx.arc(o.x, o.y, 44, Math.PI, 0); ctx.fill();
            ctx.strokeStyle = T.charcoal; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y + 62); ctx.stroke();
            ctx.fillStyle = rgba(P.champ, 0.18);
            ctx.beginPath(); ctx.arc(o.x, o.y, 44, Math.PI, 0); ctx.fill();
        } else if (o.kind === 'arm') {
            ctx.strokeStyle = T.charcoal; ctx.lineWidth = 16; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(o.x - o.dir * 60, o.y + 54);
            ctx.quadraticCurveTo(o.x, o.y + 6, o.x + o.dir * 22, o.y + 26);
            ctx.stroke();
            ctx.fillStyle = T.charcoal;
            GameEngine.drawRoundedRect(ctx, o.x - 14, o.y - 6, 30, 18, 4); ctx.fill();
        } else { /* nophotos */
            ctx.fillStyle = T.skinA;
            GameEngine.drawRoundedRect(ctx, o.x - 23, o.y - 26, 46, 52, 9); ctx.fill();
            ctx.fillStyle = P.rose;
            ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('NO', o.x, o.y - 6);
            ctx.fillText('PHOTOS', o.x, o.y + 6);
        }
        ctx.restore();
    }

    function drawAmbientPops(ctx) {
        for (var i = 0; i < ambient.pops.length; i++) {
            var p = ambient.pops[i];
            var a = clamp01(p.life / p.max);
            var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, rgba(P.champ, 0.55 * a));
            g.addColorStop(1, rgba(P.champ, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
    }

    /** Foreground paparazzi pit - silhouettes, the player's own hands last. */
    function drawPit(ctx) {
        ctx.save();
        var g = ctx.createLinearGradient(0, PIT_TOP - 20, 0, H);
        g.addColorStop(0, rgba(P.ink, 0));
        g.addColorStop(0.35, rgba(P.ink, 0.92));
        g.addColorStop(1, P.ink);
        ctx.fillStyle = g;
        ctx.fillRect(0, PIT_TOP - 20, W, H - PIT_TOP + 20);

        /* Rival photographers, sized to overlap the carpet base - they are the
           foreground plane that gives the shot its depth. */
        for (var i = 0; i < 5; i++) {
            var hx = 18 + i * 92;
            var hy = PIT_TOP - 4 + (i % 2) * 14;
            ctx.fillStyle = '#12060D';
            ctx.beginPath(); ctx.arc(hx, hy, 19, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(hx, hy + 44, 36, 30, 0, Math.PI, 0, true); ctx.fill();
            /* raised camera */
            ctx.fillStyle = '#251119';
            GameEngine.drawRoundedRect(ctx, hx - 16, hy - 32, 32, 17, 3); ctx.fill();
            ctx.fillStyle = '#0A0407';
            ctx.beginPath(); ctx.arc(hx, hy - 23.5, 6, 0, Math.PI * 2); ctx.fill();
            /* a glint on the front element */
            ctx.fillStyle = rgba(P.blush, 0.30);
            ctx.beginPath(); ctx.arc(hx - 2, hy - 25.5, 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    /* ---- viewfinder chrome ---- */
    function drawViewfinder(ctx) {
        var l = FRAME_CX - FRAME_HW, r = FRAME_CX + FRAME_HW;
        var t = FRAME_CY - FRAME_HH, b = FRAME_CY + FRAME_HH;

        ctx.save();

        /* Soft lens vignette. Deliberately NOT four hard rectangles - that read
           as a bright UI panel pasted over the scene rather than as optics. */
        var vig = ctx.createRadialGradient(FRAME_CX, FRAME_CY, 90, FRAME_CX, FRAME_CY, 330);
        vig.addColorStop(0, rgba(P.ink, 0));
        vig.addColorStop(0.55, rgba(P.ink, 0.18));
        vig.addColorStop(1, rgba(P.ink, 0.78));
        ctx.fillStyle = vig;
        ctx.fillRect(0, SCENE_TOP, W, H - SCENE_TOP);

        /* corner brackets */
        ctx.strokeStyle = P.bubble; ctx.lineWidth = 2.5; ctx.lineCap = 'square';
        var c = 22;
        [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]].forEach(function (k) {
            ctx.beginPath();
            ctx.moveTo(k[0] + k[2] * c, k[1]);
            ctx.lineTo(k[0], k[1]);
            ctx.lineTo(k[0], k[1] + k[3] * c);
            ctx.stroke();
        });

        /* centre reticle */
        ctx.strokeStyle = rgba(P.champ, 0.7); ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(FRAME_CX - 12, FRAME_CY); ctx.lineTo(FRAME_CX - 4, FRAME_CY);
        ctx.moveTo(FRAME_CX + 4, FRAME_CY); ctx.lineTo(FRAME_CX + 12, FRAME_CY);
        ctx.moveTo(FRAME_CX, FRAME_CY - 12); ctx.lineTo(FRAME_CX, FRAME_CY - 4);
        ctx.moveTo(FRAME_CX, FRAME_CY + 4); ctx.lineTo(FRAME_CX, FRAME_CY + 12);
        ctx.stroke();

        /* live framing readout - how centred is the subject right now */
        if (subject && !subject.shot && phase === 'walk') {
            var fx = clamp(subject.x, l + 6, r - 6);
            var good = Math.abs(subject.x - FRAME_CX) < 30;
            ctx.strokeStyle = good ? P.gold : rgba(P.bubble, 0.85);
            ctx.lineWidth = good ? 2.5 : 1.5;
            ctx.beginPath(); ctx.moveTo(fx, t + 4); ctx.lineTo(fx, t + 16); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(fx, b - 16); ctx.lineTo(fx, b - 4); ctx.stroke();
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
                ctx.fillStyle = P.gold;
                ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
                ctx.fillText('SHARP', FRAME_CX, FRAME_CY - rad - 9);
            }
        }

        /* camera readouts */
        ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = rgba(P.blush, 0.85);
        ctx.fillText('ISO 3200   f/2.8   1/250', l, b + 16);
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(P.blush, 0.85);
        ctx.fillText('FRAME ' + Math.min(realDone + 1, TOTAL_SUBJECTS) + '/' + TOTAL_SUBJECTS, r, b + 16);

        drawFocusMeter(ctx);
        ctx.restore();
    }

    /** Explicit focus meter with a visible sweet spot - this is what makes the
        core mechanic learnable rather than mysterious. */
    function drawFocusMeter(ctx) {
        var mx = 46, mw = W - 92, my = METER_Y;
        ctx.fillStyle = rgba(P.ink, 0.8);
        GameEngine.drawRoundedRect(ctx, mx, my, mw, 14, 7); ctx.fill();
        ctx.strokeStyle = rgba(P.bubble, 0.55); ctx.lineWidth = 1;
        GameEngine.drawRoundedRect(ctx, mx, my, mw, 14, 7); ctx.stroke();

        /* Bands ARE the scoring gates. Each edge is the exact rack position at
           which sharpness() crosses that verdict's threshold, so the band the
           player is told to aim at is the band they are graded against. The gold
           band previously sat at +/- 0.45 of the half-width, whose edge scored 55:
           it promised the top tier and paid PAGE SIX. */
        var oPage = rackOffsetFor(K_PAGE), oExcl = rackOffsetFor(K_EXCL), oFront = rackOffsetFor(K_FRONT);
        ctx.fillStyle = rgba(P.bubble, 0.28);                 // scores at all
        ctx.fillRect(mx + mw * (FOCUS_PEAK - oPage), my + 5, mw * oPage * 2, 4);
        ctx.fillStyle = rgba(P.gold, 0.45);                   // EXCLUSIVE or better
        ctx.fillRect(mx + mw * (FOCUS_PEAK - oExcl), my + 2, mw * oExcl * 2, 10);
        ctx.fillStyle = rgba(P.champ, 0.9);                   // FRONT PAGE
        ctx.fillRect(mx + mw * (FOCUS_PEAK - oFront), my + 2, mw * oFront * 2, 10);

        /* marker */
        if (focusActive) {
            var px = mx + mw * clamp01(focusT);
            ctx.fillStyle = sharpness(focusT) * 100 >= K_EXCL ? P.gold : P.champ;
            ctx.fillRect(px - 1.5, my - 4, 3, 22);
        }

        ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(P.blush, 0.9);
        ctx.fillText(holding ? 'RELEASE TO SHOOT' : 'HOLD TO FOCUS', W / 2, my + 30);
    }

    /* ---- top strip (jumbotron) ---- */
    function drawStrip(ctx) {
        var y = STRIP_Y, h = STRIP_H;
        ctx.save();
        ctx.fillStyle = rgba(P.ink, 0.9);
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.fill();
        ctx.strokeStyle = rgba(P.hot, 0.9); ctx.lineWidth = 1.5;
        GameEngine.drawRoundedRect(ctx, 8, y, W - 16, h, 5); ctx.stroke();

        ctx.fillStyle = P.hot;
        ctx.beginPath(); ctx.arc(20, y + h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = rgba(P.blush, 0.8);
        ctx.fillText('MIFF OPENING NIGHT', 30, y + h / 2);

        ctx.textAlign = 'center';
        ctx.fillStyle = P.white;
        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillText('FLASH!', W / 2 + 14, y + h / 2);

        ctx.textAlign = 'right';
        ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
        ctx.fillStyle = streak > 1 ? P.gold : rgba(P.blush, 0.7);
        ctx.fillText(streak > 1 ? ('★ x' + streak) : ('SHOTS ' + realDone), W - 18, y + h / 2);
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

        /* who it was - the on-subject name tag is suppressed while this is up */
        ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = P.ink;
        ctx.strokeText(v.name, 0, -84);
        ctx.fillStyle = rgba(P.blush, 0.95); ctx.fillText(v.name, 0, -84);

        /* glyph - the colour-independent shape channel */
        ctx.font = 'bold 38px Arial, Helvetica, sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = P.ink;
        ctx.strokeText(v.glyph, 0, -54);
        ctx.fillStyle = v.colour; ctx.fillText(v.glyph, 0, -54);

        ctx.font = 'bold 30px Arial, Helvetica, sans-serif';
        ctx.lineWidth = 6; ctx.strokeStyle = P.ink;
        ctx.strokeText(v.label, 0, 0);
        ctx.fillStyle = v.colour; ctx.fillText(v.label, 0, 0);

        ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
        ctx.fillStyle = P.white;
        ctx.fillText((v.points >= 0 ? '+' : '') + v.points, 0, 26);

        /* per-axis feedback so the player learns what to fix */
        ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
        ctx.fillStyle = rgba(P.blush, 0.95);
        ctx.fillText('FRAMING ' + Math.round(v.framing) + '   FOCUS ' + Math.round(v.focus), 0, 46);

        for (var i = 0; i < v.notes.length; i++) {
            ctx.fillStyle = P.gold;
            ctx.fillText(v.notes[i], 0, 62 + i * 14);
        }
        ctx.restore();
    }

    /* ---- flash + shutter wipe ---- */
    function drawFlash(ctx) {
        /* shutter blade wipe - always present, carries the event with no strobe */
        if (shutterWipe > 0) {
            var sw = 1 - shutterWipe;
            ctx.fillStyle = rgba(P.ink, 0.85);
            var hgt = (H - SCENE_TOP) * 0.5;
            ctx.fillRect(0, SCENE_TOP, W, hgt * (1 - sw));
            ctx.fillRect(0, H - hgt * (1 - sw), W, hgt * (1 - sw));
        }

        if (flashGlow <= 0) return;
        /* edge bloom inward - deliberately NOT a full-screen white-out */
        var a = flashGlow;
        var g = ctx.createRadialGradient(FRAME_CX, FRAME_CY, 60, FRAME_CX, FRAME_CY, 300);
        g.addColorStop(0, rgba(P.champ, 0));
        g.addColorStop(0.65, rgba(P.champ, 0.30 * a));
        g.addColorStop(1, rgba(P.white, 0.62 * a));
        ctx.fillStyle = g;
        ctx.fillRect(0, SCENE_TOP, W, H - SCENE_TOP);
    }

    /* ============================================================
       MAGAZINE COVER (results)
       ============================================================ */
    function drawCover(ctx) {
        var t = clamp01(coverT / 0.7);
        var slide = RM ? 0 : (1 - outQuart(t)) * 40;

        ctx.save();
        ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, H);

        var cx = 20, cy = SCENE_TOP + 6 + slide, cw = W - 40, ch = H - SCENE_TOP - 70;

        /* cover stock */
        var grad = ctx.createLinearGradient(0, cy, 0, cy + ch);
        grad.addColorStop(0, P.hot);
        grad.addColorStop(0.5, P.bubble);
        grad.addColorStop(1, P.blush);
        ctx.fillStyle = grad;
        GameEngine.drawRoundedRect(ctx, cx, cy, cw, ch, 6); ctx.fill();
        ctx.strokeStyle = rgba(P.champ, 0.8); ctx.lineWidth = 2;
        GameEngine.drawRoundedRect(ctx, cx, cy, cw, ch, 6); ctx.stroke();

        /* masthead */
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
        ctx.fillStyle = P.white;
        ctx.fillText('FLASH!', W / 2, cy + 40);
        ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
        ctx.fillStyle = rgba(P.ink, 0.7);
        ctx.fillText('MIFF OPENING NIGHT SPECIAL  ·  MELBOURNE  ·  AUGUST 2026', W / 2, cy + 68);

        /* hero shot */
        var px = cx + 34, py = cy + 84, pw = cw - 68, ph = 190;
        ctx.fillStyle = rgba(P.ink, 0.9);
        GameEngine.drawRoundedRect(ctx, px, py, pw, ph, 4); ctx.fill();

        if (bestShot) {
            ctx.save();
            ctx.beginPath(); GameEngine.drawRoundedRect(ctx, px, py, pw, ph, 4); ctx.clip();
            var gg = ctx.createLinearGradient(0, py, 0, py + ph);
            gg.addColorStop(0, P.rose); gg.addColorStop(1, '#3A0C26');
            ctx.fillStyle = gg; ctx.fillRect(px, py, pw, ph);
            /* 0.95, sat low in the box: at 1.05 a raised-arm pose (Messi,
               Rodri, Hemsworth) had its hand clipped off by the frame top. */
            var fig = bestShot.celeb.figures;
            var figY = py + ph - 8, sc = 0.95;
            if (fig.length > 1) {
                drawFigure(ctx, fig[1], W / 2 + 30, figY, sc * 0.92, 1, bestShot.focus / 100);
                drawFigure(ctx, fig[0], W / 2 - 30, figY, sc * 0.92, 1, bestShot.focus / 100);
            } else {
                drawFigure(ctx, fig[0], W / 2, figY, sc, 1, bestShot.focus / 100);
            }
            ctx.restore();
            ctx.strokeStyle = rgba(P.champ, 0.7); ctx.lineWidth = 1.5;
            GameEngine.drawRoundedRect(ctx, px, py, pw, ph, 4); ctx.stroke();
        } else {
            ctx.fillStyle = rgba(P.blush, 0.8);
            ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
            ctx.fillText('NO USABLE FRAMES', W / 2, py + ph / 2 - 8);
            ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
            ctx.fillText('the editor is not pleased', W / 2, py + ph / 2 + 12);
        }

        /* headline */
        var hy2 = py + ph + 24;
        ctx.fillStyle = P.ink;
        ctx.font = 'bold 17px Arial, Helvetica, sans-serif';
        var head = bestShot ? bestShot.headline : 'PAPARAZZO GOES HOME EMPTY-HANDED';
        wrapText(ctx, head, W / 2, hy2, cw - 60, 19);

        /* cover lines */
        var ly = hy2 + 44;
        ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left';
        var lines = shotLog.slice(0, 5);
        for (var i = 0; i < lines.length; i++) {
            ctx.fillStyle = rgba(P.ink, 0.78);
            ctx.fillText('• ' + lines[i].name + ' - ' + lines[i].label, cx + 26, ly + i * 14);
        }

        /* price tag = score */
        ctx.textAlign = 'center';
        ctx.fillStyle = P.ink;
        ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
        ctx.fillText('ISSUE PRICE', W / 2, cy + ch - 40);
        ctx.font = 'bold 30px Arial, Helvetica, sans-serif';
        ctx.fillStyle = P.white;
        ctx.fillText(String(score), W / 2, cy + ch - 18);

        if (coverClean) {
            ctx.fillStyle = P.gold;
            ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
            ctx.fillText('★ FULL ISSUE BONUS +5000', W / 2, cy + ch + 2);
        }

        ctx.restore();

        particlesDraw(ctx);

        if (coverReady) {
            ctx.fillStyle = rgba(P.blush, 0.9);
            ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('TAP TO FILE YOUR COPY', W / 2, H - 22);
        }
    }

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
       INIT
       ============================================================ */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 640 });
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
