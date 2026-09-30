// The outbox: changes made on the phone (offline or not) wait here until the server has confirmed them.
// Nothing is removed until the server says OK. Sending is in order, one at a time, and safe to repeat:
// upserts/deletes/updates are idempotent, and every row created offline (workouts, plans, days, plan exercises, custom
// exercises) is sent as an upsert on its client_id, so a retry after a lost reply can never create a second copy.
import { kvGet, kvSet, setOnline, setPending, onClear, TABLES } from './store';
import { FK_PARENT, ID_TABLES, CASCADE_TABLES, REFS, purgeDead } from './cascade';
import type { Row } from './pgrest';

export type Op = {
  seq: number;
  table: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  query: string;
  body: unknown;
  prefer: string | null;
  temps?: Record<string, number>; // rows created by this op: client_id -> temporary local id (negative)
  temp?: number;                  // Phase 2 format (workouts only); converted to `temps` when loaded
  failed?: string;                // set when the server rejected this change; the queue waits for retry/discard
};
type Cfg = { url: string; key: string; getToken: () => Promise<string | null>; onDrained?: (tables: string[]) => void };

let cfg: Cfg | null = null;
export const configureOutbox = (c: Cfg) => { cfg = c; };

let ops: Op[] | null = null;
type IdMap = Record<string, Record<string, number>>; // table -> temporary id -> real id
let idmapMem: IdMap | null = null;
onClear(() => { ops = null; idmapMem = null; });

async function load(): Promise<Op[]> {
  if (!ops) {
    ops = (await kvGet<Op[]>('outbox')) ?? [];
    for (const o of ops) { // upgrade changes queued by the Phase 2 build
      if (o.temp != null && !o.temps) {
        const first = (Array.isArray(o.body) ? o.body[0] : o.body) as Row | null;
        if (first && typeof first.client_id === 'string') o.temps = { [first.client_id]: o.temp };
        delete o.temp;
      }
    }
  }
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
/** Add changes to the queue. Several at once are saved together (all or nothing). */
export async function enqueueMany(list: Array<Omit<Op, 'seq'>>): Promise<void> {
  const q = await load();
  for (const op of list) q.push({ ...op, seq: await nextSeq() });
  await save();
}
export const enqueue = (op: Omit<Op, 'seq'>) => enqueueMany([op]);

// ---------- temporary ids for rows created offline ----------
export async function idMap(): Promise<IdMap> {
  if (!idmapMem) {
    const raw = (await kvGet<Record<string, unknown>>('idmap')) ?? {};
    // Phase 2 stored a flat { temporaryId: realId } map for workouts
    idmapMem = Object.values(raw).some((v) => typeof v === 'number') ? { workout_sessions: raw as Record<string, number> } : (raw as IdMap);
  }
  return idmapMem;
}
/** A row's real server id (or the same id if it never was temporary). */
export async function resolveId(table: string, id: number): Promise<number> {
  if (id >= 0) return id;
  return (await idMap())[table]?.[String(id)] ?? id;
}
export const resolveSessionId = (id: number) => resolveId('workout_sessions', id);

const parentOf = (table: string, col: string): string | null => (col === 'id' ? (ID_TABLES.has(table) ? table : null) : FK_PARENT[col] ?? null);

/** Translate temporary ids in a query string (eq / neq / in filters on `id` and on foreign-key columns). */
export function remapQueryStr(table: string, query: string, map: IdMap): { query: string; unresolved: boolean; changed: boolean } {
  if (!query) return { query, unresolved: false, changed: false };
  let unresolved = false;
  let changed = false;
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(query)) {
    const parent = parentOf(table, k);
    const m = parent ? /^(not\.)?(eq|neq|in)\.(.+)$/.exec(v) : null;
    if (!parent || !m) { out.append(k, v); continue; }
    const conv = (s: string) => {
      const real = map[parent]?.[s];
      if (real == null) { unresolved = true; return s; }
      changed = true;
      return String(real);
    };
    out.append(k, `${m[1] ?? ''}${m[2]}.${m[3].replace(/-\d+/g, conv)}`);
  }
  return { query: changed ? out.toString() : query, unresolved, changed };
}

/** Translate temporary ids held in foreign-key columns of a request body. */
export function remapBody(body: unknown, map: IdMap): { body: unknown; unresolved: boolean; changed: boolean } {
  let unresolved = false;
  let changed = false;
  const fix = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(fix);
    if (o && typeof o === 'object') {
      const r = { ...(o as Row) };
      for (const col of Object.keys(FK_PARENT)) {
        const v = r[col];
        if (typeof v === 'number' && v < 0) {
          const real = map[FK_PARENT[col]]?.[String(v)];
          if (real == null) unresolved = true; else { r[col] = real; changed = true; }
        }
      }
      return r;
    }
    return o;
  };
  return { body: fix(body), unresolved, changed };
}

