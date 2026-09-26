'use client';

import { useEffect, useState } from 'react';
import { TrendChart } from '@/components/Charts';
import { supabase, fmtKg } from '@/lib/supabase';

type BW = { id: number; logged_on: string; weight_kg: number };
type M = { id: number; logged_on: string } & Record<(typeof FIELDS)[number]['key'], number | null>;

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

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
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
    setW('');
    load();
  }

  async function saveMeasurements(e: React.FormEvent) {
    e.preventDefault();
    const row: Record<string, number | string | null> = { logged_on: date };
    for (const f of FIELDS) row[f.key] = form[f.key] ? Number(form[f.key].replace(',', '.')) : null;
    const { error } = await supabase.from('measurements').upsert(row, { onConflict: 'user_id,logged_on' });
    if (error) return alert(error.message);
    setForm({});
    setShowM(false);
    load();
  }

  async function removeBw(id: number) {
    if (!confirm('Delete this entry?')) return;
    await supabase.from('bodyweight_logs').delete().eq('id', id);
    load();
  }

  const last = bw.at(-1);
  const weekAgo = bw.filter((x) => new Date(x.logged_on) <= new Date(Date.now() - 7 * 864e5)).at(-1);
  const avg7 = (() => {
    const cut = Date.now() - 7 * 864e5;
    const r = bw.filter((x) => new Date(x.logged_on).getTime() > cut);
    return r.length ? r.reduce((a, x) => a + x.weight_kg, 0) / r.length : null;
  })();
  const lastM = ms.at(-1), prevM = ms.at(-2);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Body</h1>

      <form onSubmit={saveWeight} className="card p-4 space-y-3">
        <div className="label">Log bodyweight</div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input className="field" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          <input className="field text-center" inputMode="decimal" placeholder="kg" value={w} onChange={(e) => setW(e.target.value)} />
          <button className="btn-primary">Save</button>
        </div>
      </form>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3"><div className="label">Latest</div><div className="text-xl font-bold mt-1">{last ? fmtKg(last.weight_kg) : '—'}</div></div>
        <div className="card p-3"><div className="label">7-day avg</div><div className="text-xl font-bold mt-1">{avg7 ? avg7.toFixed(1) : '—'}</div></div>
        <div className="card p-3"><div className="label">vs 1 wk</div><div className="text-xl font-bold mt-1">{last && weekAgo ? `${last.weight_kg - weekAgo.weight_kg >= 0 ? '+' : ''}${(last.weight_kg - weekAgo.weight_kg).toFixed(1)}` : '—'}</div></div>
      </div>

      {bw.length > 1 && (
        <section className="card p-4">
          <div className="label mb-2">Bodyweight trend</div>
          <TrendChart data={bw.map((x) => ({ label: short(x.logged_on), kg: x.weight_kg }))} lines={[{ key: 'kg', name: 'Bodyweight', color: '#22c55e' }]} height={180} />
        </section>
      )}

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <div className="label">Measurements{lastM ? ` · ${short(lastM.logged_on)}` : ''}</div>
          <button className="text-sm text-accent" onClick={() => setShowM(!showM)}>{showM ? 'Cancel' : '+ New'}</button>
        </div>
        {showM && (
          <form onSubmit={saveMeasurements} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs text-muted">{f.label} ({f.unit})</span>
                  <input className="field mt-1" inputMode="decimal" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            <button className="btn-primary w-full">Save measurements for {short(date)}</button>
          </form>
        )}
        {lastM && !showM && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
            {FIELDS.map((f) => {
              const v = lastM[f.key], p = prevM?.[f.key];
              if (v == null) return null;
              const d = p != null ? Number(v) - Number(p) : null;
              return (
                <div key={f.key} className="flex justify-between text-sm">
                  <span className="text-muted">{f.label}</span>
                  <span className="tabular-nums">{Number(v)}{f.unit === '%' ? '%' : ''}{d != null && d !== 0 && <span className={`ml-1 text-xs ${d > 0 ? 'text-good' : 'text-red-400'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}</span>
                </div>
              );
            })}
          </div>
        )}
        {!lastM && !showM && <p className="text-sm text-muted mt-2">No measurements yet.</p>}
      </section>

      {bw.length > 0 && (
        <section>
          <div className="label mb-2">Bodyweight log</div>
          <div className="card divide-y divide-line">
            {[...bw].reverse().slice(0, 14).map((x) => (
              <div key={x.id} className="flex justify-between p-3 text-sm">
                <span>{short(x.logged_on)}</span>
                <span className="flex gap-4"><span className="tabular-nums">{fmtKg(x.weight_kg)} kg</span><button className="text-muted" onClick={() => removeBw(x.id)}>✕</button></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
