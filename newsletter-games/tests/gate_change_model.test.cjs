// Gate Change model tests: node --test internal/newsletter/games/tests/gate_change_model.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../games/gate-change/model.js');
const T = M.TUNING;
const DT = 1 / 60;

function stepUntilCur(s) { let n = 0; while (!s.cur && !s.ended && n++ < 1000) M.step(s, DT); return s.cur; }
// a send that is always a strike: the next gate along, or a gate other than theirs when the desk was right
function wrongDir(s, tr) { const r = M.rightDir(s, tr); return r < 3 ? (r + 1) % 3 : (s.gates.indexOf(tr.dest) + 1) % 3; }

test('same seed and inputs give the same round', () => {
    const a = M.simulate(42, { react: 0.7, sd: 0.15, err: 0.04 });
    const b = M.simulate(42, { react: 0.7, sd: 0.15, err: 0.04 });
    assert.deepStrictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('the board holds two annual-leave flights and one client-site flight, all distinct', () => {
    for (let seed = 1; seed <= 200; seed++) {
        const s = M.simulate(seed, { react: 0.6, sd: 0.1, err: 0 });
        const kinds = s.gates.map(g => M.DESTS[g].kind).sort();
        assert.deepStrictEqual(kinds, ['client', 'leave', 'leave'], 'seed ' + seed);
        assert.strictEqual(new Set(s.gates).size, 3);
    }
});

test('a correct send scores base + speed bonus at x1.0 and builds the streak', () => {
    const s = M.createRound(1); const tr = stepUntilCur(s);
    const dir = M.rightDir(s, tr);
    const r = M.send(s, dir);
    assert.ok(r.result === 'correct' || r.result === 'desk');
    assert.strictEqual(r.points, T.BASE + T.SPEED_BONUS + (r.result === 'desk' ? T.DESK_BONUS : 0));
    assert.strictEqual(s.streak, 1);
    assert.strictEqual(s.cur, null);
});

test('the multiplier caps at x3.0', () => {
    assert.strictEqual(M.multTenths(0), 10);
    assert.strictEqual(M.multTenths(5), 15);
    assert.strictEqual(M.multTenths(99), T.MULT_MAX_TENTHS);
});

test('the board is the truth: a stale pass gate is a wrong send', () => {
    const s = M.createRound(3); const tr = stepUntilCur(s);
    tr.laptop = false; tr.kind = M.DESTS[tr.dest].kind === 'client' ? 'client' : 'leave';
    const right = s.gates.indexOf(tr.dest);
    tr.passGate = (right + 1) % 3;
    const r = M.send(s, tr.passGate);
    assert.strictEqual(r.result, 'wrong');
    assert.strictEqual(s.strikes, 1);
    assert.strictEqual(r.points, 0);
});

test('laptop rule: annual leave with a laptop goes to the desk; a gate is a soft error; the desk is wrong for others', () => {
    let s = M.createRound(5); let tr = stepUntilCur(s);
    tr.kind = 'leave'; tr.laptop = true;
    let r = M.send(s, s.gates.indexOf(tr.dest));
    assert.strictEqual(r.result, 'laptop'); assert.strictEqual(s.strikes, 0); assert.strictEqual(r.points, 0); assert.strictEqual(s.streak, 0);
    tr = stepUntilCur(s); tr.kind = 'leave'; tr.laptop = true;
    r = M.send(s, 3); assert.strictEqual(r.result, 'desk'); assert.ok(r.points >= T.BASE + T.DESK_BONUS);
    tr = stepUntilCur(s); tr.kind = 'client'; tr.laptop = true;
    r = M.send(s, 3); assert.strictEqual(r.result, 'nodesk'); assert.strictEqual(s.strikes, 1);
});

test('a cancelled flight goes to the desk, during the window and after it leaves the board', () => {
    const s = M.createRound(21);
    let ev = []; let n = 0;
    while (!ev.some(e => e.type === 'cancel') && n++ < 5000) { ev = M.step(s, DT); if (s.cur) M.send(s, M.rightDir(s, s.cur)); }
    const c = ev.find(e => e.type === 'cancel');
    assert.ok(c, 'a cancellation by ' + T.CANCEL_TIMES[0] + ' s');
    assert.ok(Math.abs(s.t - T.CANCEL_TIMES[0]) < 0.05);
    assert.strictEqual(s.cancelled, c.dest);
    while (s.t < s.prev.until + DT) { if (s.cur) s.cur.age = 0; M.step(s, DT); }   // past the grace for the old board
    let tr = stepUntilCur(s); tr.dest = s.cancelled; tr.laptop = false; tr.kind = M.DESTS[tr.dest].kind;
    assert.strictEqual(M.deskReason(s, tr), 'cancelled');
    let r = M.send(s, s.gates.indexOf(tr.dest));
    assert.strictEqual(r.result, 'wrong'); assert.strictEqual(r.reason, 'cancelled'); assert.strictEqual(s.strikes, 1);
    tr = stepUntilCur(s); tr.dest = s.cancelled;
    r = M.send(s, 3); assert.strictEqual(r.result, 'desk'); assert.strictEqual(r.reason, 'cancelled');
    // after CANCEL_S the flight is replaced, same kind; a traveller still booked on it goes to the desk
    const gone = s.cancelled; n = 0;
    while (s.cancelled >= 0 && n++ < 1000) { M.step(s, DT); if (s.cur) M.send(s, M.rightDir(s, s.cur)); }
    assert.strictEqual(s.gates.indexOf(gone), -1);
    assert.deepStrictEqual(s.gates.map(g => M.DESTS[g].kind).sort(), ['client', 'leave', 'leave']);
    tr = stepUntilCur(s); tr.dest = gone;
    assert.strictEqual(M.rightDir(s, tr), 3);
});

test('a traveller left at the counter misses the flight (a strike)', () => {
    const s = M.createRound(9); const tr = stepUntilCur(s);
    const ev = []; let n = 0;
    while (s.cur && n++ < 1000) ev.push(...M.step(s, DT));
    assert.ok(ev.some(e => e.type === 'missed' && e.traveller.id === tr.id));
    assert.strictEqual(s.strikes, 1);
});

test('three strikes grounds the round, with no end bonus', () => {
    const s = M.createRound(11);
    for (let i = 0; i < 3; i++) { const tr = stepUntilCur(s); M.send(s, wrongDir(s, tr)); }
    assert.strictEqual(s.ended, true); assert.strictEqual(s.endReason, 'grounded'); assert.strictEqual(s.endBonus, 0);
    assert.deepStrictEqual(M.step(s, DT), []);
});

test('RECOVER_STREAK in a row clears a strike', () => {
    const s = M.createRound(13);
    let tr = stepUntilCur(s); M.send(s, wrongDir(s, tr));
    assert.strictEqual(s.strikes, 1);
    let recovered = 0;
    for (let i = 0; i < T.RECOVER_STREAK; i++) { tr = stepUntilCur(s); const r = M.send(s, M.rightDir(s, tr)); if (r.recovered) recovered++; }
    assert.strictEqual(recovered, 1); assert.strictEqual(s.strikes, 0);
});

test('a mistake holds the next traveller for ERROR_HOLD_S; a right call only STEP_S', () => {
    const s = M.createRound(15);
    let tr = stepUntilCur(s); M.send(s, wrongDir(s, tr));
    assert.strictEqual(s.stepIn, T.ERROR_HOLD_S);
    tr = stepUntilCur(s); M.send(s, M.rightDir(s, tr));
    assert.strictEqual(s.stepIn, T.STEP_S);
    assert.ok(T.ERROR_HOLD_S > T.STEP_S);
});

test('grace: a send that matched the board GRACE_S ago still counts; after that it is a strike', () => {
    for (const late of [false, true]) {
        const s = M.createRound(31); let n = 0, ev = [];
        // run to the first gate change with a traveller at the counter whose gate it moved
        while (n++ < 5000) {
            ev = M.step(s, DT);
            if (ev.some(e => e.type === 'change') && s.cur && s.prev && M.rightDir(s.prev, s.cur) !== M.rightDir(s, s.cur)) break;
            if (s.cur && !ev.some(e => e.type === 'change')) M.send(s, M.rightDir(s, s.cur));
        }
        assert.ok(s.prev, 'a gate change caught a traveller');
        const tr = s.cur; tr.laptop = false; tr.kind = M.DESTS[tr.dest].kind;
        const old = M.rightDir(s.prev, tr);
        assert.notStrictEqual(old, M.rightDir(s, tr));
        if (late) { const until = s.prev.until; while (s.t < until + DT && s.cur) { s.cur.age = 0; M.step(s, DT); } }
        const before = s.strikes, r = M.send(s, old);
        if (late) { assert.strictEqual(r.result, 'wrong'); assert.strictEqual(s.strikes, before + 1); }
        else { assert.ok(r.result === 'correct' || r.result === 'desk', r.result); assert.strictEqual(s.strikes, before); assert.ok(r.points > 0); }
    }
});

test('reaching 5:00 PM ends on time with the bonus; gate changes and last call happen on schedule', () => {
    const s = M.simulate(17, null);
    assert.strictEqual(s.endReason, 'time');
    assert.strictEqual(s.endBonus, T.END_BONUS + T.STRIKE_BONUS * T.MAX_STRIKES);
    assert.ok(s.lastCall);
    assert.ok(Math.max(...s.changedAt) >= T.CHANGE_FIRST_S);
    assert.strictEqual(M.clockText({ t: 0 }), '4:00 PM');
    assert.strictEqual(M.clockText({ t: T.ROUND_S }), '5:00 PM');
});

test('oracle: simulation and closed form agree within 2%, and max_score in init_db.py equals the ceiling', () => {
    const o = M.oracle(1000);
    const mean = o.instant.sim.reduce((a, b) => a + b, 0) / o.instant.sim.length;
    assert.ok(Math.abs(mean / o.instant.analytic - 1) < 0.02, `sim ${mean} vs analytic ${o.instant.analytic}`);
    const seed = fs.readFileSync(path.join(__dirname, '..', 'init_db.py'), 'utf8');
    const m = seed.match(/"gate-change", "Gate Change",[\s\S]*?\n\s*(\d+), 18,/);
    assert.ok(m, 'gate-change seed row');
    assert.strictEqual(Number(m[1]), o.maxScore);
});

test('no bot profile beats max_score; a faster bot scores more (speed decides the score)', () => {
    const max = M.oracle(200).maxScore;
    const fast = [], slow = [];
    for (let seed = 1; seed <= 200; seed++) {
        fast.push(M.simulate(seed, { react: 0.5, sd: 0.1, err: 0 }).score);
        slow.push(M.simulate(seed, { react: 1.0, sd: 0.1, err: 0 }).score);
    }
    assert.ok(Math.max(...fast, ...slow) <= max);
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    assert.ok(med(fast) > med(slow) * 1.3, `fast ${med(fast)} slow ${med(slow)}`);
});
