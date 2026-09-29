'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TrendChart, Columns } from '@/components/Charts';
import { PageHead } from '@/components/Shell';
import Icon from '@/components/Icon';
import Tip from '@/components/Tip';
import { weekStartOf, weekRangeLong, type WeekStart } from '@/lib/week';
import { usePrefs } from '@/lib/prefs';
import { supabase, fetchAll, epley } from '@/lib/supabase';

type Log = { session_id: number; exercise_id: number; weight_kg: number; reps: number; logged_at: string };
type Ex = { id: number; name: string; muscle: string };
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Rear Delts', 'Traps', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
const short = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function ProgressPage() {
  return <Suspense fallback={<div className="eyebrow pt-10 px-1">Loading</div>}><Progress /></Suspense>;
}

function Progress() {
  const router = useRouter();
  const tab = useSearchParams().get('tab') === 'body' ? 'body' : 'strength';
  const { settings } = usePrefs();
  if (!settings) return <div className="eyebrow pt-10 px-1">Loading</div>; // avoid a kg→lb flash before units load
  return (
    <div>
      <PageHead eyebrow="Your numbers" title="Progress" />
      <div className="grid grid-cols-2 p-1 rounded-xl bg-card2 mb-4" role="tablist">
        {(['strength', 'body'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => router.replace(t === 'body' ? '/progress?tab=body' : '/progress')}
            className={`h-9 rounded-[10px] text-[14px] font-semibold capitalize transition ${tab === t ? 'bg-card shadow-sm text-ink' : 'text-sub'}`}>{t}</button>
        ))}
      </div>
      {tab === 'strength' ? <Strength /> : <Body />}
    </div>
  );
}

