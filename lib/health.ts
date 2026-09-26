'use client';

/**
 * Apple Health: reads body metrics, resting heart rate, steps, active energy and sleep
 * into Supabase, adds Apple Watch heart rate/energy to Heavy sessions, and saves finished
 * sessions to Health as strength-training workouts. iPhone app only; every export is a
 * safe no-op on the web. Native side: ios/App/App/HeavyHealthPlugin.swift.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';
import { supabase } from './supabase';

type QSample = { id: string; value: number; startDate: string; endDate: string; day: string; source: string };
type SleepSample = { id: string; value: number; startDate: string; endDate: string; source: string; sourceId: string };
type QuantityType = 'bodyMass' | 'bodyFat' | 'leanMass' | 'height' | 'restingHeartRate';
type Range = { startDate: string; endDate?: string };

interface HeavyHealthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  authStatus(): Promise<{ status: 'shouldRequest' | 'unnecessary' | 'unknown' | 'unavailable' }>;
  requestAuthorization(): Promise<{ requested: boolean }>;
  readQuantity(o: Range & { type: QuantityType }): Promise<{ samples: QSample[] }>;
  dailySums(o: Range & { type: 'steps' | 'activeEnergy' }): Promise<{ days: { day: string; value: number }[] }>;
  readSleep(o: Range): Promise<{ samples: SleepSample[] }>;
  workoutStats(o: Range): Promise<{ avgHr?: number; maxHr?: number; activeKcal?: number }>;
  saveWorkout(o: Range & { externalId: string; name?: string }): Promise<{ id: string; existed: boolean }>;
}

const HeavyHealth = registerPlugin<HeavyHealthPlugin>('HeavyHealth');

/* ---------- Per-device preferences (HealthKit access is per device) ---------- */
export type HealthPrefs = { enabled: boolean; writeWorkouts: boolean; writeSince: string | null; lastSync: string | null };
const KEY = 'heavy.health';
const DEFAULTS: HealthPrefs = { enabled: false, writeWorkouts: true, writeSince: null, lastSync: null };

