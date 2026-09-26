'use client';

import { useEffect } from 'react';
import guide from '@/lib/guide.json';

type Entry = { gif: string; aka: string | null; setup: string; perform: string; avoid: string; primary: string[]; secondary: string[]; equipment: string };
const GUIDE = guide as Record<string, Entry>;

/** Resolve a plan label (e.g. "Machine Flyes") to its guide entry. */
export const guideFor = (name: string): Entry | undefined => GUIDE[name];

export default function ExerciseGuide({ name, cue, onClose }: { name: string; cue?: string | null; onClose: () => void }) {
  const g = GUIDE[name];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-paper overflow-y-auto" role="dialog" aria-modal="true" aria-label={`How to: ${name}`}>
      <div className="max-w-xl mx-auto pb-[calc(env(safe-area-inset-bottom)+28px)]">
        <div className="sticky top-0 z-10 bg-paper/95 backdrop-blur px-5 pt-[calc(env(safe-area-inset-top)+10px)] flex items-center justify-between h-[calc(env(safe-area-inset-top)+52px)]">
          <span className="eyebrow">How to</span>
          <button onClick={onClose} className="eyebrow text-ink">Close ✕</button>
        </div>

        <div className="px-5">
          <h2 className="display text-[44px]">{name}</h2>
          {g?.aka && <div className="eyebrow mt-2">aka {g.aka}</div>}
        </div>

        {g ? (
          <>
            <div className="mt-4 mx-5 border-2 border-ink bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.gif} alt={`${name} — start and end position`} className="w-full h-auto max-h-[46vh] object-contain block mx-auto" />
            </div>
            <div className="px-5 mt-1 text-[11px] text-sub">Start ↔ end position</div>

            {cue && (
              <div className="mx-5 mt-5 bg-ink text-paper p-4">
                <div className="eyebrow !text-volt">Trainer&apos;s cue</div>
                <p className="mt-2 text-[17px] leading-snug">{cue}</p>
              </div>
            )}

            <div className="px-5 mt-6 space-y-5">
              <Step n="01" title="Setup" text={g.setup} />
              <Step n="02" title="Perform" text={g.perform} />
              <Step n="03" title="Avoid" text={g.avoid} warn />
            </div>

            <div className="px-5 mt-8 border-t-2 border-ink pt-4">
              <div className="eyebrow">Muscles worked</div>
              <div className="flex flex-wrap gap-2 mt-3">
                {g.primary.map((m) => <span key={m} className="bg-volt border-2 border-ink px-2 py-1 font-display font-bold uppercase tracking-wide text-sm">{m}</span>)}
                {g.secondary.map((m) => <span key={m} className="border-2 border-rule px-2 py-1 font-display font-bold uppercase tracking-wide text-sm text-sub">{m}</span>)}
              </div>
              <div className="text-xs text-sub mt-3">Highlighted = primary · outlined = secondary</div>
            </div>
          </>
        ) : (
          <p className="px-5 mt-6 text-sub">No instructions for this exercise yet.</p>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, text, warn }: { n: string; title: string; text: string; warn?: boolean }) {
  return (
    <div className="grid grid-cols-[40px_1fr] gap-3">
      <span className={`num text-3xl leading-none ${warn ? 'text-alert' : ''}`}>{n}</span>
      <div>
        <div className={`font-display font-bold uppercase tracking-wide text-xl leading-none ${warn ? 'text-alert' : ''}`}>{title}</div>
        <p className="mt-1.5 text-[16px] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
