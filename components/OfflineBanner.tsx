'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Icon from '@/components/Icon';
import { getState, subscribe } from '@/lib/offline';
import { discardFailed, retryFailed } from '@/lib/outbox';

const server = { online: true, lastPull: null as number | null, pending: 0, failed: null as string | null };

// Dismissed state is shared by every copy of the banner (the workout screen has its own), and forgotten once the
// situation is back to normal, so the next time you go offline it appears again.
let dismissed: string | null = null;
const dsubs = new Set<() => void>();
const getDismissed = () => dismissed;
const subDismissed = (f: () => void) => { dsubs.add(f); return () => { dsubs.delete(f); }; };
const setDismissed = (k: string | null) => { if (dismissed !== k) { dismissed = k; dsubs.forEach((f) => f()); } };

function when(t: number | null) {
  if (!t) return null;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}
const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

/**
 * Status pill: offline, syncing, or a change the server refused (with Retry / Discard).
 * It never blocks taps (only its own buttons take them) and can be dismissed. `top` is the small centered version used
 * inside a workout, which leaves the Close and Overview buttons free.
 */
export default function OfflineBanner({ variant = 'bottom' }: { variant?: 'bottom' | 'top' }) {
  const s = useSyncExternalStore(subscribe, getState, () => server);
  const dz = useSyncExternalStore(subDismissed, getDismissed, () => null);
  const key = s.failed ? `failed:${s.failed}` : !s.online ? 'offline' : s.pending > 0 ? 'syncing' : null;
  useEffect(() => { if (key === null) setDismissed(null); }, [key]);
  if (!key || key === dz) return null;

  const top = variant === 'top';
  const wrap = `fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none ${top ? 'top-[calc(env(safe-area-inset-top)+6px)]' : 'bottom-[calc(env(safe-area-inset-bottom)+68px)]'}`;
  const pill = `relative rounded-2xl bg-inv text-on-inv shadow-lg ${top ? 'w-auto max-w-[62%] pl-3 pr-9 py-1.5' : 'w-full max-w-xl pl-4 pr-11 py-2.5'}`;
  const close = (
    <button aria-label="Dismiss" className="pointer-events-auto absolute right-0 top-0 w-10 h-10 grid place-items-center opacity-80" onClick={() => setDismissed(key)}>
      <Icon name="close" size={14} />
    </button>
  );

  if (s.failed) {
    return (
      <div className={wrap}>
        <div role="alert" className={pill}>
          {close}
          <div className={`${top ? 'text-[12px]' : 'text-[14px]'} font-semibold`}>{top ? "A change couldn't sync" : `${changes(s.pending)} waiting · one couldn't be saved to your account`}</div>
          {!top && <div className="text-[12px] opacity-70 break-words">{s.failed}</div>}
          <div className="flex items-center gap-4 mt-2 pointer-events-auto">
            <button className="px-4 h-8 rounded-full bg-volt text-[#111] text-[13px] font-bold" onClick={() => { void retryFailed(); }}>Retry</button>
            <button className="text-[13px] font-semibold underline opacity-80" onClick={() => {
              if (confirm('Discard the change that could not be saved, and anything that depends on it? Your workouts and logged sets are kept. This cannot be undone.')) void discardFailed();
            }}>Discard</button>
          </div>
        </div>
      </div>
    );
  }
  if (!s.online) {
    const at = when(s.lastPull);
    return (
      <div className={wrap}>
        <div role="status" className={pill}>
          {close}
          <div className={`${top ? 'text-[12px]' : 'text-[14px]'} font-semibold`}>
            {top ? (s.pending > 0 ? `Offline · ${s.pending} saved` : 'Offline') : s.pending > 0 ? `Offline · ${changes(s.pending)} saved on this phone` : "Offline · showing what's saved on this phone"}
          </div>
          {!top && (
            <div className="text-[12px] opacity-70">
              {s.pending > 0 ? "They'll be sent automatically when you're back online. " : at ? `Updated ${at}. ` : ''}
              Workouts, plans, sets and settings are saved here; account actions need a connection.
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <div role="status" className={pill}>
        {close}
        <div className={`${top ? 'text-[12px]' : 'text-[14px]'} font-semibold`}>{top ? `Syncing ${s.pending}…` : `Syncing ${changes(s.pending)}…`}</div>
      </div>
    </div>
  );
}
