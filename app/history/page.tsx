'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/Shell';
import { usePrefs } from '@/lib/prefs';
import { supabase, fetchAll, type Session } from '@/lib/supabase';

type Row = Session & { sets: number; volume: number; minutes: number | null };

export default function History() {
  const { w, units } = usePrefs();
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

  if (!rows) return <div className="eyebrow pt-10 px-1">Loading</div>;

  const byMonth = rows.reduce<Record<string, Row[]>>((m, r) => {
    const k = new Date(r.started_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    (m[k] ??= []).push(r); return m;
  }, {});

  return (
    <div>
      <PageHead eyebrow={`${rows.filter((r) => r.finished_at).length} sessions logged`} title="Log" />
      {rows.length === 0 && <div className="card p-6 text-sub">No workouts yet. Start one from Today.</div>}
      {Object.entries(byMonth).map(([month, list]) => (
        <section key={month} className="mb-6">
          <div className="flex items-baseline justify-between px-4 mb-2">
            <span className="eyebrow">{month}</span>
            <span className="eyebrow">{list.filter((r) => r.finished_at).length} sessions</span>
          </div>
          <div className="group">
            {list.map((r) => {
              const d = new Date(r.started_at);
              return (
                <Link key={r.id} href={`/workout?id=${r.id}`} className="row !gap-4">
                  <div className="text-center w-10 shrink-0">
                    <div className="num text-[28px] leading-none">{d.getDate()}</div>
                    <div className="text-[11px] font-semibold uppercase text-sub mt-0.5">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[16px] truncate">{r.day_name}</div>
                    <div className="text-[13px] text-sub">{r.finished_at ? `${r.minutes} min · ${r.sets} sets` : <span className="bg-volt text-[#111] px-1.5 rounded">In progress</span>}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num text-xl leading-none">{Math.round(w(r.volume)).toLocaleString()}</div>
                    <div className="text-[11px] text-sub mt-1">{units} volume</div>
                  </div>
                  <span className="text-sub">›</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
