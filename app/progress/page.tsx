'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendChart, StackedBars } from '@/components/Charts';
import { supabase, fetchAll, epley, fmtKg } from '@/lib/supabase';

type Log = { session_id: number; exercise_id: number; weight_kg: number; reps: number; logged_at: string };
type Ex = { id: number; name: string; muscle: string };

const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#f97316', Back: '#3b82f6', Shoulders: '#eab308', 'Rear Delts': '#a3a3a3', Traps: '#8b5cf6',
  Biceps: '#ec4899', Triceps: '#14b8a6', Quads: '#22c55e', Hamstrings: '#84cc16', Calves: '#06b6d4',
};

const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; }; // weeks start Saturday
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
    const bySession = new Map<number, { date: Date; top: number; e1rm: number; vol: number }>();
    for (const l of logs.filter((x) => x.exercise_id === sel)) {
      const g = bySession.get(l.session_id) ?? { date: new Date(l.logged_at), top: 0, e1rm: 0, vol: 0 };
      g.top = Math.max(g.top, l.weight_kg);
      g.e1rm = Math.max(g.e1rm, epley(l.weight_kg, l.reps));
      g.vol += l.weight_kg * l.reps;
      bySession.set(l.session_id, g);
    }
    return [...bySession.values()].map((g) => ({ label: short(g.date), top: g.top, e1rm: Math.round(g.e1rm * 10) / 10, vol: Math.round(g.vol) }));
  }, [logs, sel]);

  const weekly = useMemo(() => {
    if (!logs) return { data: [], keys: [] as string[] };
    const muscleOf = new Map(exs.map((e) => [e.id, e.muscle]));
    const now = weekStart(new Date());
    const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - 7 * (7 - i)); return d; });
    const rows = weeks.map((w) => ({ label: short(w), t: w.getTime() } as Record<string, number | string>));
    const keys = new Set<string>();
    for (const l of logs) {
      const t = weekStart(new Date(l.logged_at)).getTime();
      const row = rows.find((r) => r.t === t);
      if (!row) continue;
      const m = muscleOf.get(l.exercise_id) ?? 'Other';
      keys.add(m);
      row[m] = ((row[m] as number) ?? 0) + 1;
    }
    return { data: rows, keys: Object.keys(MUSCLE_COLORS).filter((k) => keys.has(k)) };
  }, [logs, exs]);

  if (!logs) return <p className="text-muted">Loading…</p>;

  const best = series.reduce((a, s) => Math.max(a, s.e1rm), 0);
  const heaviest = series.reduce((a, s) => Math.max(a, s.top), 0);
  const first = series[0]?.e1rm ?? 0;
  const change = first ? ((series.at(-1)!.e1rm - first) / first) * 100 : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Progress</h1>

      <select className="field" value={sel ?? ''} onChange={(e) => setSel(Number(e.target.value))}>
        {exs.filter((e) => trained.has(e.id)).length > 0 && (
          <optgroup label="Logged">{exs.filter((e) => trained.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
        )}
        <optgroup label="Not yet logged">{exs.filter((e) => !trained.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
      </select>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Est. 1RM" value={best ? fmtKg(Math.round(best)) : '—'} unit="kg" />
        <Tile label="Heaviest" value={heaviest ? fmtKg(heaviest) : '—'} unit="kg" />
        <Tile label="Change" value={series.length > 1 ? `${change >= 0 ? '+' : ''}${change.toFixed(0)}` : '—'} unit="%" />
      </div>

      <section className="card p-4">
        <div className="label mb-2">Strength per session</div>
        {series.length ? (
          <TrendChart data={series} lines={[{ key: 'e1rm', name: 'Est. 1RM', color: '#f97316' }, { key: 'top', name: 'Top set', color: '#8b94a1', dashed: true }]} />
        ) : <p className="text-sm text-muted py-8 text-center">No sets logged for this exercise yet.</p>}
      </section>

      {series.length > 0 && (
        <section className="card p-4">
          <div className="label mb-2">Volume per session (kg × reps)</div>
          <TrendChart data={series} lines={[{ key: 'vol', name: 'Volume', color: '#3b82f6' }]} height={160} />
        </section>
      )}

      <section className="card p-4">
        <div className="label mb-2">Weekly sets by muscle · last 8 weeks</div>
        {weekly.keys.length ? <StackedBars data={weekly.data} keys={weekly.keys} colors={MUSCLE_COLORS} /> : <p className="text-sm text-muted py-8 text-center">Log a workout to see weekly volume.</p>}
      </section>
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card p-3">
      <div className="label">{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}<span className="text-xs text-muted font-normal"> {value !== '—' ? unit : ''}</span></div>
    </div>
  );
}