/* ================= Strength ================= */
function Strength() {
  const { w, units, settings } = usePrefs();
  const ws = (settings?.week_start ?? 1) as WeekStart;
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [exs, setExs] = useState<Ex[]>([]);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: e }, l] = await Promise.all([
        supabase.from('exercises').select('id, name, muscle').order('name'),
        fetchAll<Log>((a, b) => supabase.from('set_logs').select('session_id, exercise_id, weight_kg, reps, logged_at').order('logged_at').range(a, b)),
      ]);
      setExs(e ?? []);
      setLogs(l.map((x) => ({ ...x, weight_kg: Number(x.weight_kg) })));
      const counts: Record<number, number> = {};
      l.forEach((x) => (counts[x.exercise_id] = (counts[x.exercise_id] ?? 0) + 1));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      setSel(top ? Number(top[0]) : e?.[0]?.id ?? null);
    })();
  }, []);

  const trained = useMemo(() => new Set((logs ?? []).map((l) => l.exercise_id)), [logs]);
  const series = useMemo(() => {
    if (!logs || sel == null) return [];
    const by = new Map<number, { date: Date; top: number; e1rm: number; vol: number }>();
    for (const l of logs.filter((x) => x.exercise_id === sel)) {
      const g = by.get(l.session_id) ?? { date: new Date(l.logged_at), top: 0, e1rm: 0, vol: 0 };
      g.top = Math.max(g.top, l.weight_kg); g.e1rm = Math.max(g.e1rm, epley(l.weight_kg, l.reps)); g.vol += l.weight_kg * l.reps;
      by.set(l.session_id, g);
    }
    return [...by.values()].map((g) => ({ label: short(g.date), top: w(g.top), e1rm: Math.round(w(g.e1rm) * 10) / 10, vol: Math.round(w(g.vol)) }));
  }, [logs, sel, w]);

  const weekly = useMemo(() => {
    if (!logs) return { cols: [], muscles: [] as { m: string; now: number; avg: number }[] };
    const muscleOf = new Map(exs.map((e) => [e.id, e.muscle]));
    const w0 = weekStartOf(new Date(), ws);
    const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(w0); d.setDate(d.getDate() - 7 * (7 - i)); return d.getTime(); });
    const total: Record<number, number> = {}; const per: Record<string, Record<number, number>> = {};
    for (const l of logs) {
      const t = weekStartOf(new Date(l.logged_at), ws).getTime();
      if (!weeks.includes(t)) continue;
      total[t] = (total[t] ?? 0) + 1;
      const m = muscleOf.get(l.exercise_id) ?? 'Other';
      (per[m] ??= {})[t] = (per[m][t] ?? 0) + 1;
    }
    const now = weeks.at(-1)!;
    return {
      cols: weeks.map((t) => ({ label: short(new Date(t)), sets: total[t] ?? 0 })),
      muscles: MUSCLES.map((m) => ({ m, now: per[m]?.[now] ?? 0, avg: weeks.slice(0, 7).reduce((a, t) => a + (per[m]?.[t] ?? 0), 0) / 7 })).filter((x) => x.now || x.avg),
    };
  }, [logs, exs, ws]);

  if (!logs) return <div className="eyebrow px-1">Loading</div>;
  const best = series.reduce((a, s) => Math.max(a, s.e1rm), 0);
  const heaviest = series.reduce((a, s) => Math.max(a, s.top), 0);
  const first = series[0]?.e1rm ?? 0;
  const change = first ? ((series.at(-1)!.e1rm - first) / first) * 100 : 0;
  const maxM = Math.max(1, ...weekly.muscles.map((x) => Math.max(x.now, x.avg)));

  return (
    <>
      <div className="card p-1">
        <select className="w-full h-12 bg-transparent px-3 font-display font-bold uppercase text-xl tracking-wide text-ink outline-none" value={sel ?? ''} onChange={(e) => setSel(Number(e.target.value))}>
          {exs.filter((e) => trained.has(e.id)).length > 0 && <optgroup label="Logged">{exs.filter((e) => trained.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>}
          <optgroup label="Not yet logged">{exs.filter((e) => !trained.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label="Est. 1RM" value={best ? String(Math.round(best)) : '—'} unit={units} />
        <Stat label="Heaviest" value={heaviest ? String(Math.round(heaviest * 10) / 10) : '—'} unit={units} />
        <Stat label="Change" value={series.length > 1 ? `${change >= 0 ? '+' : ''}${change.toFixed(0)}` : '—'} unit="%" />
      </div>

      <section className="card p-4 mt-3">
        <div className="eyebrow mb-3 flex items-center gap-2">Strength per session · est. 1RM <Tip id="e1rm" title="Est. 1RM">Your estimated one-rep max: the heaviest single rep you could lift, worked out from the weight and reps of each set. It lets you compare sets with different rep counts. The dashed line is your top set.</Tip></div>
        {series.length ? <TrendChart data={series} main={{ key: 'e1rm', name: 'Est. 1RM' }} secondary={{ key: 'top', name: 'Top set' }} unit={units} />
          : <p className="py-10 text-center text-sub">{logs.length === 0 ? 'Log your first workout to see strength trends.' : 'No sets logged for this exercise yet.'}</p>}
      </section>

      {series.length > 0 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Volume per session · {units} × reps</div>
          <TrendChart data={series} main={{ key: 'vol', name: 'Volume' }} height={160} unit={units} />
        </section>
      )}

      <section className="card p-4 mt-3">
        <div className="eyebrow mb-3 flex items-center gap-2">Total sets per week <Tip id="weeks" title="Weeks">Weeks run {weekRangeLong(ws)}. You can change the first day of the week in Profile › Settings.</Tip></div>
        <Columns data={weekly.cols} dataKey="sets" unit=" sets" />
      </section>

      <section className="card p-4 mt-3">
        <div className="flex justify-between eyebrow mb-4"><span className="flex items-center gap-2">This week by muscle <Tip id="muscle-chart" title="This week by muscle">The bar is how many sets you have done this week. The tick is your average over the previous 7 weeks.</Tip></span><span className="normal-case tracking-normal">bar = now · tick = 7-wk avg</span></div>
        {weekly.muscles.length === 0 && <p className="text-sub">Log a workout to see weekly volume.</p>}
        <div className="space-y-3">
          {weekly.muscles.map(({ m, now, avg }) => (
            <div key={m} className="grid grid-cols-[92px_1fr_28px] items-center gap-3">
              <span className="text-[14px] font-medium">{m}</span>
              <div className="relative h-4 rounded-full bg-card2">
                <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${(now / maxM) * 100}%` }} />
                <div className="absolute -inset-y-1 w-[3px] rounded bg-volt ring-1 ring-ink" style={{ left: `calc(${(avg / maxM) * 100}% - 1px)` }} />
              </div>
              <span className="num text-lg text-right">{now}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card p-3">
      <div className="eyebrow">{label}</div>
      <div className="num text-[30px] leading-none mt-2">{value}<span className="text-xs text-sub font-sans ml-0.5">{value !== '—' ? unit : ''}</span></div>
    </div>
  );
}

/* ================= Body ================= */
const FIELDS = [
  { key: 'chest_cm', label: 'Chest' }, { key: 'shoulders_cm', label: 'Shoulders' }, { key: 'arm_cm', label: 'Arm' }, { key: 'waist_cm', label: 'Waist' },
  { key: 'thigh_cm', label: 'Thigh' }, { key: 'calf_cm', label: 'Calf' }, { key: 'neck_cm', label: 'Neck' }, { key: 'body_fat_pct', label: 'Body fat' },
] as const;
type BW = { id: number; logged_on: string; weight_kg: number };
type M = { id: number; logged_on: string } & Record<(typeof FIELDS)[number]['key'], number | null>;
const today = () => new Date().toLocaleDateString('en-CA');

function Body() {
  const { fw, w, toKg, units } = usePrefs();
  const [bw, setBw] = useState<BW[]>([]);
  const [ms, setMs] = useState<M[]>([]);
  const [val, setVal] = useState('');
  const [date, setDate] = useState(today());
  const [form, setForm] = useState<Record<string, string>>({});
  const [showM, setShowM] = useState(false);

  async function load() {
    const [{ data: b }, { data: m }] = await Promise.all([
      supabase.from('bodyweight_logs').select('*').order('logged_on'),
      supabase.from('measurements').select('*').order('logged_on'),
    ]);
    setBw((b ?? []).map((x) => ({ ...x, weight_kg: Number(x.weight_kg) })));
    setMs(m ?? []);
  }
  useEffect(() => { load(); }, []);

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(val.replace(',', '.'));
    if (!v) return;
    const { error } = await supabase.from('bodyweight_logs').upsert({ logged_on: date, weight_kg: toKg(v), source: 'manual', external_id: null }, { onConflict: 'user_id,logged_on' });
    if (error) return alert(error.message);
    setVal(''); load();
  }
  async function saveMeasurements(e: React.FormEvent) {
    e.preventDefault();
    const row: Record<string, number | string | null> = { logged_on: date };
    for (const f of FIELDS) row[f.key] = form[f.key] ? Number(form[f.key].replace(',', '.')) : null;
    const { error } = await supabase.from('measurements').upsert(row, { onConflict: 'user_id,logged_on' });
    if (error) return alert(error.message);
    setForm({}); setShowM(false); load();
  }
  async function removeBw(id: number) {
    if (!confirm('Delete this entry?')) return;
    await supabase.from('bodyweight_logs').delete().eq('id', id); load();
  }

  const last = bw.at(-1);
  const weekAgo = bw.filter((x) => new Date(x.logged_on) <= new Date(Date.now() - 7 * 864e5)).at(-1);
  const r7 = bw.filter((x) => new Date(x.logged_on).getTime() > Date.now() - 7 * 864e5);
  const avg7 = r7.length ? r7.reduce((a, x) => a + x.weight_kg, 0) / r7.length : null;
  const delta = last && weekAgo ? w(last.weight_kg) - w(weekAgo.weight_kg) : null;
  const lastM = ms.at(-1), prevM = ms.at(-2);

  return (
    <>
      <section className="card p-5">
        <div className="eyebrow">Latest{last ? ` · ${short(last.logged_on)}` : ''}</div>
        <div className="flex items-end gap-2 mt-2">
          <span className="num text-[80px] leading-[.8]">{last ? fw(last.weight_kg) : '—'}</span>
          <span className="text-sub mb-1">{units}</span>
          {delta != null && <span className={`ml-auto num text-xl px-2.5 py-0.5 rounded-lg ${delta <= 0 ? 'bg-volt text-[#111]' : 'bg-card2'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)} <span className="text-xs font-sans">/wk</span></span>}
        </div>
        <div className="text-[14px] text-sub mt-3">7-day average · <span className="text-ink font-semibold">{avg7 ? `${fw(avg7)} ${units}` : '—'}</span></div>
        {bw.length === 0 && <p className="text-[14px] text-sub mt-3">Log your bodyweight below to see your trend.</p>}
        <form onSubmit={saveWeight} className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
          <input className="field" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input className="field num text-xl" inputMode="decimal" placeholder={units} value={val} onChange={(e) => setVal(e.target.value)} aria-label={`Weight in ${units}`} />
          <button className="btn-ink !h-12 px-4 !text-base">Log</button>
        </form>
      </section>

      {bw.length > 1 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Bodyweight trend</div>
          <TrendChart data={bw.map((x) => ({ label: short(x.logged_on), v: w(x.weight_kg) }))} main={{ key: 'v', name: 'Bodyweight' }} height={180} unit={units} />
        </section>
      )}

      <HealthBlock />

      <div className="flex items-end justify-between px-4 mt-7 mb-2">
        <span className="eyebrow">Measurements{lastM ? ` · ${short(lastM.logged_on)}` : ''}</span>
        <button className="text-[15px] font-semibold text-ink" onClick={() => setShowM(!showM)}>{showM ? 'Cancel' : '+ New'}</button>
      </div>
      {showM ? (
        <form onSubmit={saveMeasurements} className="card p-4">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key}><span className="text-[13px] text-sub">{f.label} ({f.key === 'body_fat_pct' ? '%' : 'cm'})</span>
                <input className="field num text-xl mt-1" inputMode="decimal" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <button className="btn-ink w-full mt-4">Save for {short(date)}</button>
        </form>
      ) : lastM ? (
        <div className="group">
          {FIELDS.map((f) => {
            const v = lastM[f.key], p = prevM?.[f.key];
            if (v == null) return null;
            const d = p != null ? Number(v) - Number(p) : null;
            return (
              <div key={f.key} className="row">
                <span className="flex-1">{f.label}</span>
                {d != null && d !== 0 && <span className="text-[13px] text-sub">{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
                <span className="num text-xl w-16 text-right">{Number(v)}<span className="text-xs text-sub font-sans ml-0.5">{f.key === 'body_fat_pct' ? '%' : 'cm'}</span></span>
              </div>
            );
          })}
        </div>
      ) : <div className="card p-4 text-sub">No measurements yet.</div>}

      {bw.length > 0 && (
        <>
          <div className="eyebrow px-4 mt-7 mb-2">Weigh-ins</div>
          <div className="group">
            {[...bw].reverse().slice(0, 14).map((x) => (
              <div key={x.id} className="row">
                <span className="flex-1">{short(x.logged_on)}</span>
                <span className="num text-xl">{fw(x.weight_kg)} <span className="text-xs text-sub font-sans">{units}</span></span>
                <button className="text-sub w-11 h-11 -my-2 -mr-3 grid place-items-center" aria-label="Delete entry" onClick={() => removeBw(x.id)}><Icon name="close" size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ================= Apple Health ================= */
type HS = { kind: string; day: string; value: number; meta: Record<string, number | string> | null };
const hm = (mins: number) => `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`;

function HealthBlock() {
  const { w, fw, units } = usePrefs();
  const [rows, setRows] = useState<HS[] | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 180 * 864e5).toLocaleDateString('en-CA');
    fetchAll<HS>((a, b) => supabase.from('health_samples').select('kind, day, value, meta')
      .in('kind', ['body_fat', 'lean_mass', 'resting_hr', 'sleep', 'steps', 'active_energy'])
      .gte('day', since).order('day').range(a, b))
      .then((r) => setRows(r.map((x) => ({ ...x, value: Number(x.value) })))).catch(() => setRows([]));
  }, []);

  const by = useMemo(() => {
    const m: Record<string, HS[]> = {};
    for (const r of rows ?? []) (m[r.kind] ??= []).push(r);
    // one value per day for point samples (last reading of the day)
    for (const k of ['body_fat', 'lean_mass', 'resting_hr']) {
      const d = new Map<string, HS>(); for (const r of m[k] ?? []) d.set(r.day, r); m[k] = [...d.values()];
    }
    return m;
  }, [rows]);

  if (!rows || rows.length === 0) return null;
  const last = (k: string) => by[k]?.at(-1);
  const avg = (k: string, n: number) => {
    const cut = new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA');
    const xs = (by[k] ?? []).filter((r) => r.day > cut);
    return xs.length ? xs.reduce((a, r) => a + r.value, 0) / xs.length : null;
  };
  const bf = last('body_fat'), lm = last('lean_mass'), rhr = last('resting_hr');
  const sleep7 = avg('sleep', 7), steps7 = avg('steps', 7), kcal7 = avg('active_energy', 7);
  const recent = (k: string, n: number) => (by[k] ?? []).slice(-n);

  return (
    <>
      <div className="flex items-end justify-between px-4 mt-7 mb-2">
        <span className="eyebrow">From Apple Health</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Body fat" value={bf ? String(bf.value) : '—'} unit="%" />
        <Stat label="Lean mass" value={lm ? fw(lm.value) : '—'} unit={units} />
        <Stat label="Resting HR" value={rhr ? String(Math.round(rhr.value)) : '—'} unit="bpm" />
        <Stat label="Sleep · 7d" value={sleep7 != null ? hm(sleep7) : '—'} unit="h" />
        <Stat label="Steps · 7d" value={steps7 != null ? (steps7 >= 10000 ? `${(steps7 / 1000).toFixed(1)}k` : String(Math.round(steps7))) : '—'} unit="" />
        <Stat label="Active · 7d" value={kcal7 != null ? String(Math.round(kcal7)) : '—'} unit="kcal" />
      </div>

      {(by.body_fat?.length ?? 0) > 1 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Body fat trend</div>
          <TrendChart height={160} unit="%" data={by.body_fat.map((x) => ({ label: short(x.day), v: x.value }))} main={{ key: 'v', name: 'Body fat' }} />
        </section>
      )}
      {(by.lean_mass?.length ?? 0) > 1 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Lean mass trend</div>
          <TrendChart height={160} unit={units} data={by.lean_mass.map((x) => ({ label: short(x.day), v: w(x.value) }))} main={{ key: 'v', name: 'Lean mass' }} />
        </section>
      )}
      {(by.resting_hr?.length ?? 0) > 1 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Resting heart rate</div>
          <TrendChart height={160} unit="bpm" data={by.resting_hr.map((x) => ({ label: short(x.day), v: Math.round(x.value) }))} main={{ key: 'v', name: 'Resting HR' }} />
        </section>
      )}
      {(by.sleep?.length ?? 0) > 0 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Sleep · last 14 nights · hours</div>
          <Columns data={recent('sleep', 14).map((x) => ({ label: short(x.day), h: Math.round((x.value / 60) * 10) / 10 }))} dataKey="h" unit=" h" />
        </section>
      )}
      {(by.steps?.length ?? 0) > 0 && (
        <section className="card p-4 mt-3">
          <div className="eyebrow mb-3">Steps · last 14 days</div>
          <Columns data={recent('steps', 14).map((x) => ({ label: short(x.day), s: Math.round(x.value) }))} dataKey="s" />
        </section>
      )}
    </>
  );
}
