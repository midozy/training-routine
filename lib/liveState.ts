// What the workout Live Activity (lock screen + Dynamic Island) shows. Pure, so it is easy to test.
export type LiveState = {
  dayName: string;
  startedAt: number;                 // ms: drives the elapsed-time clock
  phase: 'train' | 'rest';
  exercise: string;                  // the exercise you are on (while resting: the one you will do next)
  setText: string;                   // "Set 2 of 4"
  detail: string;                    // "82.5 kg × 8"
  setsDone: number;                  // across the whole workout
  setsTotal: number;
  restStart?: number;                // rest only (ms)
  restEnd?: number;
  nextUp?: string;
};

export function liveState(p: {
  dayName: string; startedAt: number; exercise: string;
  setIndex: number; setCount: number; weight: string; reps: string; units: string;
  setsDone: number; setsTotal: number;
  rest: { startAt: number; endAt: number; next: string } | null;
}): LiveState {
  const w = p.weight.trim();
  const reps = p.reps.trim() || '0';
  return {
    dayName: p.dayName,
    startedAt: p.startedAt,
    phase: p.rest ? 'rest' : 'train',
    exercise: p.exercise,
    setText: `Set ${p.setIndex + 1} of ${Math.max(p.setCount, p.setIndex + 1)}`,
    detail: Number(w) > 0 ? `${w} ${p.units} × ${reps}` : `${reps} reps`,
    setsDone: p.setsDone,
    setsTotal: p.setsTotal,
    ...(p.rest ? { restStart: p.rest.startAt, restEnd: p.rest.endAt, nextUp: p.rest.next } : {}),
  };
}
