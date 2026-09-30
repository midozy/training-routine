'use client';

/**
 * Thin wrapper over Capacitor plugins. Every function is a safe no-op on the web,
 * so the same code runs on Vercel and inside the iOS app.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNative = () => Capacitor.isNativePlatform();

const REST_ID = 4201;

/** Lock-screen / Dynamic Island countdown (Live Activity). Native: ios/App/App/RestActivityPlugin.swift. */
const RestActivity = registerPlugin<{
  start(o: { startAt: number; endAt: number; nextUp: string }): Promise<{ started: boolean; reason?: string }>;
  end(): Promise<void>;
  status(): Promise<{ enabled: boolean; activities: { id: string; state: string; endAt: number }[] }>;
}>('RestActivity');

export async function initNative() { /* status bar style is set by applyTheme() */ }

/** Hide the launch screen as soon as the first real screen is ready (capacitor.config.ts keeps a timer as a safety net). */
export async function hideSplash() {
  if (!isNative()) return;
  try { await SplashScreen.hide({ fadeOutDuration: 200 }); } catch { /* already hidden */ }
}

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

/* iOS never lets an app revoke its own notification permission, so the on/off switch
   is Heavy's own per-device preference, checked before every alert is scheduled. */
const ALERTS_KEY = 'heavy.restAlerts';
export function restAlertsEnabled(): boolean {
  try { return localStorage.getItem(ALERTS_KEY) !== 'off'; } catch { return true; }
}
export async function setRestAlertsEnabled(on: boolean) {
  try { localStorage.setItem(ALERTS_KEY, on ? 'on' : 'off'); } catch {}
  if (!on) await cancelRestAlert();
}

/**
 * Rest on the lock screen: a live countdown (Live Activity) plus an alert when rest ends
 * (fires even if the phone is locked or the app is in the background). Calling it again
 * during the same rest (+15s / −15s) updates the countdown.
 */
export async function scheduleRestAlert(endAt: number, nextUp: string, startAt: number = Date.now()) {
  if (!isNative()) return;
  if (!restAlertsEnabled()) return cancelRestAlert();
  try { await RestActivity.start({ startAt, endAt, nextUp }); } catch (e) { console.warn('[rest] live activity failed:', (e as Error)?.message ?? e); }
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }); // replace the pending alert, keep the countdown
    if (!(await ensureNotifyPermission())) return;
    await LocalNotifications.schedule({
      notifications: [{ id: REST_ID, title: 'Rest over — GO', body: nextUp, schedule: { at: new Date(endAt), allowWhileIdle: true } }],
    });
  } catch {}
}

export async function cancelRestAlert() {
  if (!isNative()) return;
  try { await RestActivity.end(); } catch {}
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
