// Every main screen must render, finish loading and re-render without crashing. (This is the safeguard that would
// have caught the Progress crash: a hook placed after an early return only fails on the second render.)
import { describe, it } from 'vitest';
import Today from '@/app/page';
import PlanPage from '@/app/plan/page';
import EditPage from '@/app/plan/edit/page';
import HistoryPage from '@/app/history/page';
import ProfilePage from '@/app/profile/page';
import ProgressPage from '@/app/progress/page';
import WorkoutPage from '@/app/workout/page';
import { expectScreen, renderScreen } from './helpers';

describe('screens load without crashing', () => {
  it('Today', async () => { await expectScreen(await renderScreen(<Today />, { path: '/' }), /push/i); });
  it('Plan', async () => { await expectScreen(await renderScreen(<PlanPage />, { path: '/plan' }), /training days/i); });
  it('Plan editor', async () => { await expectScreen(await renderScreen(<EditPage />, { path: '/plan/edit', search: 'id=8' }), /Barbell Bench Press/); });
  it('History', async () => { await expectScreen(await renderScreen(<HistoryPage />, { path: '/history' }), /sessions logged/i); });
  it('Profile', async () => { await expectScreen(await renderScreen(<ProfilePage />, { path: '/profile' }), /week streak/i); });
  it('Progress: strength tab (rep maxes, muscle chart)', async () => { await expectScreen(await renderScreen(<ProgressPage />, { path: '/progress' }), /rep maxes/i); });
  it('Progress: body tab', async () => { await expectScreen(await renderScreen(<ProgressPage />, { path: '/progress', search: 'tab=body' }), /bodyweight/i); });
  it('Workout in progress', async () => { await expectScreen(await renderScreen(<WorkoutPage />, { path: '/workout', search: 'id=4' }), /Barbell Bench Press/); });
});
