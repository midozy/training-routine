'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { currentSession } from '@/lib/session';
import { pullAll, startSync } from '@/lib/sync';
import { clearLocal } from '@/lib/offline';
import OfflineBanner from '@/components/OfflineBanner';
import { PrefsProvider } from '@/lib/prefs';
import { syncHealth } from '@/lib/health';
import Tour from '@/components/Tour';
import { hideSplash } from '@/lib/native';
import { refreshWidget, reconcileWorkoutActivity } from '@/lib/widget';

// Reachable without signing in (App Store requires the privacy policy to be public).
const PUBLIC = ['/login', '/privacy', '/terms', '/help'];

const ICONS: Record<string, React.ReactNode> = {
  today: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  log: <><rect x="4" y="4" width="16" height="17" rx="2.5" /><path d="M8 2.5v3M16 2.5v3M4 9.5h16M8 13.5h3M8 17h6" /></>,
  progress: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  plan: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="18" r="1.2" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
};

const NAV = [
  { href: '/', label: 'Today', icon: 'today' },
  { href: '/history', label: 'History', icon: 'log' },
  { href: '/progress', label: 'Progress', icon: 'progress' },
  { href: '/plan', label: 'Plan', icon: 'plan' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const raw = usePathname();
  const path = raw.length > 1 ? raw.replace(/\/$/, '') : raw; // trailingSlash-safe
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    startSync();
    currentSession().then(setSession); // falls back to the saved login when offline
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (s) setSession(s);
      else if (e === 'SIGNED_OUT') { void clearLocal(); setSession(null); } // a null session at start-up is handled by currentSession above
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Keep the copy saved on the phone fresh whenever a signed-in user is present and online.
  useEffect(() => { if (session?.user.id) void pullAll(true); }, [session?.user.id]);

  // Keep the home-screen widget current: when you open the app, and again when you leave it (so it is right when you see your Home Screen).
  useEffect(() => {
    if (!session?.user.id) return;
    void refreshWidget(true);
    void reconcileWorkoutActivity();
    const on = () => { void refreshWidget(document.visibilityState === 'hidden'); if (document.visibilityState === 'visible') void reconcileWorkoutActivity(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [session?.user.id]);

  // Apple Health: import on open and on every return to the foreground (throttled inside).
  useEffect(() => {
    if (!session) return;
    syncHealth();
    const onVis = () => document.visibilityState === 'visible' && syncHealth();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session]);

  const isPublic = PUBLIC.includes(path);
  useEffect(() => { if (isPublic || session !== undefined) void hideSplash(); }, [isPublic, session]); // first real screen is ready
  useEffect(() => {
    if (session === null && !isPublic) router.replace('/login');
    if (session && path === '/login') router.replace('/');
  }, [session, path, isPublic, router]);

  if (isPublic) return <main className="min-h-dvh">{children}</main>;
  if (!session) return <div className="min-h-dvh grid place-items-center eyebrow">Loading</div>;

  // Workout is a focused, full-screen flow with its own chrome.
  if (path.startsWith('/workout')) return <PrefsProvider><main className="min-h-dvh">{children}</main><OfflineBanner variant="top" /></PrefsProvider>;

  return (
    <PrefsProvider>
      <main key={path} className="page-in mx-auto max-w-xl min-h-dvh px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-32">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-50 backdrop-blur-xl bg-[var(--tabbar)] border-t border-rule safe-bottom">
        <div className="mx-auto max-w-xl grid grid-cols-5 pt-1.5">
          {NAV.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className="flex flex-col items-center gap-0.5 pb-1.5" aria-current={active ? 'page' : undefined}>
                <span className={`grid place-items-center w-14 h-8 rounded-full transition-colors ${active ? 'bg-volt text-[#111]' : 'text-sub'}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.8} strokeLinecap="round" strokeLinejoin="round">{ICONS[n.icon]}</svg>
                </span>
                <span className={`text-[10.5px] font-semibold ${active ? 'text-ink' : 'text-sub'}`}>{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <Tour userId={session.user.id} />
      <OfflineBanner />
    </PrefsProvider>
  );
}

/** Large-title page header (iOS style, condensed display type). */
export function PageHead({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="mb-5 px-1">
      <div className="flex items-center justify-between min-h-6">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : <span />}
        {right}
      </div>
      <h1 className="display text-[48px] mt-1">{title}</h1>
    </header>
  );
}

/** iOS-style section label above a grouped list. */
export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between px-4 mt-7 mb-2">
      <span className="eyebrow">{children}</span>
      {right}
    </div>
  );
}
