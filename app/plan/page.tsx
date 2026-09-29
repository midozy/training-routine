'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHead, SectionLabel } from '@/components/Shell';
import ExerciseGuide from '@/components/ExerciseGuide';
import Icon from '@/components/Icon';
import { usePrefs } from '@/lib/prefs';
import { supabase, type Plan, type PlanDay, type PlanExercise } from '@/lib/supabase';

const pad = (n: number) => String(n).padStart(2, '0');

export default function PlanPage() {
  const router = useRouter();
  const { settings, save } = usePrefs();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [viewId, setViewId] = useState<number | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [guide, setGuide] = useState<PlanExercise | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPlans() {
    const { data } = await supabase.from('plans').select('*').eq('archived', false).order('id');
    setPlans(data ?? []);
    return data ?? [];
  }
  async function loadPlan(id: number) {
    const { data: d } = await supabase.from('plan_days').select('*').eq('plan_id', id).order('position');
    setDays(d ?? []);
    const { data: e } = await supabase.from('plan_exercises').select('*').in('plan_day_id', (d ?? []).map((x) => x.id)).order('position');
    setExs(e ?? []);
  }

  useEffect(() => {
    if (!settings) return;
    loadPlans().then((ps) => {
      const id = viewId ?? settings.active_plan_id ?? ps[0]?.id ?? null;
      setViewId(id);
      if (id) loadPlan(id);
    });
  }, [settings?.active_plan_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = plans.find((p) => p.id === viewId);
  const isActive = plan && settings?.active_plan_id === plan.id;
  const mine = plan?.owner_id != null;

  async function view(id: number) { setViewId(id); setOpen(null); loadPlan(id); }
  async function activate() { if (plan) await save({ active_plan_id: plan.id, next_position: 0 }); }

  async function duplicate() {
    if (!plan) return;
    const name = prompt('Name for the copy', `${plan.name} (copy)`); if (!name) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('duplicate_plan', { src: plan.id, new_name: name });
    setBusy(false);
    if (error) return alert(error.message);
    await loadPlans(); view(data as number);
  }
  async function reset() {
    if (!plan) return;
    if (!confirm(`Reset “${plan.name}” to the original? Your edits to this plan are replaced. Logged workouts are kept.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('reset_plan', { p: plan.id });
    setBusy(false);
    if (error) return alert(error.message);
    loadPlan(plan.id);
  }
  async function remove() {
    if (!plan || isActive) return;
    if (!confirm(`Delete “${plan.name}”? Logged workouts are kept.`)) return;
    await supabase.from('plans').delete().eq('id', plan.id);
    const ps = await loadPlans(); const next = settings?.active_plan_id ?? ps[0]?.id; if (next) view(next);
  }
  async function newPlan() {
    const name = prompt('Plan name', 'My plan'); if (!name) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('plans').insert({ name, owner_id: u.user!.id, description: null }).select('id').single();
    if (error) return alert(error.message);
    await supabase.from('plan_days').insert({ plan_id: data.id, position: 0, name: 'Day 1', is_rest: false });
    router.push(`/plan/edit?id=${data.id}`);
  }
  async function startDay(d: PlanDay) {
    const { data } = await supabase.from('workout_sessions').insert({ plan_day_id: d.id, day_name: d.name }).select('id').single();
    if (data) router.push(`/workout?id=${data.id}`);
  }

  if (!settings) return <div className="eyebrow pt-10 px-1">Loading</div>;

  return (
    <div>
      <PageHead eyebrow="Programme" title="Plan" right={<button className="text-[16px] font-semibold text-ink" onClick={newPlan}>+ New</button>} />

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 snap-x snap-mandatory scroll-px-4">
        {plans.map((p) => {
          const active = settings.active_plan_id === p.id;
          return (
            <button key={p.id} onClick={() => view(p.id)}
              className={`shrink-0 snap-start text-left rounded-2xl p-4 transition ${plans.length > 1 ? 'w-[72%] max-w-[300px]' : 'w-full'} ${viewId === p.id ? 'bg-inv text-on-inv' : 'card'}`}>
              <div className="flex items-center gap-2">
                <span className="display text-[26px] leading-none truncate">{p.name}</span>
                {active && <span className="shrink-0 w-5 h-5 rounded-full bg-volt text-[#111] grid place-items-center"><Icon name="check" size={12} strokeWidth={3.4} /></span>}
              </div>
              <div className={`text-[12px] mt-1.5 line-clamp-2 ${viewId === p.id ? 'opacity-70' : 'text-sub'}`}>{p.description ?? (active ? 'Active plan' : '')}</div>
            </button>
          );
        })}
      </div>

      {plan && (
        <>
          <div className="flex flex-wrap gap-2 mt-3">
            {!isActive && <button className="pill !bg-volt !text-[#111]" onClick={activate}>Use this plan</button>}
            {mine && <Link className="pill" href={`/plan/edit?id=${plan.id}`}><Icon name="edit" size={13} />Edit</Link>}
            <button className="pill" onClick={duplicate} disabled={busy}>Duplicate</button>
            {mine && plan.source_plan_id && <button className="pill" onClick={reset} disabled={busy}>Reset to original</button>}
            {mine && !isActive && <button className="pill !text-alert" onClick={remove}>Delete</button>}
          </div>

          <SectionLabel>{days.filter((d) => !d.is_rest).length} training days · {days.filter((d) => d.is_rest).length} rest</SectionLabel>
          <div className="group">
            {days.map((d) => {
              const list = exs.filter((e) => e.plan_day_id === d.id);
              const isNext = isActive && d.position === settings.next_position % Math.max(1, days.length);
              const isOpen = open === d.id;
              return (
                <div key={d.id}>
                  <button className="row" onClick={() => setOpen(isOpen ? null : d.id)}>
                    <span className={`num text-lg w-9 h-9 rounded-full grid place-items-center shrink-0 ${isNext ? 'bg-volt text-[#111]' : 'bg-card2'}`}>{pad(d.position + 1)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{d.name}</span>
                      <span className="block text-[13px] text-sub">{isNext ? 'Up next · ' : ''}{d.is_rest ? 'Recovery' : `${list.length} exercises · ${list.reduce((a, e) => a + e.target_reps.length, 0)} sets`}</span>
                    </span>
                    <span className={`text-sub transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 bg-card">
                      {list.map((e, i) => (
                        <button key={e.id} onClick={() => setGuide(e)} className="w-full flex items-baseline gap-3 py-2 text-left border-t border-rule first:border-t-0">
                          <span className="num text-sub w-5">{i + 1}</span>
                          <span className="flex-1 text-[15px]">{e.label} <Icon name="info" size={14} className="inline text-sub ml-1 -mt-0.5" /></span>
                          <span className="num">{e.target_reps.join('·')}</span>
                        </button>
                      ))}
                      {isActive && (
                        <div className="flex gap-2 mt-3">
                          {!isNext && <button className="btn-line !h-11 !text-base flex-1" onClick={() => save({ next_position: d.position })}>Set as next</button>}
                          {!d.is_rest && <button className="btn-ink !h-11 !text-base flex-1" onClick={() => startDay(d)}>Start now</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {guide && <ExerciseGuide name={guide.label} cue={guide.cue} onClose={() => setGuide(null)} />}
    </div>
  );
}
