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
      setMsg(res.error.message.includes('Database error') ? 'Sign-ups are closed for this app.' : res.error.message);
    } else if (mode === 'up' && !res.data.session) {
      // Account is auto-confirmed server-side; sign straight in.
      const r = await supabase.auth.signInWithPassword({ email, password });
      if (r.error) setMsg(r.error.message);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="mb-8">
          <div className="text-accent font-bold tracking-widest text-xs">HIGH VOLUME PRO SPLIT</div>
          <h1 className="text-3xl font-bold mt-1">Training Routine</h1>
        </div>
        <input className="field" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="field" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        {msg && <p className="text-sm text-red-400">{msg}</p>}
        <button type="button" className="text-sm text-muted w-full" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'First time? Create your account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
