'use client';

import { useEffect } from 'react';
import guide from '@/lib/guide.json';

type Entry = { gif: string; aka: string | null; setup: string; perform: string; avoid: string; primary: string[]; secondary: string[]; equipment: string };
const GUIDE = guide as Record<string, Entry>;

/** Resolve an exercise name to its guide entry. */
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
    <div className="fixed inset-0 z-[65] bg-black/40 fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`How to: ${name}`} onClick={(e) => e.stopPropagation()}
        className="sheet-in absolute inset-x-0 bottom-0 max-h-[94dvh] overflow-y-auto rounded-t-[22px] bg-bg pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur px-4 pt-2 pb-2">
          <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
          <div className="flex items-center justify-between mt-2">
            <span className="eyebrow">How to</span>
            <button onClick={onClose} className="text-[16px] font-semibold text-ink">Done</button>
          </div>
        </div>

        <div className="px-4">
          <h2 className="display text-[40px]">{name}</h2>
          {g?.aka && <div className="text-[14px] text-sub mt-1">Also called {g.aka}</div>}
        </div>

        {g ? (
          <>
            <div className="mt-4 mx-4 rounded-2xl overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.gif} alt={`${name} — start and end position`} className="w-full h-auto max-h-[44vh] object-contain block mx-auto" />
            </div>
            <div className="px-5 mt-1.5 text-[12px] text-sub">Start ↔ end position</div>

            {cue && (
              <div className="mx-4 mt-4 rounded-2xl bg-inv text-on-inv p-4">
                <div className="eyebrow !text-volt">Coach&apos;s cue</div>
                <p className="mt-1.5 text-[17px] leading-snug">{cue}</p>
              </div>
            )}

            <div className="mx-4 mt-4 group">
              <Step n="1" title="Setup" text={g.setup} />
              <Step n="2" title="Perform" text={g.perform} />
              <Step n="3" title="Avoid" text={g.avoid} warn />
            </div>

            <div className="px-4 mt-5">
              <div className="eyebrow px-1">Muscles worked</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {g.primary.map((m) => <span key={m} className="pill !bg-volt !text-[#111]">{m}</span>)}
                {g.secondary.map((m) => <span key={m} className="pill !text-sub">{m}</span>)}
              </div>
            </div>
          </>
        ) : (
          <div className="mx-4 mt-5 card p-4 text-sub">
            {cue && <p className="text-ink mb-2">▲ {cue}</p>}
            No instructions for this exercise yet.
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, text, warn }: { n: string; title: string; text: string; warn?: boolean }) {
  return (
    <div className="flex gap-3 p-4">
      <span className={`num shrink-0 w-8 h-8 rounded-full grid place-items-center text-lg ${warn ? 'bg-alert text-white' : 'bg-ink text-on-ink'}`}>{n}</span>
      <div>
        <div className={`font-semibold text-[16px] ${warn ? 'text-alert' : ''}`}>{title}</div>
        <p className="mt-1 text-[15px] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
