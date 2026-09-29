// Sign-in that survives having no signal. supabase-js reports "no session" when the access token has expired and
// can't be refreshed offline; we fall back to the login it saved on the phone so you aren't sent to the login screen.
import type { Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL } from './supabase';
import { isOnline } from './offline';

export function storedSession(): Session | null {
  try {
    const key = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const s = JSON.parse(localStorage.getItem(key) || 'null');
    return s?.user?.id ? (s as Session) : null;
  } catch { return null; }
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  return isOnline() ? null : storedSession();
}

export async function currentUser(): Promise<{ id: string; email: string | undefined } | null> {
  const s = await currentSession();
  return s ? { id: s.user.id, email: s.user.email } : null;
}
