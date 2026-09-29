'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ExercisePicker from '@/components/ExercisePicker';
import Icon from '@/components/Icon';
import { supabase, type Exercise, type Plan, type PlanDay, type PlanExercise } from '@/lib/supabase';

const pad = (n: number) => String(n).padStart(2, '0');

export default function EditPage() {
  return <Suspense fallback={<div className="eyebrow pt-10 px-1">Loading</div>}><Editor /></Suspense>;
}

/** Positions are unique per parent, so reorders go via temporary negative slots. */
async function renumber(table: 'plan_days' | 'plan_exercises', ids: number[]) {
  for (let i = 0; i < ids.length; i++) await supabase.from(table).update({ position: -(i + 1) }).eq('id', ids[i]);
  for (let i = 0; i < ids.length; i++) await supabase.from(table).update({ position: i }).eq('id', ids[i]);
}
const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

function Editor() {
  const router = useRouter();
  const planId = Number(useSearchParams().get('id'));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [muscles, setMuscles] = useState<Record<number, string>>({});
  const [picker, setPicker] = useState<{ dayId: number } | { replace: PlanExercise } | null>(null);
  const [editing, setEditing] = useState<PlanExercise | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: d }, { data: lib }] = await Promise.all([
      supabase.from('plans').select('*').eq('id', planId).maybeSingle(),
      supabase.from('plan_days').select('*').eq('plan_id', planId).order('position'),
      supabase.from('exercises').select('id, muscle'),
    ]);
    if (!p || !p.owner_id) return router.replace('/plan');
    setPlan(p); setDays(d ?? []);
    setMuscles(Object.fromEntries((lib ?? []).map((x) => [x.id, x.muscle])));
    const { data: e } = await supabase.from('plan_exercises').select('*').in('plan_day_id', (d ?? []).map((x) => x.id)).order('position');
    setExs(e ?? []);
  }, [planId, router]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => PromiseLike<unknown>) => { setSaving(true); await fn(); await load(); setSaving(false); };

  /* ---- plan ---- */
  const savePlan = (patch: Partial<Plan>) => run(() => supabase.from('plans').update(patch).eq('id', planId));

  /* ---- days ---- */
  const addDay = (rest: boolean) => run(() => supabase.from('plan_days').insert({ plan_id: planId, position: days.length, name: rest ? 'Rest' : `Day ${days.length + 1}`, is_rest: rest }));
  const renameDay = (d: PlanDay, name: string) => name.trim() && name !== d.name && run(() => supabase.from('plan_days').update({ name: name.trim() }).eq('id', d.id));
  const moveDay = (i: number, dir: number) => run(() => renumber('plan_days', move(days, i, dir).map((d) => d.id)));
  const deleteDay = (d: PlanDay) => confirm(`Delete “${d.name}” and its exercises? Logged workouts are kept.`) &&
    run(async () => { await supabase.from('plan_days').delete().eq('id', d.id); await renumber('plan_days', days.filter((x) => x.id !== d.id).map((x) => x.id)); });

  /* ---- exercises ---- */
  const dayExs = (dayId: number) => exs.filter((e) => e.plan_day_id === dayId);
  const addExercise = (dayId: number, e: Exercise) => run(() => supabase.from('plan_exercises').insert({
    plan_day_id: dayId, position: dayExs(dayId).length, exercise_id: e.id, label: e.name, target_reps: [12, 12, 12], unit: 'reps', rest_seconds: 90, cue: null,
  }));
  const moveEx = (dayId: number, i: number, dir: number) => run(() => renumber('plan_exercises', move(dayExs(dayId), i, dir).map((e) => e.id)));
  const deleteEx = (e: PlanExercise) => confirm(`Remove “${e.label}” from this day? Logged sets are kept.`) &&
    run(async () => { await supabase.from('plan_exercises').delete().eq('id', e.id); await renumber('plan_exercises', dayExs(e.plan_day_id).filter((x) => x.id !== e.id).map((x) => x.id)); });

  if (!plan) return <div className="eyebrow pt-10 px-1">Loading</div>;

  return (
    <div>
      <div className="flex items-center justify-between px-1 h-8">
        <button className="text-[16px] font-semibold text-ink" onClick={() => router.push('/plan')}>‹ Plan</button>
        <span className="eyebrow">{saving ? 'Saving…' : 'Saved'}</span>
      </div>

      <div className="card p-4 mt-3 space-y-2">
        <input className="w-full bg-transparent display text-[40px] outline-none" defaultValue={plan.name} aria-label="Plan name"
          onBlur={(e) => e.target.value.trim() && e.target.value !== plan.name && savePlan({ name: e.target.value.trim() })} />
        <input className="field" placeholder="Description (optional)" defaultValue={plan.description ?? ''}
          onBlur={(e) => e.target.value !== (plan.description ?? '') && savePlan({ description: e.target.value || null })} />
      </div>

      {days.map((d, i) => {
        const list = dayExs(d.id);
        return (
          <section key={d.id} className="mt-6">
            <div className="flex items-center gap-2 px-1 mb-2">
              <span className="num text-lg text-sub w-7">{pad(i + 1)}</span>
              <input className="flex-1 min-w-0 bg-transparent font-display font-bold uppercase text-2xl tracking-wide outline-none" defaultValue={d.name}
                key={`${d.id}-${d.name}`} onBlur={(e) => renameDay(d, e.target.value)} aria-label="Day name" />
              <IconBtn label="Move day up" disabled={i === 0} onClick={() => moveDay(i, -1)}><Icon name="up" size={16} /></IconBtn>
              <IconBtn label="Move day down" disabled={i === days.length - 1} onClick={() => moveDay(i, 1)}><Icon name="down" size={16} /></IconBtn>
              
            </div>
            {d.is_rest ? (
              <div className="card p-4 text-sub text-[15px]">Rest day</div>
            ) : (
              <div className="group">
                {list.map((e, j) => (
                  <div key={e.id} className="row !py-2">
                    <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(e)}>
                      <div className="font-medium truncate">{e.label}</div>
                      <div className="text-[13px] text-sub truncate">{e.target_reps.length} × {e.target_reps.join('·')} {e.unit === 'steps' ? 'steps' : ''} · {e.rest_seconds}s rest{e.cue ? ' · cue' : ''}</div>
                    </button>
                    <IconBtn label="Move up" disabled={j === 0} onClick={() => moveEx(d.id, j, -1)}><Icon name="up" size={16} /></IconBtn>
                    <IconBtn label="Move down" disabled={j === list.length - 1} onClick={() => moveEx(d.id, j, 1)}><Icon name="down" size={16} /></IconBtn>
                    
                  </div>
                ))}
                <button className="row text-ink font-semibold" onClick={() => setPicker({ dayId: d.id })}><Icon name="plus" size={18} />Add exercise</button>
              </div>
            )}
          <button className="text-[14px] font-semibold text-alert h-11 px-1 mt-1" onClick={() => deleteDay(d)}>Delete day</button>
          </section>
        );
      })}

      <div className="grid grid-cols-2 gap-2 mt-6">
        <button className="btn-line" onClick={() => addDay(false)}><Icon name="plus" size={16} />Training day</button>
        <button className="btn-line" onClick={() => addDay(true)}><Icon name="plus" size={16} />Rest day</button>
      </div>
      <button className="btn-ink w-full mt-3" onClick={() => router.push('/plan')}>Done</button>

      {picker && (
        <ExercisePicker
          title={'replace' in picker ? 'Change exercise' : 'Add exercise'}
          highlightMuscle={'replace' in picker ? muscles[picker.replace.exercise_id] : undefined}
          onClose={() => setPicker(null)}
          onPick={async (e) => {
            const p = picker; setPicker(null);
            if ('dayId' in p) return addExercise(p.dayId, e);
            await run(() => supabase.from('plan_exercises').update({ exercise_id: e.id, label: e.name }).eq('id', p.replace.id));
            setEditing((cur) => (cur ? { ...cur, exercise_id: e.id, label: e.name } : cur));
          }}
        />
      )}
      {editing && (
        <ExerciseEditor
          ex={editing}
          onChangeExercise={() => setPicker({ replace: editing })}
          onDelete={async () => { const r = deleteEx(editing); if (r) { await r; setEditing(null); } }}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { await run(() => supabase.from('plan_exercises').update(patch).eq('id', editing.id)); setEditing(null); }}
        />
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  // 44×44pt hit area around a 36pt visual circle.
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="shrink-0 w-11 h-11 grid place-items-center text-ink disabled:opacity-30">
      <span className="w-9 h-9 rounded-full grid place-items-center bg-card2">{children}</span>
    </button>
  );
}

