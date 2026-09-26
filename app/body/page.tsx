'use client';

import { useEffect, useState } from 'react';
import { TrendChart } from '@/components/Charts';
import { PageHead } from '@/components/Shell';
import { supabase, fmtKg } from '@/lib/supabase';

type BW = { id: number; logged_on: string; weight_kg: number };
const FIELDS = [
  { key: 'chest_cm', label: 'Chest', unit: 'cm' },
  { key: 'shoulders_cm', label: 'Shoulders', unit: 'cm' },
  { key: 'arm_cm', label: 'Arm', unit: 'cm' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm' },
  { key: 'thigh_cm', label: 'Thigh', unit: 'cm' },
  { key: 'calf_cm', label: 'Calf', unit: 'cm' },
  { key: 'neck_cm', label: 'Neck', unit: 'cm' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
] as const;
type M = { id: number; logged_on: string } & Record<(typeof FIELDS)[number]['key'], number | null>;

const today = () => new Date().toLocaleDateString('en-CA');
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Body() {
  const [bw, setBw] = useState<BW[]>([]);
  const [ms, setMs] = useState<M[]>([]);
  const [w, setW] = useState('');
  const [date, setDate] = useState(today());
  const [form, setForm] = useState<Record<string, string>>({});
  const [showM, setShowM] = useState(false);

  async function load() {
    const [{ data: b }, { data: m }] = await Promise.all([
      supabase.from('bodyweight_logs').select('*').order('logged_on'),
      supabase.from('measurements').select('*').order('logged_on'),
    ]);
    setBw((b ?? []).map((x) => ({ ...x, weight_kg: Number(x.weight_kg) })));
    setMs(m ?? []);
  }
  useEffect(() => { load(); }, []);

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(w.replace(',', '.'));
    if (!v) return;
    const { error } = await supabase.from('bodyweight_logs').upsert({ logged_on: date, weight_kg: v }, { onConflict: 'user_id,logged_on' });
    if (error) return alert(error.message);
    setW(''); load();
  }

  async function saveMeasurements(e: React.FormEvent) {
    e.preventDefault();
    const row: Record<string, number | string | null> = { logged_on: date };
    for (const f of FIELDS) row[f.key] = form[f.key] ? Number(form[f.key].replace(',', '.')) : null;
    const { error } = await supabase.from('measurements').upsert(row, { onConflict: 'user_id,logged_on' });
    if (error) return alert(error.message);
    setForm({}); setShowM(false); load();
  }

  async function removeBw(id: number) {
    if (!confirm('Delete this entry?')) return;
    await supabase.from('bodyweight_logs').delete().eq('id', id); load();
  }

  const last = bw.at(-1);
  const weekAgo = bw.filter((x) => new Date(x.logged_on) <= new Date(Date.now() - 7 * 864e5)).at(-1);
  const r7 = bw.filter((x) => new Date(x.logged_on).getTime() > Date.now() - 7 * 864e5);
  const avg7 = r7.length ? r7.reduce((a, x) => a + x.weight_kg, 0) / r7.length : null;
  const delta = last && weekAgo ? last.weight_kg - weekAgo.weight_kg : null;
  const lastM = ms.at(-1), prevM = ms.at(-2);

  return (
    <div>
      <PageHead eyebrow="Composition" title="Body" />

      <div className="border-t-2 border-ink pt-3">
        <div className="eyebrow">Latest · {last ? short(last.logged_on) : 'no entries'}</div>
        <div className="flex items-end gap-2 mt-2">
          <span className="num text-[96px] leading-[.8]">{last ? fmtKg(last.weight_kg) : '—'}</span>
          <span className="text-sub mb-1">kg</span>
          {delta != null && <span className={`ml-auto num text-2xl px-2 ${delta <= 0 ? 'bg-volt' : 'bg-ink text-paper'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)} <span className="text-xs font-sans">/wk</span></span>}
        </div>
        <div className="eyebrow mt-3">7-day average · <span className="text-ink">{avg7 ? `${avg7.toFixed(1)} kg` : '—'}</span></div>
      </div>

      <form onSubmit={saveWeight} className="mt-6 grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label><span className="eyebrow">Date</span><input className="field" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span className="eyebrow">Weight kg</span><input className="field num text-2xl" inputMode="decimal" placeholder="00.0" value={w} onChange={(e) => setW(e.target.value)} /></label>
        <button className="btn-ink h-12 px-4 text-lg">Log</button>
      </form>

      {bw.length > 1 && (
        <section className="mt-8">
          <div className="eyebrow mb-3">Trend</div>
          <TrendChart data={bw.map((x) => ({ label: short(x.logged_on), kg: x.weight_kg }))} main={{ key: 'kg', name: 'Bodyweight' }} height={180} />
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
          <span className="display text-3xl">Measurements</span>
          <button className="eyebrow text-ink" onClick={() => setShowM(!showM)}>{showM ? 'Cancel ✕' : '+ New entry'}</button>
        </div>
        {showM && (
          <form onSubmit={saveMeasurements} className="mt-4">
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {FIELDS.map((f) => (
                <label key={f.key}><span className="eyebrow">{f.label} · {f.unit}</span>
                  <input className="field num text-2xl" inputMode="decimal" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            <button className="btn-ink w-full mt-6">Save for {short(date)}</button>
          </form>
        )}
        {lastM && !showM && (
          <>
            <div className="eyebrow mt-3">{short(lastM.logged_on)}{prevM ? ` · vs ${short(prevM.logged_on)}` : ''}</div>
            <div className="grid grid-cols-2">
              {FIELDS.map((f) => {
                const v = lastM[f.key], p = prevM?.[f.key];
                if (v == null) return null;
                const d = p != null ? Number(v) - Number(p) : null;
                return (
                  <div key={f.key} className="flex items-baseline justify-between py-2.5 border-b border-rule odd:pr-4 even:pl-4 even:border-l">
                    <span className="text-sm">{f.label}</span>
                    <span className="num text-2xl">{Number(v)}{d != null && d !== 0 && <span className="text-xs font-sans text-sub ml-1">{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {!lastM && !showM && <p className="text-sub mt-3">No measurements yet.</p>}
      </section>

      {bw.length > 0 && (
        <section className="mt-10">
          <div className="display text-3xl border-b-2 border-ink pb-2">Weigh-ins</div>
          {[...bw].reverse().slice(0, 14).map((x) => (
            <div key={x.id} className="flex items-center justify-between py-2.5 border-b border-rule">
              <span className="text-sm">{short(x.logged_on)}</span>
              <span className="flex items-center gap-5"><span className="num text-xl">{fmtKg(x.weight_kg)}</span><button className="text-sub text-sm" onClick={() => removeBw(x.id)}>✕</button></span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
