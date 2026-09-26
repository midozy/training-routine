'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/Shell';
import ExerciseGuide from '@/components/ExerciseGuide';
import { supabase, getSettings, type Plan, type PlanDay, type PlanExercise, type Settings } from '@/lib/supabase';

const pad = (n: number) => String(n).padStart(2, '0');

export default function PlanPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [guide, setGuide] = useState<PlanExercise | null>(null);

  async function loadPlan(planId: number) {
    const { data: d } = await supabase.from('plan_days').select('*').eq('plan_id', planId).order('position');
    setDays(d ?? []);
    const { data: e } = await supabase.from('plan_exercises').select('*').in('plan_day_id', (d ?? []).map((x) => x.id)).order('position');
    setExs(e ?? []);
  }

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      const { data: p } = await supabase.from('plans').select('*').order('id');
      setPlans(p ?? []);
      if (s.active_plan_id) loadPlan(s.active_plan_id);
    })();
  }, []);

  async function save(patch: Partial<Settings>) {
    const next = { ...settings!, ...patch };
    setSettings(next);
    await supabase.from('user_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', next.user_id);
  }

  async function switchPlan(id: number) {
    if (id === settings?.active_plan_id) return;
    await save({ active_plan_id: id, next_position: 0 });
    setOpen(null); loadPlan(id);
  }

  async function startDay(d: PlanDay) {
    const { data } = await supabase.from('workout_sessions').insert({ plan_day_id: d.id, day_name: d.name }).select('id').single();
    if (data) router.push(`/workout/${data.id}`);
  }

  if (!settings) return <div className="eyebrow pt-10">Loading</div>;

  return (
    <div>
      <PageHead eyebrow="Programme" title="Plan" />

      <div className="grid grid-cols-2 border-2 border-ink">
        {plans.map((p, i) => {
          const on = settings.active_plan_id === p.id;
          return (
            <button key={p.id} onClick={() => switchPlan(p.id)} className={`p-3 text-left ${i ? 'border-l-2 border-ink' : ''} ${on ? 'bg-ink text-paper' : ''}`}>
              <div className={`display text-3xl ${on ? 'text-volt' : ''}`}>{p.name.replace('High Volume Pro ', '')}</div>
              <div className={`text-xs mt-1 ${on ? 'text-paper/70' : 'text-sub'}`}>{p.description}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 border-t-2 border-ink">
        {days.map((d) => {
          const list = exs.filter((e) => e.plan_day_id === d.id);
          const isNext = d.position === settings.next_position;
          const isOpen = open === d.id;
          return (
            <div key={d.id} className="border-b border-rule">
              <button className="w-full flex items-center gap-4 py-4 text-left" onClick={() => setOpen(isOpen ? null : d.id)}>
                <span className={`num text-2xl w-10 h-10 grid place-items-center ${isNext ? 'bg-volt' : ''}`}>{pad(d.position + 1)}</span>
                <span className="flex-1">
                  <span className="font-display font-bold uppercase text-2xl tracking-wide leading-none">{d.name}</span>
                  <span className="block text-xs text-sub mt-1">{isNext ? 'Up next · ' : ''}{d.is_rest ? 'Recovery' : `${list.length} exercises · ${list.reduce((a, e) => a + e.target_reps.length, 0)} sets`}</span>
                </span>
                <span className="num text-2xl">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="pb-5 pl-14">
                  {list.map((e, i) => (
                    <button key={e.id} onClick={() => setGuide(e)} className="block w-full text-left py-2 border-t border-rule first:border-t-0">
                      <div className="flex gap-3 items-baseline">
                        <span className="num text-sub w-5">{i + 1}</span>
                        <span className="flex-1 text-[15px]">{e.label} <span className="text-sub text-xs">ⓘ</span></span>
                        <span className="num">{e.target_reps.join('·')}</span>
                      </div>
                      {e.cue && <div className="ml-8 text-xs text-sub mt-0.5">▲ {e.cue}</div>}
                    </button>
                  ))}
                  <div className="flex gap-2 mt-3">
                    {!isNext && <button className="btn-line h-11 text-base flex-1" onClick={() => save({ next_position: d.position })}>Set as next</button>}
                    {!d.is_rest && <button className="btn-ink h-11 text-base flex-1" onClick={() => startDay(d)}>Start now →</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-10">
        <div className="eyebrow mb-3">Default rest between sets</div>
        <div className="grid grid-cols-4 border-2 border-ink">
          {[60, 90, 120, 180].map((s, i) => (
            <button key={s} onClick={() => save({ default_rest_seconds: s })}
              className={`h-12 num text-xl ${i ? 'border-l-2 border-ink' : ''} ${settings.default_rest_seconds === s ? 'bg-volt' : ''}`}>{s}s</button>
          ))}
        </div>
        <p className="text-xs text-sub mt-2">Trainer-specified rests (e.g. dips, 20 s) always win.</p>
      </section>

      <button className="eyebrow text-ink underline underline-offset-4 mt-12" onClick={() => supabase.auth.signOut()}>Sign out</button>
      {guide && <ExerciseGuide name={guide.label} cue={guide.cue} onClose={() => setGuide(null)} />}
    </div>
  );
}
