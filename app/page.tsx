'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase, getSettings, fmtDate, fmtKg, type Plan, type PlanDay, type PlanExercise, type Session, type Settings } from '@/lib/supabase';

const pad = (n: number) => String(n).padStart(2, '0');

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

  async function loadDay(d: PlanDay | undefined) {
    if (!d || d.is_rest) return setExercises([]);
    const { data: ex } = await supabase.from('plan_exercises').select('*').eq('plan_day_id', d.id).order('position');
    setExercises(ex ?? []);
  }

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      const [{ data: p }, { data: d }, { data: sess }, { data: b }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', s.active_plan_id!).single(),
        supabase.from('plan_days').select('*').eq('plan_id', s.active_plan_id!).order('position'),
        supabase.from('workout_sessions').select('*').order('started_at', { ascending: false }).limit(30),
        supabase.from('bodyweight_logs').select('weight_kg, logged_on').order('logged_on', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setPlan(p);
      setDays(d ?? []);
      setOpen((sess ?? []).find((x) => !x.finished_at) ?? null);
      setRecent(sess ?? []);
      setBw(b);
      loadDay((d ?? [])[s.next_position % Math.max(1, d?.length ?? 1)]);
    })();
  }, []);

  if (!settings || !plan) return <div className="eyebrow pt-10">Loading</div>;
  const day = days[settings.next_position % days.length];
  const totalSets = exercises.reduce((a, e) => a + e.target_reps.length, 0);
  const done = recent.filter((r) => r.finished_at);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = done.filter((r) => new Date(r.started_at).getTime() > weekAgo).length;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const [first, ...rest] = day.name.split(' & ');

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
    await loadDay(days[next]);
    setBusy(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="eyebrow">{today}</span>
        <Link href="/plan" className="eyebrow text-ink">{plan.name.replace('High Volume Pro ', '')} ▸</Link>
      </div>

      {open && (
        <Link href={`/workout/${open.id}`} className="mt-5 flex items-center justify-between bg-volt px-4 h-14">
          <span className="font-display font-bold uppercase text-lg tracking-wide">Resume · {open.day_name}</span>
          <span className="text-xl">→</span>
        </Link>
      )}

      <div className="mt-8 flex items-end justify-between">
        <span className="eyebrow">Day {pad(settings.next_position + 1)} / {pad(days.length)}</span>
        {!day.is_rest && <span className="eyebrow">{exercises.length} exercises · {totalSets} sets</span>}
      </div>
      <h1 className="display text-[76px] mt-3">
        {first}{rest.length > 0 && <><br /><span className="text-sub">&amp;</span> <span className="hl">{rest.join(' & ')}</span></>}
      </h1>

      {day.is_rest ? (
        <div className="mt-8 border-t-2 border-ink pt-5">
          <p className="text-lg leading-snug max-w-xs">Recovery day. Eat, sleep, grow — the rotation moves on when you&apos;re ready.</p>
          <button className="btn-ink w-full mt-8" onClick={restDone} disabled={busy}>Rest done → next day</button>
        </div>
      ) : (
        <>
          <ol className="mt-8 border-t-2 border-ink">
            {exercises.map((e, i) => (
              <li key={e.id} className="flex items-baseline gap-4 py-3 border-b border-rule">
                <span className="num text-sub text-lg w-6">{pad(i + 1)}</span>
                <span className="flex-1 font-medium">{e.label}</span>
                <span className="num text-lg">{e.target_reps.length}×{[...new Set(e.target_reps)].join('/')}</span>
              </li>
            ))}
          </ol>
          {!open && <button className="btn-volt w-full mt-6 h-16 text-2xl" onClick={startWorkout} disabled={busy}>Start workout →</button>}
        </>
      )}

      <div className="grid grid-cols-2 mt-12 border-t-2 border-ink">
        <div className="py-4 pr-4 border-r border-rule">
          <div className="eyebrow">Last 7 days</div>
          <div className="num text-5xl mt-2">{thisWeek}<span className="text-base text-sub ml-1 font-sans font-medium">sessions</span></div>
        </div>
        <Link href="/body" className="py-4 pl-4 block">
          <div className="eyebrow">Bodyweight</div>
          <div className="num text-5xl mt-2">{bw ? fmtKg(Number(bw.weight_kg)) : '—'}<span className="text-base text-sub ml-1 font-sans font-medium">kg</span></div>
        </Link>
      </div>

      {done.length > 0 && (
        <section className="mt-10">
          <div className="eyebrow mb-2">Recent</div>
          <div className="border-t-2 border-ink">
            {done.slice(0, 4).map((r) => (
              <Link key={r.id} href={`/workout/${r.id}`} className="flex justify-between py-3 border-b border-rule">
                <span className="font-medium">{r.day_name}</span><span className="text-sub text-sm">{fmtDate(r.started_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
