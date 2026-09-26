'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase, fetchAll, fmtDate, type Session } from '@/lib/supabase';

type Row = Session & { sets: number; volume: number; minutes: number | null };

export default function History() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const sessions = await fetchAll<Session>((a, b) => supabase.from('workout_sessions').select('*').order('started_at', { ascending: false }).range(a, b));
      const logs = await fetchAll<{ session_id: number; weight_kg: number; reps: number }>((a, b) =>
        supabase.from('set_logs').select('session_id, weight_kg, reps').order('id').range(a, b));
      const agg: Record<number, { sets: number; volume: number }> = {};
      for (const l of logs) {
        const g = (agg[l.session_id] ??= { sets: 0, volume: 0 });
        g.sets++; g.volume += Number(l.weight_kg) * l.reps;
      }
      setRows(sessions.map((s) => ({
        ...s, ...(agg[s.id] ?? { sets: 0, volume: 0 }),
        minutes: s.finished_at ? Math.round((+new Date(s.finished_at) - +new Date(s.started_at)) / 60000) : null,
      })));
    })();
  }, []);

  if (!rows) return <p className="text-muted">Loading…</p>;

  const byMonth = rows.reduce<Record<string, Row[]>>((m, r) => {
    const k = new Date(r.started_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    (m[k] ??= []).push(r);
    return m;
  }, {});

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">History</h1>
      {rows.length === 0 && <p className="text-muted">No workouts yet. Start one from Today.</p>}
      {Object.entries(byMonth).map(([month, list]) => (
        <section key={month}>
          <div className="label mb-2">{month} · {list.filter((r) => r.finished_at).length} sessions</div>
          <div className="card divide-y divide-line">
            {list.map((r) => (
              <Link key={r.id} href={`/workout/${r.id}`} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <div className="font-medium">{r.day_name}{!r.finished_at && <span className="ml-2 text-xs text-accent">in progress</span>}</div>
                  <div className="text-xs text-muted">{fmtDate(r.started_at)}{r.minutes != null ? ` · ${r.minutes} min` : ''}</div>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <div>{r.sets} sets</div>
                  <div className="text-xs text-muted">{Math.round(r.volume).toLocaleString()} kg</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
