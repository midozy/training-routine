'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AuthCard from '@/components/AuthCard';
import { supabase } from '@/lib/supabase';

type Phase = 'checking' | 'ready' | 'expired' | 'done';

/** Where the "reset your password" e-mail link lands (opened in the phone's browser). */
export default function ResetPassword() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fromQuery = new URLSearchParams(window.location.search);
    if (fromHash.get('error') || fromQuery.get('error')) { setPhase('expired'); return; } // e.g. error_code=otp_expired
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setPhase('ready'); });
    // The link may have been processed before this page started listening: look for the session it created.
    const t = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      setPhase((p) => (p === 'checking' ? (s.session ? 'ready' : 'expired') : p));
    }, 1500);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg('Use at least 8 characters.');
    if (pw !== pw2) return setMsg('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setBusy(false); return setMsg(error.message); }
    await supabase.auth.signOut(); // don't leave a signed-in session behind in this browser
    setBusy(false);
    setPhase('done');
  }

  if (phase === 'checking') return <AuthCard title="One moment"><p className="text-sub" role="status">Checking your link…</p></AuthCard>;

  if (phase === 'expired') return (
    <AuthCard title="Link expired">
      <p>This link has expired or was already used. Reset links work once and only for a short time.</p>
      <Link href="/login/" className="btn-ink w-full">Back to sign in to get a new link</Link>
    </AuthCard>
  );

  if (phase === 'done') return (
    <AuthCard title="Password updated">
      <p role="status">Your password has been changed. Open the Heavy app and sign in with your new password.</p>
      <Link href="/login/" className="btn-line w-full">Sign in on the web instead</Link>
    </AuthCard>
  );

  return (
    <AuthCard title="New password">
      <form onSubmit={submit} className="space-y-3">
        <input className="field" type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
        <input className="field" type="password" autoComplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        <p className="text-xs text-sub px-1">At least 8 characters. A longer phrase is better than a short complicated one.</p>
        {msg && <p className="text-sm text-alert px-1" role="alert">{msg}</p>}
        <button className="btn-ink w-full !mt-5" disabled={busy}>{busy ? '…' : 'Save new password'}</button>
      </form>
    </AuthCard>
  );
}
