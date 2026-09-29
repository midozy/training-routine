'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase, getSettings, type Settings } from '@/lib/supabase';
import { setStatusBarDark } from '@/lib/native';

const LB = 2.2046226218;

type Prefs = {
  settings: Settings | null;
  units: 'kg' | 'lb';
  /** kg → display value in the user's unit (rounded sensibly). */
  w: (kg: number) => number;
  /** display string, e.g. "82.5" */
  fw: (kg: number) => string;
  /** user-entered value in their unit → kg for storage */
  toKg: (v: number) => number;
  step: number;
  save: (patch: Partial<Settings>) => Promise<void>;
  reload: () => Promise<void>;
};

const Ctx = createContext<Prefs | null>(null);
export const usePrefs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
};

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch {}
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const forDark = theme === 'system' ? (m.getAttribute('media') ?? '').includes('dark') : dark;
    m.setAttribute('content', forDark ? '#0d0d0b' : '#f4f1ea');
  });
  setStatusBarDark(dark);
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  const reload = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    applyTheme(s.theme ?? 'system');
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Follow the phone's appearance live when set to "system".
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => settings?.theme === 'system' && applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [settings?.theme]);

  const save = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    if (patch.theme) applyTheme(patch.theme);
    const uid = settings?.user_id;
    if (uid) await supabase.from('user_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', uid);
  }, [settings?.user_id]);

  const units = settings?.units ?? 'kg';
  const w = useCallback((kg: number) => (units === 'lb' ? Math.round(kg * LB * 2) / 2 : Math.round(kg * 100) / 100), [units]);
  const fw = useCallback((kg: number) => trim(w(kg)), [w]);
  const toKg = useCallback((v: number) => (units === 'lb' ? Math.round((v / LB) * 100) / 100 : v), [units]);

  return (
    <Ctx.Provider value={{ settings, units, w, fw, toKg, step: units === 'lb' ? 5 : 2.5, save, reload }}>
      {children}
    </Ctx.Provider>
  );
}
