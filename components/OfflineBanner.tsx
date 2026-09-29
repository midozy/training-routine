'use client';

import { useSyncExternalStore } from 'react';
import { getState, subscribe } from '@/lib/offline';
import { discardFailed, retryFailed } from '@/lib/outbox';

const server = { online: true, lastPull: null as number | null, pending: 0, failed: null as string | null };

function when(t: number | null) {
  if (!t) return null;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}
const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

/** Status pill: offline, syncing, or a change the server refused (with Retry / Discard). `top` is the compact version used inside a workout. */
export default function OfflineBanner({ variant = 'bottom' }: { variant?: 'bottom' | 'top' }) {
  const s = useSyncExternalStore(subscribe, getState, () => server);
  const pos = variant === 'top'
    ? 'top-[calc(env(safe-area-inset-top)+6px)]'
    : 'bottom-[calc(env(safe-area-inset-bottom)+68px)]';
  const box = `fixed inset-x-4 ${pos} z-40 mx-auto max-w-xl rounded-2xl bg-inv text-on-inv px-4 py-2.5 shadow-lg`;

  if (s.failed) {
    return (
      <div role="alert" className={box}>
        <div className="text-[14px] font-semibold">{changes(s.pending)} waiting · one couldn&apos;t be saved to your account</div>
        <div className="text-[12px] opacity-70 break-words">{s.failed}</div>
        <div className="flex items-center gap-4 mt-2">
          <button className="px-4 h-8 rounded-full bg-volt text-[#111] text-[13px] font-bold" onClick={() => { void retryFailed(); }}>Retry</button>
          <button className="text-[13px] font-semibold underline opacity-80" onClick={() => {
            if (confirm('Discard the change that could not be saved, and anything that depends on it? This cannot be undone.')) void discardFailed();
          }}>Discard</button>
        </div>
      </div>
    );
  }
  if (!s.online) {
    const at = when(s.lastPull);
    return (
      <div role="status" className={box}>
        <div className="text-[14px] font-semibold">
          {s.pending > 0 ? `Offline · ${changes(s.pending)} saved on this phone` : "Offline · showing what's saved on this phone"}
        </div>
        {variant === 'bottom' && (
          <div className="text-[12px] opacity-70">
            {s.pending > 0 ? "They'll be sent automatically when you're back online. " : at ? `Updated ${at}. ` : ''}
            Workouts, sets and settings are saved here; other changes need a connection.
          </div>
        )}
      </div>
    );
  }
  if (s.pending > 0) {
    return (
      <div role="status" className={box}>
        <div className="text-[14px] font-semibold">Syncing {changes(s.pending)}…</div>
      </div>
    );
  }
  return null;
}
