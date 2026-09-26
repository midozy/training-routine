'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useRestTimer } from '@/components/Shell';
import { supabase, getSettings, epley, fmtDate, fmtKg, type PlanDay, type PlanExercise, type Session, type SetLog } from '@/lib/supabase';

type Row = { weight: string; reps: string; logged: boolean; touched: boolean };
type Prev = Record<number, { weight: number; reps: number }[]>; // exercise_id -> sets (by index)

export default function Workout() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const router = useRouter();
  const timer = useRestTimer();

  const [session, setSession] = useState<Session | null>(null);
  const [day, setDay] = useState<PlanDay | null>(null);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [rows, setRows] = useState<Record<number, Row[]>>({});
  const [prev, setPrev] = useState<Prev>({});
  const [best, setBest] = useState<Record<number, number>>({});
  const [openEx, setOpenEx] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [defaultRest, setDefaultRest] = useState(90);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).single();
      if (!s) return router.replace('/');
      setSession(s);
      setNotes(s.notes ?? '');
      getSettings().then((st) => setDefaultRest(st.default_rest_seconds));
      if (!s.plan_day_id) return;
      const [{ data: d }, { data: e }, { data: logs }] = await Promise.all([
        supabase.from('plan_days').select('*').eq('id', s.plan_day_id).single(),
        supabase.from('plan_exercises').select('*').eq('plan_day_id', s.plan_day_id).order('position'),
        supabase.from('set_logs').select('*').eq('session_id', sessionId),
      ]);
      setDay(d);
      const list = (e ?? []) as PlanExercise[];
      setExs(list);
      const exIds = [...new Set(list.map((x) => x.exercise_id))];

      // Previous performance: latest earlier session per exercise
      const { data: hist } = await supabase
        .from('set_logs')
        .select('session_id, exercise_id, set_number, weight_kg, reps, logged_at')
        .in('exercise_id', exIds)
        .neq('session_id', sessionId)
        .order('logged_at', { ascending: false })
        .limit(1000);
      const p: Prev = {};
      const latestSession: Record<number, number> = {};
      const b: Record<number, number> = {};
      for (const h of hist ?? []) {
        b[h.exercise_id] = Math.max(b[h.exercise_id] ?? 0, epley(Number(h.weight_kg), h.reps));
        latestSession[h.exercise_id] ??= h.session_id;
        if (latestSession[h.exercise_id] !== h.session_id) continue;
        (p[h.exercise_id] ??= [])[h.set_number - 1] = { weight: Number(h.weight_kg), reps: h.reps };
      }
      setPrev(p);
      setBest(b);

      const byEx: Record<number, SetLog[]> = {};
      for (const l of (logs ?? []) as SetLog[]) (byEx[l.plan_exercise_id!] ??= []).push(l);
      const r: Record<number, Row[]> = {};
      for (const x of list) {
        const logged = byEx[x.id] ?? [];
        const n = Math.max(x.target_reps.length, ...logged.map((l) => l.set_number));
        r[x.id] = Array.from({ length: n }, (_, i) => {
          const l = logged.find((z) => z.set_number === i + 1);
          if (l) return { weight: fmtKg(Number(l.weight_kg)), reps: String(l.reps), logged: true, touched: true };
          const pv = p[x.exercise_id]?.[i] ?? p[x.exercise_id]?.at(-1);
          return { weight: pv ? fmtKg(pv.weight) : '', reps: String(x.target_reps[i] ?? x.target_reps.at(-1)), logged: false, touched: false };
        });
      }
      setRows(r);
      setOpenEx(list.find((x) => !r[x.id].every((z) => z.logged))?.id ?? null);
    })();
  }, [sessionId, router]);

  const stats = useMemo(() => {
    let sets = 0, vol = 0, total = 0;
    for (const x of exs) for (const r of rows[x.id] ?? []) {
      total++;
      if (r.logged) { sets++; vol += (Number(r.weight) || 0) * (Number(r.reps) || 0); }
    }
    return { sets, vol, total };
  }, [exs, rows]);

  function update(exId: number, i: number, patch: Partial<Row>) {
    setRows((all) => {
      const list = all[exId].map((r) => ({ ...r }));
      list[i] = { ...list[i], ...patch, touched: true };
      if ('weight' in patch) for (let j = i + 1; j < list.length; j++) if (!list[j].logged && !list[j].touched) list[j].weight = patch.weight!;
      return { ...all, [exId]: list };
    });
  }

  async function saveIfLogged(x: PlanExercise, i: number) {
    const r = rows[x.id][i];
    if (!r.logged) return;
    await supabase.from('set_logs').upsert(
      { session_id: sessionId, plan_exercise_id: x.id, exercise_id: x.exercise_id, set_number: i + 1, weight_kg: Number(r.weight) || 0, reps: Number(r.reps) || 0 },
      { onConflict: 'session_id,plan_exercise_id,set_number' },
    );
  }

  async function toggleSet(x: PlanExercise, i: number) {
    const r = rows[x.id][i];
    if (r.logged) {
      await supabase.from('set_logs').delete().match({ session_id: sessionId, plan_exercise_id: x.id, set_number: i + 1 });
      setRows((all) => ({ ...all, [x.id]: all[x.id].map((z, k) => (k === i ? { ...z, logged: false } : z)) }));
      return;
    }
    const weight = Number(r.weight) || 0;
    const reps = Number(r.reps) || 0;
    if (!reps) return;
    const { error } = await supabase.from('set_logs').upsert(
      { session_id: sessionId, plan_exercise_id: x.id, exercise_id: x.exercise_id, set_number: i + 1, weight_kg: weight, reps },
      { onConflict: 'session_id,plan_exercise_id,set_number' },
    );
    if (error) return alert(error.message);
    const list = rows[x.id].map((z, k) => (k === i ? { ...z, logged: true, touched: true } : z));
    setRows((all) => ({ ...all, [x.id]: all[x.id].map((z, k) => (k === i ? { ...z, logged: true, touched: true } : z)) }));
    if (list.every((z) => z.logged)) {
      const idx = exs.findIndex((e) => e.id === x.id);
      const next = exs.slice(idx + 1).find((e) => !rows[e.id].every((z) => z.logged));
      setOpenEx(next?.id ?? null);
    }
    timer.start(x.rest_seconds === 90 ? defaultRest : x.rest_seconds);
  }

  function addSet(x: PlanExercise) {
    setRows((all) => {
      const last = all[x.id].at(-1)!;
      return { ...all, [x.id]: [...all[x.id], { weight: last.weight, reps: last.reps, logged: false, touched: false }] };
    });
  }

  async function finish() {
    setSaving(true);
    await supabase.from('workout_sessions').update({ finished_at: new Date().toISOString(), notes: notes || null }).eq('id', sessionId);
    const st = await getSettings();
    if (day && day.plan_id === st.active_plan_id) {
      const { data: all } = await supabase.from('plan_days').select('id').eq('plan_id', day.plan_id);
      await supabase.from('user_settings').update({ next_position: (day.position + 1) % (all?.length || 1), updated_at: new Date().toISOString() }).eq('user_id', st.user_id);
    }
    timer.stop();
    router.push('/');
  }

  async function saveNotes() {
    await supabase.from('workout_sessions').update({ notes: notes || null }).eq('id', sessionId);
  }

  async function discard() {
    if (!confirm('Delete this workout and all its sets?')) return;
    await supabase.from('workout_sessions').delete().eq('id', sessionId);
    timer.stop();
    router.push('/');
  }

  if (!session) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <div className="label">{session.finished_at ? `Finished · ${fmtDate(session.started_at)}` : 'In progress'}</div>
          <h1 className="text-2xl font-bold">{session.day_name}</h1>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums">{stats.sets}/{stats.total}</div>
          <div className="text-xs text-muted tabular-nums">{Math.round(stats.vol).toLocaleString()} kg</div>
        </div>
      </header>
      <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${stats.total ? (stats.sets / stats.total) * 100 : 0}%` }} /></div>

      {exs.map((x, idx) => {
        const r = rows[x.id] ?? [];
        const done = r.filter((z) => z.logged).length;
        const isOpen = openEx === x.id;
        const pv = prev[x.exercise_id];
        const sessionBest = Math.max(0, ...r.filter((z) => z.logged).map((z) => epley(Number(z.weight) || 0, Number(z.reps) || 0)));
        const pr = sessionBest > 0 && best[x.exercise_id] !== undefined && sessionBest > best[x.exercise_id];
        return (
          <section key={x.id} className={`card ${isOpen ? 'border-accent/60' : ''}`}>
            <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpenEx(isOpen ? null : x.id)}>
              <span className={`grid place-items-center size-7 rounded-full text-xs font-bold ${done === r.length && r.length ? 'bg-good text-black' : 'bg-line'}`}>{done === r.length && r.length ? '✓' : idx + 1}</span>
              <span className="flex-1">
                <span className="font-semibold">{x.label}</span>
                {pr && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent text-black">PR</span>}
                <span className="block text-xs text-muted">{r.length} sets · {[...new Set(x.target_reps)].join('/')} {x.unit}{x.rest_seconds !== 90 ? ` · ${x.rest_seconds}s rest` : ''}</span>
              </span>
              <span className="text-sm text-muted tabular-nums">{done}/{r.length}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                {x.cue && <p className="text-sm text-accent/90 mb-3">{x.cue}</p>}
                {pv && <p className="text-xs text-muted mb-2">Last: {pv.filter(Boolean).map((s) => `${fmtKg(s.weight)}×${s.reps}`).join(', ')}</p>}
                <div className="grid grid-cols-[28px_1fr_1fr_52px] gap-2 items-center text-xs text-muted mb-1">
                  <span>Set</span><span>kg</span><span>{x.unit}</span><span />
                </div>
                <div className="space-y-2">
                  {r.map((row, i) => (
                    <div key={i} className="grid grid-cols-[28px_1fr_1fr_52px] gap-2 items-center">
                      <span className="text-center text-muted tabular-nums">{i + 1}</span>
                      <input inputMode="decimal" className={`field text-center tabular-nums ${row.logged ? 'border-good/40' : ''}`} value={row.weight} placeholder="0"
                        onChange={(e) => update(x.id, i, { weight: e.target.value.replace(',', '.') })} onBlur={() => saveIfLogged(x, i)} />
                      <input inputMode="numeric" className={`field text-center tabular-nums ${row.logged ? 'border-good/40' : ''}`} value={row.reps}
                        onChange={(e) => update(x.id, i, { reps: e.target.value })} onBlur={() => saveIfLogged(x, i)} />
                      <button aria-label={row.logged ? 'Unlog set' : 'Log set'} onClick={() => toggleSet(x, i)}
                        className={`h-12 rounded-xl font-bold text-lg ${row.logged ? 'bg-good text-black' : 'bg-line text-white'}`}>✓</button>
                    </div>
                  ))}
                </div>
                <button className="text-sm text-muted mt-3" onClick={() => addSet(x)}>+ Add set</button>
              </div>
            )}
          </section>
        );
      })}

      <section className="card p-4 space-y-3">
        <textarea className="field h-24 py-2" placeholder="Session notes (energy, pump, pain…)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
        {!session.finished_at && <button className="btn-primary w-full" onClick={finish} disabled={saving}>Finish workout</button>}
        <button className="btn-ghost w-full text-red-400" onClick={discard}>Delete workout</button>
      </section>
    </div>
  );
}
