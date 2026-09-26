'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/* ---------- Rest timer (global so it survives page changes) ---------- */
type TimerCtx = { start: (seconds: number) => void; stop: () => void };
const RestTimerContext = createContext<TimerCtx>({ start: () => {}, stop: () => {} });
export const useRestTimer = () => useContext(RestTimerContext);

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

function RestTimerBar({ endAt, total, onStop, onAdd }: { endAt: number; total: number; onStop: () => void; onAdd: (s: number) => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endAt]);
  const left = Math.max(0, Math.ceil((endAt - now) / 1000));
  useEffect(() => {
    if (left === 0 && !fired.current) { fired.current = true; beep(); }
  }, [left]);
  const pct = total ? Math.min(100, ((total - left) / total) * 100) : 100;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  return (
    <div className="fixed inset-x-0 bottom-[68px] z-40 px-3 safe-bottom pointer-events-none">
      <div className="mx-auto max-w-xl card overflow-hidden pointer-events-auto shadow-2xl">
        <div className="h-1 bg-line"><div className="h-1 bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="label">Rest</span>
          <span className={`text-2xl font-bold tabular-nums ${left === 0 ? 'text-good' : ''}`}>{left === 0 ? 'GO' : `${mm}:${ss}`}</span>
          <div className="ml-auto flex gap-2">
            <button className="h-9 px-3 rounded-lg border border-line text-sm" onClick={() => onAdd(-15)}>−15</button>
            <button className="h-9 px-3 rounded-lg border border-line text-sm" onClick={() => onAdd(15)}>+15</button>
            <button className="h-9 px-3 rounded-lg bg-line text-sm" onClick={onStop}>Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Navigation ---------- */
const NAV = [
  { href: '/', label: 'Today', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '/history', label: 'History', icon: 'M12 8v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/progress', label: 'Progress', icon: 'M4 19h16M6 16l4-5 3 3 5-7' },
  { href: '/body', label: 'Body', icon: 'M12 3a3 3 0 110 6 3 3 0 010-6zM6 21v-6a6 6 0 0112 0v6' },
  { href: '/plan', label: 'Plan', icon: 'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [timer, setTimer] = useState<{ endAt: number; total: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null && path !== '/login') router.replace('/login');
    if (session && path === '/login') router.replace('/');
  }, [session, path, router]);

  const start = useCallback((s: number) => setTimer({ endAt: Date.now() + s * 1000, total: s }), []);
  const stop = useCallback(() => setTimer(null), []);

  if (path === '/login') return <main className="min-h-dvh">{children}</main>;
  if (!session) return <div className="min-h-dvh grid place-items-center text-muted">Loading…</div>;

  return (
    <RestTimerContext.Provider value={{ start, stop }}>
      <main className="mx-auto max-w-xl min-h-dvh px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-40">{children}</main>
      {timer && (
        <RestTimerBar
          endAt={timer.endAt}
          total={timer.total}
          onStop={stop}
          onAdd={(d) => setTimer((t) => (t ? { endAt: Math.max(Date.now(), t.endAt + d * 1000), total: Math.max(1, t.total + d) } : t))}
        />
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 backdrop-blur safe-bottom">
        <div className="mx-auto max-w-xl grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.href === '/' ? path === '/' || path.startsWith('/workout') : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 pt-2 pb-1 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </RestTimerContext.Provider>
  );
}
