'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) {
      setMsg(res.error.message.includes('Database error') ? 'Sign-ups are currently closed.' : res.error.message);
    } else if (mode === 'up' && !res.data.session) {
      const r = await supabase.auth.signInWithPassword({ email, password });
      if (r.error) setMsg(r.error.message);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+28px)] pb-[calc(env(safe-area-inset-bottom)+24px)] max-w-md mx-auto">
      <div className="eyebrow">Team Zoher · High Volume Pro Split</div>
      <h1 className="display text-[96px] mt-6">Train<br /><span className="hl">Heavy.</span><br />Log it.</h1>

      <form onSubmit={submit} className="mt-auto space-y-6">
        <label className="block">
          <span className="eyebrow">Email</span>
          <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="eyebrow">Password</span>
          <input className="field" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {msg && <p className="text-sm text-alert">{msg}</p>}
        <button className="btn-ink w-full" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Sign in →' : 'Create account →'}</button>
        <button type="button" className="eyebrow w-full text-center underline underline-offset-4" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'First time? Create your account' : 'Have an account? Sign in'}
        </button>
        <p className="text-xs text-sub text-center">
          By continuing you agree to the <a href="/terms/" className="underline">Terms &amp; health disclaimer</a> and <a href="/privacy/" className="underline">Privacy policy</a>.
        </p>
      </form>
    </div>
  );
}
