// Applies PostgREST writes (POST insert/upsert, PATCH, DELETE) to the copy saved on the phone, for the tables that
// can be changed offline. The same call also produces the exact request to send to the server later.
// Keep this file erasable-TypeScript only (no enums / parameter properties) so scripts/test-offline.mjs can run it.
import { applyFilters, cmpVals, project, type Row } from './pgrest';

export type Ctx = { userId: string; now: string; newId: () => number };
export type Method = 'POST' | 'PATCH' | 'DELETE';
export type WriteSpec = { table: string; method: Method; params: URLSearchParams; body: unknown; prefer: string | null; accept: string | null };
export type WriteOutcome = {
  status: number;
  body: unknown;      // what the caller of the Supabase client gets back
  rows: Row[];        // the table after the change
  inserted: Row[];    // rows created by this write
  queuedBody: unknown; // what to send to the server later (null = nothing to send)
};

/** Tables that can be changed offline, with the server defaults they need. `stamp` = the server "now()" column to freeze at the time of the change. */
export const LOCAL_TABLES: Record<string, { hasId: boolean; stamp: string | null; defaults: (c: Ctx) => Row }> = {
  workout_sessions: {
    hasId: true, stamp: 'started_at',
    defaults: (c) => ({ user_id: c.userId, plan_day_id: null, started_at: c.now, finished_at: null, notes: null, health_workout_id: null, avg_hr: null, max_hr: null, active_kcal: null, client_id: null }),
  },
  set_logs: { hasId: true, stamp: 'logged_at', defaults: (c) => ({ user_id: c.userId, plan_exercise_id: null, logged_at: c.now, weight_kg: 0 }) },
  session_swaps: { hasId: false, stamp: null, defaults: (c) => ({ user_id: c.userId }) },
  user_settings: { hasId: false, stamp: null, defaults: () => ({}) },
};

export function parsePrefer(h: string | null) {
  const s = (h ?? '').toLowerCase();
  return { merge: s.includes('resolution=merge-duplicates'), ignore: s.includes('resolution=ignore-duplicates'), representation: s.includes('return=representation') };
}

const fail = (status: number, body: unknown, rows: Row[]): WriteOutcome => ({ status, body, rows, inserted: [], queuedBody: null });

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
    const conflict = (spec.params.get('on_conflict') ?? '').split(',').filter(Boolean);
    const changed: Row[] = [];
    const inserted: Row[] = [];
    const queued: Row[] = [];
    for (const item of items) {
      const existing = conflict.length
        ? next.find((r) => conflict.every((c) => r[c] != null && item[c] != null && cmpVals(r[c], item[c]) === 0))
        : undefined;
      if (existing) {
        if (pf.merge) { Object.assign(existing, item); changed.push(existing); queued.push(item); continue; }
        if (pf.ignore) continue;
        return fail(409, { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }, rows);
      }
      const row: Row = { ...info.defaults(ctx), ...item };
      if (info.hasId && row.id == null) row.id = ctx.newId();
      next.push(row); inserted.push(row); changed.push(row);
      // Freeze the time of the change: the server's own now() would otherwise stamp the moment we sync, not the moment you did it.
      queued.push(info.stamp && item[info.stamp] == null ? { [info.stamp]: row[info.stamp], ...item } : item);
    }
    const r = reply(201, changed);
    return { ...r, rows: next, inserted, queuedBody: queued.length ? (Array.isArray(spec.body) ? queued : queued[0]) : null };
  }

  if (spec.method === 'PATCH') {
    const matched = applyFilters(next, spec.params);
    if (!matched) return fail(400, { code: 'OFFLINE_UNSUPPORTED', message: "This update can't be applied offline." }, rows);
    for (const r of matched) Object.assign(r, spec.body as Row);
    return { ...reply(200, matched), rows: next, inserted: [], queuedBody: spec.body };
  }

  // DELETE
  const doomed = applyFilters(next, spec.params);
  if (!doomed) return fail(400, { code: 'OFFLINE_UNSUPPORTED', message: "This delete can't be applied offline." }, rows);
  const gone = new Set(doomed);
  return { ...reply(204, doomed), rows: next.filter((r) => !gone.has(r)), inserted: [], queuedBody: null };
}
