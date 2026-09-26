'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, getSettings, epley, fmtDate, fmtKg, type PlanExercise, type Session, type SetLog } from '@/lib/supabase';

type Row = { weight: string; reps: string; logged: boolean; touched: boolean };
type Prev = Record<number, { weight: number; reps: number }[]>;
type Muscle = Record<number, string>;
const pad = (n: number) => String(n).padStart(2, '0');

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 988;
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

export default function Workout() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [dayMeta, setDayMeta] = useState<{ plan_id: number; position: number } | null>(null);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [muscle, setMuscle] = useState<Muscle>({});
  const [rows, setRows] = useState<Record<number, Row[]>>({});
  const [prev, setPrev] = useState<Prev>({});
  const [best, setBest] = useState<Record<number, number>>({});
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState(0);
  const [notes, setNotes] = useState('');
  const [defaultRest, setDefaultRest] = useState(90);
  const [rest, setRest] = useState<{ endAt: number; total: number; next: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).single();
      if (!s) return router.replace('/');
      setSession(s);
      setNotes(s.notes ?? '');
      getSettings().then((st) => setDefaultRest(st.default_rest_seconds));
      if (!s.plan_day_id) return;
      const [{ data: d }, { data: e }, { data: logs }, { data: exRows }] = await Promise.all([
        supabase.from('plan_days').select('plan_id, position').eq('id', s.plan_day_id).single(),
        supabase.from('plan_exercises').select('*').eq('plan_day_id', s.plan_day_id).order('position'),
        supabase.from('set_logs').select('*').eq('session_id', sessionId),
        supabase.from('exercises').select('id, muscle'),
      ]);
      setDayMeta(d);
      setMuscle(Object.fromEntries((exRows ?? []).map((x) => [x.id, x.muscle])));
      const list = (e ?? []) as PlanExercise[];
      setExs(list);
      const exIds = [...new Set(list.map((x) => x.exercise_id))];

      const { data: hist } = await supabase
        .from('set_logs')
        .select('session_id, exercise_id, set_number, weight_kg, reps, logged_at')
        .in('exercise_id', exIds)
        .neq('session_id', sessionId)
        .order('logged_at', { ascending: false })
        .limit(1000);
      const p: Prev = {}; const latest: Record<number, number> = {}; const b: Record<number, number> = {};
      for (const h of hist ?? []) {
        b[h.exercise_id] = Math.max(b[h.exercise_id] ?? 0, epley(Number(h.weight_kg), h.reps));
        latest[h.exercise_id] ??= h.session_id;
        if (latest[h.exercise_id] !== h.session_id) continue;
        (p[h.exercise_id] ??= [])[h.set_number - 1] = { weight: Number(h.weight_kg), reps: h.reps };
      }
      setPrev(p); setBest(b);

      const byEx: Record<number, SetLog[]> = {};
      for (const l of (logs ?? []) as SetLog[]) (byEx[l.plan_exercise_id!] ??= []).push(l);
      const r: Record<number, Row[]> = {};
      for (const x of list) {
        const logged = byEx[x.id] ?? [];
        const n = Math.max(x.target_reps.length, ...logged.map((l) => l.set_number));
        r[x.id] = Array.from({ length: n }, (_, i) => {
          const l = logged.find((z) => z.set_number === i + 1);
          if (l) return { weight: fmtKg(Number(l.weight_kg)), reps: String(l.reps), logged: true, touched: true };
          const pv = p[x.exercise_id]?.[i] ?? p[x.exercise_id]?.filter(Boolean).at(-1);
          return { weight: pv ? fmtKg(pv.weight) : '', reps: String(x.target_reps[i] ?? x.target_reps.at(-1)), logged: false, touched: false };
        });
      }
      setRows(r);
      const firstOpen = Math.max(0, list.findIndex((x) => r[x.id].some((z) => !z.logged)));
      setCur(firstOpen);
      setSel(Math.max(0, r[list[firstOpen]?.id]?.findIndex((z) => !z.logged) ?? 0));
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

  /* ---------- rest timer ---------- */
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => {
    if (!rest) return;
    fired.current = false;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.endAt - now) / 1000)) : 0;
  useEffect(() => {
    if (rest && left === 0 && !fired.current) {
      fired.current = true; beep();
      const t = setTimeout(() => setRest(null), 1800);
      return () => clearTimeout(t);
    }
  }, [left, rest]);

  const x = exs[cur];
  const r = x ? rows[x.id] ?? [] : [];
  const row = r[sel];

  const patch = useCallback((p: Partial<Row>) => {
    if (!x) return;
    setRows((all) => {
      const list = all[x.id].map((z) => ({ ...z }));
      list[sel] = { ...list[sel], ...p, touched: true };
      if ('weight' in p) for (let j = sel + 1; j < list.length; j++) if (!list[j].logged && !list[j].touched) list[j].weight = p.weight!;
      return { ...all, [x.id]: list };
    });
  }, [x, sel]);

  const step = (field: 'weight' | 'reps', d: number) => {
    if (!row) return;
    const v = Math.max(0, (Number(row[field]) || 0) + d);
    patch({ [field]: field === 'weight' ? fmtKg(Math.round(v * 100) / 100) : String(Math.round(v)) });
  };

  function goTo(i: number) {
    const target = exs[i]; if (!target) return;
    setCur(i);
    const firstOpen = rows[target.id].findIndex((z) => !z.logged);
    setSel(firstOpen === -1 ? 0 : firstOpen);
    setSheet(false);
  }

  async function doneSet() {
    if (!x || !row) return;
    const weight = Number(row.weight) || 0, reps = Number(row.reps) || 0;
    if (!reps) return;
    const { error } = await supabase.from('set_logs').upsert(
      { session_id: sessionId, plan_exercise_id: x.id, exercise_id: x.exercise_id, set_number: sel + 1, weight_kg: weight, reps },
      { onConflict: 'session_id,plan_exercise_id,set_number' },
    );
    if (error) return alert(error.message);
    const wasLogged = row.logged;
    const list = r.map((z, k) => (k === sel ? { ...z, logged: true, touched: true } : z));
    setRows((all) => ({ ...all, [x.id]: all[x.id].map((z, k) => (k === sel ? { ...z, logged: true, touched: true } : z)) }));
    if (wasLogged) return; // editing an earlier set — stay put, no rest

    // Where to next?
    let nextEx = cur, nextSet = list.findIndex((z) => !z.logged);
    if (nextSet === -1) {
      nextEx = exs.findIndex((e, i) => i > cur && rows[e.id].some((z) => !z.logged));
      if (nextEx === -1) nextEx = exs.findIndex((e, i) => i !== cur && rows[e.id].some((z) => !z.logged));
      nextSet = nextEx === -1 ? -1 : rows[exs[nextEx].id].findIndex((z) => !z.logged);
    }
    if (nextEx === -1) { setSheet(true); return; } // everything done → summary sheet
    setCur(nextEx); setSel(nextSet);
    const nx = exs[nextEx], nr = (nextEx === cur ? list : rows[nx.id])[nextSet];
    const secs = x.rest_seconds !== 90 ? x.rest_seconds : defaultRest;
    setRest({ endAt: Date.now() + secs * 1000, total: secs, next: `${nx.label} · Set ${nextSet + 1} — ${nr.weight || '0'} kg × ${nr.reps}` });
  }

  async function undoSet() {
    if (!x || !row?.logged) return;
    await supabase.from('set_logs').delete().match({ session_id: sessionId, plan_exercise_id: x.id, set_number: sel + 1 });
    setRows((all) => ({ ...all, [x.id]: all[x.id].map((z, k) => (k === sel ? { ...z, logged: false } : z)) }));
  }

  function addSet() {
    if (!x) return;
    const last = r.at(-1)!;
    setRows((all) => ({ ...all, [x.id]: [...all[x.id], { weight: last.weight, reps: last.reps, logged: false, touched: false }] }));
    setSel(r.length);
  }

  async function finish() {
    setSaving(true);
    await supabase.from('workout_sessions').update({ finished_at: new Date().toISOString(), notes: notes || null }).eq('id', sessionId);
    const st = await getSettings();
    if (dayMeta && dayMeta.plan_id === st.active_plan_id) {
      const { data: all } = await supabase.from('plan_days').select('id').eq('plan_id', dayMeta.plan_id);
      await supabase.from('user_settings').update({ next_position: (dayMeta.position + 1) % (all?.length || 1), updated_at: new Date().toISOString() }).eq('user_id', st.user_id);
    }
    router.push('/');
  }

  async function saveNotes() { await supabase.from('workout_sessions').update({ notes: notes || null }).eq('id', sessionId); }

  async function discard() {
    if (!confirm('Delete this workout and all its sets?')) return;
    await supabase.from('workout_sessions').delete().eq('id', sessionId);
    router.push('/');
  }

  if (!session || !x || !row) return <div className="min-h-dvh grid place-items-center eyebrow">Loading</div>;

  const done = r.filter((z) => z.logged).length;
  const sessionBest = Math.max(0, ...r.filter((z) => z.logged).map((z) => epley(Number(z.weight) || 0, Number(z.reps) || 0)));
  const pr = sessionBest > 0 && best[x.exercise_id] !== undefined && sessionBest > best[x.exercise_id];
  const pv = prev[x.exercise_id]?.filter(Boolean);
  const allDone = stats.sets === stats.total;
  const unit = x.unit === 'steps' ? 'Steps' : 'Reps';

  return (
    <div className="min-h-dvh flex flex-col max-w-xl mx-auto">
      {/* top bar */}
      <div className="safe-top">
        <div className="h-1 bg-rule"><div className="h-1 bg-ink transition-all" style={{ width: `${(stats.sets / Math.max(1, stats.total)) * 100}%` }} /></div>
        <div className="flex items-center justify-between px-5 h-14">
          <button onClick={() => router.push('/')} className="eyebrow text-ink">✕ Close</button>
          <span className="eyebrow">{session.finished_at ? fmtDate(session.started_at) : `${stats.sets}/${stats.total} sets`}</span>
          <button onClick={() => setSheet(true)} className="eyebrow text-ink">Overview ☰</button>
        </div>
      </div>

      {/* exercise header */}
      <div className="px-5 pt-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow">{pad(cur + 1)} / {pad(exs.length)} · {muscle[x.exercise_id] ?? ''}</span>
          {pr && <span className="bg-volt px-1.5 py-0.5 font-display font-bold text-sm tracking-wide">NEW PR</span>}
        </div>
        <h1 className="display text-[44px] mt-2">{x.label}</h1>
        {x.cue && <p className="mt-2 text-[15px] leading-snug">▲ {x.cue}</p>}
        <p className="mt-1 text-sm text-sub">{pv?.length ? `Last time: ${pv.map((s) => `${fmtKg(s.weight)}×${s.reps}`).join('  ')}` : 'First time logging this one'}</p>
      </div>

      {/* set strip */}
      <div className="px-5 mt-5 flex gap-2 overflow-x-auto pb-1">
        {r.map((z, i) => (
          <button key={i} onClick={() => setSel(i)}
            className={`shrink-0 w-14 h-14 flex flex-col items-center justify-center border-2 ${i === sel ? 'border-ink bg-volt' : z.logged ? 'border-ink bg-ink text-paper' : 'border-rule'}`}>
            <span className="num text-xl leading-none">{z.logged ? z.reps : i + 1}</span>
            <span className={`text-[9px] uppercase tracking-widest mt-0.5 ${z.logged && i !== sel ? 'text-paper/60' : 'text-sub'}`}>{z.logged ? '✓' : `×${z.reps}`}</span>
          </button>
        ))}
        <button onClick={addSet} className="shrink-0 w-14 h-14 border-2 border-dashed border-rule text-sub text-2xl">+</button>
      </div>

      {/* steppers */}
      <div className="px-5 mt-6 flex-1 flex flex-col justify-center gap-5">
        <Stepper label={`Weight · kg`} value={row.weight} onChange={(v) => patch({ weight: v.replace(',', '.') })} onMinus={() => step('weight', -2.5)} onPlus={() => step('weight', 2.5)} big inputMode="decimal" />
        <Stepper label={`${unit} · target ${x.target_reps[sel] ?? x.target_reps.at(-1)}`} value={row.reps} onChange={(v) => patch({ reps: v })} onMinus={() => step('reps', -1)} onPlus={() => step('reps', 1)} inputMode="numeric" />
      </div>

      {/* actions */}
      <div className="px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="flex justify-between mb-3">
          <button className="eyebrow text-ink disabled:opacity-30" disabled={cur === 0} onClick={() => goTo(cur - 1)}>← Prev</button>
          {row.logged && <button className="eyebrow text-alert" onClick={undoSet}>Undo set {sel + 1}</button>}
          <button className="eyebrow text-ink disabled:opacity-30" disabled={cur === exs.length - 1} onClick={() => goTo(cur + 1)}>Next →</button>
        </div>
        {allDone && !session.finished_at ? (
          <button className="btn-ink w-full h-16 text-2xl" onClick={finish} disabled={saving}>Finish workout ✓</button>
        ) : (
          <button className="btn-volt w-full h-16 text-2xl" onClick={doneSet}>
            {row.logged ? `Update set ${sel + 1}` : `Done · set ${sel + 1} of ${r.length}`}
          </button>
        )}
        <div className="text-center eyebrow mt-3">{done}/{r.length} sets on this exercise</div>
      </div>

      {/* rest overlay */}
      {rest && (
        <div className="fixed inset-0 z-50 bg-ink text-paper flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]" onClick={() => left === 0 && setRest(null)}>
          <div className="eyebrow !text-paper/50">Rest</div>
          <div className="flex-1 flex flex-col justify-center">
            <div className={`num leading-none ${left === 0 ? 'text-volt text-[140px]' : 'text-volt text-[170px]'}`}>
              {left === 0 ? 'GO' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
            </div>
            <div className="h-1.5 bg-paper/15 mt-6"><div className="h-full bg-volt transition-all" style={{ width: `${Math.min(100, ((rest.total - left) / rest.total) * 100)}%` }} /></div>
            <div className="eyebrow !text-paper/50 mt-8">Up next</div>
            <div className="text-xl mt-2 leading-snug">{rest.next}</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button className="btn border-2 border-paper/30 text-paper" onClick={(e) => { e.stopPropagation(); setRest((t) => t && { ...t, endAt: Math.max(Date.now(), t.endAt - 15000), total: Math.max(1, t.total - 15) }); }}>−15s</button>
            <button className="btn border-2 border-paper/30 text-paper" onClick={(e) => { e.stopPropagation(); setRest((t) => t && { ...t, endAt: t.endAt + 15000, total: t.total + 15 }); }}>+15s</button>
            <button className="btn-volt" onClick={(e) => { e.stopPropagation(); setRest(null); }}>Skip</button>
          </div>
        </div>
      )}

      {/* overview sheet */}
      {sheet && (
        <div className="fixed inset-0 z-40 bg-paper overflow-y-auto">
          <div className="max-w-xl mx-auto px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="flex justify-between items-center h-10">
              <span className="eyebrow">{session.finished_at ? `Finished · ${fmtDate(session.started_at)}` : 'In progress'}</span>
              <button className="eyebrow text-ink" onClick={() => setSheet(false)}>Close ✕</button>
            </div>
            <h2 className="display text-[52px] mt-2">{session.day_name}</h2>
            <div className="grid grid-cols-2 mt-5 border-t-2 border-ink">
              <div className="py-3 border-r border-rule"><div className="eyebrow">Sets</div><div className="num text-4xl mt-1">{stats.sets}<span className="text-sub text-2xl">/{stats.total}</span></div></div>
              <div className="py-3 pl-4"><div className="eyebrow">Volume</div><div className="num text-4xl mt-1">{Math.round(stats.vol).toLocaleString()}<span className="text-sub text-base font-sans ml-1">kg</span></div></div>
            </div>
            <ol className="border-t-2 border-ink">
              {exs.map((e, i) => {
                const rr = rows[e.id] ?? []; const d = rr.filter((z) => z.logged).length; const complete = d === rr.length;
                return (
                  <li key={e.id}>
                    <button onClick={() => goTo(i)} className={`w-full flex items-center gap-4 py-3 border-b border-rule text-left ${i === cur ? 'bg-volt px-2' : ''}`}>
                      <span className={`num text-lg w-7 ${complete ? '' : 'text-sub'}`}>{complete ? '✓' : pad(i + 1)}</span>
                      <span className={`flex-1 font-medium ${complete ? 'line-through decoration-2' : ''}`}>{e.label}</span>
                      <span className="num text-lg">{d}/{rr.length}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <label className="block mt-6">
              <span className="eyebrow">Session notes</span>
              <textarea className="w-full mt-2 min-h-24 bg-transparent border-2 border-ink p-3 outline-none" placeholder="Energy, pump, anything to remember…" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
            </label>
            {!session.finished_at && <button className="btn-ink w-full mt-5" onClick={finish} disabled={saving}>Finish workout ✓</button>}
            <button className="btn-line w-full mt-3" onClick={() => setSheet(false)}>Back to logging</button>
            <button className="eyebrow !text-alert w-full text-center mt-6" onClick={discard}>Delete workout</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ label, value, onChange, onMinus, onPlus, big, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; onMinus: () => void; onPlus: () => void; big?: boolean; inputMode: 'decimal' | 'numeric';
}) {
  return (
    <div className="border-t-2 border-ink pt-2">
      <div className="eyebrow">{label}</div>
      <div className="flex items-center gap-3 mt-1">
        <button aria-label="decrease" onClick={onMinus} className={`shrink-0 border-2 border-ink grid place-items-center font-display text-4xl active:bg-ink active:text-paper ${big ? 'w-16 h-16' : 'w-14 h-14'}`}>−</button>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode} placeholder="0"
          className={`num w-full min-w-0 text-center bg-transparent outline-none placeholder:text-rule ${big ? 'text-[88px] leading-none' : 'text-[60px] leading-none'}`} />
        <button aria-label="increase" onClick={onPlus} className={`shrink-0 bg-ink text-paper grid place-items-center font-display text-4xl active:bg-volt active:text-ink ${big ? 'w-16 h-16' : 'w-14 h-14'}`}>+</button>
      </div>
    </div>
  );
}
