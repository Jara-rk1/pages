/**
 * Ghosts on Mute: the round model (pure: no DOM, no canvas, no Math.random).
 * Spec: internal/newsletter/plans/2026-10-13-ghosts-on-mute.md sections 2.7, 3.4-3.6 and 5.1.
 *
 * State (plain, JSON-safe):
 *   {t, calm, score, streak, tiles[12], presenter, queue: {spawnIn, presenterIn},
 *    flashLog: [grant times], flashAsks, glitch: {active, done}, ended, rngState,
 *    pairSeq, pairMutedAt: {pairId: t of the first mute}}
 *   tiles[i] = {state: 'idle'|'haunted'|'muted'|'muddled', hold, ghost}
 *   ghost    = {kind: 'normal'|'pair'|'replyall'|'emoji'|'echo', age, life, pairId}
 * Grid is 3 columns x 4 rows, tile i at row floor(i/3), column i%3; adjacency is orthogonal.
 *
 * Events from step(): {type, tile, kind, flash} plus `onset` (the ledger ask id) on every
 * luminance onset (spawn, hop, spread, presenter, glitch). A pair spawn, and the targets of
 * one reply-all spread, share one ask (2.7: a pair counts as one onset). tap() returns
 * {result, points, flash} plus `onset` when the result is a mute (the poof).
 * A denied spawn is deferred to a later frame; every other onset proceeds with flash:false.
 *
 * oracle(seeds) -> {instant: {sim, analytic}, farming: {sim}, maxScore}: each of the three is an
 * array of per-seed final scores (seeds: an array, or a count n meaning 1..n);
 * maxScore = ceil(max(all) * 1.08 / 500) * 500 (G4).
 */
