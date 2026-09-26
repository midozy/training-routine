'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/Shell';
import { supabase, fetchAll, type Session } from '@/lib/supabase';

type Row = Session & { sets: number; volume: number; minutes: number | null };

export default function History() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const sessions = await fetchAll<Session>((a, b) => supabase.from('workout_sessions').select('*').order('started_at', { ascending: false }).range(a, b));
      const logs = await fetchAll<{ session_id: number; weight_kg: number; reps: number }>((a, b) =>
        supabase.from('set_logs').select('session_id, weight_kg, reps').order('id').range(a, b));
      const agg: Record<number, { sets: number; volume: number }> = {};
      for (const l of logs) { const g = (agg[l.session_id] ??= { sets: 0, volume: 0 }); g.sets++; g.volume += Number(l.weight_kg) * l.reps; }
      setRows(sessions.map((s) => ({
        ...s, ...(agg[s.id] ?? { sets: 0, volume: 0 }),
        minutes: s.finished_at ? Math.round((+new Date(s.finished_at) - +new Date(s.started_at)) / 60000) : null,
      })));
    })();
  }, []);

  if (!rows) return <div className="eyebrow pt-10">Loading</div>;

  const byMonth = rows.reduce<Record<string, Row[]>>((m, r) => {
    const k = new Date(r.started_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    (m[k] ??= []).push(r); return m;
  }, {});

  return (
    <div>
      <PageHead eyebrow={`${rows.filter((r) => r.finished_at).length} sessions logged`} title="Log" />
      {rows.length === 0 && <p className="text-sub border-t-2 border-ink pt-4">No workouts yet. Start one from Today.</p>}
      {Object.entries(byMonth).map(([month, list]) => (
        <section key={month} className="mb-10">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
            <span className="display text-3xl">{month}</span>
            <span className="eyebrow">{list.filter((r) => r.finished_at).length} sessions</span>
          </div>
          {list.map((r) => {
            const d = new Date(r.started_at);
            return (
              <Link key={r.id} href={`/workout?id=${r.id}`} className="grid grid-cols-[48px_1fr_auto] gap-4 items-center py-3 border-b border-rule">
                <div className="text-center">
                  <div className="num text-3xl leading-none">{d.getDate()}</div>
                  <div className="eyebrow mt-1">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                </div>
                <div>
                  <div className="font-display font-bold uppercase text-xl tracking-wide leading-tight">{r.day_name}</div>
                  <div className="text-sm text-sub">{r.finished_at ? `${r.minutes} min` : <span className="bg-volt text-ink px-1">In progress</span>}</div>
                </div>
                <div className="text-right">
                  <div className="num text-2xl leading-none">{r.sets}<span className="text-sm text-sub font-sans ml-1">sets</span></div>
                  <div className="text-xs text-sub mt-1">{Math.round(r.volume).toLocaleString()} kg</div>
                </div>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
