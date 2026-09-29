'use client';

import { useSyncExternalStore } from 'react';
import { getState, subscribe } from '@/lib/offline';

const server = { online: true, lastPull: null as number | null };

function when(t: number | null) {
  if (!t) return null;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** Slim status pill above the tab bar while offline. */
export default function OfflineBanner() {
  const s = useSyncExternalStore(subscribe, getState, () => server);
  if (s.online) return null;
  const at = when(s.lastPull);
  return (
    <div role="status" className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-40 mx-auto max-w-xl rounded-2xl bg-inv text-on-inv px-4 py-2.5 shadow-lg">
      <div className="text-[14px] font-semibold">Offline · showing what&apos;s saved on this phone</div>
      <div className="text-[12px] opacity-70">{at ? `Updated ${at}. ` : ''}Changes can&apos;t be saved until you&apos;re back online.</div>
    </div>
  );
}
