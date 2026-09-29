// Status + storage shared by the offline layers (kept free of network code so every layer can import it).
export const TABLES = [
  'plans', 'plan_days', 'plan_exercises', 'exercises', 'workout_sessions', 'set_logs', 'session_swaps',
  'user_settings', 'profiles', 'bodyweight_logs', 'measurements', 'health_samples',
] as const;

// ---------- status (read by the UI via useSyncExternalStore) ----------
export type OfflineState = { online: boolean; lastPull: number | null; pending: number; failed: string | null };
let state: OfflineState = { online: true, lastPull: null, pending: 0, failed: null };
const subs = new Set<() => void>();
export const getState = () => state;
export const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
function set(p: Partial<OfflineState>) {
  const next = { ...state, ...p };
  if (next.online === state.online && next.lastPull === state.lastPull && next.pending === state.pending && next.failed === state.failed) return;
  state = next;
  subs.forEach((f) => f());
}
export const isOnline = () => state.online;
export const setOnline = (online: boolean) => set({ online });
export const setLastPull = (lastPull: number | null) => set({ lastPull });
export const setPending = (pending: number, failed: string | null) => set({ pending, failed });

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

const clearHooks: Array<() => void> = [];
export const onClear = (fn: () => void) => { clearHooks.push(fn); };

/** Wipe everything saved on the phone (sign-out / different account), including any unsent changes. */
export async function clearLocal(): Promise<void> {
  mem.clear();
  clearHooks.forEach((f) => f());
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* ignore */ }
  set({ lastPull: null, pending: 0, failed: null });
}
