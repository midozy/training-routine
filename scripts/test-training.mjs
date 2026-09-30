// Run: node --experimental-strip-types --no-warnings scripts/test-training.mjs
import assert from 'node:assert/strict';
import { suggest, platesFor, warmups, repMaxes, prCheck, volumeStatus, e1rm } from '../lib/training.ts';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

console.log('progression suggestions');
t('hit the target reps → add weight (kg), aim for the target again', () => assert.deepEqual(suggest({ weight: 80, reps: 8 }, 8, 'kg'), { weight: 82.5, reps: 8 }));
t('beat the target → still add weight, back to the target reps', () => assert.deepEqual(suggest({ weight: 80, reps: 10 }, 8, 'kg'), { weight: 82.5, reps: 8 }));
t('missed the target → same weight, one more rep', () => assert.deepEqual(suggest({ weight: 80, reps: 6 }, 8, 'kg'), { weight: 80, reps: 7 }));
t('never asks for more than the target reps at the same weight', () => assert.deepEqual(suggest({ weight: 80, reps: 7 }, 8, 'kg'), { weight: 80, reps: 8 }));
t('light loads go up by 1 kg, not 2.5', () => assert.deepEqual(suggest({ weight: 12, reps: 15 }, 15, 'kg'), { weight: 13, reps: 15 }));
t('pounds: jumps of 5 lb (shown in lb, returned in kg)', () => { const s = suggest({ weight: 100 / 2.20462, reps: 10 }, 10, 'lb'); near(s.weight * 2.20462, 105, 0.3); assert.equal(s.reps, 10); });
t('no history or bad input → no suggestion', () => { assert.equal(suggest(undefined, 8, 'kg'), null); assert.equal(suggest({ weight: 0, reps: 8 }, 8, 'kg'), null); assert.equal(suggest({ weight: 50, reps: 8 }, 0, 'kg'), null); });

console.log('\nplate loading');
t('100 kg on a 20 kg bar: 25 + 15 per side', () => assert.deepEqual(platesFor(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]), { perSide: [25, 15], achieved: 100, exact: true }));
t('82.5 kg: 25 + 5 + 1.25 per side', () => assert.deepEqual(platesFor(82.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide, [25, 5, 1.25]));
t('an empty bar needs no plates', () => assert.deepEqual(platesFor(20, 20, [25, 10]), { perSide: [], achieved: 20, exact: true }));
t('a weight you cannot make says what you CAN load (not exact)', () => { const p = platesFor(101, 20, [25, 10, 5]); assert.equal(p.exact, false); assert.equal(p.achieved, 100); });
t('below the bar weight → just the bar, not exact', () => { const p = platesFor(15, 20, [10]); assert.deepEqual([p.perSide.length, p.achieved, p.exact], [0, 20, false]); });
t('pounds with 45s: 225 lb = two 45s per side', () => assert.deepEqual(platesFor(225, 45, [45, 35, 25, 10, 5, 2.5]).perSide, [45, 45]));
t('plates the gym does not have are simply not used', () => assert.deepEqual(platesFor(60, 20, [10]).perSide, [10, 10]));

console.log('\nwarm-up ramps');
t('100 kg: empty bar, then 50/70/85 %', () => assert.deepEqual(warmups(100, 20, 2.5), [{ weight: 20, reps: 10 }, { weight: 50, reps: 8 }, { weight: 70, reps: 5 }, { weight: 85, reps: 3 }]));
t('a light working weight gets a shorter ramp, never below the bar, never climbing back down', () => {
  const w = warmups(40, 20, 2.5); assert.ok(w.length >= 1 && w.length <= 3); assert.ok(w.every((s, i) => s.weight >= 20 && (i === 0 || s.weight > w[i - 1].weight) && s.weight < 40));
});
t('almost nothing to warm up for a working weight near the bar', () => assert.deepEqual(warmups(25, 20, 2.5), []));
t('nothing for unknown weight', () => assert.deepEqual(warmups(0, 20, 2.5), []));

console.log('\nrep maxes and PRs');
const sets = [
  { weight_kg: 100, reps: 3, logged_at: '2026-09-01' }, { weight_kg: 90, reps: 5, logged_at: '2026-09-08' },
  { weight_kg: 80, reps: 8, logged_at: '2026-09-15' }, { weight_kg: 85, reps: 8, logged_at: '2026-09-22' }, { weight_kg: 60, reps: 12, logged_at: '2026-09-22' },
];
t('best weight for at least N reps, with the date it happened', () => {
  const m = Object.fromEntries(repMaxes(sets).map((r) => [r.reps, r]));
  assert.deepEqual([m[1].weight, m[3].weight, m[5].weight, m[8].weight, m[12].weight], [100, 100, 90, 85, 60]);
  assert.equal(m[8].date, '2026-09-22'); assert.equal(m[10].weight, 60);
});
t('reps nobody has done are left out', () => assert.deepEqual(repMaxes([{ weight_kg: 50, reps: 4, logged_at: 'x' }]).map((r) => r.reps), [1, 2, 3]));
const prev = [{ weight: 100, reps: 3 }, { weight: 90, reps: 5 }, { weight: 85, reps: 8 }];
t('heavier for the same reps = a rep PR (and usually an e1RM PR)', () => { const r = prCheck(prev, { weight: 87.5, reps: 8 }); assert.equal(r.rep, true); assert.equal(r.e1rm, true); });
t('matching your best is not a PR', () => assert.deepEqual(prCheck(prev, { weight: 85, reps: 8 }), { e1rm: false, rep: false }));
t('a light, high-rep set is not a PR just because nobody did that many reps before', () => assert.deepEqual(prCheck(prev, { weight: 40, reps: 15 }), { e1rm: false, rep: false }));
t('the very first time you do an exercise is never flagged', () => assert.deepEqual(prCheck([], { weight: 80, reps: 8 }), { e1rm: false, rep: false }));
t('a new estimated 1RM without a rep PR is still caught', () => { const r = prCheck([{ weight: 100, reps: 1 }], { weight: 90, reps: 6 }); assert.equal(r.e1rm, true); assert.equal(r.rep, false); near(e1rm(90, 6), 108); });

console.log('\nweekly volume');
t('under 10 / 10-20 / over 20 sets', () => assert.deepEqual([0, 9, 10, 20, 21].map(volumeStatus), ['under', 'under', 'in', 'in', 'over']));
console.log(`\n${n} tests passed`);
