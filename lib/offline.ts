// Offline foundation (Phase 1): a copy of your data saved on the phone, one fetch wrapper that answers reads from it
// when there is no signal, and the online/offline status the UI shows. Writes are not saved offline yet (Phase 2).
import { runQuery, type Row } from './pgrest';

export const TABLES = [
  'plans', 'plan_days', 'plan_exercises', 'exercises', 'workout_sessions', 'set_logs', 'session_swaps',
  'user_settings', 'profiles', 'bodyweight_logs', 'measurements', 'health_samples',
] as const;
const KNOWN = new Set<string>(TABLES);

// ---------- status (read by the UI via useSyncExternalStore) ----------
export type OfflineState = { online: boolean; lastPull: number | null };
let state: OfflineState = { online: true, lastPull: null };
const subs = new Set<() => void>();
export const getState = () => state;
export const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
function set(p: Partial<OfflineState>) {
  const next = { ...state, ...p };
  if (next.online === state.online && next.lastPull === state.lastPull) return;
  state = next;
  subs.forEach((f) => f());
}
export const isOnline = () => state.online;
export const setOnline = (online: boolean) => set({ online });
export const setLastPull = (lastPull: number | null) => set({ lastPull });

// ---------- storage: IndexedDB key-value (+ in-memory copy) ----------
const DB_NAME = 'heavy-local';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;
const mem = new Map<string, unknown>();

function idb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const db = await idb();
    const v = await new Promise<T | undefined>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result as T | undefined);
      r.onerror = () => rej(r.error);
    });
    if (v !== undefined) mem.set(key, v);
    return v;
  } catch { return undefined; }
}

export async function kvSet(key: string, val: unknown): Promise<void> {
  mem.set(key, val);
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* storage unavailable: the in-memory copy still works this session */ }
}

/** Wipe everything saved on the phone (sign-out / different account). */
export async function clearLocal(): Promise<void> {
  mem.clear();
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* ignore */ }
  set({ lastPull: null });
}

// ---------- the fetch wrapper passed to the Supabase client ----------
const REST = '/rest/v1/';
let writeHook: ((table: string) => void) | null = null;
/** Called after a successful online write to a table, so the saved copy can be refreshed. */
export const onRestWrite = (fn: (table: string) => void) => { writeHook = fn; };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function timed(input: RequestInfo | URL, init: RequestInit | undefined, ms: number): Promise<Response> {
  if (!ms) return fetch(input, init);
  const ctrl = new AbortController();
  const outer = init?.signal;
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', () => ctrl.abort(), { once: true }); }
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(input, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

async function emulate(url: string, accept: string | null): Promise<Response> {
  const u = new URL(url);
  const table = decodeURIComponent(u.pathname.split(REST)[1] ?? '').split('/')[0];
  if (!KNOWN.has(table)) return json(503, { code: 'OFFLINE', message: "You're offline." });
  const rows = await kvGet<Row[]>(`t:${table}`);
  if (!rows) return json(503, { code: 'OFFLINE', message: "You're offline and this hasn't been saved on this phone yet. Open the app once with a connection." });
  const { status, body } = runQuery(rows, u.searchParams, accept);
  const range: Record<string, string> = status === 200 && Array.isArray(body) ? { 'Content-Range': body.length ? `0-${body.length - 1}/*` : '*/0' } : {};
  return json(status, body, range);
}

const offlineWrite = () => json(503, { code: 'OFFLINE', message: "You're offline. Saving changes offline isn't available yet." });

export async function heavyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const isRest = url.includes(REST) && !url.includes(`${REST}rpc/`);
  const isAuth = url.includes('/auth/v1/');
  try {
    const res = await timed(input, init, isRest || isAuth ? 10_000 : 0);
    setOnline(true);
    if (isRest && method !== 'GET' && method !== 'HEAD' && res.ok) {
      const table = decodeURIComponent(new URL(url).pathname.split(REST)[1] ?? '').split('/')[0];
      if (KNOWN.has(table)) writeHook?.(table);
    }
    return res;
  } catch (e) {
    if (init?.signal?.aborted) throw e; // the caller cancelled on purpose: not a connectivity problem
    setOnline(false);
    if (isRest && (method === 'GET' || method === 'HEAD')) return emulate(url, new Headers(init?.headers).get('Accept'));
    if (isRest) return offlineWrite();
    throw e;
  }
}
