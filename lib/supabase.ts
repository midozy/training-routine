import { createClient } from '@supabase/supabase-js';

// Publishable (client-safe) values; data is protected by Row Level Security.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://danzdvismbezkymgstfu.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_kHaeEQBW1wGS8pdgJExqdw_Xlxd2afq';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export type Plan = { id: number; slug: string | null; name: string; description: string | null; owner_id: string | null; archived: boolean; source_plan_id: number | null };
export type PlanDay = { id: number; plan_id: number; position: number; name: string; is_rest: boolean };
export type PlanExercise = {
  id: number; plan_day_id: number; position: number; exercise_id: number; label: string;
  target_reps: number[]; unit: 'reps' | 'steps'; cue: string | null; rest_seconds: number;
};
export type Settings = { user_id: string; active_plan_id: number | null; next_position: number; default_rest_seconds: number; units: 'kg' | 'lb'; theme: 'system' | 'light' | 'dark' };
export type Profile = { user_id: string; display_name: string | null; avatar_path: string | null; height_cm: number | null; birth_date: string | null; training_since: string | null; goal: 'bulk' | 'cut' | 'maintain' | 'recomp' | null; target_weight_kg: number | null; target_body_fat_pct: number | null };
export type Exercise = { id: number; name: string; muscle: string; owner_id: string | null };
export type Session = { id: number; plan_day_id: number | null; day_name: string; started_at: string; finished_at: string | null; notes: string | null;
  health_workout_id?: string | null; avg_hr?: number | null; max_hr?: number | null; active_kcal?: number | null };
export type SetLog = {
  id: number; session_id: number; plan_exercise_id: number | null; exercise_id: number;
  set_number: number; weight_kg: number; reps: number; logged_at: string;
};

/** Fetch every row of a query in 1000-row pages. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Load settings, creating a default row (Split 2 active) on first use. */
export async function getSettings(): Promise<Settings> {
  const { data } = await supabase.from('user_settings').select('*').maybeSingle();
  if (data) return data as Settings;
  const { data: plan } = await supabase.from('plans').select('id').eq('slug', 'split-2').maybeSingle();
  const { data: created, error } = await supabase
    .from('user_settings')
    .insert({ active_plan_id: plan?.id ?? null, next_position: 0 })
    .select('*')
    .single();
  if (error) throw error;
  return created as Settings;
}

export const epley = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));
export const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
