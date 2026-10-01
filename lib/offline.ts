// Offline layer: one fetch wrapper for the Supabase client.
//  - Reads: from the network; if that fails (no signal / 10 s timeout), or while changes are waiting to be sent,
//    from the copy saved on the phone.
//  - Changes to workouts, plans, exercises, body weight, measurements, profile, Health data and settings are made on
//    the phone FIRST (instant, works with no signal), then queued in the outbox and sent in the background.
//    Duplicate / Reset plan are reproduced on the phone too.
//  - Everything else (sign-in, account deletion, avatar upload) needs a connection.
import { applyFilters, runQuery, type Row } from './pgrest';
import { applyWrite, LOCAL_TABLES, parsePrefer, type Method } from './pgwrite';
import { ID_TABLES, CASCADE_TABLES, cascade } from './cascade';
import { enqueueMany, flush, idMap, pendingCount, remapBody, remapQueryStr, remapUrlIds, resolveId } from './outbox';
import { kvGet, kvSet, setOnline, TABLES } from './store';

export { TABLES, getState, subscribe, isOnline, setOnline, setLastPull, kvGet, kvSet, clearLocal } from './store';
const KNOWN = new Set<string>(TABLES);

const REST = '/rest/v1/';
let writeHook: ((table: string) => void) | null = null;
/** Called after a successful online write to a table that isn't handled locally, so the saved copy can be refreshed. */
export const onRestWrite = (fn: (table: string) => void) => { writeHook = fn; };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  status === 204 || body === null
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function timed(input: RequestInfo | URL, init: RequestInit | undefined, ms: number): Promise<Response> {
  if (!ms) return fetch(input, init);
  const ctrl = new AbortController();
  const outer = init?.signal;
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', () => ctrl.abort(), { once: true }); }
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(input, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

const tableOf = (url: string) => decodeURIComponent(new URL(url).pathname.split(REST)[1] ?? '').split('/')[0];

async function emulate(url: string, accept: string | null): Promise<Response> {
  const table = tableOf(url);
  if (!KNOWN.has(table)) return json(503, { code: 'OFFLINE', message: "You're offline." });
  const rows = await kvGet<Row[]>(`t:${table}`);
  if (!rows) return json(503, { code: 'OFFLINE', message: "You're offline and this hasn't been saved on this phone yet. Open the app once with a connection." });
  const { status, body } = runQuery(rows, new URL(url).searchParams, accept);
  const range: Record<string, string> = status === 200 && Array.isArray(body) ? { 'Content-Range': body.length ? `0-${body.length - 1}/*` : '*/0' } : {};
  return json(status, body, range);
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });

let tempCounter = 0;
/** Temporary local ids are negative, so they can never collide with a real (positive) server id. */
const tempId = () => -(Date.now() * 1000 + (tempCounter++ % 1000));

/** After rows were deleted from `table`, apply the database's ON DELETE rules to the other saved tables. */
async function applyCascade(table: string, tableRows: Row[], removed: Row[]): Promise<void> {
  const db: Record<string, Row[]> = { [table]: tableRows };
  for (const t of CASCADE_TABLES) {
    if (t === table) continue;
    const rows = await kvGet<Row[]>(`t:${t}`);
    if (rows) db[t] = rows.map((r) => ({ ...r }));
  }
  for (const t of cascade(db, table, removed)) await kvSet(`t:${t}`, db[t]);
}

/** Tables without a client_id: a row created offline has only a temporary id, so later edits/deletes are sent by date instead. */
const NATURAL_KEY: Record<string, string[]> = { bodyweight_logs: ['logged_on'], measurements: ['logged_on'] };

const CREATE_QUERY = 'on_conflict=client_id&select=id,client_id';
const CREATE_PREFER = 'resolution=merge-duplicates,return=representation';

/** Returns null when the first download hasn't happened yet (then the normal online path is used). */
async function localWrite(table: string, method: Method, url: string, init?: RequestInit): Promise<Response | null> {
  const meta = await kvGet<{ userId: string }>('meta');
  const rows = await kvGet<Row[]>(`t:${table}`);
  if (!meta || !rows) return null;

  const u = new URL(url);
  const headers = new Headers(init?.headers);
  // Ids that have already synced are translated first, so a screen still holding a temporary id keeps working.
  const map = await idMap();
  const rq = remapQueryStr(table, u.search.replace(/^\?/, ''), map);
  const rb = remapBody(init?.body ? JSON.parse(String(init.body)) : null, map);
  const body = rb.body as Row | Row[] | null;
  const query = rq.query;
  const params = new URLSearchParams(query);
  let prefer = headers.get('Prefer');

  // Rows created here are sent as upserts on a client-made id, so re-sending can never make a duplicate.
  const isCreate = method === 'POST' && ID_TABLES.has(table);
  if (isCreate) {
    for (const it of Array.isArray(body) ? body : [body]) if (it && !it.client_id) it.client_id = uuid();
    params.set('on_conflict', 'client_id');
    prefer = `resolution=merge-duplicates${parsePrefer(prefer).representation ? ',return=representation' : ''}`;
  }

  const affectedBefore = method === 'PATCH' && NATURAL_KEY[table] ? applyFilters(rows, params) ?? [] : [];
  const out = applyWrite(rows, { table, method, params, body, prefer, accept: headers.get('Accept') }, { userId: meta.userId, now: new Date().toISOString(), newId: tempId });
  if (out.status >= 400) return json(out.status, out.body);
  await kvSet(`t:${table}`, out.rows);
  if (method === 'DELETE' && out.removed.length) await applyCascade(table, out.rows, out.removed);

  if (method === 'POST' && out.queuedBody != null) {
    const merge = parsePrefer(prefer).merge;
    const temps = isCreate ? Object.fromEntries(out.inserted.map((r) => [r.client_id as string, r.id as number])) : undefined;
    await enqueueMany([{
      table, method,
      query: isCreate ? CREATE_QUERY : u.search.replace(/^\?/, ''),
      body: out.queuedBody,
      prefer: isCreate ? CREATE_PREFER : `${merge ? 'resolution=merge-duplicates,' : ''}return=minimal`,
      ...(temps && Object.keys(temps).length ? { temps } : {}),
    }]);
  } else if (method === 'PATCH' || method === 'DELETE') {
    const nk = NATURAL_KEY[table];
    const affected = method === 'DELETE' ? out.removed : affectedBefore;
    const queries = nk
      ? affected.map((r) => (typeof r.id === 'number' && r.id < 0 ? nk.map((c) => `${c}=eq.${encodeURIComponent(String(r[c]))}`).join('&') : `id=eq.${r.id}`))
      : [query];
    await enqueueMany(queries.map((q) => ({ table, method, query: q, body: method === 'PATCH' ? out.queuedBody : null, prefer: 'return=minimal' })));
  }
  void flush(); // send in the background; if there is no signal it simply stays queued
  return json(out.status, out.body);
}

// ---------- "Duplicate plan" and "Reset plan" (the server functions, reproduced on the phone) ----------
type Copies = { dayRows: Row[]; dayItems: Row[]; dayTemps: Record<string, number>; exRows: Row[]; exItems: Row[]; exTemps: Record<string, number> };

/** Copies of a plan's days and exercises, as saved-copy rows (with temporary ids) and as rows to send later. */
function copyContents(days: Row[], exs: Row[], srcId: number, dstId: number): Copies {
  const c: Copies = { dayRows: [], dayItems: [], dayTemps: {}, exRows: [], exItems: [], exTemps: {} };
  const byPos = (a: Row, b: Row) => (a.position as number) - (b.position as number);
  for (const d of days.filter((x) => x.plan_id === srcId).sort(byPos)) {
    const id = tempId();
    const cid = uuid();
    const base = { plan_id: dstId, position: d.position, name: d.name, is_rest: d.is_rest };
    c.dayRows.push({ id, ...base, client_id: cid });
    c.dayItems.push({ ...base, client_id: cid });
    c.dayTemps[cid] = id;
    for (const e of exs.filter((x) => x.plan_day_id === d.id).sort(byPos)) {
      const eid = tempId();
      const ecid = uuid();
      const eb = { plan_day_id: id, position: e.position, exercise_id: e.exercise_id, label: e.label, target_reps: e.target_reps, unit: e.unit, cue: e.cue ?? null, rest_seconds: e.rest_seconds, superset_group: e.superset_group ?? null };
      c.exRows.push({ id: eid, ...eb, client_id: ecid });
      c.exItems.push({ ...eb, client_id: ecid });
      c.exTemps[ecid] = eid;
    }
  }
  return c;
}

const creates = (c: Copies) => [
  ...(c.dayItems.length ? [{ table: 'plan_days', method: 'POST' as const, query: CREATE_QUERY, body: c.dayItems, prefer: CREATE_PREFER, temps: c.dayTemps }] : []),
  ...(c.exItems.length ? [{ table: 'plan_exercises', method: 'POST' as const, query: CREATE_QUERY, body: c.exItems, prefer: CREATE_PREFER, temps: c.exTemps }] : []),
];
const rpcError = (message: string) => json(400, { code: 'P0001', message, details: null, hint: null });

async function localRpc(name: string, init?: RequestInit): Promise<Response | null> {
  if (name !== 'duplicate_plan' && name !== 'reset_plan') return null;
  const meta = await kvGet<{ userId: string }>('meta');
  const plans = await kvGet<Row[]>('t:plans');
  const days = await kvGet<Row[]>('t:plan_days');
  const exs = await kvGet<Row[]>('t:plan_exercises');
  if (!meta || !plans || !days || !exs) return null;
  const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

  if (name === 'duplicate_plan') {
    const srcId = await resolveId('plans', Number(args.src));
    const s = plans.find((p) => p.id === srcId);
    if (!s) return rpcError('Plan not found');
    const asArchive = args.as_archive === true;
    const planId = tempId();
    const pcid = uuid();
    const item = { name: String(args.new_name), description: s.description ?? null, owner_id: meta.userId, archived: asArchive, source_plan_id: asArchive ? null : srcId, client_id: pcid, created_at: new Date().toISOString() };
    const c = copyContents(days, exs, srcId, planId);
    await kvSet('t:plans', [...plans, { id: planId, slug: null, ...item }]);
    await kvSet('t:plan_days', [...days, ...c.dayRows]);
    await kvSet('t:plan_exercises', [...exs, ...c.exRows]);
    await enqueueMany([{ table: 'plans', method: 'POST', query: CREATE_QUERY, body: item, prefer: CREATE_PREFER, temps: { [pcid]: planId } }, ...creates(c)]);
    void flush();
    return json(200, planId);
  }

  // reset_plan
  const pId = await resolveId('plans', Number(args.p));
  const plan = plans.find((p) => p.id === pId && p.owner_id === meta.userId);
  const srcId = plan?.source_plan_id as number | null | undefined;
  if (!srcId) return rpcError('This plan has no original to reset to');
  const oldDays = days.filter((d) => d.plan_id === pId);
  const keptDays = days.filter((d) => d.plan_id !== pId);
  await kvSet('t:plan_days', keptDays);
  await applyCascade('plan_days', keptDays, oldDays); // its exercises go, logged sets/swaps/workouts are detached, like the server
  const c = copyContents(days, (await kvGet<Row[]>('t:plan_exercises')) ?? exs, srcId, pId);
  await kvSet('t:plan_days', [...keptDays, ...c.dayRows]);
  await kvSet('t:plan_exercises', [...((await kvGet<Row[]>('t:plan_exercises')) ?? []), ...c.exRows]);
  await enqueueMany([{ table: 'plan_days', method: 'DELETE', query: `plan_id=eq.${pId}`, body: null, prefer: 'return=minimal' }, ...creates(c)]);
  void flush();
  return json(204, null);
}

export async function heavyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const isRpc = url.includes(`${REST}rpc/`);
  const isRest = url.includes(REST) && !isRpc;
  const isAuth = url.includes('/auth/v1/');
  const isRead = method === 'GET' || method === 'HEAD';

  if (isRpc && method === 'POST') {
    const local = await localRpc(url.split('/rpc/')[1].split('?')[0], init);
    if (local) return local;
  }
  if (isRest && (method === 'POST' || method === 'PATCH' || method === 'DELETE') && LOCAL_TABLES[tableOf(url)]) {
    const local = await localWrite(tableOf(url), method as Method, url, init);
    if (local) return local;
  }
  // While changes are waiting to be sent, the server doesn't have them yet: read from the phone so screens stay consistent.
  if (isRest && isRead && (await pendingCount()) > 0) return emulate(url, new Headers(init?.headers).get('Accept'));

  // A row that was created offline may still be referred to by its temporary id: translate it once it has synced.
  const target = isRest && isRead && /(?:\.|%28|\(|,|%2C)-\d/.test(url) ? await remapUrlIds(url) : url;
  try {
    const res = await timed(target === url ? input : target, init, isRest || isAuth ? 10_000 : 0);
    setOnline(true);
    if (isRest && !isRead && res.ok) {
      const table = tableOf(url);
      if (KNOWN.has(table)) writeHook?.(table);
    }
    return res;
  } catch (e) {
    if (init?.signal?.aborted) throw e; // the caller cancelled on purpose: not a connectivity problem
    setOnline(false);
    if (isRest && isRead) return emulate(url, new Headers(init?.headers).get('Accept'));
    if (isRest) return json(503, { code: 'OFFLINE', message: "You're offline. This change needs a connection for now." });
    throw e;
  }
}