/** Translate a request URL's temporary ids to real ones (once they have synced). */
export async function remapUrlIds(url: string): Promise<string> {
  const u = new URL(url);
  const table = decodeURIComponent(u.pathname.split('/rest/v1/')[1] ?? '').split('/')[0];
  const r = remapQueryStr(table, u.search.replace(/^\?/, ''), await idMap());
  return r.changed ? `${u.origin}${u.pathname}?${r.query}` : url;
}

async function learn(table: string, temp: number, real: number): Promise<void> {
  const map = await idMap();
  (map[table] ??= {})[String(temp)] = real;
  await kvSet('idmap', map);
  // keep the saved copy consistent until the next full download replaces it
  for (const t of TABLES) {
    const rows = await kvGet<Row[]>(`t:${t}`);
    if (!rows) continue;
    let dirty = false;
    const next = rows.map((r) => {
      let c = r;
      if (t === table && r.id === temp) { c = { ...c, id: real }; }
      for (const [col, parent] of Object.entries(FK_PARENT)) {
        if (parent === table && r[col] === temp) { if (c === r) c = { ...r }; c[col] = real; }
      }
      if (c !== r) dirty = true;
      return c;
    });
    if (dirty) await kvSet(`t:${t}`, next);
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('heavy:idmap', { detail: { table, from: temp, to: real } }));
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
    const map = await idMap();
    const rq = remapQueryStr(op.table, op.query, map);
    const rb = remapBody(op.body, map);
    if (rq.unresolved || rb.unresolved) {
      op.failed = 'Belongs to something that was never saved to the server';
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
      if (op.temps && Object.keys(op.temps).length) {
        const parsed = (await res.json().catch(() => null)) as Row[] | Row | null;
        const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        const learned: Array<[number, number]> = [];
        for (const r of rows) {
          const temp = typeof r.client_id === 'string' ? op.temps[r.client_id] : undefined;
          if (temp != null && typeof r.id === 'number') learned.push([temp, r.id]);
        }
        if (learned.length !== Object.keys(op.temps).length) { op.failed = 'The server did not return the new ids'; await save(); return { sent, blocked: 'failed' }; }
        for (const [temp, real] of learned) await learn(op.table, temp, real);
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

/**
 * What discarding a dead row (created offline, then refused by the server) means for a later change:
 *  - 'drop': it only makes sense with that row (edits to it, children of it): remove it;
 *  - 'cleared': it merely pointed at it where the database would say "set null" (a workout's plan day, a logged set's
 *    exercise slot, the active plan): keep it, so your training log is never lost, and clear the dead link;
 *  - 'keep': not affected.
 */
function reviewOp(op: Op, dead: Set<string>): 'drop' | 'cleared' | 'keep' {
  for (const [k, v] of new URLSearchParams(op.query)) {
    const parent = parentOf(op.table, k);
    if (!parent) continue;
    for (const m of v.matchAll(/-\d+/g)) if (dead.has(`${parent}:${m[0]}`)) return 'drop';
  }
  let drop = false;
  let cleared = false;
  const fix = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(fix);
    if (o && typeof o === 'object') {
      const r = { ...(o as Row) };
      for (const col of Object.keys(FK_PARENT)) {
        const v = r[col];
        if (typeof v !== 'number' || v >= 0 || !dead.has(`${FK_PARENT[col]}:${v}`)) continue;
        if (REFS.find((x) => x.table === op.table && x.col === col)?.onDelete === 'null') { r[col] = null; cleared = true; } else drop = true;
      }
      return r;
    }
    return o;
  };
  const body = fix(op.body);
  if (drop) return 'drop';
  if (cleared) { op.body = body; return 'cleared'; }
  return 'keep';
}

/** Give up on the change the server rejected (and anything that only made sense with it), then carry on. */
export async function discardFailed(): Promise<void> {
  const q = await load();
  const i = q.findIndex((o) => o.failed);
  if (i < 0) return;
  const dead = new Set<string>();
  const [removed] = q.splice(i, 1);
  for (const t of Object.values(removed.temps ?? {})) dead.add(`${removed.table}:${t}`);
  for (let again = true; again;) { // repeat until nothing else depends on something that will never exist
    again = false;
    for (let k = q.length - 1; k >= 0; k--) {
      if (reviewOp(q[k], dead) === 'drop') {
        for (const t of Object.values(q[k].temps ?? {})) dead.add(`${q[k].table}:${t}`);
        q.splice(k, 1);
        again = true;
      }
    }
  }
  for (const o of q) delete o.failed;
  if (dead.size) { // remove the never-synced rows (and their dependents) from the saved copy too
    const db: Record<string, Row[]> = {};
    for (const t of new Set<string>([...CASCADE_TABLES, ...TABLES])) { const rows = await kvGet<Row[]>(`t:${t}`); if (rows) db[t] = rows.map((r) => ({ ...r })); }
    for (const t of purgeDead(db, dead)) await kvSet(`t:${t}`, db[t]);
  }
  await save();
  await flush();
}
