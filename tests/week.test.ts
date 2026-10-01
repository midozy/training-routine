import { describe, expect, it } from 'vitest';
import { weekStreak, weekStartOf } from '@/lib/week';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = new Date(2026, 8, 30, 10); // Wednesday 30 Sept 2026

describe('week streak', () => {
  it('no workouts, no streak', () => expect(weekStreak([], 1, NOW)).toBe(0));
  it('a workout this week counts', () => expect(weekStreak([at(2026, 9, 28)], 1, NOW)).toBe(1));
  it('this week can still be empty: last week alone keeps a streak of 1', () => expect(weekStreak([at(2026, 9, 22)], 1, NOW)).toBe(1));
  it('three weeks in a row', () => expect(weekStreak([at(2026, 9, 29), at(2026, 9, 23), at(2026, 9, 15)], 1, NOW)).toBe(3));
  it('a missed week breaks it', () => expect(weekStreak([at(2026, 9, 29), at(2026, 9, 8)], 1, NOW)).toBe(1));
  it('two weeks ago with nothing since is already over', () => expect(weekStreak([at(2026, 9, 15)], 1, NOW)).toBe(0));
  it('several workouts in one week are still one week', () => expect(weekStreak([at(2026, 9, 28), at(2026, 9, 29), at(2026, 9, 30, 8)], 1, NOW)).toBe(1));
  it('follows the chosen first day of the week: Sunday 27 Sept vs Monday 28 Sept splits the same workouts differently', () => {
    const times = [at(2026, 9, 27), at(2026, 9, 21)]; // Sunday, and the Monday before
    expect(weekStreak(times, 1, NOW)).toBe(1);          // Monday weeks: 21st is last week... 27th also last week -> only 1 week with a gap to this week? (this week empty, last week has both)
    expect(weekStreak(times, 0, NOW)).toBe(2);          // Sunday weeks: 27th starts this week, the 21st is last week
  });
  it('survives a daylight-saving change (the old arithmetic broke here)', () => {
    const dst = new Date(2026, 10, 4, 10); // early Nov 2026
    const times = [new Date(2026, 10, 2, 9).getTime(), new Date(2026, 9, 26, 9).getTime(), new Date(2026, 9, 19, 9).getTime()];
    expect(weekStreak(times, 1, dst)).toBe(3);
  });
  it('weekStartOf is local midnight', () => { const d = weekStartOf(new Date(2026, 8, 30, 15), 1); expect([d.getDate(), d.getHours()]).toEqual([28, 0]); });
});
