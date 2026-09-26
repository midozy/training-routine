'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/', label: 'Today' },
  { href: '/history', label: 'Log' },
  { href: '/progress', label: 'Stats' },
  { href: '/body', label: 'Body' },
  { href: '/plan', label: 'Plan' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null && path !== '/login') router.replace('/login');
    if (session && path === '/login') router.replace('/');
  }, [session, path, router]);

  if (path === '/login') return <main className="min-h-dvh">{children}</main>;
  if (!session) return <div className="min-h-dvh grid place-items-center eyebrow">Loading</div>;

  // Workout is a focused, full-screen flow with its own chrome.
  if (path.startsWith('/workout')) return <main className="min-h-dvh">{children}</main>;

  return (
    <>
      <main className="mx-auto max-w-xl min-h-dvh px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-32">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-50 bg-ink text-paper safe-bottom">
        <div className="mx-auto max-w-xl grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className="relative h-16 grid place-items-center">
                {active && <span className="absolute top-0 inset-x-3 h-1 bg-volt" />}
                <span className={`font-display font-bold uppercase tracking-wider text-[15px] ${active ? 'text-volt' : 'text-paper/55'}`}>{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/** Shared page header: eyebrow + big condensed title. */
export function PageHead({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between h-5">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : <span />}
        {right}
      </div>
      <h1 className="display text-[56px] mt-2">{title}</h1>
    </header>
  );
}
