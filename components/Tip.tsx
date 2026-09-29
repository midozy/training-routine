'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';

const KEY = 'heavy.tips.seen';
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

/** Small "?" that opens a short explanation. A volt dot marks tips that haven't been opened yet. */
export default function Tip({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);
  useEffect(() => { setSeen(read().includes(id)); }, [id]);

  function show() {
    setOpen(true);
    if (!seen) {
      setSeen(true);
      try { localStorage.setItem(KEY, JSON.stringify([...read(), id])); } catch {}
    }
  }

  return (
    <>
      {/* 40pt hit area around a 24pt visual */}
      <button type="button" aria-label={`About: ${title}`} onClick={(e) => { e.stopPropagation(); show(); }}
        className="shrink-0 w-10 h-10 -my-2.5 grid place-items-center normal-case tracking-normal">
        <span className="relative w-6 h-6 rounded-full bg-card2 text-sub grid place-items-center">
          <Icon name="info" size={14} />
          {!seen && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-volt ring-2 ring-bg" />}
        </span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/40 fade-in" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
            className="sheet-in absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-[22px] bg-bg px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-rule" />
            <h3 className="display text-[30px] mt-4">{title}</h3>
            <p className="mt-2 text-[16px] leading-snug">{children}</p>
            <button className="btn-ink w-full mt-5" onClick={() => setOpen(false)}>Got it</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
