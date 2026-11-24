/**
 * Gate Change: the round model (pure: no DOM, no canvas, no Math.random).
 * Spec: internal/newsletter/plans/2026-11-25-gate-change.md section 3.
 *
 * The rule: board each traveller at the gate the BOARD shows for their destination, unless something
 * is wrong, then the service desk. Wrong is either on the traveller (annual leave with a laptop) or on
 * the board (their flight is CANCELLED, or no longer on the board at all).
 *
 * State (plain, JSON-safe):
 *   {t, score, streak, bestStreak, strikes, ended, endReason ('time'|'grounded'), endBonus, lastCall,
 *    gates[3] (DESTS index on each gate: the board is the truth), changedAt[3], rolledAt[3],
 *    changeAt, cancelled (DESTS index or -1), cancelledAt, cancelUntil, cancelNext (index into CANCEL_TIMES),
 *    prev ({gates, cancelled, until}: the board before its last move, for GRACE_S) or null,
 *    cur (traveller at the counter or null), stepIn, queue[QUEUE_LEN], served,
 *    counts {correct, desk, wrong, nodesk, laptop, missed}, nextId, rngState}
 *   traveller = {id, dest, kind ('leave'|'client'), passGate (printed at issue, may be stale),
 *                laptop, upgrade, look, age, patience}
 * Directions: 0 gate A (left), 1 gate B (up), 2 gate C (right), 3 the service desk (down).
 *
 * step(s, dt) -> events [{type: 'step'|'missed'|'change'|'cancel'|'rollover'|'lastcall'|'end', ...}]
 * send(s, dir) -> {result: 'correct'|'desk'|'laptop'|'wrong'|'nodesk'|'wait', reason ('laptop'|'cancelled'|null),
 *                  points, dir, correct (0-3), traveller, recovered (a strike won back)}
 * oracle(seeds) -> {instant: {sim, analytic}, maxScore}; maxScore = ceil(max(all) * 1.08 / 500) * 500.
 */
