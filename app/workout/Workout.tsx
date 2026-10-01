'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExerciseGuide, { guideFor } from '@/components/ExerciseGuide';
import PlateSheet from '@/components/PlateSheet';
import ExercisePicker from '@/components/ExercisePicker';
import Icon from '@/components/Icon';
import Tip from '@/components/Tip';
import { usePrefs } from '@/lib/prefs';
import { tap, success, keepScreenOn, scheduleRestAlert, cancelRestAlert } from '@/lib/native';
import { saveSessionToHealth } from '@/lib/health';
import { resolveSessionId } from '@/lib/outbox';
import { suggest, warmups, platesFor, prCheck, type SetRef } from '@/lib/training';
import { nextTarget, runOf } from '@/lib/superset';
import { DEFAULT_GEAR, loadGear, fmtWeight, type Gear } from '@/lib/gear';
import { supabase, epley, fmtDate, type PlanExercise, type Session, type SetLog } from '@/lib/supabase';

type Row = { weight: string; reps: string; logged: boolean; touched: boolean; rpe: number | null; note: string }; // weight is in the user's display unit
type Prev = Record<number, { weight: number; reps: number; rpe?: number | null }[]>;                 // kg, keyed by exercise_id
type Lib = Record<number, { name: string; muscle: string }>;
type Swap = { exercise_id: number };
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
  const urlId = Number(useSearchParams().get('id'));
  // A workout started offline has a temporary (negative) id until it syncs; sidRef/sessionId always hold the current real one.
  const [sessionId, setSessionId] = useState(urlId);
  const sidRef = useRef(urlId);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ table: string; from: number; to: number }>).detail;
      if (d.table === 'workout_sessions' && d.from === sidRef.current) { sidRef.current = d.to; setSessionId(d.to); }
    };
    window.addEventListener('heavy:idmap', on);
    return () => window.removeEventListener('heavy:idmap', on);
  }, []);
  const router = useRouter();
  const { settings, w, fw, toKg, step: wStep, units } = usePrefs();

  const [session, setSession] = useState<Session | null>(null);
  const [dayMeta, setDayMeta] = useState<{ plan_id: number; position: number } | null>(null);
  const [exs, setExs] = useState<PlanExercise[]>([]);
  const [lib, setLib] = useState<Lib>({});
  const [swaps, setSwaps] = useState<Record<number, Swap>>({});
  const [rows, setRows] = useState<Record<number, Row[]>>({});
  const [orphans, setOrphans] = useState<SetLog[]>([]);
  const [prev, setPrev] = useState<Prev>({});
  const [best, setBest] = useState<Record<number, number>>({});
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState(0);
  const [notes, setNotes] = useState('');
  const [rest, setRest] = useState<{ endAt: number; total: number; next: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [ready, setReady] = useState(false);
  const [hist, setHist] = useState<Record<number, SetRef[]>>({}); // every earlier set per exercise (kg), for PR checks
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2800); };
  const [plateOpen, setPlateOpen] = useState(false);
  const [warm, setWarm] = useState<Record<number, { n: number; weight: number; reps: number }[]>>({}); // logged warm-ups per plan exercise (kg)
  const [gear, setGear] = useState<Gear>(DEFAULT_GEAR.kg);
  useEffect(() => { setGear(loadGear(units)); }, [units]);

  const effId = useCallback((x: PlanExercise) => swaps[x.id]?.exercise_id ?? x.exercise_id, [swaps]);
  const effName = useCallback((x: PlanExercise) => (swaps[x.id] ? lib[swaps[x.id].exercise_id]?.name ?? x.label : x.label), [swaps, lib]);

  /** Last session's sets + best e1RM for the given exercises (excluding this session). */
  const loadHistory = useCallback(async (ids: number[]) => {
    if (!ids.length) return { p: {} as Prev, b: {} as Record<number, number> };
    const { data: hist } = await supabase.from('set_logs').select('session_id, exercise_id, set_number, weight_kg, reps, rpe, logged_at')
      .in('exercise_id', ids).neq('session_id', sidRef.current).not('is_warmup', 'is', true).order('logged_at', { ascending: false }).limit(1000);
    const p: Prev = {}; const latest: Record<number, number> = {}; const b: Record<number, number> = {}; const all: Record<number, SetRef[]> = {};
    for (const h of hist ?? []) {
      (all[h.exercise_id] ??= []).push({ weight: Number(h.weight_kg), reps: h.reps });
      b[h.exercise_id] = Math.max(b[h.exercise_id] ?? 0, epley(Number(h.weight_kg), h.reps));
      latest[h.exercise_id] ??= h.session_id;
      if (latest[h.exercise_id] !== h.session_id) continue;
      (p[h.exercise_id] ??= [])[h.set_number - 1] = { weight: Number(h.weight_kg), reps: h.reps, rpe: h.rpe };
    }
    setPrev((o) => ({ ...o, ...p })); setBest((o) => ({ ...o, ...b })); setHist((o) => ({ ...o, ...all }));
    return { p, b };
  }, []);

  const freshRows = useCallback((x: PlanExercise, exId: number, p: Prev, logged: SetLog[]): Row[] => {
    const n = Math.max(x.target_reps.length, ...logged.map((l) => l.set_number));
    return Array.from({ length: n }, (_, i) => {
      const l = logged.find((z) => z.set_number === i + 1);
      if (l) return { weight: fw(Number(l.weight_kg)), reps: String(l.reps), logged: true, touched: true, rpe: l.rpe ?? null, note: l.note ?? '' };
      const pv = p[exId]?.[i] ?? p[exId]?.filter(Boolean).at(-1);
      return { weight: pv ? fw(pv.weight) : '', reps: String(x.target_reps[i] ?? x.target_reps.at(-1)), logged: false, touched: false, rpe: null, note: '' };
    });
  }, [fw]);

  useEffect(() => {
    if (!settings) return;
    (async () => {
      const sid = await resolveSessionId(urlId); // the real id, if this workout has synced since the link was made
      sidRef.current = sid; setSessionId(sid);
      const { data: s } = await supabase.from('workout_sessions').select('*').eq('id', sid).maybeSingle();
      if (!s) return router.replace('/');
      setSession(s); setNotes(s.notes ?? '');
      const [{ data: logs }, { data: exRows }, { data: sw }] = await Promise.all([
        supabase.from('set_logs').select('*').eq('session_id', sid).order('set_number'),
        supabase.from('exercises').select('id, name, muscle'),
        supabase.from('session_swaps').select('plan_exercise_id, exercise_id').eq('session_id', sid),
      ]);
      const libMap: Lib = Object.fromEntries((exRows ?? []).map((x) => [x.id, { name: x.name, muscle: x.muscle }]));
      setLib(libMap);
      const swapMap: Record<number, Swap> = Object.fromEntries((sw ?? []).map((x) => [x.plan_exercise_id, { exercise_id: x.exercise_id }]));
      setSwaps(swapMap);

      let list: PlanExercise[] = [];
      if (s.plan_day_id) {
        const [{ data: d }, { data: e }] = await Promise.all([
          supabase.from('plan_days').select('plan_id, position').eq('id', s.plan_day_id).maybeSingle(),
          supabase.from('plan_exercises').select('*').eq('plan_day_id', s.plan_day_id).order('position'),
        ]);
        setDayMeta(d); list = (e ?? []) as PlanExercise[];
      }
      setExs(list);
      const ids = new Set(list.map((x) => x.id));
      const allLogs = (logs ?? []) as SetLog[];
      const working = allLogs.filter((l) => !l.is_warmup);
      const wu: Record<number, { n: number; weight: number; reps: number }[]> = {};
      for (const l of allLogs) if (l.is_warmup && l.plan_exercise_id) (wu[l.plan_exercise_id] ??= []).push({ n: l.set_number, weight: Number(l.weight_kg), reps: l.reps });
      setWarm(wu);
      setOrphans(working.filter((l) => !l.plan_exercise_id || !ids.has(l.plan_exercise_id)));

      const eff = (x: PlanExercise) => swapMap[x.id]?.exercise_id ?? x.exercise_id;
      const { p } = await loadHistory([...new Set(list.map(eff))]);
      const byEx: Record<number, SetLog[]> = {};
      for (const l of working) if (l.plan_exercise_id) (byEx[l.plan_exercise_id] ??= []).push(l);
      const r: Record<number, Row[]> = {};
      for (const x of list) r[x.id] = freshRows(x, eff(x), p, byEx[x.id] ?? []);
      setRows(r);
      const firstOpen = Math.max(0, list.findIndex((x) => r[x.id].some((z) => !z.logged)));
      setCur(firstOpen);
      setSel(Math.max(0, r[list[firstOpen]?.id]?.findIndex((z) => !z.logged) ?? 0));
      if (!list.length) setSheet(true);
      setReady(true);
    })();
  }, [urlId, router, settings?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    let sets = 0, vol = 0, total = 0;
    for (const x of exs) for (const r of rows[x.id] ?? []) {
      total++;
      if (r.logged) { sets++; vol += (Number(r.weight) || 0) * (Number(r.reps) || 0); }
    }
    for (const o of orphans) { sets++; total++; vol += w(Number(o.weight_kg)) * o.reps; }
    return { sets, vol, total };
  }, [exs, rows, orphans, w]);

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
  useEffect(() => { if (rest) scheduleRestAlert(rest.endAt, rest.next, rest.endAt - rest.total * 1000); else cancelRestAlert(); }, [rest?.endAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { keepScreenOn(true); return () => { keepScreenOn(false); cancelRestAlert(); }; }, []);

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
    tap('light');
    const v = Math.max(0, (Number(row[field]) || 0) + d);
    patch({ [field]: field === 'weight' ? String(Math.round(v * 100) / 100) : String(Math.round(v)) });
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
    const weight = toKg(Number(row.weight) || 0), reps = Number(row.reps) || 0;
    if (!reps) return;
    const { error } = await supabase.from('set_logs').upsert(
      { session_id: sessionId, plan_exercise_id: x.id, exercise_id: effId(x), set_number: sel + 1, weight_kg: weight, reps, rpe: row.rpe, note: row.note.trim() || null },
      { onConflict: 'session_id,plan_exercise_id,set_number' },
    );
    if (error) return alert(error.message);
    tap('medium');
    const wasLogged = row.logged;
    if (!wasLogged && (hist[effId(x)]?.length ?? 0) > 0) { // a PR against everything before (other workouts + earlier sets today)
      const earlier: SetRef[] = [...hist[effId(x)], ...r.filter((z, k) => k !== sel && z.logged).map((z) => ({ weight: toKg(Number(z.weight) || 0), reps: Number(z.reps) || 0 }))];
      const pr = prCheck(earlier, { weight, reps });
      if (pr.e1rm || pr.rep) { success(); flash(`New PR · ${fw(weight)} ${units} × ${reps}`); }
    }
    const list = r.map((z, k) => (k === sel ? { ...z, logged: true, touched: true } : z));
    setRows((all) => ({ ...all, [x.id]: all[x.id].map((z, k) => (k === sel ? { ...z, logged: true, touched: true } : z)) }));
    if (wasLogged) return; // editing an earlier set — stay put, no rest

    // Where next? A normal exercise: its next set, then the next exercise. A superset: straight on to the next member (no rest),
    // rest once the round is complete. (The rule lives in lib/superset.ts and is tested.)
    const open = (i: number) => (i === cur ? list : rows[exs[i].id]).findIndex((z) => !z.logged);
    const tgt = nextTarget(exs, open, cur);
    if (!tgt) { setSheet(true); return; }
    setCur(tgt.ex); setSel(tgt.set);
    const nx = exs[tgt.ex], nr = (tgt.ex === cur ? list : rows[nx.id])[tgt.set];
    if (!tgt.rest) { flash(`Superset · now ${effName(nx)}`); return; }
    const restOf = (e: PlanExercise) => (e.rest_seconds !== 90 ? e.rest_seconds : settings?.default_rest_seconds ?? 90);
    const group = runOf(exs, cur);
    const secs = group ? Math.max(...exs.slice(group[0], group[1] + 1).map(restOf)) : restOf(x); // a superset rests for the longest of its exercises
    setRest({ endAt: Date.now() + secs * 1000, total: secs, next: `${effName(nx)} · Set ${tgt.set + 1} — ${nr.weight || '0'} ${units} × ${nr.reps}` });
  }

  /** Save a change to the selected set's effort or note (the set is already logged). */
  async function saveSet(next: Row) {
    if (!x) return;
    const { error } = await supabase.from('set_logs').upsert(
      { session_id: sessionId, plan_exercise_id: x.id, exercise_id: effId(x), set_number: sel + 1, weight_kg: toKg(Number(next.weight) || 0), reps: Number(next.reps) || 0, rpe: next.rpe, note: next.note.trim() || null },
      { onConflict: 'session_id,plan_exercise_id,set_number' },
    );
    if (error) alert(error.message);
  }
  function setRpe(v: number) {
    if (!row) return;
    tap('light');
    const rpe = row.rpe === v ? null : v; // tap again to clear
    patch({ rpe });
    if (row.logged) void saveSet({ ...row, rpe });
  }

  /** Warm-ups are saved like sets (numbered 101, 102, ...) but never count towards volume, PRs or charts. */
  async function logWarm(s: { weight: number; reps: number }) {
    if (!x) return;
    const used = new Set((warm[x.id] ?? []).map((z) => z.n));
    let n = 101; while (used.has(n)) n++;
    const { error } = await supabase.from('set_logs').upsert(
      { session_id: sessionId, plan_exercise_id: x.id, exercise_id: effId(x), set_number: n, weight_kg: s.weight, reps: s.reps, is_warmup: true },
      { onConflict: 'session_id,plan_exercise_id,set_number' },
    );
    if (error) return alert(error.message);
    tap('light');
    setWarm((o) => ({ ...o, [x.id]: [...(o[x.id] ?? []), { n, weight: s.weight, reps: s.reps }] }));
  }
  async function undoWarm(n: number) {
    if (!x) return;
    await supabase.from('set_logs').delete().match({ session_id: sessionId, plan_exercise_id: x.id, set_number: n });
    setWarm((o) => ({ ...o, [x.id]: (o[x.id] ?? []).filter((z) => z.n !== n) }));
  }

  async function undoSet() {
    if (!x || !row?.logged) return;
    await supabase.from('set_logs').delete().match({ session_id: sessionId, plan_exercise_id: x.id, set_number: sel + 1 });
    setRows((all) => ({ ...all, [x.id]: all[x.id].map((z, k) => (k === sel ? { ...z, logged: false } : z)) }));
  }

  function addSet() {
    if (!x) return;
    const last = r.at(-1)!;
    setRows((all) => ({ ...all, [x.id]: [...all[x.id], { weight: last.weight, reps: last.reps, logged: false, touched: false, rpe: null, note: '' }] }));
    setSel(r.length);
  }

  async function swapTo(exerciseId: number | null) {
    if (!x) return;
    setSwapping(false);
    if (exerciseId === null || exerciseId === x.exercise_id) {
      await supabase.from('session_swaps').delete().match({ session_id: sessionId, plan_exercise_id: x.id });
      setSwaps(({ [x.id]: _gone, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    } else {
      const { error } = await supabase.from('session_swaps').upsert({ session_id: sessionId, plan_exercise_id: x.id, exercise_id: exerciseId }, { onConflict: 'session_id,plan_exercise_id' });
      if (error) return alert(error.message);
      setSwaps((s) => ({ ...s, [x.id]: { exercise_id: exerciseId } }));
    }
    const target = exerciseId ?? x.exercise_id;
    const { p } = await loadHistory([target]);
    setRows((all) => ({ ...all, [x.id]: freshRows(x, target, p, []) }));
    setSel(0);
  }

  async function finish() {
    setSaving(true);
    success();
    await supabase.from('workout_sessions').update({ finished_at: new Date().toISOString(), notes: notes || null }).eq('id', sessionId);
    saveSessionToHealth(sessionId).catch(() => {}); // Apple Health write-back (iPhone app, if enabled)
    if (dayMeta && dayMeta.plan_id === settings?.active_plan_id) {
      const { data: all } = await supabase.from('plan_days').select('id').eq('plan_id', dayMeta.plan_id);
      await supabase.from('user_settings').update({ next_position: (dayMeta.position + 1) % (all?.length || 1), updated_at: new Date().toISOString() }).eq('user_id', settings.user_id);
    }
    router.push('/');
  }

  async function saveNotes() { await supabase.from('workout_sessions').update({ notes: notes || null }).eq('id', sessionId); }
  async function discard() {
    if (!confirm('Delete this workout and all its sets?')) return;
    await supabase.from('workout_sessions').delete().eq('id', sessionId);
    router.push('/');
  }

  if (!session || !ready) return <div className="min-h-dvh grid place-items-center eyebrow">Loading</div>;

  const swapped = x ? !!swaps[x.id] : false;
  const name = x ? effName(x) : '';
  const done = r.filter((z) => z.logged).length;
  const exId = x ? effId(x) : 0;
  const sessionBest = Math.max(0, ...r.filter((z) => z.logged).map((z) => epley(toKg(Number(z.weight) || 0), Number(z.reps) || 0)));
  const pr = sessionBest > 0 && best[exId] !== undefined && sessionBest > best[exId];
  const pv = prev[exId]?.filter(Boolean);
  const isReps = x?.unit !== 'steps';
  const ss = x ? runOf(exs, cur) : null; // [first, last] index of this exercise's superset
  const equip = guideFor(name)?.equipment;
  const isBarbell = equip === 'Barbell';
  const shownWeight = row ? Number(row.weight) || 0 : 0;                       // in the display unit
  const lastForSet = prev[exId]?.[sel] ?? prev[exId]?.filter(Boolean).at(-1);
  const sug = x && row && isReps && !row.logged ? suggest(lastForSet, x.target_reps[sel] ?? x.target_reps.at(-1) ?? 0, units) : null;
  const sugNew = !!sug && (Math.abs(sug.weight - toKg(shownWeight)) > 0.01 || sug.reps !== Number(row?.reps));
  const ramp = isBarbell && isReps && done === 0 ? warmups(Number(r[0]?.weight) || 0, gear.bar, units === 'kg' ? 2.5 : 5) : [];
  const plates = isBarbell && shownWeight > 0 ? platesFor(shownWeight, gear.bar, gear.plates) : null;
  const loggedWarm = (x ? warm[x.id] ?? [] : []).slice().sort((a, b) => a.n - b.n);
  const maxWarm = Math.max(0, ...loggedWarm.map((z) => w(z.weight)));
  const todoRamp = ramp.filter((s) => s.weight > maxWarm + 0.01); // suggestions still ahead of what you have logged
  const allDone = exs.length > 0 && exs.every((e) => (rows[e.id] ?? []).every((z) => z.logged));
  const unitLbl = x?.unit === 'steps' ? 'Steps' : 'Reps';
  const orphanGroups = Object.entries(orphans.reduce<Record<number, SetLog[]>>((m, o) => ((m[o.exercise_id] ??= []).push(o), m), {}));

  return (
    <div className="min-h-dvh flex flex-col max-w-xl mx-auto">
      {toast && <div role="status" className="pointer-events-none fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+58px)] z-50 rounded-full bg-volt text-[#111] px-4 py-2 font-display font-bold tracking-wide shadow-lg">{toast}</div>}
      {/* top bar */}
      <div className="safe-top">
        <div className="flex items-center justify-between px-4 h-12">
          <button onClick={() => router.push('/')} className="text-[16px] font-semibold text-ink">‹ Close</button>
          <span className="text-[14px] font-semibold text-sub">{session.finished_at ? fmtDate(session.started_at) : `${stats.sets} of ${stats.total} sets`}</span>
          <button onClick={() => setSheet(true)} className="text-[16px] font-semibold text-ink">Overview</button>
        </div>
        <div className="mx-4 h-1.5 rounded-full bg-card2 overflow-hidden"><div className="h-full rounded-full bg-volt transition-all" style={{ width: `${(stats.sets / Math.max(1, stats.total)) * 100}%` }} /></div>
      </div>

      {x && row ? (
        <>
          {/* exercise header */}
          <div className="px-4 pt-4">
            <div className="flex items-center gap-2">
              <span className="eyebrow">{pad(cur + 1)} / {pad(exs.length)} · {lib[exId]?.muscle ?? ''}</span>
              {ss && <span className="bg-ink text-on-ink px-2 py-0.5 rounded-md font-display font-bold text-sm tracking-wide">SUPERSET {cur - ss[0] + 1}/{ss[1] - ss[0] + 1}</span>}
              {pr && <span className="bg-volt text-[#111] px-2 py-0.5 rounded-md font-display font-bold text-sm tracking-wide">NEW PR</span>}
            </div>
            <button onClick={() => setGuideOpen(true)} className="block text-left mt-2" aria-label={`How to do ${name}`}>
              <h1 className="display text-[42px]">{name}</h1>
            </button>
            {swapped && <div className="text-[13px] text-sub mt-1">Swapped for today · plan: {x.label}</div>}
            <div className="flex gap-2 mt-3">
              <button className="pill" onClick={() => setGuideOpen(true)}><Icon name="play" size={12} />How to</button>
              <button className="pill" onClick={() => (done && !swapped ? alert('Undo the logged sets on this exercise before swapping it.') : setSwapping(true))}><Icon name="swap" size={14} />Swap</button>
              {swapped && <button className="pill" onClick={() => swapTo(null)}><Icon name="undo" size={14} />Back to plan</button>}
              <Tip id="swap" title="Swap">Replaces this exercise for today only. Your plan does not change.</Tip>
            </div>
            {x.cue && !swapped && <div className="mt-3 rounded-xl bg-card2 px-3 py-2 text-[15px] leading-snug flex gap-2 items-start"><Icon name="bolt" size={16} className="mt-[3px] shrink-0" /><span>{x.cue}</span></div>}
            {pv?.length ? (
              <div className="mt-3 flex items-baseline flex-wrap gap-x-3 gap-y-1">
                <span className="eyebrow">Last time</span>
                {pv.map((s, i) => <span key={i} className="num text-[20px] leading-none text-ink">{fw(s.weight)}<span className="text-sub">×</span>{s.reps}{s.rpe ? <span className="text-sub text-[13px]"> @{s.rpe}</span> : null}</span>)}
              </div>
            ) : <p className="mt-3 eyebrow">First time logging this one</p>}
            {sugNew && sug && (
              <div className="mt-2 flex items-center gap-1">
                <button className="pill" onClick={() => patch({ weight: fw(sug.weight), reps: String(sug.reps), touched: true })}>
                  <Icon name="up" size={12} />Try {fw(sug.weight)} {units} × {sug.reps}
                </button>
                <Tip id="suggest" title="Suggested load">Hit all your target reps last time? Add a little weight. Otherwise aim for one more rep at the same weight. A nudge, not a rule.</Tip>
              </div>
            )}
            {(todoRamp.length > 0 || loggedWarm.length > 0) && (
              <div className="mt-3 flex items-center flex-wrap gap-2">
                <span className="eyebrow">Warm-up</span>
                {loggedWarm.map((z) => (
                  <button key={z.n} className="pill !bg-ink !text-on-ink" aria-label={`Remove warm-up ${fmtWeight(w(z.weight))} by ${z.reps}`} onClick={() => undoWarm(z.n)}>
                    <Icon name="check" size={11} strokeWidth={3.2} />{fmtWeight(w(z.weight))}×{z.reps}
                  </button>
                ))}
                {todoRamp.map((t, i) => <button key={i} className="pill" onClick={() => logWarm({ weight: toKg(t.weight), reps: t.reps })}>{fmtWeight(t.weight)}×{t.reps}</button>)}
                <Tip id="warmup" title="Warm-up sets">A suggested ramp towards your first working set. Tap one to log it, tap a logged one to remove it. Warm-ups are saved with the workout but never count towards volume, PRs or charts.</Tip>
              </div>
            )}
            {plates && (
              <button className="mt-3 flex items-baseline gap-2 text-left" onClick={() => setPlateOpen(true)}>
                <span className="eyebrow">Each side</span>
                <span className="num text-[17px] leading-none text-ink">{plates.perSide.length ? plates.perSide.map(fmtWeight).join(' · ') : 'Bar only'}</span>
                {!plates.exact && <span className="text-[12px] text-sub">(closest)</span>}
              </button>
            )}
          </div>

          {/* set strip */}
          <div className="px-4 mt-4 flex gap-2 overflow-x-auto pb-1">
            {r.map((z, i) => (
              <button key={i} onClick={() => setSel(i)}
                className={`shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center transition ${i === sel ? 'bg-volt text-[#111] ring-2 ring-ink' : z.logged ? 'bg-ink text-on-ink' : 'bg-card'}`}>
                <span className="num text-xl leading-none">{z.logged ? z.reps : i + 1}</span>
                <span className={`text-[10px] font-semibold mt-0.5 ${i === sel ? 'text-[#111]/60' : z.logged ? 'opacity-60' : 'text-sub'}`}>{z.logged ? <Icon name="check" size={11} strokeWidth={3.2} /> : `×${z.reps}`}</span>
              </button>
            ))}
            <button onClick={addSet} className="shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-rule text-sub text-2xl" aria-label="Add set">+</button>
          </div>

          {/* steppers */}
          <div className="px-4 py-3 flex-1 flex flex-col justify-center gap-3">
            <Stepper label={`Weight · ${units}`} value={row.weight} onChange={(v) => patch({ weight: v.replace(',', '.') })} onMinus={() => step('weight', -wStep)} onPlus={() => step('weight', wStep)} big inputMode="decimal" />
            <Stepper label={`${unitLbl} · target ${x.target_reps[sel] ?? x.target_reps.at(-1)}`} value={row.reps} onChange={(v) => patch({ reps: v })} onMinus={() => step('reps', -1)} onPlus={() => step('reps', 1)} inputMode="numeric" />
            <div className="rounded-2xl bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="eyebrow">Effort · RPE</span>
                <Tip id="rpe" title="Effort (RPE)">How hard the set felt, from 6 to 10. 10 = nothing left, 9 = one rep left, 8 = two left, 7 = three left. Tap again to clear. It is just for you and never changes your numbers.</Tip>
              </div>
              <div className="flex gap-2 mt-2">
                {[6, 7, 8, 9, 10].map((v) => (
                  <button key={v} aria-pressed={row.rpe === v} onClick={() => setRpe(v)} className={`flex-1 h-11 rounded-xl num text-xl ${row.rpe === v ? 'bg-ink text-on-ink' : 'bg-card2 text-ink'}`}>{v}</button>
                ))}
              </div>
              <input className="field mt-3" placeholder="Note for this set (optional)" value={row.note} maxLength={200}
                onChange={(e) => patch({ note: e.target.value })} onBlur={() => { if (row.logged) void saveSet(row); }} />
            </div>
          </div>

          {/* actions */}
          <div className="sticky bottom-0 z-20 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] bg-bg/95 backdrop-blur border-t border-rule">
            <div className="flex justify-between mb-2 px-1">
              <button className="text-[15px] font-semibold text-ink disabled:opacity-30" disabled={cur === 0} onClick={() => goTo(cur - 1)}>‹ Prev</button>
              {row.logged && <button className="text-[15px] font-semibold text-alert" onClick={undoSet}>Undo set {sel + 1}</button>}
              <button className="text-[15px] font-semibold text-ink disabled:opacity-30" disabled={cur === exs.length - 1} onClick={() => goTo(cur + 1)}>Next ›</button>
            </div>
            {allDone && !session.finished_at ? (
              <button className="btn-ink w-full !h-16 !text-2xl" onClick={finish} disabled={saving}>Finish workout<Icon name="check" size={20} strokeWidth={3} /></button>
            ) : (
              <button className="btn-volt w-full !h-16 !text-2xl" onClick={doneSet}>{row.logged ? `Update set ${sel + 1}` : `Done · set ${sel + 1} of ${r.length}`}</button>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 grid place-items-center px-8 text-center text-sub">This workout&apos;s plan day was changed. Open Overview to see what you logged.</div>
      )}

      {/* rest overlay — always dark */}
      {rest && (
        <div className="fixed inset-0 z-50 bg-inv text-on-inv flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)] fade-in" onClick={() => left === 0 && setRest(null)}>
          <div className="eyebrow !text-on-inv/50">Rest</div>
          <div className="flex-1 flex flex-col justify-center">
            <div className={`num leading-none text-volt ${left === 0 ? 'text-[140px]' : 'text-[170px]'}`}>
              {left === 0 ? 'GO' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
            </div>
            <div className="h-2 rounded-full bg-on-inv/15 mt-6 overflow-hidden"><div className="h-full rounded-full bg-volt transition-all" style={{ width: `${Math.min(100, ((rest.total - left) / rest.total) * 100)}%` }} /></div>
            <div className="eyebrow !text-on-inv/50 mt-8">Up next</div>
            <div className="text-xl mt-2 leading-snug">{rest.next}</div>
            <p className="text-[13px] text-on-inv/50 mt-6">−15s and +15s change this rest only.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button className="btn !bg-on-inv/10 !text-on-inv" onClick={(e) => { e.stopPropagation(); setRest((t) => t && { ...t, endAt: Math.max(Date.now(), t.endAt - 15000), total: Math.max(1, t.total - 15) }); }}>−15s</button>
            <button className="btn !bg-on-inv/10 !text-on-inv" onClick={(e) => { e.stopPropagation(); setRest((t) => t && { ...t, endAt: t.endAt + 15000, total: t.total + 15 }); }}>+15s</button>
            <button className="btn-volt" onClick={(e) => { e.stopPropagation(); setRest(null); }}>Skip</button>
          </div>
        </div>
      )}

      {/* overview sheet */}
      {sheet && (
        <div className="fixed inset-0 z-40 bg-black/40 fade-in" onClick={() => exs.length && setSheet(false)}>
          <div onClick={(e) => e.stopPropagation()} className="sheet-in absolute inset-x-0 bottom-0 max-h-[94dvh] overflow-y-auto rounded-t-[22px] bg-bg pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="sticky top-0 bg-bg/95 backdrop-blur px-4 pt-2 pb-3 z-10">
              <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
              <div className="flex justify-between items-center mt-3">
                <span className="eyebrow">{session.finished_at ? `Finished · ${fmtDate(session.started_at)}` : 'In progress'}</span>
                {exs.length > 0 ? <button className="text-[16px] font-semibold text-ink" onClick={() => setSheet(false)}>Done</button>
                  : <button className="text-[16px] font-semibold text-ink" onClick={() => router.push('/')}>Close</button>}
              </div>
            </div>
            <div className="px-4">
              <h2 className="display text-[44px]">{session.day_name}</h2>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="card p-4"><div className="eyebrow">Sets</div><div className="num text-4xl mt-1">{stats.sets}<span className="text-sub text-2xl">/{stats.total}</span></div></div>
                <div className="card p-4"><div className="eyebrow">Volume</div><div className="num text-4xl mt-1">{Math.round(stats.vol).toLocaleString()}<span className="text-sub text-base font-sans ml-1">{units}</span></div></div>
              </div>
              {(session.avg_hr != null || session.active_kcal != null) && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="card p-3"><div className="eyebrow">Avg HR</div><div className="num text-3xl mt-1">{session.avg_hr != null ? Math.round(Number(session.avg_hr)) : '—'}<span className="text-sub text-sm font-sans ml-1">bpm</span></div></div>
                  <div className="card p-3"><div className="eyebrow">Max HR</div><div className="num text-3xl mt-1">{session.max_hr != null ? Math.round(Number(session.max_hr)) : '—'}<span className="text-sub text-sm font-sans ml-1">bpm</span></div></div>
                  <div className="card p-3"><div className="eyebrow">Active</div><div className="num text-3xl mt-1">{session.active_kcal != null ? Math.round(Number(session.active_kcal)) : '—'}<span className="text-sub text-sm font-sans ml-1">kcal</span></div></div>
                </div>
              )}
              {exs.length > 0 && (
                <div className="group mt-4">
                  {exs.map((e, i) => {
                    const rr = rows[e.id] ?? []; const d = rr.filter((z) => z.logged).length; const complete = d === rr.length;
                    const grp = runOf(exs, i);
                    return (
                      <button key={e.id} onClick={() => goTo(i)} className={`row ${i === cur ? '!bg-volt/40' : ''} ${grp ? 'border-l-4 border-volt' : ''}`}>
                        <span className={`num text-lg w-7 ${complete ? '' : 'text-sub'}`}>{complete ? <Icon name="check" size={16} strokeWidth={3} /> : pad(i + 1)}</span>
                        <span className={`flex-1 ${complete ? 'line-through decoration-2 text-sub' : ''}`}>{grp && <span className="inline-grid place-items-center w-5 h-5 mr-2 rounded bg-volt text-[#111] text-[11px] font-bold align-[1px]">{String.fromCharCode(65 + i - grp[0])}</span>}{effName(e)}{swaps[e.id] && <Icon name="swap" size={13} className="inline ml-1.5 -mt-0.5" />}</span>
                        <span className="num text-lg">{d}/{rr.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {orphanGroups.length > 0 && (
                <>
                  <div className="eyebrow px-3 mt-5 mb-2">{exs.length ? 'Also logged (no longer in this plan day)' : 'Logged sets'}</div>
                  <div className="group">
                    {orphanGroups.map(([id, sets]) => (
                      <div key={id} className="row">
                        <span className="flex-1">{lib[Number(id)]?.name ?? 'Exercise'}</span>
                        <span className="text-[13px] text-sub text-right">{sets.map((s) => `${fw(Number(s.weight_kg))}×${s.reps}`).join('  ')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <label className="block mt-5">
                <span className="eyebrow px-1">Session notes</span>
                <textarea className="field !h-24 py-3 mt-2" placeholder="Energy, pump, anything to remember…" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
              </label>
              {!session.finished_at && exs.length > 0 && <button className="btn-ink w-full mt-5" onClick={finish} disabled={saving}>Finish workout<Icon name="check" size={20} strokeWidth={3} /></button>}
              {exs.length > 0 && <button className="btn-line w-full mt-3" onClick={() => setSheet(false)}>Back to logging</button>}
              <button className="w-full text-center text-[15px] font-semibold text-alert mt-6" onClick={discard}>Delete workout</button>
            </div>
          </div>
        </div>
      )}

      <PlateSheet open={plateOpen} onClose={() => setPlateOpen(false)} weight={shownWeight} unit={units} gear={gear} onGear={setGear} />
      {guideOpen && x && <ExerciseGuide name={name} cue={swapped ? null : x.cue} onClose={() => setGuideOpen(false)} />}
      {swapping && x && <ExercisePicker title="Swap for today" highlightMuscle={lib[x.exercise_id]?.muscle} onClose={() => setSwapping(false)} onPick={(e) => swapTo(e.id)} />}
    </div>
  );
}

function Stepper({ label, value, onChange, onMinus, onPlus, big, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; onMinus: () => void; onPlus: () => void; big?: boolean; inputMode: 'decimal' | 'numeric';
}) {
  return (
    <div className="card px-3 py-2.5">
      <div className="eyebrow px-1">{label}</div>
      <div className="flex items-center gap-3 mt-1">
        <button aria-label="decrease" onClick={onMinus} className={`shrink-0 rounded-2xl bg-card2 grid place-items-center font-display text-4xl text-ink active:scale-95 transition ${big ? 'w-16 h-16' : 'w-14 h-14'}`}>−</button>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode} placeholder="0"
          className={`num w-full min-w-0 text-center bg-transparent outline-none text-ink placeholder:text-rule ${big ? 'text-[84px] leading-none' : 'text-[56px] leading-none'}`} />
        <button aria-label="increase" onClick={onPlus} className={`shrink-0 rounded-2xl bg-ink text-on-ink grid place-items-center font-display text-4xl active:scale-95 transition ${big ? 'w-16 h-16' : 'w-14 h-14'}`}>+</button>
      </div>
    </div>
  );
}
