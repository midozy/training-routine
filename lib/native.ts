'use client';

/**
 * Thin wrapper over Capacitor plugins. Every function is a safe no-op on the web,
 * so the same code runs on Vercel and inside the iOS app.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = () => Capacitor.isNativePlatform();

const REST_ID = 4201;

export async function initNative() { /* status bar style is set by applyTheme() */ }

/** Style.Dark = light text (for dark backgrounds); Style.Light = dark text. */
export async function setStatusBarDark(dark: boolean) {
  if (!isNative()) return;
  try { await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch {}
}

export async function tap(kind: 'light' | 'medium' | 'heavy' = 'light') {
  if (!isNative()) return;
  const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  try { await Haptics.impact({ style }); } catch {}
}

export async function success() {
  if (!isNative()) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
}

export async function keepScreenOn(on: boolean) {
  if (!isNative()) return;
  try { on ? await KeepAwake.keepAwake() : await KeepAwake.allowSleep(); } catch {}
}

/** Ask once, when the first rest timer starts. */
async function ensureNotifyPermission() {
  const p = await LocalNotifications.checkPermissions();
  if (p.display === 'granted') return true;
  if (p.display === 'denied') return false;
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

/** Lock-screen alert when rest ends (fires even if the phone is locked or the app is in the background). */
export async function scheduleRestAlert(endAt: number, nextUp: string) {
  if (!isNative()) return;
  try {
    await cancelRestAlert();
    if (!(await ensureNotifyPermission())) return;
    await LocalNotifications.schedule({
      notifications: [{ id: REST_ID, title: 'Rest over — GO', body: nextUp, schedule: { at: new Date(endAt), allowWhileIdle: true } }],
    });
  } catch {}
}

export async function cancelRestAlert() {
  if (!isNative()) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }); } catch {}
}

/** For the Profile screen: 'granted' | 'denied' | 'prompt' | 'web'. */
export async function notifyStatus(): Promise<'granted' | 'denied' | 'prompt' | 'web'> {
  if (!isNative()) return 'web';
  try { const p = await LocalNotifications.checkPermissions(); return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'; }
  catch { return 'prompt'; }
}
export async function requestNotify() {
  if (!isNative()) return false;
  try { return (await LocalNotifications.requestPermissions()).display === 'granted'; } catch { return false; }
}