(function (root) {
    'use strict';

    var TUNING = Object.freeze({
        ROUND_S: 75,                    // 4:00 PM to 5:00 PM
        CLOCK_START_MIN: 16 * 60,
        CLOCK_SPAN_MIN: 60,
        MAX_STRIKES: 3,
        QUEUE_LEN: 2,
        FIRST_STEP_S: 0.6,
        STEP_S: 0.3,                    // next traveller steps up this long after a send
        ERROR_HOLD_S: 0.7,              // after a mistake or a miss: time to read the verdict before the next one
        PATIENCE_START_S: 4.0,
        PATIENCE_END_S: 2.0,
        BASE: 100,
        SPEED_BONUS: 100,               // times the share of patience left
        MULT_MAX_TENTHS: 30,            // multiplier = min(30, 10 + streak) / 10
        DESK_BONUS: 50,
        LAPTOP_FROM_S: 15,
        LAPTOP_CHANCE: 0.30,            // of annual-leave travellers
        CANCEL_TIMES: Object.freeze([22, 40, 58]),   // a random flight is cancelled at each
        CANCEL_S: 7,                    // shown CANCELLED this long, then a new flight takes the gate
        CANCEL_BIAS: 0.15,              // extra share of new travellers booked on the cancelled flight
        STALE_FROM_S: 30,
        STALE_CHANCE: 0.12,             // a new pass printed before the last gate change
        UPGRADE_FROM_S: 35,
        UPGRADE_CHANCE: 0.08,
        UPGRADE_PATIENCE: 0.8,
        UPGRADE_MULT: 2,
        LAST_CALL_S: 10,
        LAST_CALL_MULT: 2,
        CHANGE_FIRST_S: 12,
        CHANGE_MIN_S: 9,
        CHANGE_MAX_S: 13,
        END_BONUS: 1000,
        STRIKE_BONUS: 500,              // per unused strike at 5:00 PM
        RECOVER_STREAK: 8,              // every 8 in a row wins a strike back
        GRACE_S: 0.4                    // a send this soon after the board moves may match the old board (reaction time)
    });
    var T = TUNING;

    // the board always holds two annual-leave flights and one client-site flight (a new flight keeps the kind)
    var DESTS = Object.freeze([
        { city: 'KYOTO', code: 'KIX', flight: 'HOL 122', kind: 'leave' },
        { city: 'REYKJAVIK', code: 'KEF', flight: 'HOL 214', kind: 'leave' },
        { city: 'PATAGONIA', code: 'PUQ', flight: 'HOL 309', kind: 'leave' },
        { city: 'BALI', code: 'DPS', flight: 'HOL 417', kind: 'leave' },
        { city: 'LISBON', code: 'LIS', flight: 'HOL 528', kind: 'leave' },
        { city: 'QUEENSTOWN', code: 'ZQN', flight: 'HOL 633', kind: 'leave' },
        { city: 'SINGAPORE', code: 'SIN', flight: 'BIZ 701', kind: 'client' },
        { city: 'LONDON', code: 'LHR', flight: 'BIZ 702', kind: 'client' },
        { city: 'NEW YORK', code: 'JFK', flight: 'BIZ 703', kind: 'client' },
        { city: 'HONG KONG', code: 'HKG', flight: 'BIZ 704', kind: 'client' }
    ]);
    var LOOKS = 6;

    function rand(s) {                  // mulberry32 on s.rngState
        var a = (s.rngState = (s.rngState + 0x6D2B79F5) >>> 0);
        a = Math.imul(a ^ (a >>> 15), a | 1);
        a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
        return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
    }
    function pick(s, arr) { return arr[Math.floor(rand(s) * arr.length)]; }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function patience(t) { return T.PATIENCE_START_S + (T.PATIENCE_END_S - T.PATIENCE_START_S) * clamp01(t / T.ROUND_S); }
    function ofKind(kind) { var o = []; for (var i = 0; i < DESTS.length; i++) if (DESTS[i].kind === kind) o.push(i); return o; }
    function laptopOnLeave(tr) { return !!tr && tr.laptop && tr.kind === 'leave'; }
    function flightOff(s, dest) { return dest === s.cancelled || s.gates.indexOf(dest) < 0; }
    // why this traveller belongs at the service desk, or null if they board at a gate
    function deskReason(s, tr) { return flightOff(s, tr.dest) ? 'cancelled' : laptopOnLeave(tr) ? 'laptop' : null; }
    function rightDir(s, tr) { return deskReason(s, tr) ? 3 : s.gates.indexOf(tr.dest); }
    function multTenths(streak) { return Math.min(T.MULT_MAX_TENTHS, 10 + streak); }
    function clockMin(s) { return T.CLOCK_START_MIN + T.CLOCK_SPAN_MIN * clamp01(s.t / T.ROUND_S); }
    function clockText(s) {
        var m = Math.floor(clockMin(s)), h = Math.floor(m / 60), mm = m % 60;
        return (h > 12 ? h - 12 : h) + ':' + (mm < 10 ? '0' : '') + mm + ' PM';
    }

    function spawn(s) {
        // every draw is taken every time, so one input sequence always gives one round
        var rBias = rand(s), rDest = rand(s), rStale = rand(s), rStaleTo = rand(s), rLaptop = rand(s), rUp = rand(s), rLook = rand(s);
        var dest = s.cancelled >= 0 && s.gates.indexOf(s.cancelled) >= 0 && rBias < T.CANCEL_BIAS ? s.cancelled : s.gates[Math.floor(rDest * 3)];
        var kind = DESTS[dest].kind, passGate = s.gates.indexOf(dest);
        if (s.t >= T.STALE_FROM_S && rStale < T.STALE_CHANCE) passGate = (passGate + 1 + Math.floor(rStaleTo * 2)) % 3;
        return {
            id: s.nextId++, dest: dest, kind: kind, passGate: passGate,
            laptop: kind === 'client' || (s.t >= T.LAPTOP_FROM_S && rLaptop < T.LAPTOP_CHANCE),
            upgrade: s.t >= T.UPGRADE_FROM_S && rUp < T.UPGRADE_CHANCE,
            look: Math.floor(rLook * LOOKS), age: 0, patience: 0
        };
    }

    function createRound(seed) {
        var s = {
            t: 0, score: 0, streak: 0, bestStreak: 0, strikes: 0, ended: false, endReason: null, endBonus: 0,
            lastCall: false, gates: [], changedAt: [-99, -99, -99], rolledAt: [-99, -99, -99],
            changeAt: T.CHANGE_FIRST_S, cancelled: -1, cancelledAt: -99, cancelUntil: 0, cancelNext: 0,
            prev: null, cur: null, stepIn: T.FIRST_STEP_S, queue: [], served: 0,
            counts: { correct: 0, desk: 0, wrong: 0, nodesk: 0, laptop: 0, missed: 0 },
            nextId: 1, rngState: (seed >>> 0) || 1
        };
        var leave = ofKind('leave').slice(), a = pick(s, leave);
        leave.splice(leave.indexOf(a), 1);
        s.gates = [a, pick(s, leave), pick(s, ofKind('client'))];
        var g = Math.floor(rand(s) * 3), tmp = s.gates[g];   // move the client flight to gate g
        s.gates[g] = s.gates[2]; s.gates[2] = tmp;
        for (var q = 0; q < T.QUEUE_LEN; q++) s.queue.push(spawn(s));
        return s;
    }

    function remember(s) { s.prev = { gates: s.gates.slice(), cancelled: s.cancelled, until: s.t + T.GRACE_S }; }

    function end(s, reason, ev) {
        s.ended = true; s.endReason = reason;
        if (reason === 'time') { s.endBonus = T.END_BONUS + T.STRIKE_BONUS * (T.MAX_STRIKES - s.strikes); s.score += s.endBonus; }
        ev.push({ type: 'end', reason: reason, bonus: s.endBonus });
    }

    function step(s, dt) {
        var ev = [];
        if (s.ended) return ev;
        s.t += dt;
        if (!s.lastCall && s.t >= T.ROUND_S - T.LAST_CALL_S) { s.lastCall = true; ev.push({ type: 'lastcall' }); }
        if (s.t >= T.ROUND_S) { end(s, 'time', ev); return ev; }
        if (s.t >= s.changeAt) {
            remember(s);
            var a = Math.floor(rand(s) * 3), b = (a + 1 + Math.floor(rand(s) * 2)) % 3, tmp = s.gates[a];
            s.gates[a] = s.gates[b]; s.gates[b] = tmp;
            s.changedAt[a] = s.changedAt[b] = s.t;
            s.changeAt += T.CHANGE_MIN_S + rand(s) * (T.CHANGE_MAX_S - T.CHANGE_MIN_S);
            ev.push({ type: 'change', a: a, b: b });
        }
        if (s.cancelled < 0 && s.cancelNext < T.CANCEL_TIMES.length && s.t >= T.CANCEL_TIMES[s.cancelNext]) {
            var cg = Math.floor(rand(s) * 3);
            remember(s);
            s.cancelled = s.gates[cg]; s.cancelledAt = s.t; s.cancelUntil = s.t + T.CANCEL_S; s.cancelNext++;
            ev.push({ type: 'cancel', gate: cg, dest: s.cancelled });
        } else if (s.cancelled >= 0 && s.t >= s.cancelUntil) {
            var rg = s.gates.indexOf(s.cancelled), from = s.cancelled;
            var pool = ofKind(DESTS[from].kind).filter(function (d) { return s.gates.indexOf(d) < 0; });
            var to = pick(s, pool);
            remember(s);
            s.gates[rg] = to; s.rolledAt[rg] = s.t; s.cancelled = -1;
            ev.push({ type: 'rollover', gate: rg, from: from, to: to });
        }
        if (!s.cur) {
            s.stepIn -= dt;
            if (s.stepIn <= 1e-9) {     // epsilon: 0.3 s is exactly 18 frames at 60 fps, not 19
                s.cur = s.queue.shift();
                s.cur.age = 0;
                s.cur.patience = patience(s.t) * (s.cur.upgrade ? T.UPGRADE_PATIENCE : 1);
                s.queue.push(spawn(s));
                ev.push({ type: 'step', traveller: s.cur });
            }
        } else {
            s.cur.age += dt;
            if (s.cur.age >= s.cur.patience) {
                var tr = s.cur;
                s.strikes++; s.streak = 0; s.counts.missed++;
                s.cur = null; s.stepIn = T.ERROR_HOLD_S;
                ev.push({ type: 'missed', traveller: tr, correct: rightDir(s, tr) });
                if (s.strikes >= T.MAX_STRIKES) end(s, 'grounded', ev);
            }
        }
        return ev;
    }

    function send(s, dir) {
        if (s.ended || !s.cur || dir < 0 || dir > 3) return { result: 'wait', points: 0, dir: dir };
        var tr = s.cur, reason = deskReason(s, tr), correct = rightDir(s, tr), result;
        if (dir !== correct && s.prev && s.t < s.prev.until && dir === rightDir(s.prev, tr)) {   // right a moment ago
            reason = deskReason(s.prev, tr); correct = dir;
        }
        if (dir === correct) result = reason ? 'desk' : 'correct';
        else if (reason === 'laptop' && dir === s.gates.indexOf(tr.dest)) result = 'laptop';   // boarded, laptop and all
        else result = dir === 3 ? 'nodesk' : 'wrong';
        var points = 0, recovered = false;
        if (result === 'correct' || result === 'desk') {
            var base = T.BASE + Math.round(T.SPEED_BONUS * clamp01(1 - tr.age / tr.patience)) + (result === 'desk' ? T.DESK_BONUS : 0);
            points = Math.round(base * multTenths(s.streak) / 10) * (tr.upgrade ? T.UPGRADE_MULT : 1) * (s.lastCall ? T.LAST_CALL_MULT : 1);
            s.streak++; if (s.streak > s.bestStreak) s.bestStreak = s.streak;
            if (s.strikes > 0 && s.streak % T.RECOVER_STREAK === 0) { s.strikes--; recovered = true; }
        } else if (result === 'laptop') s.streak = 0;
        else { s.strikes++; s.streak = 0; }
        s.counts[result]++;
        s.score += points; s.served++;
        s.cur = null; s.stepIn = points > 0 ? T.STEP_S : T.ERROR_HOLD_S;
        var out = { result: result, reason: reason, points: points, dir: dir, correct: correct, traveller: tr, recovered: recovered };
        if (s.strikes >= T.MAX_STRIKES) { var ev = []; end(s, 'grounded', ev); out.ended = true; }
        return out;
    }

    /* ---- oracle and bots (node and the test hooks only) ---- */
    var DT = 1 / 60;
    function botRng(seed) { var b = { rngState: (seed ^ 0x9E3779B9) >>> 0 }; return function () { return rand(b); }; }
    // profile: {react: mean s, sd: s, err: share of wrong sends, trustPass: go by the pass gate}; null = perfect instant
    function simulate(seed, profile, dt) {
        dt = dt || DT;
        var s = createRound(seed), br = botRng(seed), wait = 0, curId = -1;
        while (!s.ended) {
            step(s, dt);
            if (!s.cur) continue;
            if (s.cur.id !== curId) {
                curId = s.cur.id;
                if (profile) { var g = 0; for (var k = 0; k < 6; k++) g += br(); wait = Math.max(0.15, profile.react + profile.sd * (g - 3) * 1.41); }
                else wait = 0;
            }
            if (wait > 1e-9) { wait -= dt; continue; }
            var tr = s.cur, right = rightDir(s, tr);
            if (profile && profile.trustPass && right < 3) right = tr.passGate;
            if (profile && br() < profile.err) right = (right + 1 + Math.floor(br() * 3)) % 4;
            send(s, right);
        }
        return s;
    }
    // Second method: perfect instant play in closed form from the schedules alone (no board, no RNG):
    // traveller k steps up at a frame-quantised time and is sent at age 0; random kinds, cancellations
    // and laptops enter as expected values. Compared with the simulation on the MEAN over seeds.
    function analytic() {
        var period = Math.ceil(T.STEP_S / DT - 1e-6) * DT, first = Math.ceil(T.FIRST_STEP_S / DT - 1e-6) * DT;
        var times = [], score = 0;
        for (var t = first; t < T.ROUND_S - 1e-9; t += period) times.push(t);
        for (var k = 0; k < times.length; k++) {
            var born = k < T.QUEUE_LEN ? 0 : times[k - T.QUEUE_LEN], served = times[k], pC = 0;
            for (var c = 0; c < T.CANCEL_TIMES.length; c++) {
                var c0 = T.CANCEL_TIMES[c];
                if (born >= c0 && born < c0 + T.CANCEL_S) pC = T.CANCEL_BIAS + (1 - T.CANCEL_BIAS) / 3;   // booked during the window
                else if (born < c0 && served >= c0) pC = 1 / 3;                                         // queued when it was cancelled
            }
            var pL = born >= T.LAPTOP_FROM_S ? (2 / 3) * T.LAPTOP_CHANCE : 0;
            var pDesk = pC + (1 - pC) * pL;
            var pUp = born >= T.UPGRADE_FROM_S ? T.UPGRADE_CHANCE : 0;
            var m = multTenths(k) / 10;
            var pts = pDesk * Math.round((T.BASE + T.SPEED_BONUS + T.DESK_BONUS) * m) + (1 - pDesk) * Math.round((T.BASE + T.SPEED_BONUS) * m);
            pts *= (1 - pUp) + pUp * T.UPGRADE_MULT;
            if (served >= T.ROUND_S - T.LAST_CALL_S) pts *= T.LAST_CALL_MULT;
            score += pts;
        }
        return score + T.END_BONUS + T.STRIKE_BONUS * T.MAX_STRIKES;
    }
    function oracle(seeds) {
        if (typeof seeds === 'number') { var n = seeds; seeds = []; for (var q = 1; q <= n; q++) seeds.push(q); }
        var sim = seeds.map(function (sd) { return simulate(sd, null).score; });
        var an = analytic();
        var top = Math.max(an, Math.max.apply(null, sim));
        return { instant: { sim: sim, analytic: an }, maxScore: Math.ceil(top * 1.08 / 500) * 500 };
    }

    var MODEL = {
        TUNING: TUNING, DESTS: DESTS, LOOKS: LOOKS,
        createRound: createRound, step: step, send: send, laptopOnLeave: laptopOnLeave, flightOff: flightOff,
        deskReason: deskReason, rightDir: rightDir, patience: patience,
        multTenths: multTenths, clockMin: clockMin, clockText: clockText,
        simulate: simulate, analytic: analytic, oracle: oracle
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = MODEL;
    if (typeof window !== 'undefined') { root.GateChange = root.GateChange || {}; root.GateChange.MODEL = MODEL; }
})(typeof window !== 'undefined' ? window : this);
