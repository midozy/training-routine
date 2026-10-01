// Supersets: exercises in the same day that sit next to each other and share a non-null `superset_group` are done
// as a round (A1, B1, rest, A2, B2, rest, ...). Group numbers only mean something within one day.
// Pure functions, tested in tests/superset.test.ts.

export type Item = { id: number; superset_group?: number | null };
export type Patch = { id: number; superset_group: number | null };
export const MAX_GROUP = 4;

const g = (items: Item[], i: number) => items[i]?.superset_group ?? null;

/** [first, last] index of the superset containing item i (neighbours sharing its group), or null if it is not in one. */
export function runOf(items: Item[], i: number): [number, number] | null {
  const group = g(items, i);
  if (group == null) return null;
  let a = i, b = i;
  while (a > 0 && g(items, a - 1) === group) a--;
  while (b < items.length - 1 && g(items, b + 1) === group) b++;
  return b > a ? [a, b] : null;
}

export function runs(items: Item[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < items.length; i++) {
    const r = runOf(items, i);
    if (r && r[0] === i) { out.push(r); i = r[1]; }
  }
  return out;
}

const nextGroup = (items: Item[]) => items.reduce((m, it) => Math.max(m, it.superset_group ?? 0), 0) + 1;

/** Changes that make item i and item i+1 a superset (merging runs they already belong to). null = it would exceed MAX_GROUP. */
export function link(items: Item[], i: number): Patch[] | null {
  if (i < 0 || i + 1 >= items.length) return null;
  const left = runOf(items, i);
  if (left && left[1] > i) return []; // already linked
  const a = left ?? [i, i];
  const b = runOf(items, i + 1) ?? [i + 1, i + 1];
  if (a[1] - a[0] + 1 + (b[1] - b[0] + 1) > MAX_GROUP) return null;
  const group = left ? (items[i].superset_group as number) : nextGroup(items);
  const out: Patch[] = [];
  for (let k = a[0]; k <= b[1]; k++) if (items[k].superset_group !== group) out.push({ id: items[k].id, superset_group: group });
  return out;
}

/** Changes that break the superset between item i and item i+1 (a part left on its own becomes a normal exercise). */
export function unlink(items: Item[], i: number): Patch[] {
  const run = runOf(items, i);
  if (!run || i < run[0] || i + 1 > run[1]) return [];
  const [a, b] = run;
  const out: Patch[] = [];
  if (i === a) out.push({ id: items[a].id, superset_group: null });
  if (i + 1 === b) out.push({ id: items[b].id, superset_group: null });
  else { const group = nextGroup(items); for (let k = i + 1; k <= b; k++) out.push({ id: items[k].id, superset_group: group }); }
  return out;
}

/** After reordering or deleting: no two separate runs may share a number (or they would re-join by accident), and a group of one is just an exercise. */
export function normalize(items: Item[]): Patch[] {
  const out: Patch[] = [];
  const inRun = new Set<number>();
  const used = new Set<number>();
  let spare = nextGroup(items);
  for (const [a, b] of runs(items)) {
    let group = items[a].superset_group as number;
    if (used.has(group)) { group = spare++; for (let k = a; k <= b; k++) out.push({ id: items[k].id, superset_group: group }); }
    used.add(group);
    for (let k = a; k <= b; k++) inRun.add(k);
  }
  items.forEach((it, k) => { if (!inRun.has(k) && it.superset_group != null) out.push({ id: it.id, superset_group: null }); });
  return out;
}

export type Target = { ex: number; set: number; rest: boolean };

/**
 * Where to go after logging a set of exercise `cur`. `firstOpen(i)` = index of the first set of exercise i still to do (or -1).
 * Normal exercise: its next set, then the next exercise that has sets left (rest after every set).
 * Superset: round-robin through its members with NO rest between them, rest once you wrap back to the first, then on.
 */
export function nextTarget(items: Item[], firstOpen: (i: number) => number, cur: number): Target | null {
  const run = runOf(items, cur);
  if (run) {
    const [a, b] = run;
    const len = b - a + 1;
    for (let k = 1; k <= len; k++) {
      const i = a + ((cur - a + k) % len);
      const s = firstOpen(i);
      if (s !== -1) return { ex: i, set: s, rest: i <= cur }; // forward inside the superset: no rest; wrapped (or alone): rest
    }
  } else {
    const s = firstOpen(cur);
    if (s !== -1) return { ex: cur, set: s, rest: true };
  }
  const inside = (j: number) => (run ? j >= run[0] && j <= run[1] : j === cur);
  const after = run ? run[1] : cur;
  let i = items.findIndex((_, j) => j > after && firstOpen(j) !== -1);
  if (i === -1) i = items.findIndex((_, j) => !inside(j) && firstOpen(j) !== -1);
  return i === -1 ? null : { ex: i, set: firstOpen(i), rest: true };
}
