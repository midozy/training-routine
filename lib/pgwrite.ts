// Applies PostgREST writes (POST insert/upsert, PATCH, DELETE) to the copy saved on the phone, for the tables that
// can be changed offline. The same call also produces the exact request to send to the server later.
// Keep this file erasable-TypeScript only (no enums / parameter properties) so scripts/test-offline.mjs can run it.
import { applyFilters, cmpVals, project, type Row } from './pgrest';

export type Ctx = { userId: string; now: string; newId: () => number };
export type Method = 'POST' | 'PATCH' | 'DELETE';
export type WriteSpec = { table: string; method: Method; params: URLSearchParams; body: unknown; prefer: string | null; accept: string | null };
export type WriteOutcome = {
  status: number;
  body: unknown;       // what the caller of the Supabase client gets back
  rows: Row[];         // the table after the change
  inserted: Row[];     // rows created by this write
  removed: Row[];      // rows deleted by this write (the caller applies ON DELETE rules to other tables)
  queuedBody: unknown; // what to send to the server later (null = nothing to send)
};

type Info = {
  hasId: boolean;
  stamp: string | null;          // the server "now()" column to freeze at the time of the change
  pk?: string[];                 // primary key without an id (used when an upsert names no on_conflict)
  unique?: string[][];           // extra unique constraints worth refusing immediately, like the server would
  defaults: (c: Ctx) => Row;
};

/** Tables that can be changed offline, with the server defaults they need. */
export const LOCAL_TABLES: Record<string, Info> = {
  workout_sessions: {
    hasId: true, stamp: 'started_at',
    defaults: (c) => ({ user_id: c.userId, plan_day_id: null, started_at: c.now, finished_at: null, notes: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null, client_id: null }),
  },
  set_logs: { hasId: true, stamp: 'logged_at', defaults: (c) => ({ user_id: c.userId, plan_exercise_id: null, logged_at: c.now, weight_kg: 0, rpe: null, note: null, is_warmup: false }) },
  session_swaps: { hasId: false, stamp: null, defaults: (c) => ({ user_id: c.userId }) },
  user_settings: { hasId: false, stamp: null, pk: ['user_id'], defaults: () => ({}) },
  plans: { hasId: true, stamp: 'created_at', defaults: (c) => ({ owner_id: c.userId, slug: null, description: null, archived: false, source_plan_id: null, created_at: c.now, client_id: null }) },
  plan_days: { hasId: true, stamp: null, defaults: () => ({ is_rest: false, client_id: null }) },
  plan_exercises: { hasId: true, stamp: null, defaults: () => ({ unit: 'reps', rest_seconds: 90, cue: null, superset_group: null, client_id: null }) },
  exercises: { hasId: true, stamp: null, unique: [['owner_id', 'name']], defaults: (c) => ({ owner_id: c.userId, client_id: null }) },
  profiles: { hasId: false, stamp: null, pk: ['user_id'], defaults: (c) => ({ user_id: c.userId }) },
  bodyweight_logs: { hasId: true, stamp: null, defaults: (c) => ({ user_id: c.userId, source: 'manual', external_id: null }) },
  measurements: { hasId: true, stamp: null, defaults: (c) => ({ user_id: c.userId }) },
  health_samples: { hasId: true, stamp: null, defaults: (c) => ({ user_id: c.userId, created_at: c.now }) },
};

export function parsePrefer(h: string | null) {
  const s = (h ?? '').toLowerCase();
  return { merge: s.includes('resolution=merge-duplicates'), ignore: s.includes('resolution=ignore-duplicates'), representation: s.includes('return=representation') };
}

const fail = (status: number, body: unknown, rows: Row[]): WriteOutcome => ({ status, body, rows, inserted: [], removed: [], queuedBody: null });

