// Training math used by the screens: progression suggestions, plate loading, warm-up ramps, rep maxes, PR checks and
// weekly volume targets. Pure functions (weights in kg unless a function says otherwise).
// Keep this file erasable-TypeScript only so scripts/test-training.mjs can run it directly.

export type SetRef = { weight: number; reps: number };

export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30)); // Epley, same formula as the charts
const LB = 2.20462;

/**
 * Double progression: if you hit the target reps last time, add weight and aim for the target again; otherwise stay
 * at that weight and go for one more rep. Weights in kg; `unit` only decides the size of the jump.
 */
export function suggest(last: SetRef | undefined, targetReps: number, unit: 'kg' | 'lb'): SetRef | null {
  if (!last || !(last.weight > 0) || !(last.reps > 0) || !(targetReps > 0)) return null;
  if (last.reps < targetReps) return { weight: last.weight, reps: Math.min(last.reps + 1, targetReps) };
  const shown = unit === 'kg' ? last.weight : last.weight * LB;
  const jump = unit === 'kg' ? (shown < 20 ? 1 : 2.5) : (shown < 45 ? 2.5 : 5); // small loads go up in smaller steps
  const next = Math.round((shown + jump) * 2) / 2; // nearest 0.5 of the display unit
  return { weight: unit === 'kg' ? next : next / LB, reps: targetReps };
}

export type PlatePlan = { perSide: number[]; achieved: number; exact: boolean };

/** Plates to load on each side of the bar for `total` (all values in the same unit). Greedy, heaviest first. */
export function platesFor(total: number, bar: number, plates: number[]): PlatePlan {
  const avail = [...plates].filter((p) => p > 0).sort((a, b) => b - a);
  let rest = Math.max(0, Math.round(((total - bar) / 2) * 1000) / 1000);
  const perSide: number[] = [];
  for (const p of avail) while (rest + 1e-9 >= p) { perSide.push(p); rest = Math.round((rest - p) * 1000) / 1000; }
  const achieved = Math.round((bar + 2 * perSide.reduce((a, b) => a + b, 0)) * 1000) / 1000;
  return { perSide, achieved, exact: Math.abs(achieved - total) < 0.01 };
}

/** A warm-up ramp towards `working` (same unit as `bar` and `step`): optionally the empty bar, then 50%, 70%, 85%. */
export function warmups(working: number, bar: number, step: number): SetRef[] {
  if (!(working > 0) || working < bar * 1.5) return [];
  const round = (x: number) => Math.max(bar, Math.round(x / step) * step);
  const plan: SetRef[] = [];
  if (working >= bar * 2) plan.push({ weight: bar, reps: 10 });
  plan.push({ weight: round(working * 0.5), reps: 8 }, { weight: round(working * 0.7), reps: 5 }, { weight: round(working * 0.85), reps: 3 });
  const out: SetRef[] = [];
  for (const s of plan) {
    const last = out.at(-1);
    if (s.weight >= working * 0.95 || (last && s.weight <= last.weight)) continue; // skip steps that don't climb or that are already working weight
    out.push(s);
  }
  return out;
}

export type RepMax = { reps: number; weight: number; date: string };

/** Best weight lifted for at least N reps, for each N in `reps`. */
export function repMaxes(sets: Array<{ weight_kg: number; reps: number; logged_at: string }>, reps = [1, 2, 3, 5, 8, 10, 12]): RepMax[] {
  const out: RepMax[] = [];
  for (const r of reps) {
    let best: { weight_kg: number; logged_at: string } | null = null;
    for (const s of sets) if (s.reps >= r && (!best || s.weight_kg > best.weight_kg)) best = s;
    if (best) out.push({ reps: r, weight: best.weight_kg, date: best.logged_at });
  }
  return out;
}

/** Does `now` beat everything in `prev`? e1rm = a new estimated 1RM; rep = the heaviest weight yet for at least that many reps. */
export function prCheck(prev: SetRef[], now: SetRef): { e1rm: boolean; rep: boolean } {
  if (!prev.length || !(now.weight > 0) || !(now.reps > 0)) return { e1rm: false, rep: false };
  const bestE = Math.max(...prev.map((s) => e1rm(s.weight, s.reps)));
  const heavier = Math.max(0, ...prev.filter((s) => s.reps >= now.reps).map((s) => s.weight));
  return { e1rm: e1rm(now.weight, now.reps) > bestE + 1e-6, rep: heavier > 0 && now.weight > heavier + 1e-6 };
}

/** Weekly sets per muscle: the commonly used 10-20 "productive" range. */
export const VOLUME_TARGET = { lo: 10, hi: 20 };
export const volumeStatus = (sets: number): 'under' | 'in' | 'over' => (sets < VOLUME_TARGET.lo ? 'under' : sets > VOLUME_TARGET.hi ? 'over' : 'in');
