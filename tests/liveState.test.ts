import { describe, expect, it } from 'vitest';
import { liveState } from '@/lib/liveState';

const base = { dayName: 'Push', startedAt: 1_000, exercise: 'Barbell Bench Press', setIndex: 1, setCount: 4, weight: '82.5', reps: '8', units: 'kg', setsDone: 5, setsTotal: 24, rest: null };

describe('Live Activity state', () => {
  it('while training: the exercise, "Set 2 of 4", the weight and reps, and overall progress', () => {
    expect(liveState(base)).toEqual({ dayName: 'Push', startedAt: 1_000, phase: 'train', exercise: 'Barbell Bench Press', setText: 'Set 2 of 4', detail: '82.5 kg × 8', setsDone: 5, setsTotal: 24 });
  });
  it('while resting: the countdown window and what is up next', () => {
    const s = liveState({ ...base, rest: { startAt: 5_000, endAt: 95_000, next: 'Barbell Bench Press · Set 2 — 82.5 kg × 8' } });
    expect(s).toMatchObject({ phase: 'rest', restStart: 5_000, restEnd: 95_000, nextUp: 'Barbell Bench Press · Set 2 — 82.5 kg × 8' });
  });
  it('no weight yet: just the reps; pounds are shown as pounds', () => {
    expect(liveState({ ...base, weight: '' }).detail).toBe('8 reps');
    expect(liveState({ ...base, weight: '185', units: 'lb' }).detail).toBe('185 lb × 8');
  });
  it('an extra set added on the fly never reads "Set 5 of 4"', () => expect(liveState({ ...base, setIndex: 4, setCount: 4 }).setText).toBe('Set 5 of 5'));
  it('empty reps do not show NaN', () => expect(liveState({ ...base, reps: '' }).detail).toBe('82.5 kg × 0'));
});