export function applyWrite(rows: Row[], spec: WriteSpec, ctx: Ctx): WriteOutcome {
  const info = LOCAL_TABLES[spec.table];
  if (!info) return fail(400, { code: 'OFFLINE_UNSUPPORTED', message: `${spec.table} can't be changed offline yet.` }, rows);
  const pf = parsePrefer(spec.prefer);
  const wantObject = !!spec.accept && spec.accept.includes('application/vnd.pgrst.object+json');
  const select = spec.params.get('select');

  const reply = (status: number, changed: Row[]): { status: number; body: unknown } => {
    if (!pf.representation) return { status: status === 200 ? 204 : status, body: null };
    const out = changed.map((r) => project(r, select));
    if (wantObject) {
      return out.length === 1
        ? { status, body: out[0] }
        : { status: 406, body: { code: 'PGRST116', details: `The result contains ${out.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { status, body: out };
  };

  const next = rows.map((r) => ({ ...r })); // never half-apply a failing write

  if (spec.method === 'POST') {
    const items = (Array.isArray(spec.body) ? spec.body : [spec.body]) as Row[];
    const onConflict = (spec.params.get('on_conflict') ?? '').split(',').filter(Boolean);
    const cols = onConflict.length ? onConflict : (pf.merge || pf.ignore) && info.pk ? info.pk : [];
    const keyOf = (r: Row): string | null => {
      if (!cols.length) return null;
      const vals = cols.map((c) => r[c]);
      return vals.some((v) => v == null) ? null : JSON.stringify(vals);
    };
    const index = new Map<string, Row>();
    if (cols.length) for (const r of next) { const k = keyOf(r); if (k) index.set(k, r); }

    const changed: Row[] = [];
    const inserted: Row[] = [];
    const queued: Row[] = [];
    let merged = 0;
    for (const item of items) {
      const cand: Row = { ...info.defaults(ctx), ...item }; // conflicts are decided on the row as the server would build it
      const k = keyOf(cand);
      const existing = k ? index.get(k) : undefined;
      if (existing) {
        if (pf.merge) { Object.assign(existing, item); changed.push(existing); queued.push(item); merged++; continue; }
        if (pf.ignore) continue;
        return fail(409, { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }, rows);
      }
      for (const u of info.unique ?? []) {
        if (u.every((c) => cand[c] != null) && next.some((r) => u.every((c) => r[c] != null && cmpVals(r[c], cand[c]) === 0))) {
          return fail(409, { code: '23505', message: `duplicate key value violates unique constraint "${spec.table}_${u.join('_')}_key"`, details: null, hint: null }, rows);
        }
      }
      if (info.hasId && cand.id == null) cand.id = ctx.newId();
      next.push(cand); inserted.push(cand); changed.push(cand);
      if (k) index.set(k, cand);
      queued.push(item);
    }
    // Freeze the time of the change (the server's own now() would stamp the moment we sync). Bulk requests must have the
    // same keys in every row, so only do it when every row in the request is new.
    if (info.stamp && queued.length && merged === 0 && inserted.length === queued.length) {
      for (let i = 0; i < queued.length; i++) if (queued[i][info.stamp] == null) queued[i] = { [info.stamp]: inserted[i][info.stamp], ...queued[i] };
    }
    const r = reply(201, changed);
    return { ...r, rows: next, inserted, removed: [], queuedBody: queued.length ? (Array.isArray(spec.body) ? queued : queued[0]) : null };
  }

  if (spec.method === 'PATCH') {
    const matched = applyFilters(next, spec.params);
    if (!matched) return fail(400, { code: 'OFFLINE_UNSUPPORTED', message: "This update can't be applied offline." }, rows);
    for (const r of matched) Object.assign(r, spec.body as Row);
    return { ...reply(200, matched), rows: next, inserted: [], removed: [], queuedBody: spec.body };
  }

  // DELETE
  const doomed = applyFilters(next, spec.params);
  if (!doomed) return fail(400, { code: 'OFFLINE_UNSUPPORTED', message: "This delete can't be applied offline." }, rows);
  const gone = new Set(doomed);
  return { ...reply(204, doomed), rows: next.filter((r) => !gone.has(r)), inserted: [], removed: doomed, queuedBody: null };
}
