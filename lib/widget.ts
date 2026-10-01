// Home-screen widget bridge: hands a small snapshot (today's workout, this week) to the phone's shared storage and asks
// iOS to redraw the widget. Only does anything inside the iOS app.
import { registerPlugin } from '@capacitor/core';
import { isNative, endWorkoutActivity } from './native';
import { supabase } from './supabase';
import { buildSnapshot } from './widgetSnapshot';

type HeavyWidgetPlugin = { update(o: { json: string }): Promise<{ ok: boolean }> };
const HeavyWidget = registerPlugin<HeavyWidgetPlugin>('HeavyWidget');

let lastRun = 0;
let lastJson = '';

/** Rebuild the snapshot and push it if it changed. Quietly does nothing on the web or on any failure (the widget keeps its last data). */
export async function refreshWidget(force = false): Promise<void> {
  if (!isNative()) return;
  if (!force && Date.now() - lastRun < 4000) return;
  lastRun = Date.now();
  try {
    const snap = await buildSnapshot();
    if (!snap) return;
    const body = JSON.stringify({ ...snap, updatedAt: 0 });   // compare without the timestamp so an unchanged snapshot doesn't make iOS redraw
    if (!force && body === lastJson) return;
    lastJson = body;
    await HeavyWidget.update({ json: JSON.stringify(snap) });
  } catch { /* the widget simply keeps showing what it had */ }
}

/** If no workout is open (finished on another device, deleted, or the app was closed mid-workout and later finished), remove any leftover Live Activity. */
export async function reconcileWorkoutActivity(): Promise<void> {
  if (!isNative()) return;
  try {
    const { data } = await supabase.from('workout_sessions').select('id').is('finished_at', null).limit(1);
    if (data && data.length === 0) await endWorkoutActivity();
  } catch { /* leave it as it is */ }
}
