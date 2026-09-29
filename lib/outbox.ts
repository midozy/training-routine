// The outbox: changes made on the phone (offline or not) wait here until the server has confirmed them.
// Nothing is removed until the server says OK. Sending is in order, one at a time, and safe to repeat:
// upserts/deletes/updates are idempotent, and a workout created offline is sent as an upsert on its client_id,
// so a retry after a lost response can never create a second copy.
import { kvGet, kvSet, setOnline, setPending, onClear } from './store';
import type { Row } from './pgrest';

export type Op = {
  seq: number;
  table: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  query: string;
  body: unknown;
  prefer: string | null;
  temp?: number;   // workout created offline: its temporary local id (negative)
  failed?: string; // set when the server rejected this change; the queue waits for retry/discard
};
type Cfg = { url: string; key: string; getToken: () => Promise<string | null>; onDrained?: (tables: string[]) => void };

let cfg: Cfg | null = null;
export const configureOutbox = (c: Cfg) => { cfg = c; };

let ops: Op[] | null = null;
let idmapMem: Record<string, number> | null = null;
onClear(() => { ops = null; idmapMem = null; });

async function load(): Promise<Op[]> {
  if (!ops) ops = (await kvGet<Op[]>('outbox')) ?? [];
  return ops;
}
async function save(): Promise<void> {
  const q = await load();
  await kvSet('outbox', q);
  setPending(q.length, q.find((o) => o.failed)?.failed ?? null);
}
/** Publish the saved queue's size to the UI at start-up. */
export async function initOutbox(): Promise<void> { await save(); }

export async function pendingCount(): Promise<number> { return (await load()).length; }

async function nextSeq(): Promise<number> {
  const n = ((await kvGet<number>('outbox_seq')) ?? 0) + 1;
  await kvSet('outbox_seq', n);
  return n;
}
export async function enqueue(op: Omit<Op, 'seq'>): Promise<void> {
  const q = await load();
  q.push({ ...op, seq: await nextSeq() });
  await save();
}

// ---------- temporary ids for workouts created offline ----------
async function idmap(): Promise<Record<string, number>> {
  if (!idmapMem) idmapMem = (await kvGet<Record<string, number>>('idmap')) ?? {};
  return idmapMem;
}
/** A workout's real server id (or the same id if it never was temporary). */
export async function resolveSessionId(id: number): Promise<number> {
  if (id >= 0) return id;
  return (await idmap())[String(id)] ?? id;
}

const REF = /(^|&)(session_id|id)=(eq|neq)\.(-\d+)(?=&|$)/g;
function remapQuery(table: string, query: string, map: Record<string, number>) {
  let unresolved = false;
  const out = query.replace(REF, (m, amp: string, key: string, op: string, id: string) => {
    if (key === 'id' && table !== 'workout_sessions') return m;
    const real = map[id];
    if (real == null) { unresolved = true; return m; }
    return `${amp}${key}=${op}.${real}`;
  });
  return { query: out, unresolved };
}
function remapBody(body: unknown, map: Record<string, number>) {
  let unresolved = false;
  const fix = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(fix);
    if (o && typeof o === 'object') {
      const r = { ...(o as Row) };
      const v = r.session_id;
      if (typeof v === 'number' && v < 0) { const real = map[String(v)]; if (real == null) unresolved = true; else r.session_id = real; }
      return r;
    }
    return o;
  };
  return { body: fix(body), unresolved };
}

/** Translate a workout's old temporary id in a request URL to its real id (once it has synced). */
export async function remapUrlIds(url: string): Promise<string> {
  const u = new URL(url);
  const table = decodeURIComponent(u.pathname.split('/rest/v1/')[1] ?? '').split('/')[0];
  const r = remapQuery(table, u.search.replace(/^\?/, ''), await idmap());
  return r.query === u.search.replace(/^\?/, '') ? url : `${u.origin}${u.pathname}?${r.query}`;
}

async function learn(temp: number, real: number): Promise<void> {
  const map = await idmap();
  map[String(temp)] = real;
  await kvSet('idmap', map);
  // keep the saved copy consistent until the next full download replaces it
  const sessions = await kvGet<Row[]>('t:workout_sessions');
  if (sessions) await kvSet('t:workout_sessions', sessions.map((r) => (r.id === temp ? { ...r, id: real } : r)));
  for (const t of ['set_logs', 'session_swaps']) {
    const rows = await kvGet<Row[]>(`t:${t}`);
    if (rows) await kvSet(`t:${t}`, rows.map((r) => (r.session_id === temp ? { ...r, session_id: real } : r)));
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('heavy:idmap', { detail: { from: temp, to: real } }));
}

