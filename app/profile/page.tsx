'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHead, SectionLabel } from '@/components/Shell';
import { usePrefs } from '@/lib/prefs';
import { notifyStatus, requestNotify, isNative, restAlertsEnabled, setRestAlertsEnabled } from '@/lib/native';
import { connectHealth, disconnectHealth, getHealthPrefs, healthAvailable, setWriteWorkouts, syncHealth, type HealthPrefs, type SyncResult } from '@/lib/health';
import { supabase, fetchAll, epley, type Profile } from '@/lib/supabase';

const GOALS = [
  { v: 'bulk', label: 'Bulk' }, { v: 'cut', label: 'Cut' }, { v: 'maintain', label: 'Maintain' }, { v: 'recomp', label: 'Recomp' },
] as const;
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const yearsSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 864e5));
const weekKey = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x.getTime(); };

type Stats = { workouts: number; month: number; streak: number; volumeKg: number; sets: number;
  prs: { name: string; e1rm: number; weight: number; reps: number; date: string }[];
  bwFirst: number | null; bwLast: number | null; bfLast: number | null };

export default function ProfilePage() {
  const router = useRouter();
  const { settings, save, fw, w, toKg, units } = usePrefs();
  const [profile, setProfile] = useState<Partial<Profile> | null>(null);
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [tw, setTw] = useState(''); // target weight as typed, in the user's unit
  const [stats, setStats] = useState<Stats | null>(null);
  const [notif, setNotif] = useState<'granted' | 'denied' | 'prompt' | 'web'>('web');
  const [uploading, setUploading] = useState(false);
  const [alertsOn, setAlertsOn] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: p }] = await Promise.all([supabase.auth.getUser(), supabase.from('profiles').select('*').maybeSingle()]);
      setEmail(u.user?.email ?? '');
      setProfile(p ?? {});
      if (p?.avatar_path) {
        const { data } = await supabase.storage.from('avatars').createSignedUrl(p.avatar_path, 3600);
        setAvatar(data?.signedUrl ?? null);
      }
      setNotif(await notifyStatus());
      setAlertsOn(restAlertsEnabled());
      loadStats();
    })();
  }, []);

  async function loadStats() {
    const [sessions, sets, exs, { data: bw }, { data: bf }] = await Promise.all([
      fetchAll<{ id: number; started_at: string; finished_at: string | null }>((a, b) => supabase.from('workout_sessions').select('id, started_at, finished_at').range(a, b)),
      fetchAll<{ exercise_id: number; weight_kg: number; reps: number; logged_at: string }>((a, b) => supabase.from('set_logs').select('exercise_id, weight_kg, reps, logged_at').order('id').range(a, b)),
      supabase.from('exercises').select('id, name').then((r) => r.data ?? []),
      supabase.from('bodyweight_logs').select('weight_kg, logged_on').order('logged_on'),
      supabase.from('measurements').select('body_fat_pct, logged_on').not('body_fat_pct', 'is', null).order('logged_on', { ascending: false }).limit(1),
    ]);
    const { data: hbf } = await supabase.from('health_samples').select('value, day').eq('kind', 'body_fat').order('day', { ascending: false }).order('end_at', { ascending: false }).limit(1);
    const bfM = bf?.[0], bfH = hbf?.[0];
    const bfLatest = bfH && (!bfM || bfH.day >= bfM.logged_on) ? Number(bfH.value) : bfM?.body_fat_pct != null ? Number(bfM.body_fat_pct) : null;
    const done = sessions.filter((s) => s.finished_at);
    const now = new Date();
    const month = done.filter((s) => { const d = new Date(s.started_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    // Streak = consecutive weeks (Sat–Fri) with at least one workout; this week counts if it already has one.
    const weeks = new Set(done.map((s) => weekKey(new Date(s.started_at))));
    let streak = 0; let k = weekKey(now);
    if (!weeks.has(k)) k -= 7 * 864e5;
    while (weeks.has(k)) { streak++; k -= 7 * 864e5; }
    const names = new Map(exs.map((e) => [e.id, e.name]));
    const best = new Map<number, Stats['prs'][number]>();
    let vol = 0;
    for (const s of sets) {
      const wkg = Number(s.weight_kg); vol += wkg * s.reps;
      const e = epley(wkg, s.reps);
      const cur = best.get(s.exercise_id);
      if (wkg > 0 && (!cur || e > cur.e1rm)) best.set(s.exercise_id, { name: names.get(s.exercise_id) ?? '—', e1rm: e, weight: wkg, reps: s.reps, date: s.logged_at });
    }
    setStats({
      workouts: done.length, month, streak, volumeKg: vol, sets: sets.length,
      prs: [...best.values()].sort((a, b) => b.e1rm - a.e1rm).slice(0, 6),
      bwFirst: bw?.length ? Number(bw[0].weight_kg) : null, bwLast: bw?.length ? Number(bw.at(-1)!.weight_kg) : null,
      bfLast: bfLatest,
    });
  }

  async function saveProfile(patch: Partial<Profile>) {
    const next = { ...profile, ...patch };
    setProfile(next);
    const { user_id: _u, ...rest } = next as Profile; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { error } = await supabase.from('profiles').upsert({ ...rest, updated_at: new Date().toISOString() });
    if (error) alert(error.message);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const blob = await squareJpeg(file, 512);
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      if (profile?.avatar_path) await supabase.storage.from('avatars').remove([profile.avatar_path]);
      await saveProfile({ avatar_path: path });
      const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
      setAvatar(data?.signedUrl ?? null);
    } catch (err) { alert((err as Error).message); }
    setUploading(false);
    e.target.value = '';
  }

  function openEdit() {
    setDraft(profile ?? {});
    setTw(profile?.target_weight_kg != null ? fw(Number(profile.target_weight_kg)) : '');
    setEditing(true);
  }

  async function deleteAccount() {
    if (!confirm('Delete your account? This permanently erases every workout, set, bodyweight entry, measurement and your profile.')) return;
    if (prompt('Type DELETE to confirm') !== 'DELETE') return;
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return alert(error.message);
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const age = profile?.birth_date ? yearsSince(profile.birth_date) : null;
  const goalLabel = GOALS.find((g) => g.v === profile?.goal)?.label;
  const target = profile?.target_weight_kg != null ? Number(profile.target_weight_kg) : null;
  const weightPct = useMemo(() => {
    if (!stats?.bwFirst || !stats.bwLast || target == null || stats.bwFirst === target) return null;
    return Math.max(0, Math.min(100, ((stats.bwLast - stats.bwFirst) / (target - stats.bwFirst)) * 100));
  }, [stats, target]);

  if (!profile || !settings) return <div className="eyebrow pt-10 px-1">Loading</div>;

  return (
    <div>
      <PageHead title="Profile" right={<button className="text-[16px] font-semibold text-ink" onClick={openEdit}>Edit</button>} />

      {/* ---------- Identity ---------- */}
      <section className="card p-5 flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative shrink-0 w-20 h-20 rounded-full overflow-hidden bg-card2 grid place-items-center" aria-label="Change photo">
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> /* eslint-disable-line @next/next/no-img-element */
            : <span className="display text-4xl text-sub">{(profile.display_name ?? email ?? '?').slice(0, 1)}</span>}
          <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] font-semibold py-0.5">{uploading ? '…' : 'EDIT'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        <div className="min-w-0">
          <div className={`display text-[34px] truncate ${profile.display_name ? '' : 'text-sub'}`}>{profile.display_name || 'Add your name'}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {goalLabel && <span className="pill !bg-volt !text-[#111]">{goalLabel}</span>}
            {age != null && <span className="pill">{age} yrs</span>}
            {profile.height_cm && <span className="pill">{Number(profile.height_cm)} cm</span>}
            {profile.training_since && <span className="pill">Training {yearsSince(profile.training_since)}+ yrs</span>}
          </div>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <SectionLabel>Training stats</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Workouts" value={stats ? String(stats.workouts) : '—'} sub={stats ? `${stats.month} this month` : ''} />
        <Tile label="Week streak" value={stats ? String(stats.streak) : '—'} sub="weeks in a row" hot={!!stats && stats.streak >= 4} />
        <Tile label="Volume lifted" value={stats ? compact(w(stats.volumeKg)) : '—'} sub={`${units} all-time`} />
        <Tile label="Sets logged" value={stats ? compact(stats.sets) : '—'} sub="all-time" />
      </div>

      <SectionLabel>Personal records</SectionLabel>
      <div className="group">
        {stats && stats.prs.length === 0 && <div className="row text-sub">Log some sets to see your PRs.</div>}
        {stats?.prs.map((p, i) => (
          <div key={p.name} className="row">
            <span className={`num text-lg w-6 ${i === 0 ? '' : 'text-sub'}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-[13px] text-sub">{fw(p.weight)} {units} × {p.reps} · {short(p.date)}</div>
            </div>
            <div className="text-right"><div className="num text-xl leading-none">{fw(p.e1rm)}</div><div className="text-[11px] text-sub mt-0.5">est. 1RM</div></div>
          </div>
        ))}
      </div>

      {/* ---------- Goals ---------- */}
      <SectionLabel right={<button className="text-[15px] font-semibold text-ink" onClick={openEdit}>Set</button>}>Goals</SectionLabel>
      <div className="group">
        <div className="row flex-col !items-stretch">
          <div className="flex justify-between"><span>Target bodyweight</span><span className="num text-xl">{target != null ? `${fw(target)} ${units}` : '—'}</span></div>
          {target != null && stats?.bwLast != null && (
            <>
              <div className="h-2.5 rounded-full bg-card2 mt-2 overflow-hidden"><div className="h-full rounded-full bg-volt" style={{ width: `${weightPct ?? 0}%` }} /></div>
              <div className="flex justify-between text-[12px] text-sub mt-1.5">
                <span>Start {stats.bwFirst != null ? fw(stats.bwFirst) : '—'}</span>
                <span className="text-ink font-semibold">Now {fw(stats.bwLast)} · {Math.abs(w(target) - w(stats.bwLast)).toFixed(1)} {units} to go</span>
              </div>
            </>
          )}
        </div>
        <div className="row">
          <span className="flex-1">Target body fat</span>
          <span className="text-[13px] text-sub mr-2">{stats?.bfLast != null ? `now ${stats.bfLast}%` : ''}</span>
          <span className="num text-xl">{profile.target_body_fat_pct != null ? `${Number(profile.target_body_fat_pct)}%` : '—'}</span>
        </div>
      </div>

      {/* ---------- Settings ---------- */}
      <SectionLabel>Settings</SectionLabel>
      <div className="group">
        <div className="row"><span className="flex-1">Units</span>
          <Segmented value={settings.units} options={[['kg', 'kg'], ['lb', 'lb']]} onChange={(v) => save({ units: v as 'kg' | 'lb' })} /></div>
        <div className="row"><span className="flex-1">Appearance</span>
          <Segmented value={settings.theme} options={[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => save({ theme: v as 'system' | 'light' | 'dark' })} /></div>
        <div className="row"><span className="flex-1">Default rest</span>
          <Segmented value={String(settings.default_rest_seconds)} options={[['60', '60s'], ['90', '90s'], ['120', '2m'], ['180', '3m']]} onChange={(v) => save({ default_rest_seconds: Number(v) })} /></div>
        <div className="row">
          <span className="flex-1">Rest timer on lock screen<span className="block text-[13px] text-sub">Live countdown and an alert when rest ends</span></span>
          {notif === 'web' && <span className="text-[13px] text-sub">iPhone app only</span>}
          {notif === 'granted' && <Segmented value={alertsOn ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={async (v) => { await setRestAlertsEnabled(v === 'on'); setAlertsOn(v === 'on'); }} />}
          {notif === 'prompt' && <button className="pill !bg-volt !text-[#111]" onClick={async () => { await requestNotify(); await setRestAlertsEnabled(true); setAlertsOn(true); setNotif(await notifyStatus()); }}>Turn on</button>}
          {notif === 'denied' && <span className="text-[13px] text-sub text-right">Off — enable in iPhone Settings › Heavy</span>}
        </div>
      </div>

      {/* ---------- Apple Health ---------- */}
      <SectionLabel>Apple Health</SectionLabel>
      <HealthSection onSynced={loadStats} />

      {/* ---------- Account ---------- */}
      <SectionLabel>Account</SectionLabel>
      <div className="group">
        <div className="row"><span className="flex-1">Email</span><span className="text-sub text-[15px] truncate max-w-[60%]">{email}</span></div>
        <Link href="/privacy" className="row"><span className="flex-1">Privacy policy</span><span className="text-sub">›</span></Link>
        <Link href="/terms" className="row"><span className="flex-1">Terms &amp; health disclaimer</span><span className="text-sub">›</span></Link>
        <button className="row" onClick={() => supabase.auth.signOut()}><span className="flex-1 text-ink font-medium">Sign out</span></button>
      </div>
      <div className="group mt-3">
        <button className="row" onClick={deleteAccount}><span className="flex-1 text-alert font-medium">Delete account</span></button>
      </div>
      <p className="text-center text-[12px] text-sub mt-6">Heavy · v1.1</p>

      {/* ---------- Edit sheet ---------- */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/40 fade-in" onClick={() => setEditing(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); const t = Number(tw.replace(',', '.')); await saveProfile({ ...draft, target_weight_kg: tw.trim() && t ? toKg(t) : null }); setEditing(false); }}
            className="sheet-in absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[22px] bg-bg pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="sticky top-0 bg-bg/95 backdrop-blur px-4 pt-2 pb-3 z-10">
              <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
              <div className="flex items-center justify-between mt-3">
                <button type="button" className="text-[16px] text-sub" onClick={() => setEditing(false)}>Cancel</button>
                <span className="font-semibold">Edit profile</span>
                <button className="text-[16px] font-semibold text-ink">Save</button>
              </div>
            </div>
            <div className="px-4 space-y-3">
              <Field label="Name"><input className="field" value={draft.display_name ?? ''} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="Your name" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height (cm)"><input className="field num text-xl" inputMode="decimal" value={draft.height_cm ?? ''} onChange={(e) => setDraft({ ...draft, height_cm: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="Date of birth"><input className="field" type="date" value={draft.birth_date ?? ''} onChange={(e) => setDraft({ ...draft, birth_date: e.target.value || null })} /></Field>
              </div>
              <Field label="Training since"><input className="field" type="date" value={draft.training_since ?? ''} onChange={(e) => setDraft({ ...draft, training_since: e.target.value || null })} /></Field>
              <div>
                <span className="text-[13px] text-sub px-1">Goal</span>
                <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-card2 mt-1" role="radiogroup" aria-label="Goal">
                  {GOALS.map((g) => (
                    <button type="button" role="radio" aria-checked={draft.goal === g.v} key={g.v} onClick={() => setDraft({ ...draft, goal: g.v })}
                      className={`h-9 rounded-[10px] text-[14px] font-semibold ${draft.goal === g.v ? 'bg-volt text-[#111]' : 'text-sub'}`}>{g.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Target weight (${units})`}>
                  <input className="field num text-xl" inputMode="decimal" value={tw} onChange={(e) => setTw(e.target.value)} />
                </Field>
                <Field label="Target body fat (%)">
                  <input className="field num text-xl" inputMode="decimal" value={draft.target_body_fat_pct ?? ''} onChange={(e) => setDraft({ ...draft, target_body_fat_pct: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} />
                </Field>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : short(iso);
};

function HealthSection({ onSynced }: { onSynced: () => void }) {
  const [avail, setAvail] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<HealthPrefs>(getHealthPrefs());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { healthAvailable().then(setAvail); }, []);

  const report = (r: SyncResult) => {
    setPrefs(getHealthPrefs());
    if (!r.ok && r.error) return setMsg(`Sync failed: ${r.error}`);
    const c = r.counts;
    if (c) {
      const got = (c.body_mass ?? 0) + (c.body_fat ?? 0) + (c.lean_mass ?? 0) + (c.resting_hr ?? 0) + (c.sleep ?? 0) + (c.steps ?? 0);
      setMsg(got ? `Imported ${c.body_mass ?? 0} weigh-ins, ${c.sleep ?? 0} nights of sleep and ${c.steps ?? 0} days of steps.` : 'Up to date. If nothing arrives, check access in iPhone Settings › Health › Data Access & Devices › Heavy.');
      onSynced();
    }
  };
  async function run(fn: () => Promise<SyncResult>) {
    setBusy(true); setMsg(null);
    try { report(await fn()); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  if (!isNative() || avail === false) return <div className="group"><div className="row"><span className="flex-1">Apple Health</span><span className="text-[13px] text-sub">iPhone app only</span></div></div>;
  if (avail == null) return <div className="group"><div className="row text-sub">Checking…</div></div>;

  if (!prefs.enabled) return (
    <div className="card p-4">
      <p className="text-[15px] leading-snug">Bring in weight, body fat, lean mass, height, resting heart rate, steps, active energy and sleep, and save your workouts to Health.</p>
      <button className="btn-volt w-full mt-4" disabled={busy} onClick={() => run(connectHealth)}>{busy ? 'Connecting…' : 'Connect Apple Health'}</button>
      {msg && <p className="text-[13px] text-sub mt-3">{msg}</p>}
    </div>
  );

  return (
    <>
      <div className="group">
        <div className="row">
          <span className="flex-1">Connected<span className="block text-[13px] text-sub">{prefs.lastSync ? `Synced ${ago(prefs.lastSync)}` : 'Not synced yet'}</span></span>
          <button className="pill" disabled={busy} onClick={() => run(() => syncHealth({ force: true }))}>{busy ? 'Syncing…' : 'Sync now'}</button>
        </div>
        <div className="row"><span className="flex-1">Save workouts to Health</span>
          <Segmented value={prefs.writeWorkouts ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => { setWriteWorkouts(v === 'on'); setPrefs(getHealthPrefs()); }} /></div>
        <div className="row"><span className="flex-1 text-[13px] text-sub">Choose what Heavy can read in iPhone Settings › Health › Data Access &amp; Devices › Heavy.</span></div>
        <button className="row" onClick={() => { disconnectHealth(); setPrefs(getHealthPrefs()); setMsg(null); }}><span className="flex-1 text-alert font-medium">Stop syncing</span></button>
      </div>
      {msg && <p className="text-[13px] text-sub mt-2 px-4">{msg}</p>}
    </>
  );
}

function Tile({ label, value, sub, hot }: { label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className={`card p-4 ${hot ? '!bg-volt text-[#111]' : ''}`}>
      <div className={`eyebrow ${hot ? '!text-[#111]/70' : ''}`}>{label}</div>
      <div className="num text-[38px] leading-none mt-2">{value}</div>
      <div className={`text-[12px] mt-1 ${hot ? 'text-[#111]/70' : 'text-sub'}`}>{sub}</div>
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex p-0.5 rounded-[10px] bg-card2">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`h-8 px-3 rounded-[8px] text-[13px] font-semibold ${value === v ? 'bg-card text-ink shadow-sm' : 'text-sub'}`}>{l}</button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[13px] text-sub px-1">{label}</span><div className="mt-1">{children}</div></label>;
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : Math.round(n).toLocaleString());

/** Center-crop to a square JPEG (keeps uploads small and consistent). */
async function squareJpeg(file: File, size: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process image'))), 'image/jpeg', 0.85));
}
