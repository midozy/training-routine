// Offline layer: one fetch wrapper for the Supabase client.
//  - Reads: from the network; if that fails (no signal / 10 s timeout), or while changes are waiting to be sent,
//    from the copy saved on the phone.
//  - Workouts, sets, swaps and settings: changed on the phone FIRST (instant, works with no signal), then queued in
//    the outbox and sent in the background.
//  - Everything else is unchanged (sign-in, profile, plans, ...): needs a connection for now.
import { runQuery, type Row } from './pgrest';
import { applyWrite, LOCAL_TABLES, parsePrefer, type Method } from './pgwrite';
import { enqueue, flush, pendingCount, remapUrlIds } from './outbox';
import { kvGet, kvSet, setOnline } from './store';

export { TABLES, getState, subscribe, isOnline, setOnline, setLastPull, kvGet, kvSet, clearLocal } from './store';
import { TABLES } from './store';
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

/** Returns null when the first download hasn't happened yet (then the normal online path is used). */
async function localWrite(table: string, method: Method, url: string, init?: RequestInit): Promise<Response | null> {
  const meta = await kvGet<{ userId: string }>('meta');
  const rows = await kvGet<Row[]>(`t:${table}`);
  if (!meta || !rows) return null;

  const u = new URL(url);
  const headers = new Headers(init?.headers);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const params = new URLSearchParams(u.search);
  let query = u.search.replace(/^\?/, '');
  let prefer = headers.get('Prefer');

  // A workout is created as an upsert on a client-made id, so re-sending it can never make a duplicate.
  if (table === 'workout_sessions' && method === 'POST') {
    const items = Array.isArray(body) ? body : [body];
    for (const it of items) if (!it.client_id) it.client_id = uuid();
    params.set('on_conflict', 'client_id');
    prefer = `resolution=merge-duplicates${parsePrefer(prefer).representation ? ',return=representation' : ''}`;
  }

  const out = applyWrite(rows, { table, method, params, body, prefer, accept: headers.get('Accept') }, { userId: meta.userId, now: new Date().toISOString(), newId: tempId });
  if (out.status >= 400) return json(out.status, out.body);
  await kvSet(`t:${table}`, out.rows);

  if (method === 'POST' && out.queuedBody != null) {
    const merge = parsePrefer(prefer).merge;
    const isSession = table === 'workout_sessions';
    await enqueue({
      table, method,
      query: isSession ? 'on_conflict=client_id&select=id,client_id' : query,
      body: out.queuedBody,
      prefer: isSession ? 'resolution=merge-duplicates,return=representation' : `${merge ? 'resolution=merge-duplicates,' : ''}return=minimal`,
      ...(isSession && out.inserted.length ? { temp: out.inserted[0].id as number } : {}),
    });
  } else if (method === 'PATCH') {
    await enqueue({ table, method, query, body: out.queuedBody, prefer: 'return=minimal' });
  } else if (method === 'DELETE') {
    await enqueue({ table, method, query, body: null, prefer: 'return=minimal' });
  }
  void flush(); // send in the background; if there is no signal it simply stays queued
  return json(out.status, out.body);
}

export async function heavyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const isRest = url.includes(REST) && !url.includes(`${REST}rpc/`);
  const isAuth = url.includes('/auth/v1/');
  const isRead = method === 'GET' || method === 'HEAD';

  if (isRest && !isRead && (method === 'POST' || method === 'PATCH' || method === 'DELETE') && LOCAL_TABLES[tableOf(url)]) {
    const local = await localWrite(tableOf(url), method as Method, url, init);
    if (local) return local;
  }
  // While changes are waiting to be sent, the server doesn't have them yet: read from the phone so screens stay consistent.
  if (isRest && isRead && (await pendingCount()) > 0) return emulate(url, new Headers(init?.headers).get('Accept'));

  // A workout that started offline may still be referred to by its temporary id: translate it once it has synced.
  const target = isRest && isRead && /[?&](session_id|id)=(eq|neq)\.-\d/.test(url) ? await remapUrlIds(url) : url;
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
