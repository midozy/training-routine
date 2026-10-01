export type WeekStart = 0 | 1 | 6; // first day of the week: 0 = Sunday, 1 = Monday, 6 = Saturday

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Local midnight of the first day of the week containing `d`. */
export function weekStartOf(d: Date, ws: WeekStart = 1): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() - ws + 7) % 7));
  return x;
}

/** e.g. "Monday to Sunday" */
export const weekRangeLong = (ws: WeekStart) => `${DAY_NAMES[ws]} to ${DAY_NAMES[(ws + 6) % 7]}`;

/** Consecutive weeks (by the user's week start) with at least one workout; this week counts if it already has one. */
export function weekStreak(times: number[], ws: WeekStart, now: Date = new Date()): number {
  const weeks = new Set(times.map((t) => weekStartOf(new Date(t), ws).getTime()));
  const back = (t: number) => { const d = new Date(t); d.setDate(d.getDate() - 7); return d.getTime(); }; // DST-safe
  let n = 0;
  let k = weekStartOf(now, ws).getTime();
  if (!weeks.has(k)) k = back(k);
  while (weeks.has(k)) { n++; k = back(k); }
  return n;
}
