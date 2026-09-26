'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase, getSettings, type Plan, type PlanDay, type PlanExercise, type Settings } from '@/lib/supabase';

export default function PlanPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  async function loadPlan(planId: number) {
    const { data: d } = await supabase.from('plan_days').select('*').eq('plan_id', planId).order('position');
    setDays(d ?? []);
    const ids = (d ?? []).map((x) => x.id);
    const { data: e } = await supabase.from('plan_exercises').select('*').in('plan_day_id', ids).order('position');
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
    await save({ active_plan_id: id, next_position: 0 });
    setOpen(null);
    loadPlan(id);
  }

  async function startDay(d: PlanDay) {
    const { data } = await supabase.from('workout_sessions').insert({ plan_day_id: d.id, day_name: d.name }).select('id').single();
    if (data) router.push(`/workout/${data.id}`);
  }

  if (!settings) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plan</h1>

      <div className="grid grid-cols-2 gap-2">
        {plans.map((p) => (
          <button key={p.id} onClick={() => switchPlan(p.id)}
            className={`card p-3 text-left ${settings.active_plan_id === p.id ? 'border-accent' : ''}`}>
            <div className="font-semibold text-sm">{p.name.replace('High Volume Pro ', '')}</div>
            <div className="text-xs text-muted mt-0.5">{p.description}</div>
          </button>
        ))}
      </div>

      <div className="card divide-y divide-line">
        {days.map((d) => {
          const list = exs.filter((e) => e.plan_day_id === d.id);
          const isNext = d.position === settings.next_position;
          return (
            <div key={d.id}>
              <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(open === d.id ? null : d.id)}>
                <span className={`grid place-items-center size-7 rounded-full text-xs font-bold ${isNext ? 'bg-accent text-black' : 'bg-line'}`}>{d.position + 1}</span>
                <span className="flex-1">
                  <span className="font-semibold">{d.name}</span>
                  {isNext && <span className="ml-2 text-xs text-accent">next</span>}
                  {!d.is_rest && <span className="block text-xs text-muted">{list.length} exercises · {list.reduce((a, e) => a + e.target_reps.length, 0)} sets</span>}
                </span>
                <span className="text-muted">{open === d.id ? '−' : '+'}</span>
              </button>
              {open === d.id && (
                <div className="px-4 pb-4 space-y-3">
                  {list.map((e, i) => (
                    <div key={e.id} className="text-sm">
                      <div className="flex gap-2">
                        <span className="text-muted w-4">{i + 1}</span>
                        <span className="flex-1">{e.label}</span>
                        <span className="text-muted tabular-nums">{e.target_reps.join(' · ')}</span>
                      </div>
                      {e.cue && <div className="ml-6 text-xs text-accent/80">{e.cue}</div>}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {!isNext && <button className="btn-ghost h-10 text-sm" onClick={() => save({ next_position: d.position })}>Set as next</button>}
                    {!d.is_rest && <button className="btn-primary h-10 text-sm col-span-1" onClick={() => startDay(d)}>Start now</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="card p-4 space-y-2">
        <div className="label">Default rest between sets</div>
        <div className="grid grid-cols-4 gap-2">
          {[60, 90, 120, 180].map((s) => (
            <button key={s} onClick={() => save({ default_rest_seconds: s })}
              className={`h-10 rounded-xl border text-sm ${settings.default_rest_seconds === s ? 'border-accent text-accent' : 'border-line'}`}>{s}s</button>
          ))}
        </div>
        <p className="text-xs text-muted">Exercises with a trainer-specified rest (e.g. dips, 20 s) keep their own.</p>
      </section>

      <button className="btn-ghost w-full" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}
