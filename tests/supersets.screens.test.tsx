// Supersets through the real screens: linking in the plan editor, and the logging flow in a workout.
import { describe, expect, it } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import EditPage from '@/app/plan/edit/page';
import WorkoutPage from '@/app/workout/page';
import { expectScreen, renderScreen } from './helpers';
import { makeCloud, seed, UID } from './fakeCloud';

const groupOf = (cloud: ReturnType<typeof makeCloud>, id: number) => cloud.db.plan_exercises.find((e) => e.id === id)?.superset_group ?? null;

describe('plan editor', () => {
  it('links two exercises into a superset, then unlinks them', async () => {
    const cloud = makeCloud();
    const s = await renderScreen(<EditPage />, { path: '/plan/edit', search: 'id=8', cloud });
    await expectScreen(s, /Barbell Bench Press/);
    expect(s.container.textContent).not.toMatch(/Superset · tap to unlink/);
    fireEvent.click(s.getAllByRole('button', { name: 'Link as superset' })[0]);          // between Bench Press and Incline Press
    await waitFor(() => expect(s.container.textContent).toMatch(/Superset · tap to unlink/));
    expect(groupOf(cloud, 800)).not.toBeNull(); expect(groupOf(cloud, 800)).toBe(groupOf(cloud, 801)); expect(groupOf(cloud, 802)).toBeNull();
    fireEvent.click(s.getByRole('button', { name: 'Unlink superset' }));
    await waitFor(() => expect(s.container.textContent).not.toMatch(/Superset · tap to unlink/));
    expect(groupOf(cloud, 800)).toBeNull(); expect(groupOf(cloud, 801)).toBeNull();
    expect(s.errors).toEqual([]);
  });

  it('moving an exercise out of a superset takes it apart cleanly (no stray group)', async () => {
    const db = seed(); db.plan_exercises.find((e) => e.id === 800)!.superset_group = 1; db.plan_exercises.find((e) => e.id === 801)!.superset_group = 1;
    const cloud = makeCloud(db);
    const s = await renderScreen(<EditPage />, { path: '/plan/edit', search: 'id=8', cloud });
    await expectScreen(s, /Superset · tap to unlink/);
    fireEvent.click(s.getAllByRole('button', { name: 'Move down' })[1]);                  // Incline Press moves below Rope Pushdown
    await waitFor(() => expect(groupOf(cloud, 800)).toBeNull());
    expect(groupOf(cloud, 801)).toBeNull();
    await waitFor(() => expect(s.container.textContent).not.toMatch(/Superset · tap to unlink/));
  });
});

describe('workout flow', () => {
  const supersetWorkout = () => {
    const db = seed();
    db.plan_exercises.find((e) => e.id === 800)!.superset_group = 1; db.plan_exercises.find((e) => e.id === 801)!.superset_group = 1;
    db.workout_sessions.push({ id: 5, plan_day_id: 80, day_name: 'Push', started_at: new Date().toISOString(), finished_at: null, notes: null, user_id: UID, client_id: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null });
    return makeCloud(db);
  };
  const title = (s: Awaited<ReturnType<typeof renderScreen>>) => s.container.querySelector('h1')?.textContent ?? '';
  const done = (s: Awaited<ReturnType<typeof renderScreen>>) => fireEvent.click(s.getByRole('button', { name: /^done/i }));

  it('shows the superset, goes A → B with no rest, then rests after B and returns to A for the next set', async () => {
    const cloud = supersetWorkout();
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud });
    await expectScreen(s, /SUPERSET 1\/2/);
    expect(title(s)).toMatch(/Barbell Bench Press/);

    done(s);                                                                            // A1
    await waitFor(() => expect(title(s)).toMatch(/Incline Dumbbell Press/));
    expect(s.queryByText('Skip')).toBeNull();                                           // no rest between the two
    expect(s.container.textContent).toMatch(/SUPERSET 2\/2/);

    done(s);                                                                            // B1
    await waitFor(() => expect(s.getByText('Skip')).toBeTruthy());                      // rest starts now
    expect(s.container.textContent).toMatch(/Barbell Bench Press · Set 2/);             // and it says what is next
    fireEvent.click(s.getByText('Skip'));
    await waitFor(() => expect(title(s)).toMatch(/Barbell Bench Press/));

    const logged = cloud.db.set_logs.filter((l) => l.session_id === 5 && !l.is_warmup);
    expect(logged.map((l) => [l.exercise_id, l.set_number])).toEqual([[1, 1], [2, 1]]);
    expect(s.errors).toEqual([]);
  });

  it('a normal exercise still rests after every set', async () => {
    const db = seed(); db.workout_sessions.push({ id: 5, plan_day_id: 80, day_name: 'Push', started_at: new Date().toISOString(), finished_at: null, notes: null, user_id: UID, client_id: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null });
    const s = await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=5', cloud: makeCloud(db) });
    await expectScreen(s, /Barbell Bench Press/);
    expect(s.container.textContent).not.toMatch(/SUPERSET/);
    done(s);
    await waitFor(() => expect(s.getByText('Skip')).toBeTruthy());
    expect(s.container.textContent).toMatch(/Barbell Bench Press · Set 2/);
  });
});
