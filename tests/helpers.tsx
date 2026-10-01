import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { PrefsProvider } from '@/lib/prefs';
import { makeCloud, type Cloud } from './fakeCloud';
import { setRoute } from './nav';

/** Records any error a screen throws while rendering (this is how a hook-order mistake shows up). */
class Boundary extends React.Component<{ onError: (e: Error) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { this.props.onError(e); }
  render() { return this.state.failed ? <div data-testid="crashed">This page could not be loaded</div> : this.props.children; }
}

export type Screen = ReturnType<typeof render> & { errors: Error[]; cloud: Cloud; logged: string[] };

/** Render a screen the way the app does (inside the settings provider), against a fake cloud. */
export async function renderScreen(ui: React.ReactElement, opts: { path: string; search?: string; cloud?: Cloud }): Promise<Screen> {
  const cloud = opts.cloud ?? makeCloud();
  setRoute(opts.path, opts.search ?? '');
  vi.stubGlobal('fetch', cloud.fetch);
  const errors: Error[] = [];
  const logged: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')); });
  const view = render(<Boundary onError={(e) => errors.push(e)}><PrefsProvider>{ui}</PrefsProvider></Boundary>);
  return Object.assign(view, { errors, cloud, logged });
}

/** Wait until the screen shows something, then assert it never crashed or logged a React error. */
export async function expectScreen(s: Screen, text: RegExp) {
  await waitFor(() => expect(s.container.textContent ?? '').toMatch(text), { timeout: 8000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); }); // let any second render happen: that is when a bad hook order blows up
  expect(s.errors.map((e) => e.message)).toEqual([]);
  expect(s.container.querySelector('[data-testid="crashed"]')).toBeNull();
  const reactErrors = s.logged.filter((m) => /hooks|Minified React error|Cannot read|is not a function|is not defined|Maximum update depth/i.test(m));
  expect(reactErrors).toEqual([]);
}
