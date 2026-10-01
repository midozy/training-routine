// Date logic for the training calendar. Pure functions, tested in tests/calendar.test.ts.
// Dates are local calendar days as "YYYY-MM-DD" (a workout at 23:30 belongs to that evening, not the next day).

export type WeekStart = 0 | 1 | 6; // 0 = Sunday, 1 = Monday, 6 = Saturday
export type Cell = { date: string; day: number; inMonth: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The weeks shown for a month (always whole weeks, starting on `weekStart`), including the neighbouring days that fill them. */
export function monthGrid(year: number, month0: number, weekStart: WeekStart): Cell[][] {
  const first = new Date(year, month0, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(year, month0, 1 - lead);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const out: Cell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      row.push({ date: localDate(d), day: d.getDate(), inMonth: d.getMonth() === month0 });
    }
    out.push(row);
  }
  return out;
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const weekdayLabels = (weekStart: WeekStart) => Array.from({ length: 7 }, (_, i) => LETTERS[(weekStart + i) % 7]);

/** 0 = rest day, 1-3 = a light / solid / big day, by working sets. */
export const intensity = (sets: number): 0 | 1 | 2 | 3 => (sets <= 0 ? 0 : sets < 15 ? 1 : sets < 30 ? 2 : 3);

export type DaySummary = { workouts: number; sets: number };
/** Workouts and working sets per local day. */
export function byDay(rows: Array<{ started_at: string; sets: number }>): Record<string, DaySummary> {
  const out: Record<string, DaySummary> = {};
  for (const r of rows) {
    if (!(r.sets > 0)) continue; // a workout with nothing logged isn't a training day
    const k = localDate(new Date(r.started_at));
    const d = (out[k] ??= { workouts: 0, sets: 0 });
    d.workouts++; d.sets += r.sets;
  }
  return out;
}

export function monthTotals(days: Record<string, DaySummary>, year: number, month0: number) {
  const prefix = `${year}-${pad(month0 + 1)}-`;
  let workouts = 0, sets = 0, activeDays = 0;
  for (const [k, v] of Object.entries(days)) if (k.startsWith(prefix)) { workouts += v.workouts; sets += v.sets; activeDays++; }
  return { workouts, sets, activeDays };
}

export const shiftMonth = (year: number, month0: number, by: number) => { const d = new Date(year, month0 + by, 1); return { year: d.getFullYear(), month0: d.getMonth() }; };
