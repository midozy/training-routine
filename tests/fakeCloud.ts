// A fake Supabase for screen tests: realistic data, answered by the same query/write engine the app uses offline.
import { runQuery, type Row } from '@/lib/pgrest';
import { applyWrite } from '@/lib/pgwrite';
import { cascade, CASCADE_TABLES } from '@/lib/cascade';

export const UID = 'user-1';
const ago = (days: number, hour = 9) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const day = (days: number) => ago(days).slice(0, 10);

export function seed(): Record<string, Row[]> {
  const ex = (id: number, name: string, muscle: string): Row => ({ id, name, muscle, owner_id: null, client_id: null });
  const pe = (id: number, dayId: number, pos: number, exId: number, label: string, reps: number[]): Row => ({ id, plan_day_id: dayId, position: pos, exercise_id: exId, label, target_reps: reps, unit: 'reps', cue: null, rest_seconds: 90, superset_group: null, client_id: null });
  const set = (id: number, session: number, peId: number, exId: number, n: number, kg: number, reps: number, extra: Row = {}): Row =>
    ({ id, session_id: session, plan_exercise_id: peId, exercise_id: exId, set_number: n, weight_kg: kg, reps, logged_at: ago(0, 9), user_id: UID, rpe: null, note: null, is_warmup: false, ...extra });
  const sessions = [
    { id: 1, ago: 14, kg: 75 }, { id: 2, ago: 7, kg: 80 }, { id: 3, ago: 2, kg: 82.5 },
  ];
  const setLogs: Row[] = [];
  let sid = 100;
  for (const s of sessions) {
    setLogs.push(set(sid++, s.id, 800, 1, 101, 40, 8, { is_warmup: true, logged_at: ago(s.ago, 8) }));
    for (let n = 1; n <= 3; n++) setLogs.push(set(sid++, s.id, 800, 1, n, s.kg, 8, { rpe: 7 + n * 0.5, logged_at: ago(s.ago, 9) }));
    setLogs.push(set(sid++, s.id, 801, 2, 1, 30, 10, { logged_at: ago(s.ago, 9) }));
  }
  setLogs.push(set(sid++, 4, 800, 1, 1, 82.5, 8, { logged_at: ago(0, 8) }), set(sid++, 4, 800, 1, 2, 82.5, 7, { logged_at: ago(0, 8), note: 'grindy' }));
  return {
    exercises: [ex(1, 'Barbell Bench Press', 'Chest'), ex(2, 'Incline Dumbbell Press', 'Chest'), ex(3, 'Lat Pulldown', 'Back'), ex(4, 'Barbell Squat', 'Quads'), ex(5, 'Barbell Curl', 'Biceps'), ex(6, 'Rope Pushdown', 'Triceps')],
    plans: [
      { id: 7, slug: 'starter-ppl', name: 'Starter: Push / Pull / Legs', description: 'starter', owner_id: null, archived: false, source_plan_id: null, client_id: null },
      { id: 8, slug: null, name: 'My split', description: null, owner_id: UID, archived: false, source_plan_id: 7, client_id: null },
    ],
    plan_days: [
      { id: 80, plan_id: 8, position: 0, name: 'Push', is_rest: false, client_id: null },
      { id: 81, plan_id: 8, position: 1, name: 'Pull', is_rest: false, client_id: null },
      { id: 82, plan_id: 8, position: 2, name: 'Rest', is_rest: true, client_id: null },
    ],
    plan_exercises: [pe(800, 80, 0, 1, 'Barbell Bench Press', [8, 8, 8]), pe(801, 80, 1, 2, 'Incline Dumbbell Press', [10, 10, 10]), pe(802, 80, 2, 6, 'Rope Pushdown', [12, 12]), pe(810, 81, 0, 3, 'Lat Pulldown', [10, 10, 10]), pe(811, 81, 1, 5, 'Barbell Curl', [10, 10])],
    user_settings: [{ user_id: UID, active_plan_id: 8, next_position: 0, default_rest_seconds: 90, units: 'kg', theme: 'light', week_start: 1 }],
    profiles: [{ user_id: UID, display_name: 'Tester', avatar_path: null, height_cm: 180, birth_date: null, training_since: null, goal: null, target_weight_kg: 85, target_body_fat: null, updated_at: ago(1) }],
    workout_sessions: [
      ...sessions.map((s) => ({ id: s.id, plan_day_id: 80, day_name: 'Push', started_at: ago(s.ago, 8), finished_at: ago(s.ago, 10), notes: null, user_id: UID, client_id: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null })),
      { id: 4, plan_day_id: 80, day_name: 'Push', started_at: ago(0, 8), finished_at: null, notes: null, user_id: UID, client_id: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null },
    ],
    set_logs: setLogs,
    session_swaps: [],
    bodyweight_logs: [{ id: 1, user_id: UID, logged_on: day(10), weight_kg: 88, source: 'manual', external_id: null }, { id: 2, user_id: UID, logged_on: day(5), weight_kg: 87.4, source: 'manual', external_id: null }, { id: 3, user_id: UID, logged_on: day(1), weight_kg: 87, source: 'manual', external_id: null }],
    measurements: [{ id: 1, user_id: UID, logged_on: day(3), waist_cm: 84, chest_cm: 105 }],
    health_samples: [{ id: 1, user_id: UID, kind: 'steps', external_id: 's1', day: day(1), value: 9000, created_at: ago(1) }],
  };
}

export type Cloud = ReturnType<typeof makeCloud>;
export function makeCloud(db: Record<string, Row[]> = seed()) {
  const log: Array<{ method: string; table: string; query: string; body: unknown }> = [];
  let nextId = 5000;
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input.toString());
    const method = (init.method ?? 'GET').toUpperCase();
    if (url.pathname.includes('/auth/v1/')) return new Response(JSON.stringify({ message: 'not signed in' }), { status: 401 });
    const table = url.pathname.split('/rest/v1/')[1]?.split('/')[0] ?? '';
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    log.push({ method, table, query: url.search.slice(1), body });
    if (method === 'GET') {
      const r = runQuery(db[table] ?? [], url.searchParams, headers.get('Accept'));
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    const out = applyWrite(db[table] ?? [], { table, method: method as 'POST' | 'PATCH' | 'DELETE', params: url.searchParams, body, prefer: headers.get('Prefer'), accept: headers.get('Accept') }, { userId: UID, now: new Date().toISOString(), newId: () => ++nextId });
    if (out.status >= 400) return new Response(JSON.stringify(out.body), { status: out.status });
    db[table] = out.rows;
    if (method === 'DELETE' && out.removed.length) {
      const copy: Record<string, Row[]> = {};
      for (const t of CASCADE_TABLES) copy[t] = t === table ? out.rows : (db[t] ?? []).map((r) => ({ ...r }));
      for (const t of cascade(copy, table, out.removed)) db[t] = copy[t];
    }
    return out.body === null ? new Response(null, { status: out.status }) : new Response(JSON.stringify(out.body), { status: out.status });
  };
  return { db, log, fetch: fetchImpl };
}
