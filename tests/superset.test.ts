import { describe, expect, it } from 'vitest';
import { link, unlink, normalize, runOf, runs, nextTarget, MAX_GROUP, type Item } from '@/lib/superset';

const mk = (...groups: Array<number | null>): Item[] => groups.map((g, i) => ({ id: i + 1, superset_group: g }));
const apply = (items: Item[], patches: Array<{ id: number; superset_group: number | null }> | null) =>
  items.map((it) => ({ ...it, superset_group: patches?.find((p) => p.id === it.id) ? patches.find((p) => p.id === it.id)!.superset_group : it.superset_group }));
const groups = (items: Item[]) => items.map((i) => i.superset_group ?? null);

describe('finding supersets', () => {
  it('a superset is neighbours sharing a number; a lone number is just an exercise', () => {
    const it = mk(null, 1, 1, null, 2, null);
    expect(runOf(it, 1)).toEqual([1, 2]); expect(runOf(it, 2)).toEqual([1, 2]);
    expect(runOf(it, 0)).toBeNull(); expect(runOf(it, 4)).toBeNull();
    expect(runs(mk(1, 1, null, 2, 2, 2))).toEqual([[0, 1], [3, 5]]);
  });
  it('the same number in two separate places is two separate supersets', () => expect(runs(mk(1, 1, null, 1, 1))).toEqual([[0, 1], [3, 4]]));
});

describe('linking and unlinking', () => {
  it('link two exercises', () => expect(groups(apply(mk(null, null, null), link(mk(null, null, null), 0)))).toEqual([1, 1, null]));
  it('extend a pair to a tri-set', () => expect(groups(apply(mk(1, 1, null), link(mk(1, 1, null), 1)))).toEqual([1, 1, 1]));
  it('linking next to an existing superset merges the two', () => expect(groups(apply(mk(1, 1, 2, 2), link(mk(1, 1, 2, 2), 1)))).toEqual([1, 1, 1, 1]));
  it('linking what is already linked changes nothing', () => expect(link(mk(1, 1), 0)).toEqual([]));
  it(`never makes a group bigger than ${MAX_GROUP}`, () => { expect(link(mk(1, 1, 1, 1, null), 3)).toBeNull(); expect(link(mk(1, 1, 2, 2, 2), 1)).toBeNull(); });
  it('cannot link past the last exercise', () => expect(link(mk(null, null), 1)).toBeNull());
  it('unlinking a pair makes both normal again', () => expect(groups(apply(mk(1, 1, null), unlink(mk(1, 1, null), 0)))).toEqual([null, null, null]));
  it('unlinking in the middle of a tri-set leaves a lone exercise and a pair, not three-in-one', () => {
    const out = groups(apply(mk(1, 1, 1), unlink(mk(1, 1, 1), 0)));
    expect(out[0]).toBeNull(); expect(out[1]).not.toBeNull(); expect(out[1]).toBe(out[2]);
  });
  it('unlinking the end of a tri-set leaves a pair', () => {
    const out = groups(apply(mk(1, 1, 1), unlink(mk(1, 1, 1), 1)));
    expect(out[0]).toBe(out[1]); expect(out[2]).toBeNull();
  });
});

describe('tidying after a reorder or delete', () => {
  it('a superset broken up by moving one exercise away stops being one (no stray "group of one")', () => expect(groups(apply(mk(1, null, 1), normalize(mk(1, null, 1))))).toEqual([null, null, null]));
  it('two separate supersets that ended up with the same number get different ones, so they cannot merge by accident', () => {
    const out = groups(apply(mk(1, 1, null, 1, 1), normalize(mk(1, 1, null, 1, 1))));
    expect(out[0]).toBe(out[1]); expect(out[3]).toBe(out[4]); expect(out[0]).not.toBe(out[3]);
  });
  it('a healthy plan needs no changes', () => expect(normalize(mk(1, 1, null, 2, 2))).toEqual([]));
});

// helper: logged-set state as [setsLogged, setsTotal] per exercise
const open = (state: number[][]) => (i: number) => (state[i][0] < state[i][1] ? state[i][0] : -1);

describe('what comes next after logging a set', () => {
  it('a normal exercise: its next set with a rest, then on to the next exercise', () => {
    const it = mk(null, null, null);
    expect(nextTarget(it, open([[1, 3], [0, 3], [0, 3]]), 0)).toEqual({ ex: 0, set: 1, rest: true });
    expect(nextTarget(it, open([[3, 3], [0, 3], [0, 3]]), 0)).toEqual({ ex: 1, set: 0, rest: true });
  });
  it('finishing everything after the last exercise returns nothing (workout complete)', () => expect(nextTarget(mk(null, null), open([[3, 3], [3, 3]]), 1)).toBeNull());
  it('a straggler earlier in the list is picked up when nothing is left ahead', () => expect(nextTarget(mk(null, null), open([[1, 3], [3, 3]]), 1)).toEqual({ ex: 0, set: 1, rest: true }));

  const ss = mk(1, 1, null); // A and B superset, then C
  it('superset: A1 → straight to B1 with NO rest', () => expect(nextTarget(ss, open([[1, 3], [0, 3], [0, 3]]), 0)).toEqual({ ex: 1, set: 0, rest: false }));
  it('superset: B1 → rest, then back to A2', () => expect(nextTarget(ss, open([[1, 3], [1, 3], [0, 3]]), 1)).toEqual({ ex: 0, set: 1, rest: true }));
  it('superset: A2 → B2 without rest, and so on for the whole round-robin', () => expect(nextTarget(ss, open([[2, 3], [1, 3], [0, 3]]), 0)).toEqual({ ex: 1, set: 1, rest: false }));
  it('superset finished: rest, then on to the next exercise after it', () => expect(nextTarget(ss, open([[3, 3], [3, 3], [0, 3]]), 1)).toEqual({ ex: 2, set: 0, rest: true }));
  it('uneven set counts: when B runs out, A carries on with a rest each time', () => {
    expect(nextTarget(ss, open([[2, 3], [2, 2], [0, 3]]), 1)).toEqual({ ex: 0, set: 2, rest: true });   // B done after its 2nd set → back to A3
    expect(nextTarget(ss, open([[3, 3], [2, 2], [0, 3]]), 0)).toEqual({ ex: 2, set: 0, rest: true });   // A3 was last → move on
  });
  it('tri-set cycles A → B → C → rest → A', () => {
    const t = mk(1, 1, 1);
    expect(nextTarget(t, open([[1, 2], [0, 2], [0, 2]]), 0)).toEqual({ ex: 1, set: 0, rest: false });
    expect(nextTarget(t, open([[1, 2], [1, 2], [0, 2]]), 1)).toEqual({ ex: 2, set: 0, rest: false });
    expect(nextTarget(t, open([[1, 2], [1, 2], [1, 2]]), 2)).toEqual({ ex: 0, set: 1, rest: true });
  });
  it('a superset in the middle: the exercise before it is unaffected', () => expect(nextTarget(mk(null, 1, 1), open([[1, 3], [0, 3], [0, 3]]), 0)).toEqual({ ex: 0, set: 1, rest: true }));
  it('editing an earlier set of a superset elsewhere never traps you: if everything else is done, finish', () => expect(nextTarget(ss, open([[3, 3], [3, 3], [3, 3]]), 0)).toBeNull());
});
