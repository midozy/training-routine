// What the home-screen widget shows, as a small JSON snapshot the app hands to the phone's shared storage.
// Built from the same data and rules as the Today screen, so the widget and the app always agree.
import { supabase, fetchAll, type PlanDay, type PlanExercise, type Session } from './supabase';
import { localDate } from './calendar';
import { weekStartOf, weekStreak, type WeekStart } from './week';

export type WidgetSnapshot = {
  v: 1;
  updatedAt: number;
  weekStart: WeekStart;
  today: { kind: 'workout' | 'rest' | 'none'; name: string; exercises: number; sets: number; next: string[] };
  inProgress: boolean;       // a workout is open right now
  trainedDates: string[];    // local YYYY-MM-DD of finished workouts in the last 28 days (the widget draws this week from them)
  weekWorkouts: number;      // finished workouts so far this week
  streak: number;            // weeks in a row
};

export async function buildSnapshot(now: Date = new Date()): Promise<WidgetSnapshot | null> {
  const { data: settings } = await supabase.from('user_settings').select('*').maybeSingle();
  if (!settings) return null;
  const ws = (settings.week_start ?? 1) as WeekStart;

  const sessions = await fetchAll<Session>((a, b) => supabase.from('workout_sessions').select('*').order('started_at', { ascending: false }).range(a, b));
  const finished = sessions.filter((s) => s.finished_at);
  const times = finished.map((s) => +new Date(s.started_at));
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 28);
  const trainedDates = [...new Set(finished.filter((s) => new Date(s.started_at) >= cutoff).map((s) => localDate(new Date(s.started_at))))].sort();
  const weekStartMs = weekStartOf(now, ws).getTime();

  let today: WidgetSnapshot['today'] = { kind: 'none', name: 'No plan yet', exercises: 0, sets: 0, next: [] };
  if (settings.active_plan_id) {
    const { data: days } = await supabase.from('plan_days').select('*').eq('plan_id', settings.active_plan_id).order('position');
    const list = (days ?? []) as PlanDay[];
    const day = list[settings.next_position % Math.max(1, list.length)]; // exactly how the Today screen picks it
    if (day?.is_rest) today = { kind: 'rest', name: day.name, exercises: 0, sets: 0, next: [] };
    else if (day) {
      const { data: ex } = await supabase.from('plan_exercises').select('*').eq('plan_day_id', day.id).order('position');
      const exs = (ex ?? []) as PlanExercise[];
      today = { kind: 'workout', name: day.name, exercises: exs.length, sets: exs.reduce((n, e) => n + e.target_reps.length, 0), next: exs.slice(0, 3).map((e) => e.label) };
    }
  }

  return {
    v: 1, updatedAt: now.getTime(), weekStart: ws, today,
    inProgress: sessions.some((s) => !s.finished_at),
    trainedDates,
    weekWorkouts: times.filter((t) => t >= weekStartMs).length,
    streak: weekStreak(times, ws, now),
  };
}
