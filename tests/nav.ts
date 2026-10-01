// The "address bar" the screens read through next/navigation, controllable from a test.
import { vi } from 'vitest';

export const route = { path: '/', search: '' };
export const nav = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() };
export function setRoute(path: string, search = '') { route.path = path; route.search = search; Object.values(nav).forEach((f) => f.mockClear()); }
