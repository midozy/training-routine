'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ExerciseGuide from '@/components/ExerciseGuide';
import Icon from '@/components/Icon';
import { usePrefs } from '@/lib/prefs';
import { supabase, fmtDate, type Plan, type PlanDay, type PlanExercise, type Session } from '@/lib/supabase';

const pad = (n: number) => String(n).padStart(2, '0');
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function Today() {
  const router = useRouter();
  const { settings, save, fw, units } = usePrefs();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exercises, setExercises] = useState<PlanExercise[]>([]);
  const [open, setOpen] = useState<Session | null>(null);
  const [recent, setRecent] = useState<Session[]>([]);
  const [bw, setBw] = useState<number | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<PlanExercise | null>(null);

  async function loadDay(d: PlanDay | undefined) {
    if (!d || d.is_rest) return setExercises([]);
    const { data: ex } = await supabase.from('plan_exercises').select('*').eq('plan_day_id', d.id).order('position');
    setExercises(ex ?? []);
  }

  useEffect(() => {
    if (!settings) return;
    (async () => {
      const [{ data: sess }, { data: b }, { data: prof }] = await Promise.all([
        supabase.from('workout_sessions').select('*').order('started_at', { ascending: false }).limit(30),
        supabase.from('bodyweight_logs').select('weight_kg').order('logged_on', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('profiles').select('display_name').maybeSingle(),
      ]);
      setOpen((sess ?? []).find((x) => !x.finished_at) ?? null);
      setRecent(sess ?? []);
      setBw(b ? Number(b.weight_kg) : null);
      setName(prof?.display_name?.split(' ')[0] ?? null);
      if (!settings.active_plan_id) return setPlan(null);
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', settings.active_plan_id).maybeSingle(),
        supabase.from('plan_days').select('*').eq('plan_id', settings.active_plan_id).order('position'),
      ]);
      setPlan(p);
      setDays(d ?? []);
      loadDay((d ?? [])[settings.next_position % Math.max(1, d?.length ?? 1)]);
    })();
  }, [settings?.active_plan_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings || plan === undefined) return <div className="eyebrow pt-10 px-1">Loading</div>;
  if (!plan || days.length === 0) return (
    <div className="pt-10 px-1">
      <h1 className="display text-[64px]">No plan<br /><span className="hl">yet.</span></h1>
      <p className="mt-5 text-[17px] text-sub max-w-xs">Choose or create a training plan to get started.</p>
      <Link href="/plan" className="btn-ink w-full mt-8">Go to Plan</Link>
    </div>
  );

  const day = days[settings.next_position % days.length];
  const totalSets = exercises.reduce((a, e) => a + e.target_reps.length, 0);
  const done = recent.filter((r) => r.finished_at);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = done.filter((r) => new Date(r.started_at).getTime() > weekAgo).length;
  const [first, ...rest] = day.name.split(' & ');

  async function startWorkout() {
    setBusy(true);
    const { data, error } = await supabase.from('workout_sessions').insert({ plan_day_id: day.id, day_name: day.name }).select('id').single();
    setBusy(false);
    if (!error && data) router.push(`/workout?id=${data.id}`);
  }

  async function restDone() {
    setBusy(true);
    const next = (settings!.next_position + 1) % days.length;
    await save({ next_position: next });
    await loadDay(days[next]);
    setBusy(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <span className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <Link href="/plan" className="pill">{plan.name}<span className="text-sub">›</span></Link>
      </div>
      <p className="px-1 mt-4 text-[17px] text-sub">{greet()}{name ? `, ${name}` : ''}.</p>

      {open && (
        <Link href={`/workout?id=${open.id}`} className="mt-4 flex items-center justify-between rounded-2xl bg-volt text-[#111] px-4 h-14">
          <span className="font-display font-bold uppercase text-lg tracking-wide">Resume · {open.day_name}</span>
          <span className="text-xl">→</span>
        </Link>
      )}

      <section className="card mt-4 p-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Day {pad(settings.next_position + 1)} of {pad(days.length)}</span>
          {!day.is_rest && <span className="eyebrow">{exercises.length} exercises · {totalSets} sets</span>}
        </div>
        <h1 className="display text-[64px] mt-3">
          {first}{rest.length > 0 && <><br /><span className="text-sub">&amp;</span> <span className="hl">{rest.join(' & ')}</span></>}
        </h1>

        {day.is_rest ? (
          <>
            <p className="mt-5 text-[17px] leading-snug text-sub">Recovery day. Eat, sleep, grow — the rotation moves on when you&apos;re ready.</p>
            <button className="btn-ink w-full mt-6" onClick={restDone} disabled={busy}>Rest done · next day</button>
          </>
        ) : (
          <>
            <ol className="mt-5 -mx-1">
              {exercises.map((e, i) => (
                <li key={e.id}>
                  <button onClick={() => setGuide(e)} className="w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-lg active:bg-card2">
                    <span className="num text-sub text-lg w-6">{pad(i + 1)}</span>
                    <span className="flex-1 text-[16px]">{e.label}</span>
                    <span className="num text-lg">{e.target_reps.length}×{[...new Set(e.target_reps)].join('/')}</span>
                    <Icon name="info" size={17} className="text-sub shrink-0" />
                  </button>
                </li>
              ))}
            </ol>
            {!open && <button className="btn-volt w-full mt-5 h-14 text-[22px]" onClick={startWorkout} disabled={busy}>Start workout</button>}
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="card p-4">
          <div className="eyebrow">Last 7 days</div>
          <div className="num text-[44px] leading-none mt-2">{thisWeek}<span className="text-[15px] text-sub font-sans font-medium ml-1.5">sessions</span></div>
        </div>
        <Link href="/progress?tab=body" className="card p-4 block">
          <div className="eyebrow">Bodyweight</div>
          <div className="num text-[44px] leading-none mt-2">{bw != null ? fw(bw) : '—'}<span className="text-[15px] text-sub font-sans font-medium ml-1.5">{units}</span></div>
        </Link>
      </div>

      {done.length > 0 && (
        <>
          <div className="eyebrow px-4 mt-7 mb-2">Recent</div>
          <div className="group">
            {done.slice(0, 4).map((r) => (
              <Link key={r.id} href={`/workout?id=${r.id}`} className="row">
                <span className="flex-1 font-medium">{r.day_name}</span><span className="text-sub text-sm">{fmtDate(r.started_at)}</span><span className="text-sub">›</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {guide && <ExerciseGuide name={guide.label} cue={guide.cue} onClose={() => setGuide(null)} />}
    </div>
  );
}
