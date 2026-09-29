"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const CARDS = [
  { t: 'Your plan, one day at a time', p: 'Today shows your next workout. Finish it and the plan moves on to the next day.' },
  { t: 'Log a set in two taps', p: 'Adjust weight and reps, then tap Done. Next time they are prefilled from your last session.' },
  { t: 'Rest, then go', p: 'A timer starts after every set. The iPhone app also alerts you on the lock screen.' },
  { t: 'See it add up', p: 'Progress tracks estimated 1RM, weekly sets per muscle and bodyweight. Apple Health is optional.' },
];

/** First-run tour: shown once per account on this device, skippable, replayable from Profile (event "heavy:tour"). */
export default function Tour({ userId }: { userId: string }) {
  const path = usePathname();
  const key = `heavy.tour.done.${userId}`;
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    const on = () => { setI(0); setOpen(true); };
    window.addEventListener('heavy:tour', on);
    return () => window.removeEventListener('heavy:tour', on);
  }, []);

  useEffect(() => {
    if (path !== '/') return;
    try { if (!localStorage.getItem(key)) { setI(0); setOpen(true); } } catch {}
  }, [path, key]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  const last = i === CARDS.length - 1;
  const done = () => { try { localStorage.setItem(key, '1'); } catch {} setOpen(false); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Heavy"
      className="fixed inset-0 z-[95] bg-bg flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] fade-in">
      <div className="mx-auto w-full max-w-xl flex-1 flex flex-col">
        <div className="flex items-center justify-between h-11">
          <span className="eyebrow">{String(i + 1).padStart(2, '0')} / {String(CARDS.length).padStart(2, '0')}</span>
          {!last && <button className="text-[16px] font-semibold text-ink h-11 px-1" onClick={done}>Skip</button>}
        </div>

        <div key={i} className="flex-1 flex flex-col justify-center page-in">
          <span className="inline-grid place-items-center w-20 h-20 rounded-2xl bg-volt text-[#111] num text-[48px] leading-none">{i + 1}</span>
          <h2 className="display text-[54px] mt-6">{CARDS[i].t}</h2>
          <p className="mt-4 text-[19px] leading-snug max-w-sm">{CARDS[i].p}</p>
        </div>

        <div className="flex gap-1.5 mb-5" aria-hidden="true">
          {CARDS.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-8 bg-ink' : 'w-1.5 bg-rule'}`} />)}
        </div>
        <div className="flex gap-3">
          {i > 0 && <button className="btn-line" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn-volt flex-1" onClick={() => (last ? done() : setI(i + 1))}>{last ? 'Get started' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
