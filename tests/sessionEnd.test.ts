import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/native', () => ({ isNative: () => false }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
import { effectiveEnd } from '@/lib/health';

const t = (m: number) => new Date(Date.UTC(2026, 9, 8, 10, 0) + m * 60e3).toISOString();

describe('effectiveEnd', () => {
  it('keeps a normal finish', () => expect(effectiveEnd(t(0), t(70), t(65))).toBe(t(70)));
  it('clamps a session left open for days to last set + 5 min', () =>
    expect(effectiveEnd(t(0), t(811), t(60))).toBe(t(65)));
  it('rejects an empty session with an absurd window', () => expect(effectiveEnd(t(0), t(811), null)).toBeNull());
  it('keeps a short empty session', () => expect(effectiveEnd(t(0), t(20), null)).toBe(t(20)));
});
