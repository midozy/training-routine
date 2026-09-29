// Keeps the copy on the phone fresh: downloads every table whenever the app is online (open, return to foreground,
// reconnect) and refreshes a table right after you change it. Uses plain fetch on purpose, so a failed download can
// never be mistaken for "served from the saved copy".
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';
import { TABLES, kvGet, kvSet, clearLocal, onRestWrite, setLastPull, setOnline } from './offline';
import type { Row } from './pgrest';

const NO_ID = new Set(['user_settings', 'profiles', 'session_swaps']); // tables without a single `id` key (all are small)

async function fetchTable(table: string, token: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const order = NO_ID.has(table) ? '' : '&order=id.asc';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${order}&limit=1000&offset=${off}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`download ${table}: ${res.status}`);
      const rows = (await res.json()) as Row[];
      out.push(...rows);
      if (rows.length < 1000) break;
    } finally { clearTimeout(t); }
  }
  return out;
}

let running: Promise<void> | null = null;
let lastRun = 0;

/** Download everything into the copy on the phone. Skips if one ran in the last 20 s unless forced. */
export function pullAll(force = false): Promise<void> {
  if (running) return running;
  if (!force && Date.now() - lastRun < 20_000) return Promise.resolve();
  running = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!s) return;
      const meta = await kvGet<{ userId: string; lastPull: number }>('meta');
      if (meta && meta.userId !== s.user.id) await clearLocal(); // never mix two accounts on one phone
      for (const t of TABLES) await kvSet(`t:${t}`, await fetchTable(t, s.access_token));
      const lastPull = Date.now();
      await kvSet('meta', { userId: s.user.id, lastPull });
      setLastPull(lastPull);
      setOnline(true);
      lastRun = lastPull;
    } catch (e) {
      if (e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError')) setOnline(false);
      // otherwise: transient error, keep the copy we already have
    } finally { running = null; }
  })();
  return running;
}

// Refresh just the table you changed, shortly after the change succeeded.
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
async function flushDirty() {
  const tables = [...dirty]; dirty.clear();
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    for (const t of tables) await kvSet(`t:${t}`, await fetchTable(t, data.session.access_token));
  } catch { /* the next full download will catch up */ }
}

let started = false;
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { void pullAll(true); });
  window.addEventListener('offline', () => setOnline(false));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void pullAll(); });
  onRestWrite((table) => { dirty.add(table); clearTimeout(timer); timer = setTimeout(flushDirty, 1500); });
  void kvGet<{ lastPull: number }>('meta').then((m) => { if (m) setLastPull(m.lastPull); });
}
