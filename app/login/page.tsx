'use client';

import { useEffect, useState } from 'react';
import { supabase, authRedirect } from '@/lib/supabase';

type Mode = 'in' | 'up' | 'forgot';
type Notice = { kind: 'confirm' | 'reset'; email: string } | null;

const COOLDOWN_S = 60; // Supabase allows about one e-mail a minute per address

const friendly = (m: string) =>
  /database error/i.test(m) ? 'Sign-ups are currently closed.'
  : /invalid login credentials/i.test(m) ? "That email and password don't match. Forgot your password? Use the link below."
  : /rate limit|too many/i.test(m) ? 'Too many tries. Please wait a minute and try again.'
  : m;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('in');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [wait, setWait] = useState(0); // seconds until another e-mail may be requested

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const mail = email.trim();
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: authRedirect('/reset-password/') });
        if (error) return setMsg(friendly(error.message));
        setNotice({ kind: 'reset', email: mail }); setWait(COOLDOWN_S); // the same message whether or not the address has an account
        return;
      }
      if (mode === 'in') {
        const r = await supabase.auth.signInWithPassword({ email: mail, password });
        if (r.error) {
          if (/not confirmed/i.test(r.error.message)) { setNotice({ kind: 'confirm', email: mail }); return; }
          return setMsg(friendly(r.error.message));
        }
        return;
      }
      const up = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: authRedirect('/email-confirmed/') } });
      if (up.error) return setMsg(friendly(up.error.message));
      if (!up.data.session) { // signed up, but not signed in: either a confirmation e-mail is needed, or this is an account that skips it
        const r = await supabase.auth.signInWithPassword({ email: mail, password });
        if (r.error) {
          if (/not confirmed/i.test(r.error.message)) { setNotice({ kind: 'confirm', email: mail }); setWait(COOLDOWN_S); return; }
          return setMsg(friendly(r.error.message));
        }
      }
    } finally { setBusy(false); }
  }

  async function resend() {
    if (!notice || wait > 0) return;
    setMsg(null);
    if (notice.kind === 'confirm') {
      const { error } = await supabase.auth.resend({ type: 'signup', email: notice.email, options: { emailRedirectTo: authRedirect('/email-confirmed/') } });
      if (error) return setMsg(friendly(error.message));
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(notice.email, { redirectTo: authRedirect('/reset-password/') });
      if (error) return setMsg(friendly(error.message));
    }
    setWait(COOLDOWN_S);
  }

  const back = () => { setNotice(null); setMode('in'); setMsg(null); };

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

      {notice ? (
        <div className="mt-auto pt-10 space-y-3" role="status">
          <h2 className="display text-[36px]">Check your email</h2>
          <p className="text-[16px]">
            {notice.kind === 'confirm'
              ? <>We sent a confirmation link to <b>{notice.email}</b>. Open it, then come back here and sign in.</>
              : <>If an account exists for <b>{notice.email}</b>, we have sent a link to choose a new password. Open it on this phone.</>}
          </p>
          <p className="text-sm text-sub">Nothing there? Check your spam folder.</p>
          {msg && <p className="text-sm text-alert">{msg}</p>}
          <button className="btn-line w-full" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Send again in ${wait}s` : 'Send again'}</button>
          <button type="button" className="w-full text-center text-[15px] font-semibold text-ink py-2" onClick={back}>Back to sign in</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-auto pt-10 space-y-3">
          <input className="field" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {mode !== 'forgot' && (
            <input className="field" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          )}
          {mode === 'forgot' && <p className="text-sm text-sub px-1">Enter your email and we will send you a link to choose a new password.</p>}
          {mode === 'up' && <p className="text-xs text-sub px-1">At least 8 characters. A longer phrase is better than a short complicated one.</p>}
          {msg && <p className="text-sm text-alert px-1" role="alert">{msg}</p>}
          <button className="btn-ink w-full !mt-5" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
          {mode === 'in' && (
            <button type="button" className="w-full text-center text-[14px] font-semibold text-sub py-1" onClick={() => { setMode('forgot'); setMsg(null); }}>Forgot your password?</button>
          )}
          <button type="button" className="w-full text-center text-[15px] font-semibold text-ink py-2" onClick={() => { setMode(mode === 'up' ? 'in' : mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
            {mode === 'in' ? 'First time? Create your account' : mode === 'up' ? 'Have an account? Sign in' : 'Back to sign in'}
          </button>
          <p className="text-xs text-sub text-center pt-1">
            By continuing you agree to the <a href="/terms/" className="underline">Terms &amp; health disclaimer</a> and <a href="/privacy/" className="underline">Privacy policy</a>. <a href="/help/" className="underline">Need help?</a>
          </p>
        </form>
      )}
    </div>
  );
}
