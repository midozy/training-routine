// The workout Live Activity (lock screen / Dynamic Island) as the Workout screen drives it. The native bridge is replaced by spies.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import WorkoutPage from '@/app/workout/page';
import { endWorkoutActivity, syncWorkoutActivity } from '@/lib/native';
import { nav } from './nav';
import { expectScreen, renderScreen } from './helpers';
import { makeCloud, seed, UID } from './fakeCloud';

vi.mock('@/lib/native', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/native')>();
  return { ...real, syncWorkoutActivity: vi.fn(), endWorkoutActivity: vi.fn() };
});

const sync = vi.mocked(syncWorkoutActivity);
const end = vi.mocked(endWorkoutActivity);
const last = () => sync.mock.calls.at(-1)?.[0];
const openWorkout = (superset = false) => {
  const db = seed();
  if (superset) for (const id of [800, 801]) db.plan_exercises.find((e) => e.id === id)!.superset_group = 1;
  db.workout_sessions.push({ id: 5, plan_day_id: 80, day_name: 'Push', started_at: new Date().toISOString(), finished_at: null, notes: null, user_id: UID, client_id: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null });
  return makeCloud(db);
};
type S = Awaited<ReturnType<typeof renderScreen>>;
const done = (s: S) => fireEvent.click(s.getByRole('button', { name: /^done/i }));

beforeEach(() => { sync.mockClear(); end.mockClear(); });

describe('workout Live Activity', () => {
  it('starts as soon as the workout is open: day, exercise, set and overall progress', async () => {
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud: openWorkout() });
    await expectScreen(s, /Barbell Bench Press/);
    await waitFor(() => expect(sync).toHaveBeenCalled());
    expect(last()).toMatchObject({ dayName: 'Push', phase: 'train', exercise: 'Barbell Bench Press', setText: 'Set 1 of 3', setsDone: 0, setsTotal: 8 });
    expect(typeof last()!.startedAt).toBe('number');
  });

  it('after a set: the rest countdown with what is next; after rest: back to training with the count updated', async () => {
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud: openWorkout() });
    await expectScreen(s, /Barbell Bench Press/);
    done(s);
    await waitFor(() => expect(last()).toMatchObject({ phase: 'rest', setsDone: 1 }));
    expect(last()!.restEnd!).toBeGreaterThan(Date.now());
    expect(last()!.restStart!).toBeLessThan(last()!.restEnd!);
    expect(last()!.nextUp).toMatch(/Barbell Bench Press · Set 2/);
    fireEvent.click(s.getByText('Skip'));
    await waitFor(() => expect(last()).toMatchObject({ phase: 'train', setText: 'Set 2 of 3', setsDone: 1 }));
    expect(last()!.restEnd).toBeUndefined();
  });

  it('adding 15 seconds to the rest moves the countdown', async () => {
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud: openWorkout() });
    await expectScreen(s, /Barbell Bench Press/);
    done(s);
    await waitFor(() => expect(last()?.phase).toBe('rest'));
    const before = last()!.restEnd!;
    fireEvent.click(s.getByText('+15s'));
    await waitFor(() => expect(last()!.restEnd!).toBe(before + 15_000));
  });

  it('a superset: no rest between its exercises, the lock screen simply moves to the next exercise', async () => {
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud: openWorkout(true) });
    await expectScreen(s, /SUPERSET 1\/2/);
    done(s);
    await waitFor(() => expect(last()).toMatchObject({ phase: 'train', exercise: 'Incline Dumbbell Press', setsDone: 1 }));
    expect(sync.mock.calls.some((c) => c[0].phase === 'rest')).toBe(false);
  });

  it('looking at an old, finished workout does not start one', async () => {
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=3', cloud: makeCloud() });
    await expectScreen(s, /Incline Dumbbell Press|Barbell Bench Press/);   // it opens on the first exercise with sets left
    await new Promise((r) => setTimeout(r, 400));
    expect(sync).not.toHaveBeenCalled();
  });

  it('leaving the screen in the middle of a rest puts the lock screen back to "training" (the workout is still on)', async () => {
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud: openWorkout() });
    await expectScreen(s, /Barbell Bench Press/);
    done(s);
    await waitFor(() => expect(last()?.phase).toBe('rest'));
    s.unmount();
    expect(last()).toMatchObject({ phase: 'train' });
    expect(end).not.toHaveBeenCalled();
  });

  it('finishing the workout ends the Live Activity', async () => {
    const cloud = openWorkout();
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud });
    await expectScreen(s, /Barbell Bench Press/);
    fireEvent.click(s.getByRole('button', { name: /overview/i }));
    fireEvent.click(await s.findByRole('button', { name: /finish workout/i }));
    await waitFor(() => expect(end).toHaveBeenCalled());
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/'));
    expect(cloud.db.workout_sessions.find((x) => x.id === 5)!.finished_at).not.toBeNull();
  });
});
