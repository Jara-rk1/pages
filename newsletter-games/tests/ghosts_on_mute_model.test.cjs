// Ghosts on Mute model tests (G2, G4 oracle, G9). Run:
//   node --test --test-reporter=tap internal/newsletter/games/tests/ghosts_on_mute_model.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'games', 'ghosts-on-mute', 'model.js');
const M = require(SRC);
const T = M.TUNING;
const DT = 1 / 60;
const ONSETS = new Set(['spawn', 'hop', 'spread', 'presenter', 'glitch']);

function rng(seed) {                    // test-local mulberry32, independent of the model's
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let x = Math.imul(a ^ (a >>> 15), a | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

// Plays one round. profile: 'perfect' (taps every haunt at once), 'casual' (9.1: reaction 550 ms
// sd 150, 12% misclick, 1 s lapse 10% of the time) or 'none'. Returns {s, events, taps}.
function play(seed, profile) {
    const s = M.createRound(seed);
    const r = rng(seed * 7919 + 1);
    const due = new Map();              // ghost object -> tap time
    const events = [], taps = [];
    const reaction = () => {
        const g = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
        return Math.max(0.15, 0.55 + 0.15 * g) + (r() < 0.10 ? 1 : 0);
    };
    while (!s.ended) {
        for (const e of M.step(s, DT)) events.push(Object.assign({ t: s.t }, e));
        if (profile === 'none') continue;
        for (let i = 0; i < 12; i++) {
            const tl = s.tiles[i];
            if (tl.state !== 'haunted') continue;
            if (profile === 'perfect') { taps.push(Object.assign({ t: s.t }, M.tap(s, i))); continue; }
            if (!due.has(tl.ghost)) { due.set(tl.ghost, s.t + reaction()); continue; }
            if (s.t < due.get(tl.ghost)) continue;
            if (r() < 0.12) {           // misclick on a neighbour, then react again
                const n = M.ADJ[i][Math.floor(r() * M.ADJ[i].length)];
                taps.push(Object.assign({ t: s.t }, M.tap(s, n)));
                due.set(tl.ghost, s.t + reaction());
                continue;
            }
            taps.push(Object.assign({ t: s.t }, M.tap(s, i)));
        }
    }
    return { s, events, taps };
}

// G9 checks for one played round; throws on the first breach.
function checkLedger(run) {
    const { s, events, taps } = run;
    const log = s.flashLog;
    for (let i = T.FLASH_MAX_PER_S; i < log.length; i++) {
        assert.ok(log[i] - log[i - T.FLASH_MAX_PER_S] > T.FLASH_WINDOW_S, `4 grants inside 1 s at ${log[i]}`);
    }
    const granted = new Set();
    const onsetEvents = events.filter(e => ONSETS.has(e.type)).concat(taps.filter(x => x.result === 'mute' || x.result === 'echo' || x.result === 'pair'));
    for (const e of onsetEvents) {
        assert.ok(Number.isInteger(e.onset) && e.onset >= 1 && e.onset <= s.flashAsks, `onset bypassed canFlash: ${JSON.stringify(e)}`);
        if (e.flash) granted.add(e.onset);
    }
    for (const x of taps) if (!('onset' in x)) assert.equal(x.flash, false);
    assert.equal(granted.size, log.length, 'flash:true onsets vs ledger grants');
    return log.length;
}

function hauntedAt(s, i, kind, life, extra) {
    s.tiles[i].state = 'haunted';
    s.tiles[i].ghost = Object.assign({ kind, age: 0, life, pairId: 0 }, extra || {});
}

test('TUNING is frozen and carries the 3.4-3.6 numbers', () => {
    assert.ok(Object.isFrozen(T));
    assert.equal(T.ROUND_S, 60);
    assert.deepEqual([T.SPAWN_INTERVAL_START_S, T.SPAWN_INTERVAL_END_S, T.HAUNT_LIFE_START_S, T.HAUNT_LIFE_END_S], [1.3, 0.7, 2.2, 1.6]);
    assert.deepEqual([0, 9.9, 10, 24.9, 25, 39.9, 40, 59].map(M.maxConcurrent), [1, 1, 2, 2, 3, 3, 4, 4]);
    assert.deepEqual([T.FLASH_MAX_PER_S, T.PRESENTER_ROTATE_S, T.MUTED_HOLD_S, T.MUDDLED_S], [3, 15, 0.4, 0.6]);
    assert.deepEqual([T.PAIR_FROM_S, T.PAIR_WINDOW_S, T.PAIR_BONUS, T.REPLY_ALL_FROM_S, T.REPLY_ALL_BONUS, T.REPLY_ALL_MAX_SPREAD], [15, 1.5, 100, 25, 50, 3]);
    assert.deepEqual([T.EMOJI_FROM_S, T.EMOJI_LIFE_S, T.EMOJI_BONUS, T.EMOJI_CALM, T.GLITCH_START_S, T.GLITCH_END_S, T.GLITCH_SPAWN_MULT], [35, 0.8, 150, 3, 42, 47, 1.6]);
    assert.deepEqual([T.CALM_START, T.CALM_END_BONUS, T.EXPIRE_CALM, T.PRESENTER_TAP_CALM, T.ECHO_POINTS, T.ECHO_LIFE_MULT], [100, 20, 5, 10, 25, 0.8]);
    assert.deepEqual([T.MUTE_BASE, T.MUTE_SPEED_BONUS, T.STREAK_MULT_MAX_TENTHS], [50, 150, 35]);
    assert.ok(Math.abs(M.spawnInterval(30) - 1.0) < 1e-9 && Math.abs(M.spawnInterval(44) - M.spawnInterval(41.999) / 1.6) < 0.02);
});

test('model is pure: no Math.random, no DOM', () => {
    const src = fs.readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const bad of ['Math.random', 'document', 'canvas', 'performance.now', 'Date.now']) {
        assert.ok(!src.includes(bad), bad);
    }
});

test('determinism: same seed and inputs give the same round; seeds differ', () => {
    const a = play(42, 'casual'), b = play(42, 'casual'), c = play(43, 'casual');
    assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.notEqual(JSON.stringify(a.events), JSON.stringify(c.events));
    assert.ok(a.events.filter(e => e.type === 'spawn').length > 20);
});

test('invariants over 300 casual seeds: presenter never haunted, onboarding single haunt, calm bounds', () => {
    for (let seed = 1; seed <= 300; seed++) {
        const s = M.createRound(seed);
        const r = rng(seed);
        while (!s.ended) {
            M.step(s, DT);
            assert.ok(s.calm >= 0 && s.calm <= 100);
            assert.equal(s.tiles[s.presenter].state === 'haunted', false, `presenter haunted seed ${seed}`);
            const h = s.tiles.filter(x => x.state === 'haunted').length;
            if (s.t < 10) assert.ok(h <= 1, `onboarding ${h} haunts at ${s.t}`);
            for (let i = 0; i < 12; i++) if (s.tiles[i].state === 'haunted' && r() < 0.03) M.tap(s, i);
        }
    }
});

test('Calm floor: an untouched round drains to 0, ends early, bonus 0', () => {
    const { s, events } = play(7, 'none');
    assert.equal(s.calm, 0);
    assert.ok(s.t < T.ROUND_S);
    const ends = events.filter(e => e.type === 'end');
    assert.equal(ends.length, 1);
    assert.equal(ends[0].bonus, 0);
    assert.ok(events.some(e => e.type === 'hop') && events.some(e => e.type === 'leave'));
});

test('60 s end: perfect play ends at ROUND_S once, with Calm 100 and the end bonus; step after end is empty', () => {
    const { s, events } = play(3, 'perfect');
    assert.ok(s.ended && Math.abs(s.t - 60) < DT * 1.5);
    assert.equal(s.calm, 100);
    const ends = events.filter(e => e.type === 'end');
    assert.equal(ends.length, 1);
    assert.equal(ends[0].bonus, 100 * T.CALM_END_BONUS);
    assert.deepEqual(M.step(s, DT), []);
    assert.equal(M.tap(s, 0).result, 'miss');
});

test('unlock times: pair 15 s, reply-all 25 s, emoji 35 s, glitch once at 42-47 s', () => {
    const first = { pair: Infinity, replyall: Infinity, emoji: Infinity };
    let glitches = 0, seen = { pair: 0, replyall: 0, emoji: 0 };
    for (let seed = 1; seed <= 200; seed++) {
        const s = M.createRound(seed);
        while (!s.ended) {
            for (const e of M.step(s, DT)) {
                if (e.type === 'spawn' && e.kind in first) { first[e.kind] = Math.min(first[e.kind], s.t); seen[e.kind]++; }
                if (e.type === 'glitch') { glitches++; assert.ok(s.t >= 42 && s.t < 42 + DT * 1.5); }
            }
            assert.equal(s.glitch.active, s.t >= 42 && s.t < 47);
            for (let i = 0; i < 12; i++) if (s.tiles[i].state === 'haunted') M.tap(s, i);
        }
    }
    assert.ok(first.pair >= 15 && first.replyall >= 25 && first.emoji >= 35, JSON.stringify(first));
    assert.ok(seen.pair > 0 && seen.replyall > 0 && seen.emoji > 0, JSON.stringify(seen));
    assert.equal(glitches, 200);
});

test('scoring arithmetic: 50 base plus up to 150 for speed, streak multiplier and its cap (3.5)', () => {
    assert.equal(M.mutePoints(0, 2, 0), 200);
    assert.equal(M.mutePoints(1, 2, 0), 125);
    assert.equal(M.mutePoints(3, 2, 0), 50);
    assert.equal(M.mutePoints(0, 2, 3), 260);
    assert.equal(M.mutePoints(1, 2, 7), 212);      // floor(125 * 1.7)
    assert.equal(M.mutePoints(0, 2, 10), 400);
    assert.equal(M.mutePoints(0, 2, 25), 700);
    assert.equal(M.mutePoints(0, 2, 40), 700);
    const s = M.createRound(1);
    const i = (s.presenter + 1) % 12;
    hauntedAt(s, i, 'normal', 2);
    s.tiles[i].ghost.age = 1; s.streak = 4;
    const r = M.tap(s, i);
    assert.deepEqual([r.result, r.points, s.streak, s.score, s.tiles[i].state], ['mute', 175, 5, 175, 'muted']);
    hauntedAt(s, i, 'replyall', 2);
    assert.equal(M.tap(s, i).points, Math.floor(200 * 1.5) + 50);
    hauntedAt(s, i, 'emoji', 0.8);
    assert.equal(M.tap(s, i).points, Math.floor(200 * 1.6) + 150);
});

test('echo mute is a flat 25 and leaves the streak alone', () => {
    const s = M.createRound(1);
    const i = (s.presenter + 1) % 12;
    s.streak = 6;
    hauntedAt(s, i, 'echo', 1);
    const r = M.tap(s, i);
    assert.deepEqual([r.result, r.points, s.streak, s.score], ['echo', 25, 6, 25]);
});

test('wrong taps reset the streak, a presenter tap also costs PRESENTER_TAP_CALM; muted tile tap keeps it', () => {
    const s = M.createRound(1);
    const p = s.presenter, idle = (p + 1) % 12;
    s.streak = 5;
    let r = M.tap(s, p);
    assert.deepEqual([r.result, r.points, s.streak, s.calm, s.score], ['presenter', 0, 0, 100 - T.PRESENTER_TAP_CALM, 0]);
    s.calm = 100;
    s.streak = 5;
    r = M.tap(s, idle);
    assert.deepEqual([r.result, s.streak, s.calm], ['miss', 0, 100]);
    s.streak = 5; s.tiles[idle].state = 'muted'; s.tiles[idle].hold = 0.4;
    assert.equal(M.tap(s, idle).result, 'miss');
    assert.equal(s.streak, 5);
    assert.equal(M.tap(s, 99).result, 'miss');
});

test('pair bonus inside PAIR_WINDOW_S only', () => {
    const s = M.createRound(1);
    const [a, b] = [0, 1, 2, 3, 4, 5].filter(x => x !== s.presenter && x + 1 !== s.presenter).slice(0, 1).map(x => [x, x + 1])[0];
    hauntedAt(s, a, 'pair', 2, { pairId: 9 }); hauntedAt(s, b, 'pair', 2, { pairId: 9 });
    assert.equal(M.tap(s, a).result, 'mute');
    s.t += 1.4;
    const r = M.tap(s, b);
    assert.equal(r.result, 'pair');
    assert.equal(r.points, Math.floor(200 * 1.1) + 100);
    hauntedAt(s, a, 'pair', 2, { pairId: 10 }); hauntedAt(s, b, 'pair', 2, { pairId: 10 });
    M.tap(s, a); s.t += 1.6;
    assert.equal(M.tap(s, b).result, 'mute');
});

test('expiry: Calm -EXPIRE_CALM, streak broken, one hop as echo (life x0.8) to an adjacent idle non-presenter; echo expiry leaves', () => {
    const s = M.createRound(5);
    s.presenter = 11; s.queue.spawnIn = 99;
    hauntedAt(s, 4, 'normal', 1);
    s.tiles[4].ghost.age = 1; s.streak = 5;
    const ev = M.step(s, DT);
    const hop = ev.find(e => e.type === 'hop');
    assert.equal(s.calm, 100 - T.EXPIRE_CALM);
    assert.equal(s.streak, 0);
    assert.ok(M.ADJ[4].includes(hop.tile) && hop.tile !== 11 && hop.from === 4);
    assert.equal(s.tiles[4].state, 'muddled');
    assert.equal(s.tiles[hop.tile].ghost.kind, 'echo');
    assert.ok(Math.abs(s.tiles[hop.tile].ghost.life - 0.8) < 1e-9);
    s.tiles[hop.tile].ghost.age = 0.8;
    const ev2 = M.step(s, DT);
    assert.equal(s.calm, 100 - 2 * T.EXPIRE_CALM);
    assert.ok(ev2.some(e => e.type === 'leave' && e.tile === hop.tile));
    assert.equal(s.tiles.filter(t => t.state === 'haunted').length, 0);
});

test('reply-all spreads to every adjacent idle tile (max 3); emoji expiry costs EMOJI_CALM and never spreads', () => {
    const s = M.createRound(5);
    s.presenter = 0; s.queue.spawnIn = 99;
    hauntedAt(s, 4, 'replyall', 1);            // tile 4 has 4 neighbours: 1, 3, 5, 7
    s.tiles[4].ghost.age = 1;
    const ev = M.step(s, DT);
    const spread = ev.filter(e => e.type === 'spread');
    assert.equal(spread.length, 3);
    assert.equal(new Set(spread.map(e => e.onset)).size, 1, 'one onset for the whole spread');
    assert.ok(spread.every(e => M.ADJ[4].includes(e.tile) && s.tiles[e.tile].ghost.kind === 'echo'));
    assert.equal(s.calm, 100 - T.EXPIRE_CALM);
    const t = M.createRound(5);
    t.presenter = 0; t.queue.spawnIn = 99;
    hauntedAt(t, 4, 'emoji', 0.8); t.tiles[4].ghost.age = 0.8;
    const ev2 = M.step(t, DT);
    assert.equal(t.calm, 100 - T.EMOJI_CALM);
    assert.ok(!ev2.some(e => e.type === 'hop' || e.type === 'spread'));
});

test('canFlash: at most 3 grants per sliding second, and a denied spawn is deferred', () => {
    const s = M.createRound(1);
    assert.deepEqual([M.canFlash(s), M.canFlash(s), M.canFlash(s), M.canFlash(s)], [true, true, true, false]);
    s.t = 1.0;
    assert.equal(M.canFlash(s), false);
    s.t = 1.001;
    assert.equal(M.canFlash(s), true);
    const d = M.createRound(2);
    d.queue.spawnIn = 0; d.t = 5;
    d.flashLog = [5, 5, 5];
    assert.equal(M.step(d, DT).filter(e => e.type === 'spawn').length, 0);
    assert.ok(d.queue.spawnIn <= 0, 'still due');
    d.t = 6.01;
    assert.equal(M.step(d, DT).filter(e => e.type === 'spawn').length, 1);
});

test('G9 flash ledger: perfect and casual profiles over 1000 seeds, no onset bypasses canFlash', () => {
    let grants = 0, rounds = 0;
    for (const profile of ['perfect', 'casual']) {
        for (let seed = 1; seed <= 1000; seed++) { grants += checkLedger(play(seed, profile)); rounds++; }
    }
    assert.equal(rounds, 2000);
    assert.ok(grants > 2000 * 20, `grants ${grants}`);
    console.log(`# G9 rounds=${rounds} grants=${grants}`);
});

test('G4 oracle: instant sim vs analytic within 2%, farming below instant, max_score', () => {
    const o = M.oracle(1000);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    for (const a of [o.instant.sim, o.instant.analytic, o.farming.sim]) assert.equal(a.length, 1000);
    const sim = mean(o.instant.sim), ana = mean(o.instant.analytic);
    const gap = Math.abs(sim - ana) / ana;
    assert.ok(gap < 0.02, `gap ${gap}`);
    assert.ok(Math.max(...o.farming.sim) < Math.min(...o.instant.sim), 'farming beats instant on some seed');
    const top = Math.max(...o.instant.sim, ...o.instant.analytic, ...o.farming.sim);
    assert.equal(o.maxScore, Math.ceil(top * 1.08 / 500) * 500);
    assert.deepEqual(M.oracle([5, 6]).instant.sim, o.instant.sim.slice(4, 6), 'array and count forms agree');
    console.log(`# G4 sim_mean=${sim.toFixed(1)} analytic_mean=${ana.toFixed(1)} farming_max=${Math.max(...o.farming.sim)} ceiling=${top} max_score=${o.maxScore} gap=${(gap * 100).toFixed(3)}%`);
});