export function getHealthPrefs(): HealthPrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}
export function setHealthPrefs(patch: Partial<HealthPrefs>): HealthPrefs {
  const next = { ...getHealthPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

export async function healthAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try { return (await HeavyHealth.isAvailable()).available; }
  catch (e) {
    console.warn('[health] isAvailable failed:', (e as Error)?.message ?? e);
    return false;
  }
}

/** Shows Apple's permission sheet (first time only), turns sync on and runs a full import. */
export async function connectHealth(): Promise<SyncResult> {
  await HeavyHealth.requestAuthorization();
  setHealthPrefs({ enabled: true, writeSince: getHealthPrefs().writeSince ?? new Date().toISOString() });
  return syncHealth({ force: true });
}

export function disconnectHealth() {
  setHealthPrefs({ enabled: false });
}

export function setWriteWorkouts(on: boolean) {
  setHealthPrefs({ writeWorkouts: on, ...(on ? { writeSince: new Date().toISOString() } : {}) });
}

/* ---------- Sync ---------- */
export type SyncResult = { ok: boolean; skipped?: boolean; error?: string; counts?: Record<string, number> };

const DAY = 864e5;
const FIRST_SYNC_DAYS = 365;
const OVERLAP_DAYS = 3;          // re-read recent days: late Watch/scale data, edits
const THROTTLE_MS = 15 * 60e3;   // automatic syncs at most every 15 minutes
const localDay = (d: Date | string | number) => new Date(d).toLocaleDateString('en-CA');
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

type Row = { user_id: string; kind: string; day: string; value: number; unit: string; start_at: string | null; end_at: string | null; source: string | null; external_id: string; meta?: Record<string, unknown> | null };

const QUANTITIES: { type: QuantityType; kind: string; unit: string; dp: number }[] = [
  { type: 'bodyMass', kind: 'body_mass', unit: 'kg', dp: 2 },
  { type: 'bodyFat', kind: 'body_fat', unit: '%', dp: 1 },
  { type: 'leanMass', kind: 'lean_mass', unit: 'kg', dp: 2 },
  { type: 'height', kind: 'height', unit: 'cm', dp: 1 },
  { type: 'restingHeartRate', kind: 'resting_hr', unit: 'bpm', dp: 0 },
];

let running: Promise<SyncResult> | null = null;

/** Imports everything new since the last sync. Safe to call often: throttled and de-duplicated. */
export function syncHealth(opts: { force?: boolean } = {}): Promise<SyncResult> {
  if (running) return running;
  running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ force }: { force?: boolean }): Promise<SyncResult> {
  if (!isNative()) return { ok: false, skipped: true };
  const prefs = getHealthPrefs();
  if (!prefs.enabled) return { ok: false, skipped: true };
  if (!force && prefs.lastSync && Date.now() - new Date(prefs.lastSync).getTime() < THROTTLE_MS) return { ok: true, skipped: true };

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) return { ok: false, skipped: true };

  const now = new Date();
  const start = prefs.lastSync ? new Date(new Date(prefs.lastSync).getTime() - OVERLAP_DAYS * DAY) : new Date(now.getTime() - FIRST_SYNC_DAYS * DAY);
  const range = { startDate: start.toISOString(), endDate: now.toISOString() };
  const counts: Record<string, number> = {};

  try {
    const rows: Row[] = [];
    const byKind: Record<string, QSample[]> = {};

    // 1. Point-in-time samples.
    for (const q of QUANTITIES) {
      const { samples } = await HeavyHealth.readQuantity({ ...range, type: q.type });
      byKind[q.kind] = samples;
      counts[q.kind] = samples.length;
      for (const s of samples) rows.push({
        user_id: uid, kind: q.kind, day: s.day, value: round(s.value, q.dp), unit: q.unit,
        start_at: s.startDate, end_at: s.endDate, source: s.source, external_id: s.id,
      });
    }

    // 2. Daily totals (HealthKit merges iPhone + Watch without double counting).
    for (const [type, kind, unit] of [['steps', 'steps', 'count'], ['activeEnergy', 'active_energy', 'kcal']] as const) {
      const { days } = await HeavyHealth.dailySums({ ...range, type });
      counts[kind] = days.length;
      for (const d of days) rows.push({
        user_id: uid, kind, day: d.day, value: Math.round(d.value), unit,
        start_at: null, end_at: null, source: 'Apple Health', external_id: `day:${d.day}`,
      });
    }

    // 3. Sleep, one row per night (dated by the morning you woke up).
    const { samples: sleep } = await HeavyHealth.readSleep({ ...range, startDate: new Date(start.getTime() - DAY).toISOString() });
    const nights = sleepNights(sleep, localDay(start.getTime() + DAY));
    counts.sleep = nights.length;
    for (const n of nights) rows.push({ user_id: uid, ...n });

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('health_samples').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,kind,external_id' });
      if (error) throw error;
    }

    // 4. Bodyweight feeds the Progress charts; a manual entry for the same day always wins.
    await mergeBodyweight(uid, byKind.body_mass ?? [], localDay(start));

    // 5. Latest height fills the profile.
    const h = (byKind.height ?? []).at(-1);
    if (h) await supabase.from('profiles').update({ height_cm: round(h.value, 1), updated_at: now.toISOString() }).eq('user_id', uid);

    // 6. Apple Watch heart rate / energy for recent sessions, and workout write-back.
    counts.sessions_enriched = await enrichSessions(start);
    if (prefs.writeWorkouts && prefs.writeSince) counts.workouts_saved = await backfillWorkouts(prefs.writeSince);

    setHealthPrefs({ lastSync: now.toISOString() });
    return { ok: true, counts };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? String(e) };
  }
}

