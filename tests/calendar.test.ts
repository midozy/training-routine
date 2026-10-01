import { describe, expect, it } from 'vitest';
import { byDay, intensity, localDate, monthGrid, monthTotals, shiftMonth, weekdayLabels } from '@/lib/calendar';

describe('month grid', () => {
  it('September 2026 starting on Monday: 5 whole weeks, 1 Sept is a Tuesday', () => {
    const g = monthGrid(2026, 8, 1);
    expect(g.length).toBe(5); expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toEqual({ date: '2026-08-31', day: 31, inMonth: false });
    expect(g[0][1]).toEqual({ date: '2026-09-01', day: 1, inMonth: true });
    expect(g.at(-1)![6]).toEqual({ date: '2026-10-04', day: 4, inMonth: false });
  });
  it('the same month with weeks starting on Sunday and on Saturday', () => {
    expect(monthGrid(2026, 8, 0)[0][0].date).toBe('2026-08-30');
    expect(monthGrid(2026, 8, 6)[0][0].date).toBe('2026-08-29');
    expect(monthGrid(2026, 8, 6)[0][3].date).toBe('2026-09-01');
  });
  it('the number of weeks follows the real calendar (checked by hand)', () => {
    // 1 March 2026 is a Sunday: Monday-first weeks need a lead of 6 days -> 37 cells -> 6 rows
    expect(monthGrid(2026, 2, 1).length).toBe(6);
    expect(monthGrid(2026, 2, 0).length).toBe(5);            // Sunday-first: 31 cells -> 5 rows
    // 1 Feb 2026 is a Sunday and the month has 28 days: exactly 4 Sunday-first weeks, 5 Monday-first
    expect(monthGrid(2026, 1, 0).length).toBe(4);
    expect(monthGrid(2026, 1, 1).length).toBe(5);
    expect(monthGrid(2026, 8, 1).length).toBe(5);            // September 2026: lead 1 + 30 days
  });
  it('leap year February has 29 in-month days', () => expect(monthGrid(2028, 1, 1).flat().filter((c) => c.inMonth).length).toBe(29));
  it('every grid is gap-free and in order', () => {
    for (const ws of [0, 1, 6] as const) for (let m = 0; m < 12; m++) {
      const flat = monthGrid(2026, m, ws).flat().map((c) => c.date);
      expect([...flat].sort()).toEqual(flat); expect(new Set(flat).size).toBe(flat.length);
      expect(flat.filter((_, i) => monthGrid(2026, m, ws).flat()[i].inMonth).length).toBe(new Date(2026, m + 1, 0).getDate());
    }
  });
  it('weekday letters follow the week start', () => {
    expect(weekdayLabels(1)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(weekdayLabels(0)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(weekdayLabels(6)).toEqual(['S', 'S', 'M', 'T', 'W', 'T', 'F']);
  });
});

describe('intensity and totals', () => {
  it('levels by working sets', () => expect([0, 1, 14, 15, 29, 30, 60].map(intensity)).toEqual([0, 1, 1, 2, 2, 3, 3]));
  it('a workout is dated by its LOCAL day (late evening stays that day)', () => {
    const late = new Date(2026, 8, 28, 23, 30); const early = new Date(2026, 8, 29, 0, 20);
    const d = byDay([{ started_at: late.toISOString(), sets: 10 }, { started_at: early.toISOString(), sets: 5 }]);
    expect(d['2026-09-28']).toEqual({ workouts: 1, sets: 10 }); expect(d['2026-09-29']).toEqual({ workouts: 1, sets: 5 });
  });
  it('two workouts on one day add up; a workout with no sets is not a training day', () => {
    const t = new Date(2026, 8, 10, 9).toISOString();
    const d = byDay([{ started_at: t, sets: 12 }, { started_at: t, sets: 8 }, { started_at: new Date(2026, 8, 11).toISOString(), sets: 0 }]);
    expect(d).toEqual({ '2026-09-10': { workouts: 2, sets: 20 } });
  });
  it('month totals only count that month', () => {
    const d = { '2026-08-31': { workouts: 1, sets: 10 }, '2026-09-01': { workouts: 1, sets: 20 }, '2026-09-03': { workouts: 2, sets: 25 } };
    expect(monthTotals(d, 2026, 8)).toEqual({ workouts: 3, sets: 45, activeDays: 2 });
  });
  it('month navigation crosses years', () => { expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 }); expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 }); });
  it('localDate formats with zero padding', () => expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05'));
});
