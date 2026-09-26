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
    <div className="min-h-dvh flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+36px)] pb-[calc(env(safe-area-inset-bottom)+24px)] max-w-md mx-auto page-in">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-volt">
          <svg width="22" height="22" viewBox="0 0 100 100" fill="#111"><rect x="20" y="46" width="60" height="8" /><rect x="24" y="28" width="8" height="44" /><rect x="68" y="28" width="8" height="44" /><rect x="14" y="36" width="8" height="28" /><rect x="78" y="36" width="8" height="28" /></svg>
        </span>
        <span className="display text-3xl">Heavy</span>
      </div>
      <h1 className="display text-[84px] mt-10">Lift<br /><span className="hl">heavy.</span><br />Log it.</h1>
      <p className="mt-4 text-sub text-[17px] max-w-xs">Every set, every rep, every gain — tracked.</p>

      <form onSubmit={submit} className="mt-auto pt-10 space-y-3">
        <input className="field" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="field" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {msg && <p className="text-sm text-alert px-1">{msg}</p>}
        <button className="btn-ink w-full !mt-5" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="w-full text-center text-[15px] font-semibold text-ink py-2" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'First time? Create your account' : 'Have an account? Sign in'}
        </button>
        <p className="text-xs text-sub text-center pt-1">
          By continuing you agree to the <a href="/terms/" className="underline">Terms &amp; health disclaimer</a> and <a href="/privacy/" className="underline">Privacy policy</a>.
        </p>
      </form>
    </div>
  );
}