/** Collapse raw sleep samples to one row per night, using the source with the most sleep (usually the Watch). */
function sleepNights(samples: SleepSample[], fromDay: string) {
  const ASLEEP = new Set([1, 3, 4, 5]);
  const NAMES: Record<number, string> = { 0: 'inBed', 1: 'asleep', 2: 'awake', 3: 'core', 4: 'deep', 5: 'rem' };
  const nights = new Map<string, Map<string, { source: string; mins: Record<string, number>; asleep: number; start: number; end: number }>>();
  for (const s of samples) {
    const day = localDay(s.endDate);
    if (day < fromDay) continue; // may be cut off by the query window; the previous sync has it whole
    const a = new Date(s.startDate).getTime(), b = new Date(s.endDate).getTime();
    const mins = (b - a) / 60e3;
    const bySrc = nights.get(day) ?? new Map();
    const g = bySrc.get(s.sourceId) ?? { source: s.source, mins: {}, asleep: 0, start: a, end: b };
    const name = NAMES[s.value] ?? 'other';
    g.mins[name] = (g.mins[name] ?? 0) + mins;
    if (ASLEEP.has(s.value)) g.asleep += mins;
    g.start = Math.min(g.start, a); g.end = Math.max(g.end, b);
    bySrc.set(s.sourceId, g); nights.set(day, bySrc);
  }
  return [...nights.entries()].map(([day, bySrc]) => {
    const best = [...bySrc.values()].sort((x, y) => (y.asleep - x.asleep) || ((y.mins.inBed ?? 0) - (x.mins.inBed ?? 0)))[0];
    const value = best.asleep > 0 ? best.asleep : best.mins.inBed ?? 0;
    const meta = Object.fromEntries(Object.entries(best.mins).map(([k, v]) => [k, Math.round(v)]));
    return {
      kind: 'sleep', day, value: Math.round(value), unit: 'min',
      start_at: new Date(best.start).toISOString(), end_at: new Date(best.end).toISOString(),
      source: best.source, external_id: `night:${day}`, meta: { ...meta, measured: best.asleep > 0 ? 'asleep' : 'inBed' },
    };
  }).filter((n) => n.value > 0);
}

async function mergeBodyweight(uid: string, samples: QSample[], fromDay: string) {
  if (!samples.length) return;
  const lastPerDay = new Map<string, QSample>();
  for (const s of samples) lastPerDay.set(s.day, s); // samples are oldest → newest
  const { data: existing } = await supabase.from('bodyweight_logs').select('logged_on, source').gte('logged_on', fromDay);
  const manual = new Set((existing ?? []).filter((r) => r.source === 'manual').map((r) => r.logged_on));
  const rows = [...lastPerDay.values()].filter((s) => !manual.has(s.day)).map((s) => ({
    user_id: uid, logged_on: s.day, weight_kg: round(s.value, 2), source: 'apple_health', external_id: s.id,
  }));
  if (rows.length) await supabase.from('bodyweight_logs').upsert(rows, { onConflict: 'user_id,logged_on' });
}

/** Adds heart rate and active energy recorded during each finished session (Apple Watch). */
async function enrichSessions(since: Date): Promise<number> {
  const { data } = await supabase.from('workout_sessions').select('id, started_at, finished_at')
    .not('finished_at', 'is', null).is('avg_hr', null).gte('started_at', new Date(since.getTime() - 30 * DAY).toISOString()).limit(60);
  let n = 0;
  for (const s of data ?? []) {
    const st = await HeavyHealth.workoutStats({ startDate: s.started_at, endDate: s.finished_at! });
    if (st.avgHr == null && st.activeKcal == null) continue;
    await supabase.from('workout_sessions').update({
      avg_hr: st.avgHr != null ? round(st.avgHr, 1) : null,
      max_hr: st.maxHr != null ? round(st.maxHr, 1) : null,
      active_kcal: st.activeKcal != null ? round(st.activeKcal, 1) : null,
    }).eq('id', s.id);
    n++;
  }
  return n;
}

async function backfillWorkouts(since: string): Promise<number> {
  const { data } = await supabase.from('workout_sessions').select('id, day_name, started_at, finished_at')
    .not('finished_at', 'is', null).is('health_workout_id', null).gte('finished_at', since).limit(60);
  let n = 0;
  for (const s of data ?? []) if (await writeWorkout(s)) n++;
  return n;
}

async function writeWorkout(s: { id: number; day_name: string; started_at: string; finished_at: string | null }): Promise<boolean> {
  if (!s.finished_at || new Date(s.finished_at) <= new Date(s.started_at)) return false;
  try {
    const r = await HeavyHealth.saveWorkout({ startDate: s.started_at, endDate: s.finished_at, externalId: `heavy-session-${s.id}`, name: s.day_name });
    await supabase.from('workout_sessions').update({ health_workout_id: r.id }).eq('id', s.id);
    return !r.existed;
  } catch { return false; } // write access denied or Health unavailable: skip quietly
}

/** Call right after a session is finished. */
export async function saveSessionToHealth(sessionId: number) {
  if (!isNative()) return;
  const p = getHealthPrefs();
  if (!p.enabled || !p.writeWorkouts) return;
  const { data } = await supabase.from('workout_sessions').select('id, day_name, started_at, finished_at').eq('id', sessionId).maybeSingle();
  if (data) await writeWorkout(data);
}
