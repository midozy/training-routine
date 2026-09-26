'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendChart, Columns } from '@/components/Charts';
import { PageHead } from '@/components/Shell';
import { supabase, fetchAll, epley, fmtKg } from '@/lib/supabase';

type Log = { session_id: number; exercise_id: number; weight_kg: number; reps: number; logged_at: string };
type Ex = { id: number; name: string; muscle: string };
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Rear Delts', 'Traps', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves'];

const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; }; // Saturday
const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Progress() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [exs, setExs] = useState<Ex[]>([]);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: e }, l] = await Promise.all([
        supabase.from('exercises').select('*').order('name'),
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
    return [...by.values()].map((g) => ({ label: short(g.date), top: g.top, e1rm: Math.round(g.e1rm * 10) / 10, vol: Math.round(g.vol) }));
  }, [logs, sel]);

  const weekly = useMemo(() => {
    if (!logs) return { cols: [], muscles: [] as { m: string; now: number; avg: number }[] };
    const muscleOf = new Map(exs.map((e) => [e.id, e.muscle]));
    const w0 = weekStart(new Date());
    const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(w0); d.setDate(d.getDate() - 7 * (7 - i)); return d.getTime(); });
    const total: Record<number, number> = {}; const per: Record<string, Record<number, number>> = {};
    for (const l of logs) {
      const t = weekStart(new Date(l.logged_at)).getTime();
      if (!weeks.includes(t)) continue;
      total[t] = (total[t] ?? 0) + 1;
      const m = muscleOf.get(l.exercise_id) ?? 'Other';
      (per[m] ??= {})[t] = (per[m][t] ?? 0) + 1;
    }
    const cols = weeks.map((t) => ({ label: short(new Date(t)), sets: total[t] ?? 0 }));
    const now = weeks.at(-1)!;
    const muscles = MUSCLES.map((m) => ({ m, now: per[m]?.[now] ?? 0, avg: weeks.slice(0, 7).reduce((a, t) => a + (per[m]?.[t] ?? 0), 0) / 7 }))
      .filter((x) => x.now || x.avg);
    return { cols, muscles };
  }, [logs, exs]);

  if (!logs) return <div className="eyebrow pt-10">Loading</div>;

  const best = series.reduce((a, s) => Math.max(a, s.e1rm), 0);
  const heaviest = series.reduce((a, s) => Math.max(a, s.top), 0);
  const first = series[0]?.e1rm ?? 0;
  const change = first ? ((series.at(-1)!.e1rm - first) / first) * 100 : 0;
  const maxM = Math.max(1, ...weekly.muscles.map((x) => Math.max(x.now, x.avg)));

  return (
    <div>
      <PageHead eyebrow="Progress" title="Stats" />

      <label className="block">
        <span className="eyebrow">Exercise</span>
        <select className="field font-display font-bold uppercase text-2xl tracking-wide appearance-none" value={sel ?? ''} onChange={(e) => setSel(Number(e.target.value))}>
          {exs.filter((e) => trained.has(e.id)).length > 0 && (
            <optgroup label="Logged">{exs.filter((e) => trained.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
          )}
          <optgroup label="Not yet logged">{exs.filter((e) => !trained.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
        </select>
      </label>

      <div className="grid grid-cols-3 mt-6 border-t-2 border-ink">
        <Stat label="Est. 1RM" value={best ? fmtKg(Math.round(best)) : '—'} unit="kg" />
        <Stat label="Heaviest" value={heaviest ? fmtKg(heaviest) : '—'} unit="kg" border />
        <Stat label="Change" value={series.length > 1 ? `${change >= 0 ? '+' : ''}${change.toFixed(0)}` : '—'} unit="%" border />
      </div>

      <section className="mt-8">
        <div className="eyebrow mb-3">Strength per session <span className="text-ink">— est. 1RM</span> · <span>top set dashed</span></div>
        {series.length ? <TrendChart data={series} main={{ key: 'e1rm', name: 'Est. 1RM' }} secondary={{ key: 'top', name: 'Top set' }} />
          : <p className="py-10 text-center text-sub border-y border-rule">No sets logged for this exercise yet.</p>}
      </section>

      {series.length > 0 && (
        <section className="mt-8">
          <div className="eyebrow mb-3">Volume per session · kg × reps</div>
          <TrendChart data={series} main={{ key: 'vol', name: 'Volume' }} height={160} />
        </section>
      )}

      <section className="mt-10 border-t-2 border-ink pt-4">
        <div className="eyebrow mb-3">Total sets per week · weeks start Saturday</div>
        <Columns data={weekly.cols} dataKey="sets" unit=" sets" />
      </section>

      <section className="mt-10 border-t-2 border-ink pt-4">
        <div className="flex justify-between eyebrow mb-4"><span>This week by muscle</span><span>▮ now  ┃ 7-wk avg</span></div>
        {weekly.muscles.length === 0 && <p className="text-sub">Log a workout to see weekly volume.</p>}
        <div className="space-y-3">
          {weekly.muscles.map(({ m, now, avg }) => (
            <div key={m} className="grid grid-cols-[92px_1fr_32px] items-center gap-3">
              <span className="font-display font-bold uppercase tracking-wide">{m}</span>
              <div className="relative h-5 bg-paper-2">
                <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${(now / maxM) * 100}%` }} />
                <div className="absolute -inset-y-1 w-[3px] bg-volt outline outline-1 outline-ink" style={{ left: `calc(${(avg / maxM) * 100}% - 1px)` }} />
              </div>
              <span className="num text-lg text-right">{now}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, unit, border }: { label: string; value: string; unit: string; border?: boolean }) {
  return (
    <div className={`py-3 ${border ? 'pl-3 border-l border-rule' : ''}`}>
      <div className="eyebrow">{label}</div>
      <div className="num text-4xl mt-1">{value}<span className="text-sm text-sub font-sans ml-0.5">{value !== '—' ? unit : ''}</span></div>
    </div>
  );
}