const RESTS = [20, 45, 60, 90, 120, 180];
const fmtRest = (s: number) => (s < 120 ? `${s}s` : `${s / 60} min`);

function ExerciseEditor({ ex, onSave, onClose, onChangeExercise, onDelete }: {
  ex: PlanExercise; onSave: (p: Partial<PlanExercise>) => void; onClose: () => void; onChangeExercise: () => void; onDelete: () => void;
}) {
  const [label, setLabel] = useState(ex.label);
  const [reps, setReps] = useState<string[]>(ex.target_reps.map(String));
  const [unit, setUnit] = useState(ex.unit);
  const [rest, setRest] = useState(ex.rest_seconds);
  const [cue, setCue] = useState(ex.cue ?? '');
  useEffect(() => setLabel(ex.label), [ex.label]);

  const setCount = (n: number) => setReps((r) => (n > r.length ? [...r, ...Array(n - r.length).fill(r.at(-1) ?? '10')] : r.slice(0, Math.max(1, n))));
  const valid = reps.every((r) => Number(r) > 0) && label.trim();

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-in absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[22px] bg-bg pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <div className="sticky top-0 bg-bg/95 backdrop-blur px-4 pt-2 pb-3 z-10">
          <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
          <div className="flex items-center justify-between mt-3">
            <button className="text-[16px] text-sub" onClick={onClose}>Cancel</button>
            <span className="font-semibold">Edit exercise</span>
            <button className="text-[16px] font-semibold text-ink disabled:opacity-30" disabled={!valid}
              onClick={() => onSave({ label: label.trim(), target_reps: reps.map(Number), unit, rest_seconds: rest, cue: cue.trim() || null })}>Save</button>
          </div>
        </div>
        <div className="px-4 space-y-5">
          <div className="card p-4">
            <div className="text-[13px] text-sub">Exercise</div>
            <input className="w-full bg-transparent display text-[30px] outline-none mt-1" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name shown in plan" />
            <button className="pill mt-2" onClick={onChangeExercise}><Icon name="swap" size={14} />Change exercise</button>
          </div>

          <div>
            <div className="flex items-center justify-between px-1">
              <span className="text-[13px] text-sub">Sets</span>
              <div className="flex items-center gap-2">
                <button className="w-9 h-9 rounded-full bg-card2 text-xl" onClick={() => setCount(reps.length - 1)} aria-label="Fewer sets">−</button>
                <span className="num text-2xl w-6 text-center">{reps.length}</span>
                <button className="w-9 h-9 rounded-full bg-ink text-on-ink text-xl" onClick={() => setCount(reps.length + 1)} aria-label="More sets">+</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {reps.map((r, i) => (
                <label key={i} className="card p-2 text-center">
                  <span className="text-[11px] text-sub">Set {i + 1}</span>
                  <input className="w-full bg-transparent num text-2xl text-center outline-none" inputMode="numeric" value={r}
                    onChange={(e) => setReps((all) => all.map((x, k) => (k === i ? e.target.value.replace(/\D/g, '') : x)))} />
                </label>
              ))}
            </div>
            <button className="text-[14px] font-semibold text-ink mt-2 px-1" onClick={() => setReps((all) => all.map(() => all[0]))}>Use set 1 for all</button>
          </div>

          <div>
            <span className="text-[13px] text-sub px-1">Count</span>
            <div className="grid grid-cols-2 p-1 rounded-xl bg-card2 mt-1">
              {(['reps', 'steps'] as const).map((u) => <button key={u} onClick={() => setUnit(u)} className={`h-9 rounded-[10px] text-[14px] font-semibold capitalize ${unit === u ? 'bg-card text-ink shadow-sm' : 'text-sub'}`}>{u}</button>)}
            </div>
          </div>

          <div>
            <span className="text-[13px] text-sub px-1">Rest between sets</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {RESTS.map((s) => <button key={s} onClick={() => setRest(s)} className={`pill ${rest === s ? '!bg-volt !text-[#111]' : ''}`}>{fmtRest(s)}</button>)}
            </div>
            <p className="text-[12px] text-sub mt-1.5 px-1">90s follows your default rest from Profile.</p>
          </div>

          <label className="block">
            <span className="text-[13px] text-sub px-1">Coach cue (optional)</span>
            <textarea className="field !h-24 py-3 mt-1" value={cue} onChange={(e) => setCue(e.target.value)} placeholder="e.g. Up fast, 3 s down" />
          </label>
          <button type="button" className="btn-line w-full !text-alert" onClick={onDelete}>Remove from this day</button>
        </div>
      </div>
    </div>
  );
}
