import { describe, expect, it } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import HistoryPage from '@/app/history/page';
import { expectScreen, renderScreen } from './helpers';

const longMonth = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
const cellName = (d: Date) => new RegExp(`^${d.getDate()} ${longMonth(d)} ${d.getFullYear()},`);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

describe('training calendar on History', () => {
  it('shows this month with your training days marked, and today selected', async () => {
    const s = await renderScreen(<HistoryPage />, { path: '/history' });
    await expectScreen(s, /Training calendar|sessions logged/i);
    await waitFor(() => expect(s.getByLabelText('Training calendar')).toBeTruthy());
    const today = new Date();
    expect(s.container.textContent).toContain(today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
    const todayCell = s.getByRole('button', { name: cellName(today) });
    expect(todayCell.getAttribute('aria-label')).toMatch(/1 workout, 2 sets/);     // the in-progress workout of today (2 sets logged)
    expect(todayCell.getAttribute('aria-pressed')).toBe('true');
    expect(s.container.textContent).toMatch(/Push/);                                // today's workout is listed under the grid
  });

  it('tapping a day lists its workout, and it links to the workout', async () => {
    const s = await renderScreen(<HistoryPage />, { path: '/history' });
    await waitFor(() => expect(s.getByLabelText('Training calendar')).toBeTruthy());
    const d = daysAgo(2);                                                           // a finished Push workout (4 working sets, warm-up not counted)
    if (d.getMonth() !== new Date().getMonth()) fireEvent.click(s.getByRole('button', { name: 'Previous month' }));
    const cell = s.getByRole('button', { name: cellName(d) });
    expect(cell.getAttribute('aria-label')).toMatch(/1 workout, 4 sets/);
    fireEvent.click(cell);
    await waitFor(() => expect(cell.getAttribute('aria-pressed')).toBe('true'));
    const link = s.container.querySelector('section[aria-label="Training calendar"] a[href="/workout?id=3"]');
    expect(link).not.toBeNull();
  });

  it('a day you did not train is a rest day', async () => {
    const s = await renderScreen(<HistoryPage />, { path: '/history' });
    await waitFor(() => expect(s.getByLabelText('Training calendar')).toBeTruthy());
    const d = daysAgo(4);
    if (d.getMonth() !== new Date().getMonth()) fireEvent.click(s.getByRole('button', { name: 'Previous month' }));
    const cell = s.getByRole('button', { name: cellName(d) });
    expect(cell.getAttribute('aria-label')).toMatch(/rest day/);
    fireEvent.click(cell);
    await waitFor(() => expect(s.container.textContent).toMatch(/Rest day: nothing logged/));
  });

  it('month arrows move between months and "Today" brings you back', async () => {
    const s = await renderScreen(<HistoryPage />, { path: '/history' });
    await waitFor(() => expect(s.getByLabelText('Training calendar')).toBeTruthy());
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    fireEvent.click(s.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(s.container.textContent).toContain(prev.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })));
    fireEvent.click(s.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(s.container.textContent).toContain(now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })));
    expect(s.errors).toEqual([]);
  });

  it('weeks start on the day chosen in Settings', async () => {
    const s = await renderScreen(<HistoryPage />, { path: '/history' });
    await waitFor(() => expect(s.getByLabelText('Training calendar')).toBeTruthy());
    const letters = [...s.container.querySelectorAll('section[aria-label="Training calendar"] .grid-cols-7 > div.eyebrow')].map((e) => e.textContent).join('');
    expect(letters).toBe('MTWTFSS');                                                // the fake account's week starts on Monday
  });
});