// ---------- sending ----------
export type FlushResult = { sent: number; blocked: 'offline' | 'failed' | 'auth' | null };

async function send(op: Op, token: string, query: string, body: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    return await fetch(`${cfg!.url}/rest/v1/${op.table}${query ? `?${query}` : ''}`, {
      method: op.method,
      signal: ctrl.signal,
      headers: { apikey: cfg!.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(op.prefer ? { Prefer: op.prefer } : {}) },
      body: op.method === 'DELETE' || body == null ? undefined : JSON.stringify(body),
    });
  } finally { clearTimeout(t); }
}

async function run(): Promise<FlushResult> {
  const q = await load();
  let sent = 0;
  if (!q.length) return { sent, blocked: null };
  if (!cfg) return { sent, blocked: 'auth' };
  let token = await cfg.getToken();
  if (!token) return { sent, blocked: 'auth' };
  const touched = new Set<string>();

  while (q.length) {
    const op = q[0];
    if (op.failed) return { sent, blocked: 'failed' };
    const map = await idmap();
    const rq = remapQuery(op.table, op.query, map);
    const rb = remapBody(op.body, map);
    if (rq.unresolved || rb.unresolved) {
      op.failed = 'Belongs to a workout that was never saved to the server';
      await save();
      return { sent, blocked: 'failed' };
    }

    let res: Response;
    try { res = await send(op, token, rq.query, rb.body); } catch { setOnline(false); return { sent, blocked: 'offline' }; }
    if (res.status === 401) { // login expired: refresh it once
      token = (await cfg.getToken()) ?? token;
      try { res = await send(op, token, rq.query, rb.body); } catch { setOnline(false); return { sent, blocked: 'offline' }; }
      if (res.status === 401) return { sent, blocked: 'auth' };
    }
    setOnline(true);

    if (res.ok) {
      if (op.temp != null) {
        const parsed = (await res.json().catch(() => null)) as Row[] | Row | null;
        const row = Array.isArray(parsed) ? parsed[0] : parsed;
        const real = row && typeof row.id === 'number' ? row.id : null;
        if (real == null) { op.failed = 'The server did not return the new workout id'; await save(); return { sent, blocked: 'failed' }; }
        await learn(op.temp, real);
      }
      touched.add(op.table);
      q.shift();
      sent++;
      await save();
      continue;
    }
    if (res.status === 408 || res.status === 429 || res.status >= 500) return { sent, blocked: 'offline' }; // temporary: keep and try later
    const text = await res.text().catch(() => '');
    let msg = text;
    try { msg = (JSON.parse(text) as { message?: string }).message ?? text; } catch { /* keep raw text */ }
    op.failed = `${res.status}: ${msg}`.slice(0, 200);
    await save();
    return { sent, blocked: 'failed' };
  }
  cfg.onDrained?.([...touched]);
  return { sent, blocked: null };
}

let flushing: Promise<FlushResult> | null = null;
/** Send everything waiting, in order. Safe to call any time; concurrent calls share one run. */
export function flush(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    let last: FlushResult;
    for (;;) {
      last = await run();
      if (last.blocked || last.sent === 0 || !(await load()).length) return last;
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function retryFailed(): Promise<void> {
  const q = await load();
  for (const o of q) delete o.failed;
  await save();
  await flush();
}

/** Give up on the change the server rejected (and anything that only made sense with it), then carry on. */
export async function discardFailed(): Promise<void> {
  const q = await load();
  const i = q.findIndex((o) => o.failed);
  if (i < 0) return;
  const dead = new Set<number>();
  const [removed] = q.splice(i, 1);
  if (removed.temp != null) dead.add(removed.temp);
  const refs = (o: Op) => {
    for (const m of o.query.matchAll(REF)) if (dead.has(Number(m[4]))) return true;
    const b = o.body as Row | Row[] | null;
    return (Array.isArray(b) ? b : b ? [b] : []).some((r) => typeof r.session_id === 'number' && dead.has(r.session_id));
  };
  for (let k = q.length - 1; k >= 0; k--) if (refs(q[k])) q.splice(k, 1);
  for (const o of q) delete o.failed;
  if (dead.size) { // remove the never-synced workout from the saved copy too
    const s = await kvGet<Row[]>('t:workout_sessions');
    if (s) await kvSet('t:workout_sessions', s.filter((r) => !dead.has(r.id as number)));
    for (const t of ['set_logs', 'session_swaps']) {
      const rows = await kvGet<Row[]>(`t:${t}`);
      if (rows) await kvSet(`t:${t}`, rows.filter((r) => !dead.has(r.session_id as number)));
    }
  }
  await save();
  await flush();
}
