'use client';

import { useEffect, useMemo, useState } from 'react';
import { guideFor } from '@/components/ExerciseGuide';
import Icon from '@/components/Icon';
import { supabase, type Exercise } from '@/lib/supabase';

const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Rear Delts', 'Traps', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Other'];

/** Bottom sheet: search the exercise library (shared + your custom ones) or create a custom exercise. */
export default function ExercisePicker({ title = 'Choose exercise', highlightMuscle, onPick, onClose }: {
  title?: string; highlightMuscle?: string; onPick: (e: Exercise) => void; onClose: () => void;
}) {
  const [all, setAll] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState(highlightMuscle ?? 'Chest');

  useEffect(() => { supabase.from('exercises').select('*').order('name').then(({ data }) => setAll(data ?? [])); }, []);

  const groups = useMemo(() => {
    const f = all.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()));
    const by = new Map<string, Exercise[]>();
    for (const e of f) (by.get(e.muscle) ?? by.set(e.muscle, []).get(e.muscle)!).push(e);
    const order = [...by.keys()].sort((a, b) => (a === highlightMuscle ? -1 : b === highlightMuscle ? 1 : MUSCLES.indexOf(a) - MUSCLES.indexOf(b)));
    return order.map((m) => [m, by.get(m)!] as const);
  }, [all, q, highlightMuscle]);

  async function create() {
    const name = newName.trim(); if (!name) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('exercises').insert({ name, muscle: newMuscle, owner_id: u.user!.id }).select('*').single();
    if (error) return alert(error.message.includes('duplicate') ? 'You already have an exercise with that name.' : error.message);
    onPick(data as Exercise);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-in absolute inset-x-0 bottom-0 h-[88dvh] flex flex-col rounded-t-[22px] bg-bg">
        <div className="px-4 pt-2 pb-3">
          <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
          <div className="flex items-center justify-between mt-3">
            <button className="text-[16px] text-sub" onClick={onClose}>Cancel</button>
            <span className="font-semibold">{title}</span>
            <button className="text-[16px] font-semibold text-ink" onClick={() => setCreating(!creating)}>{creating ? 'Library' : '+ Custom'}</button>
          </div>
          {!creating && <input autoFocus className="field mt-3" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>

        {creating ? (
          <div className="px-4 space-y-3">
            <label className="block"><span className="text-[13px] text-sub px-1">Name</span>
              <input autoFocus className="field mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cable Crossover" /></label>
            <div>
              <span className="text-[13px] text-sub px-1">Main muscle</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {MUSCLES.map((m) => <button key={m} onClick={() => setNewMuscle(m)} className={`pill ${newMuscle === m ? '!bg-volt !text-[#111]' : ''}`}>{m}</button>)}
              </div>
            </div>
            <button className="btn-ink w-full" onClick={create} disabled={!newName.trim()}>Create &amp; add</button>
            <p className="text-[13px] text-sub px-1">Custom exercises are private to you. They don&apos;t have an instruction card yet.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            {groups.length === 0 && <p className="text-sub text-center mt-10">No match. Tap “+ Custom” to create it.</p>}
            {groups.map(([m, list]) => (
              <div key={m} className="mb-4">
                <div className="eyebrow px-3 mb-1.5">{m}</div>
                <div className="group">
                  {list.map((e) => (
                    <button key={e.id} className="row" onClick={() => onPick(e)}>
                      {guideFor(e.name)?.gif ? <img src={guideFor(e.name)!.gif!} alt="" className="w-11 h-11 rounded-lg object-cover bg-card2" /> /* eslint-disable-line @next/next/no-img-element */
                        : <span className="w-11 h-11 rounded-lg bg-card2 grid place-items-center text-sub text-xs">{e.owner_id ? 'MINE' : '—'}</span>}
                      <span className="flex-1">{e.name}</span>
                      <Icon name="plus" size={18} className="text-sub" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
