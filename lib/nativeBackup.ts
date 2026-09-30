// A second copy of the unsent changes, kept in the phone's native storage (iOS UserDefaults via Capacitor Preferences),
// outside the web layer. iOS can clear web storage (IndexedDB) under extreme storage pressure; this copy survives that.
// Only used inside the iOS app. The storage is injectable so it can be tested without a phone.
// Keep the module free of static imports of native packages (they're loaded only when actually needed).

export type BackupAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
export type Snapshot = { userId: string; ops: unknown[]; idmap: unknown; seq: number; at: number };

const KEY = 'heavy.backup.v1';
const MAX_BYTES = 3_000_000; // a backup this large means something is wrong; keep the previous good copy instead

let adapter: BackupAdapter | null | undefined; // undefined = not resolved yet; null = no native storage (web)
export function setBackupAdapter(a: BackupAdapter | null) { adapter = a; }

async function getAdapter(): Promise<BackupAdapter | null> {
  if (adapter !== undefined) return adapter;
  adapter = null;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import('@capacitor/preferences');
      adapter = {
        get: async (key) => (await Preferences.get({ key })).value,
        set: (key, value) => Preferences.set({ key, value }),
        remove: (key) => Preferences.remove({ key }),
      };
    }
  } catch { adapter = null; }
  return adapter;
}

let chain: Promise<void> = Promise.resolve();
/** Save (or, with null, erase) the backup. Writes are queued in order, so an older copy can never overwrite a newer one. */
export function writeBackup(snap: Snapshot | null): Promise<void> {
  const payload = snap ? JSON.stringify(snap) : null; // frozen now, written in order below
  chain = chain.then(async () => {
    const a = await getAdapter();
    if (!a) return;
    try {
      if (payload === null) await a.remove(KEY);
      else if (payload.length <= MAX_BYTES) await a.set(KEY, payload);
    } catch { /* a failed backup must never break the app */ }
  });
  return chain;
}

export async function readBackup(): Promise<Snapshot | null> {
  const a = await getAdapter();
  if (!a) return null;
  try {
    const v = await a.get(KEY);
    return v ? (JSON.parse(v) as Snapshot) : null;
  } catch { return null; }
}
