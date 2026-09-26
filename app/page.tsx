'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase, getSettings, fmtDate, fmtKg, type Plan, type PlanDay, type PlanExercise, type Session, type Settings } from '@/lib/supabase';

export default function Today() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exercises, setExercises] = useState<PlanExercise[]>([]);
  const [open, setOpen] = useState<Session | null>(null);
  const [recent, setRecent] = useState<Session[]>([]);
  const [bw, setBw] = useState<{ weight_kg: number; logged_on: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      const [{ data: p }, { data: d }, { data: sess }, { data: b }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', s.active_plan_id!).single(),
        supabase.from('plan_days').select('*').eq('plan_id', s.active_plan_id!).order('position'),
        supabase.from('workout_sessions').select('*').order('started_at', { ascending: false }).limit(10),
        supabase.from('bodyweight_logs').select('weight_kg, logged_on').order('logged_on', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setPlan(p);
      setDays(d ?? []);
      setOpen((sess ?? []).find((x) => !x.finished_at) ?? null);
      setRecent(sess ?? []);
      setBw(b);
      const day = (d ?? [])[s.next_position % Math.max(1, d?.length ?? 1)];
      if (day && !day.is_rest) {
        const { data: ex } = await supabase.from('plan_exercises').select('*').eq('plan_day_id', day.id).order('position');
        setExercises(ex ?? []);
      }
    })();
  }, []);

  if (!settings || !plan) return <p className="text-muted">Loading…</p>;
  const day = days[settings.next_position % days.length];
  const totalSets = exercises.reduce((a, e) => a + e.target_reps.length, 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = recent.filter((r) => r.finished_at && new Date(r.started_at).getTime() > weekAgo).length;

  async function startWorkout() {
    setBusy(true);
    const { data, error } = await supabase.from('workout_sessions').insert({ plan_day_id: day.id, day_name: day.name }).select('id').single();
    setBusy(false);
    if (!error && data) router.push(`/workout/${data.id}`);
  }

  async function restDone() {
    setBusy(true);
    const next = (settings!.next_position + 1) % days.length;
    await supabase.from('user_settings').update({ next_position: next, updated_at: new Date().toISOString() }).eq('user_id', settings!.user_id);
    setSettings({ ...settings!, next_position: next });
    setBusy(false);
    const { data: ex } = await supabase.from('plan_exercises').select('*').eq('plan_day_id', days[next].id).order('position');
    setExercises(ex ?? []);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="label">{plan.name}</div>
        <h1 className="text-2xl font-bold">Today</h1>
      </header>

      {open && (
        <Link href={`/workout/${open.id}`} className="card block p-4 border-accent">
          <div className="label text-accent">In progress</div>
          <div className="text-lg font-semibold">{open.day_name}</div>
          <div className="text-sm text-muted">Started {fmtDate(open.started_at)} · tap to resume</div>
        </Link>
      )}

      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <div className="label">Day {settings.next_position + 1} of {days.length}</div>
          <Link href="/plan" className="text-xs text-muted">Change</Link>
        </div>
        <div className="text-2xl font-bold mt-1">{day.name}</div>
        {day.is_rest ? (
          <>
            <p className="text-muted mt-2">Recovery day. Eat, sleep, grow.</p>
            <button className="btn-ghost w-full mt-4" onClick={restDone} disabled={busy}>Rest day done → next</button>
          </>
        ) : (
          <>
            <div className="text-sm text-muted mt-1">{exercises.length} exercises · {totalSets} sets</div>
            <ol className="mt-3 space-y-1.5">
              {exercises.map((e, i) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="text-muted w-4 tabular-nums">{i + 1}</span>
                  <span className="flex-1">{e.label}</span>
                  <span className="text-muted tabular-nums">{e.target_reps.length}×{[...new Set(e.target_reps)].join('/')}</span>
                </li>
              ))}
            </ol>
            {!open && <button className="btn-primary w-full mt-4" onClick={startWorkout} disabled={busy}>Start workout</button>}
          </>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="label">Last 7 days</div>
          <div className="text-2xl font-bold mt-1">{thisWeek}<span className="text-sm text-muted font-normal"> sessions</span></div>
        </div>
        <Link href="/body" className="card p-4 block">
          <div className="label">Bodyweight</div>
          <div className="text-2xl font-bold mt-1">{bw ? fmtKg(Number(bw.weight_kg)) : '—'}<span className="text-sm text-muted font-normal"> kg</span></div>
        </Link>
      </section>

      {recent.filter((r) => r.finished_at).length > 0 && (
        <section>
          <div className="label mb-2">Recent</div>
          <div className="card divide-y divide-line">
            {recent.filter((r) => r.finished_at).slice(0, 4).map((r) => (
              <Link key={r.id} href={`/workout/${r.id}`} className="flex justify-between p-3 text-sm">
                <span>{r.day_name}</span><span className="text-muted">{fmtDate(r.started_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
