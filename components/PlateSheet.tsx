'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { platesFor } from '@/lib/training';
import { BAR_OPTIONS, PLATE_CHOICES, fmtWeight, saveGear, type Gear, type Unit } from '@/lib/gear';

/** "What do I put on the bar?" for the weight on screen, with your bar and your gym's plates. */
export default function PlateSheet({ open, onClose, weight, unit, gear, onGear }: {
  open: boolean; onClose: () => void; weight: number; unit: Unit; gear: Gear; onGear: (g: Gear) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!open || !mounted) return null;

  const plan = platesFor(weight, gear.bar, gear.plates);
  const change = (g: Gear) => { saveGear(unit, g); onGear(g); };
  const toggle = (p: number) => change({ ...gear, plates: gear.plates.includes(p) ? gear.plates.filter((x) => x !== p) : [...gear.plates, p] });
  const chip = (on: boolean) => `h-11 min-w-11 px-3 rounded-full text-[15px] font-semibold ${on ? 'bg-ink text-on-ink' : 'bg-card2 text-sub'}`;

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40 fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Plates" onClick={(e) => e.stopPropagation()}
        className="sheet-in absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-[22px] bg-bg px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] max-h-[85dvh] overflow-y-auto">
        <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
        <div className="eyebrow mt-4">Load on the bar</div>
        <div className="display text-[44px] leading-none mt-1">{fmtWeight(weight)} {unit}</div>

        <div className="mt-4 rounded-2xl bg-card p-4">
          <div className="eyebrow">Each side</div>
          {plan.perSide.length ? (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {plan.perSide.map((p, i) => <span key={i} className="num text-[22px] h-11 min-w-11 px-3 rounded-lg bg-ink text-on-ink grid place-items-center">{fmtWeight(p)}</span>)}
            </div>
          ) : <div className="text-[17px] mt-2">{weight > gear.bar ? 'No plate fits' : 'Just the bar'}</div>}
          {!plan.exact && weight > 0 && <div className="text-[13px] text-sub mt-3">Closest you can load with these plates: <span className="text-ink font-semibold">{fmtWeight(plan.achieved)} {unit}</span></div>}
        </div>

        <div className="eyebrow mt-5">Your bar</div>
        <div className="flex gap-2 mt-2">
          {BAR_OPTIONS[unit].map((b) => <button key={b} className={chip(gear.bar === b)} onClick={() => change({ ...gear, bar: b })}>{fmtWeight(b)} {unit}</button>)}
        </div>
        <div className="eyebrow mt-5">Plates your gym has</div>
        <div className="flex flex-wrap gap-2 mt-2">
          {PLATE_CHOICES[unit].map((p) => <button key={p} className={chip(gear.plates.includes(p))} onClick={() => toggle(p)}>{fmtWeight(p)}</button>)}
        </div>
        <button className="btn-ink w-full mt-6" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
