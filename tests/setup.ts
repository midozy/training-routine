import { vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { cleanup } from '@testing-library/react';

// next/navigation + next/link without a running Next app
vi.mock('next/navigation', async () => {
  const { route, nav } = await import('./nav');
  return { useRouter: () => nav, usePathname: () => route.path, useSearchParams: () => new URLSearchParams(route.search) };
});
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => createElement('a', { href, ...rest }, children),
}));

// things a real phone browser has and jsdom does not
class RO { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', RO);
Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });
window.HTMLElement.prototype.scrollIntoView = () => {};
window.alert = vi.fn(); window.confirm = vi.fn(() => true); window.prompt = vi.fn(() => 'Test');

afterEach(() => { cleanup(); localStorage.clear(); });
