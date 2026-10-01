import { describe, expect, it, vi } from 'vitest';
import { buildSnapshot } from '@/lib/widgetSnapshot';
import { localDate } from '@/lib/calendar';
import { makeCloud, seed } from './fakeCloud';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

describe('widget snapshot', () => {
  it("is today's workout from the active plan, the same one the Today screen shows", async () => {
    vi.stubGlobal('fetch', makeCloud().fetch);
    const s = await buildSnapshot();
    expect(s).not.toBeNull();
    expect(s!.today).toEqual({ kind: 'workout', name: 'Push', exercises: 3, sets: 8, next: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Rope Pushdown'] });
    expect(s!.weekStart).toBe(1); expect(s!.v).toBe(1);
  });
  it('follows next_position through the plan (a rest day, and wrapping around)', async () => {
    const db = seed(); db.user_settings[0].next_position = 2;
    vi.stubGlobal('fetch', makeCloud(db).fetch);
    expect((await buildSnapshot())!.today).toEqual({ kind: 'rest', name: 'Rest', exercises: 0, sets: 0, next: [] });
    const db2 = seed(); db2.user_settings[0].next_position = 4;      // 4 % 3 days = the second day
    vi.stubGlobal('fetch', makeCloud(db2).fetch);
    expect((await buildSnapshot())!.today.name).toBe('Pull');
  });
  it('lists the days you trained (finished workouts only), and flags a workout in progress', async () => {
    vi.stubGlobal('fetch', makeCloud().fetch);
    const s = (await buildSnapshot())!;
    expect(s.trainedDates).toEqual([localDate(daysAgo(14)), localDate(daysAgo(7)), localDate(daysAgo(2))].sort());
    expect(s.inProgress).toBe(true);                                  // session 4 is open
  });
  it('counts workouts this week and the streak', async () => {
    vi.stubGlobal('fetch', makeCloud().fetch);
    const s = (await buildSnapshot())!;
    expect(s.weekWorkouts).toBeGreaterThanOrEqual(0); expect(s.weekWorkouts).toBeLessThanOrEqual(3);
    expect(s.streak).toBeGreaterThanOrEqual(1);
  });
  it('no active plan: says so instead of inventing a workout', async () => {
    const db = seed(); db.user_settings[0].active_plan_id = null;
    vi.stubGlobal('fetch', makeCloud(db).fetch);
    expect((await buildSnapshot())!.today).toEqual({ kind: 'none', name: 'No plan yet', exercises: 0, sets: 0, next: [] });
  });
  it('a brand-new account with no settings yet gives nothing to show', async () => {
    const db = seed(); db.user_settings = [];
    vi.stubGlobal('fetch', makeCloud(db).fetch);
    expect(await buildSnapshot()).toBeNull();
  });
});