(function (root) {
    'use strict';

    var TUNING = Object.freeze({
        ROUND_S: 60,
        CALM_START: 100,
        CALM_END_BONUS: 20,             // end bonus = calm * this
        FIRST_SPAWN_S: 0.8,
        SPAWN_INTERVAL_START_S: 1.3,
        SPAWN_INTERVAL_END_S: 0.7,
        HAUNT_LIFE_START_S: 2.2,
        HAUNT_LIFE_END_S: 1.6,
        CONCURRENT_STEPS: Object.freeze([[10, 1], [25, 2], [40, 3]]),   // [under t, max]
        MAX_CONCURRENT_END: 4,
        FLASH_MAX_PER_S: 3,
        FLASH_WINDOW_S: 1,
        PRESENTER_ROTATE_S: 15,
        MUTED_HOLD_S: 0.4,
        MUDDLED_S: 0.6,
        MUTE_BASE: 50,                  // plus up to MUTE_SPEED_BONUS for a quick mute: speed decides the score
        MUTE_SPEED_BONUS: 150,
        STREAK_STEP_TENTHS: 1,          // multiplier = min(STREAK_MULT_MAX_TENTHS, 10 + streak) / 10
        STREAK_MULT_MAX_TENTHS: 35,
        EXPIRE_CALM: 5,                 // and an escape breaks the streak
        PRESENTER_TAP_CALM: 10,
        ECHO_LIFE_MULT: 0.8,
        ECHO_POINTS: 25,
        PAIR_FROM_S: 15,
        PAIR_CHANCE: 0.15,
        PAIR_WINDOW_S: 1.5,
        PAIR_BONUS: 100,
        REPLY_ALL_FROM_S: 25,
        REPLY_ALL_CHANCE: 0.15,
        REPLY_ALL_BONUS: 50,
        REPLY_ALL_MAX_SPREAD: 3,
        EMOJI_FROM_S: 35,
        EMOJI_CHANCE: 0.12,
        EMOJI_LIFE_S: 0.8,
        EMOJI_BONUS: 150,
        EMOJI_CALM: 3,
        GLITCH_START_S: 42,
        GLITCH_END_S: 47,
        GLITCH_SPAWN_MULT: 1.6
    });
    var T = TUNING;
    var COLS = 3, N = 12;

    var ADJ = [];
    for (var a = 0; a < N; a++) {
        var r = Math.floor(a / COLS), c = a % COLS, n = [];
        if (r > 0) n.push(a - COLS);
        if (c > 0) n.push(a - 1);
        if (c < COLS - 1) n.push(a + 1);
        if (r < N / COLS - 1) n.push(a + COLS);
        ADJ.push(n);
    }

    function rand(s) {                  // mulberry32, state kept in s.rngState
        var x = (s.rngState = (s.rngState + 0x6D2B79F5) | 0);
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }
    function pick(s, arr) { return arr[Math.floor(rand(s) * arr.length)]; }
    function lerp(a0, a1, t) { var k = Math.min(1, Math.max(0, t / T.ROUND_S)); return a0 + (a1 - a0) * k; }

    function spawnInterval(t) {
        var i = lerp(T.SPAWN_INTERVAL_START_S, T.SPAWN_INTERVAL_END_S, t);
        return (t >= T.GLITCH_START_S && t < T.GLITCH_END_S) ? i / T.GLITCH_SPAWN_MULT : i;
    }
    function hauntLife(t) { return lerp(T.HAUNT_LIFE_START_S, T.HAUNT_LIFE_END_S, t); }
    function maxConcurrent(t) {
        for (var i = 0; i < T.CONCURRENT_STEPS.length; i++) if (t < T.CONCURRENT_STEPS[i][0]) return T.CONCURRENT_STEPS[i][1];
        return T.MAX_CONCURRENT_END;
    }
    // Shared by the sim and the analytic, so the chance table lives in one place.
    function kindFor(t, r, pairOk) {
        var acc = 0;
        if (t >= T.EMOJI_FROM_S) { acc += T.EMOJI_CHANCE; if (r < acc) return 'emoji'; }
        if (t >= T.REPLY_ALL_FROM_S) { acc += T.REPLY_ALL_CHANCE; if (r < acc) return 'replyall'; }
        if (t >= T.PAIR_FROM_S && pairOk) { acc += T.PAIR_CHANCE; if (r < acc) return 'pair'; }
        return 'normal';
    }
    function mutePoints(age, life, streak) {
        var base = T.MUTE_BASE + Math.floor(T.MUTE_SPEED_BONUS * Math.max(0, 1 - age / life));
        var tenths = Math.min(T.STREAK_MULT_MAX_TENTHS, 10 + T.STREAK_STEP_TENTHS * streak);
        return Math.floor(base * tenths / 10);   // integer arithmetic, no 0.1 float drift
    }

    function createRound(seed) {
        var s = {
            t: 0, calm: T.CALM_START, score: 0, streak: 0, tiles: [], presenter: 0,
            queue: { spawnIn: T.FIRST_SPAWN_S, presenterIn: T.PRESENTER_ROTATE_S },
            flashLog: [], flashAsks: 0, glitch: { active: false, done: false },
            ended: false, rngState: (seed >>> 0), pairSeq: 0, pairMutedAt: {}
        };
        for (var i = 0; i < N; i++) s.tiles.push({ state: 'idle', hold: 0, ghost: null });
        s.presenter = Math.floor(rand(s) * N);
        return s;
    }

    // The single flash ledger (2.7): at most FLASH_MAX_PER_S grants in any FLASH_WINDOW_S.
    // Same rule as multiplex harness.js canFlash(). Records the grant; returns the decision.
    function canFlash(s) {
        s.flashAsks++;
        var log = s.flashLog, k = log.length - T.FLASH_MAX_PER_S;
        if (k >= 0 && s.t - log[k] <= T.FLASH_WINDOW_S) return false;
        log.push(s.t);
        return true;
    }

    function idleFree(s, i) { return s.tiles[i].state === 'idle' && i !== s.presenter; }
    function hauntedCount(s) { var n = 0; for (var i = 0; i < N; i++) if (s.tiles[i].state === 'haunted') n++; return n; }
    function haunt(s, i, kind, life, pairId) {
        var tl = s.tiles[i];
        tl.state = 'haunted'; tl.hold = 0;
        tl.ghost = { kind: kind, age: 0, life: life, pairId: pairId || 0 };
    }
    function settle(tl, state, hold) { tl.state = state; tl.hold = hold; tl.ghost = null; }

    function end(s, ev) {
        s.ended = true;
        var bonus = s.calm * T.CALM_END_BONUS;
        s.score += bonus;
        ev.push({ type: 'end', tile: -1, kind: null, flash: false, bonus: bonus, calm: s.calm, score: s.score });
    }

    function expire(s, i, ev) {
        var g = s.tiles[i].ghost;
        s.streak = 0;
        settle(s.tiles[i], 'muddled', T.MUDDLED_S);
        if (g.kind === 'emoji') {
            s.calm = Math.max(0, s.calm - T.EMOJI_CALM);
            ev.push({ type: 'expire', tile: i, kind: g.kind, flash: false });
            ev.push({ type: 'leave', tile: i, kind: g.kind, flash: false });
            return;
        }
        s.calm = Math.max(0, s.calm - T.EXPIRE_CALM);
        ev.push({ type: 'expire', tile: i, kind: g.kind, flash: false });
        if (g.kind === 'echo') { ev.push({ type: 'leave', tile: i, kind: g.kind, flash: false }); return; }
        var free = ADJ[i].filter(function (j) { return idleFree(s, j); });
        if (!free.length) { ev.push({ type: 'leave', tile: i, kind: g.kind, flash: false }); return; }
        var life = g.life * T.ECHO_LIFE_MULT, targets;
        if (g.kind === 'replyall') {
            targets = free.slice();
            while (targets.length > T.REPLY_ALL_MAX_SPREAD) targets.splice(Math.floor(rand(s) * targets.length), 1);
        } else {
            targets = [pick(s, free)];
        }
        var type = g.kind === 'replyall' ? 'spread' : 'hop';
        var flash = canFlash(s), onset = s.flashAsks;
        for (var k = 0; k < targets.length; k++) {
            haunt(s, targets[k], 'echo', life, 0);
            ev.push({ type: type, tile: targets[k], from: i, kind: 'echo', flash: flash, onset: onset });
        }
    }

    function trySpawn(s, ev) {
        var room = maxConcurrent(s.t) - hauntedCount(s);
        if (room < 1) return false;
        var free = [], pairs = [], i;
        for (i = 0; i < N; i++) if (idleFree(s, i)) free.push(i);
        if (!free.length) return false;
        if (room >= 2) for (i = 0; i < free.length; i++) {
            for (var k = 0; k < ADJ[free[i]].length; k++) {
                var j = ADJ[free[i]][k];
                if (j > free[i] && idleFree(s, j)) pairs.push([free[i], j]);
            }
        }
        if (!canFlash(s)) return false;          // deferred: the timer stays due, retried next step
        var onset = s.flashAsks, t = s.t;
        var kind = kindFor(t, rand(s), pairs.length > 0);
        if (kind === 'pair') {
            var p = pick(s, pairs), id = ++s.pairSeq, life = hauntLife(t);
            for (i = 0; i < 2; i++) {
                haunt(s, p[i], 'pair', life, id);
                ev.push({ type: 'spawn', tile: p[i], kind: 'pair', flash: true, onset: onset });
            }
        } else {
            var tile = pick(s, free);
            haunt(s, tile, kind, kind === 'emoji' ? T.EMOJI_LIFE_S : hauntLife(t), 0);
            ev.push({ type: 'spawn', tile: tile, kind: kind, flash: true, onset: onset });
        }
        return true;
    }

    function step(s, dt) {
        var ev = [], i;
        if (s.ended) return ev;
        s.t += dt;
        for (i = 0; i < N; i++) {
            var tl = s.tiles[i];
            if (tl.state === 'muted' || tl.state === 'muddled') {
                tl.hold -= dt;
                if (tl.hold <= 0) { tl.state = 'idle'; tl.hold = 0; }
            } else if (tl.state === 'haunted') {
                tl.ghost.age += dt;
            }
        }
        for (i = 0; i < N; i++) {
            var g = s.tiles[i].ghost;
            if (s.tiles[i].state === 'haunted' && g.age >= g.life) expire(s, i, ev);
        }
        if (s.calm <= 0 || s.t >= T.ROUND_S) { end(s, ev); return ev; }

        s.queue.presenterIn -= dt;
        if (s.queue.presenterIn <= 0) {
            s.queue.presenterIn += T.PRESENTER_ROTATE_S;
            var cand = [];
            for (i = 0; i < N; i++) if (idleFree(s, i)) cand.push(i);
            if (cand.length) {
                s.presenter = pick(s, cand);
                var f = canFlash(s);
                ev.push({ type: 'presenter', tile: s.presenter, kind: null, flash: f, onset: s.flashAsks });
            }
        }
        if (!s.glitch.done && s.t >= T.GLITCH_START_S) {
            s.glitch.done = true; s.glitch.active = true;
            var gf = canFlash(s);
            ev.push({ type: 'glitch', tile: -1, kind: null, flash: gf, onset: s.flashAsks });
        }
        if (s.glitch.active && s.t >= T.GLITCH_END_S) s.glitch.active = false;

        s.queue.spawnIn -= dt;
        if (s.queue.spawnIn <= 0 && trySpawn(s, ev)) s.queue.spawnIn += spawnInterval(s.t);
        return ev;
    }

    function tap(s, i) {
        var tl = s.tiles[i];
        if (s.ended || !tl) return { result: 'miss', points: 0, flash: false };
        if (i === s.presenter) { s.streak = 0; s.calm = Math.max(0, s.calm - T.PRESENTER_TAP_CALM); return { result: 'presenter', points: 0, flash: false }; }
        if (tl.state === 'idle') { s.streak = 0; return { result: 'miss', points: 0, flash: false }; }
        // ponytail: a tap on a tile already muted or muddled is a miss that keeps the streak (no
        // double-tap penalty); the spec names only idle and presenter as wrong taps.
        if (tl.state !== 'haunted') return { result: 'miss', points: 0, flash: false };
        var g = tl.ghost, result = 'mute', pts;
        if (g.kind === 'echo') {
            pts = T.ECHO_POINTS; result = 'echo';
        } else {
            pts = mutePoints(g.age, g.life, s.streak);
            s.streak++;
            if (g.kind === 'replyall') pts += T.REPLY_ALL_BONUS;
            if (g.kind === 'emoji') pts += T.EMOJI_BONUS;
            if (g.kind === 'pair') {
                var first = s.pairMutedAt[g.pairId];
                if (first === undefined) s.pairMutedAt[g.pairId] = s.t;
                else if (s.t - first <= T.PAIR_WINDOW_S) { pts += T.PAIR_BONUS; result = 'pair'; }
            }
        }
        settle(tl, 'muted', T.MUTED_HOLD_S);
        s.score += pts;
        var flash = canFlash(s);
        return { result: result, points: pts, flash: flash, onset: s.flashAsks };
    }

    // ---- G4 oracle -------------------------------------------------------------------------
    var DT = 1 / 60;
    function simulate(seed, profile) {
        var s = createRound(seed);
        while (!s.ended) {
            step(s, DT);
            for (var i = 0; i < N; i++) {
                var tl = s.tiles[i];
                if (tl.state !== 'haunted') continue;
                // farming: let normal, pair and reply-all ghosts expire once, mute the echoes
                if (profile === 'farming' && tl.ghost.kind !== 'echo' && tl.ghost.kind !== 'emoji') continue;
                tap(s, i);
            }
        }
        return s.score;
    }
    // Second method: the spawn schedule alone (timer, ledger, kinds), no tiles and its own RNG
    // stream, scored in closed form. Perfect instant play: every ghost muted at age 0, so no
    // expiries, Calm ends at CALM_START. Compared on the MEAN over seeds (different RNG draws).
    // ponytail: assumes a pair site always exists after PAIR_FROM_S (true at <=1 haunted).
    function analytic(seed) {
        var r = { rngState: (seed ^ 0x5bd1e995) >>> 0 };
        var t = 0, spawnIn = T.FIRST_SPAWN_S, presenterIn = T.PRESENTER_ROTATE_S, glitch = false;
        var log = [], streak = 0, score = 0;
        function grant() {
            var k = log.length - T.FLASH_MAX_PER_S;
            if (k >= 0 && t - log[k] <= T.FLASH_WINDOW_S) return false;
            log.push(t); return true;
        }
        function mute(bonus) { score += Math.floor((T.MUTE_BASE + T.MUTE_SPEED_BONUS) * Math.min(T.STREAK_MULT_MAX_TENTHS, 10 + T.STREAK_STEP_TENTHS * streak) / 10) + bonus; streak++; grant(); }
        for (;;) {
            t += DT;
            if (t >= T.ROUND_S) break;
            presenterIn -= DT;
            if (presenterIn <= 0) { presenterIn += T.PRESENTER_ROTATE_S; grant(); }
            if (!glitch && t >= T.GLITCH_START_S) { glitch = true; grant(); }
            spawnIn -= DT;
            if (spawnIn <= 0 && grant()) {
                var kind = kindFor(t, rand(r), true);
                if (kind === 'pair') { mute(0); mute(T.PAIR_BONUS); }
                else mute(kind === 'replyall' ? T.REPLY_ALL_BONUS : kind === 'emoji' ? T.EMOJI_BONUS : 0);
                spawnIn += spawnInterval(t);
            }
        }
        return score + T.CALM_START * T.CALM_END_BONUS;
    }
    function oracle(seeds) {
        if (typeof seeds === 'number') { var n = seeds; seeds = []; for (var q = 1; q <= n; q++) seeds.push(q); }
        function agg(fn) { return seeds.map(function (sd) { return fn(sd); }); }
        var out = {
            instant: { sim: agg(function (sd) { return simulate(sd, 'instant'); }), analytic: agg(analytic) },
            farming: { sim: agg(function (sd) { return simulate(sd, 'farming'); }) }
        };
        var top = Math.max.apply(null, out.instant.sim.concat(out.instant.analytic, out.farming.sim));
        out.maxScore = Math.ceil(top * 1.08 / 500) * 500;
        return out;
    }

    var MODEL = {
        TUNING: TUNING, ADJ: ADJ, COLS: COLS, TILES: N,
        createRound: createRound, canFlash: canFlash, step: step, tap: tap, oracle: oracle,
        maxConcurrent: maxConcurrent, spawnInterval: spawnInterval, hauntLife: hauntLife, mutePoints: mutePoints
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = MODEL;
    if (typeof window !== 'undefined') { root.GhostsOnMute = root.GhostsOnMute || {}; root.GhostsOnMute.MODEL = MODEL; }
})(typeof window !== 'undefined' ? window : this);
