'use client';
import { useEffect, useState } from 'react';
import { onPushTokenTaken, savePushToken } from './push-token';

/**
 * The App Store app (Capacitor, see mobile/ios) adds "MyServiceApp-iOS" to its user agent. Apple lets an app
 * sell a subscription only through its own in-app purchase, so inside that app the plan chooser and any
 * talk of paying elsewhere are hidden; the subscription is managed on the website.
 */
export const IOS_APP_UA = 'MyServiceApp-iOS';
export const inIosApp = () => typeof navigator !== 'undefined' && navigator.userAgent.includes(IOS_APP_UA);
export function useIosApp() {
  const [ios, setIos] = useState(false);
  useEffect(() => { setIos(inIosApp()); }, []);
  return ios;
}

/**
 * In the App Store app the home page (prices, "1 month free") is not shown: Apple counts a sales page inside
 * the app as steering to outside purchases. The app goes straight to signing in instead.
 */
export function IosAppLeavesHome() {
  useEffect(() => { if (inIosApp()) location.replace('/login'); }, []);
  return null;
}

// ---------- Native features of the iPhone app ----------
// The page comes from myserviceuz.uz; the app injects Capacitor's bridge into it, and these calls reach
// the app's Swift code: the camera, printing, the share sheet and push notifications. In a browser
// none of this exists and every helper answers "not handled", so the caller does the web thing.

type Listener = { remove: () => Promise<void> | void };
type NativeTools = {
  printImage(o: { data: string; name?: string }): Promise<{ completed: boolean }>;
  shareFile(o: { data: string; name: string; mime: string; text?: string }): Promise<{ completed: boolean }>;
  shareText(o: { text: string }): Promise<{ completed: boolean }>;
};
type CameraPlugin = {
  getPhoto(o: Record<string, unknown>): Promise<{ dataUrl?: string; format?: string }>;
};
type PushPlugin = {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(event: 'registration', cb: (t: { value: string }) => void): Promise<Listener>;
  addListener(event: 'registrationError', cb: (e: { error: string }) => void): Promise<Listener>;
  addListener(event: 'pushNotificationActionPerformed', cb: (a: { notification: { data?: Record<string, unknown> } }) => void): Promise<Listener>;
};

async function plugin<T>(name: string): Promise<T> {
  // The end-to-end tests stand in for the app here (apps/e2e/tests/ios-app.spec.ts).
  const stand = (window as unknown as { __nativeTest?: Record<string, unknown> }).__nativeTest?.[name];
  if (stand) return stand as T;
  const { registerPlugin } = await import('@capacitor/core');
  return registerPlugin<T & object>(name) as T;
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob);
});
/** "Cancelled" from the share sheet, the printer dialog or the camera is not an error. */
const cancelled = (e: unknown) => /cancel/i.test(String((e as { message?: string })?.message ?? e));

/** Print a picture (the receipt) with iOS's printer dialog. False when not in the app. */
export async function nativePrintImage(dataUrl: string, name: string): Promise<boolean> {
  if (!inIosApp()) return false;
  try { await (await plugin<NativeTools>('NativeTools')).printImage({ data: dataUrl, name }); } catch (e) { if (!cancelled(e)) throw e; }
  return true;
}

/** iOS share sheet with a file (a PDF, a receipt picture) and optional text. False when not in the app. */
export async function nativeShareFile(file: Blob, name: string, text?: string): Promise<boolean> {
  if (!inIosApp()) return false;
  const data = await blobToDataUrl(file);
  try { await (await plugin<NativeTools>('NativeTools')).shareFile({ data, name, mime: file.type || 'application/octet-stream', ...(text ? { text } : {}) }); } catch (e) { if (!cancelled(e)) throw e; }
  return true;
}

/** iOS share sheet with text (a link for the customer). False when not in the app. */
export async function nativeShareText(text: string): Promise<boolean> {
  if (!inIosApp()) return false;
  try { await (await plugin<NativeTools>('NativeTools')).shareText({ text }); } catch (e) { if (!cancelled(e)) throw e; }
  return true;
}

/**
 * The iPhone camera or photo library (iOS asks which). Undefined when not in the app (use the file
 * input); null when the user cancelled.
 */
export async function nativePhoto(): Promise<File | null | undefined> {
  if (!inIosApp()) return undefined;
  try {
    const photo = await (await plugin<CameraPlugin>('Camera')).getPhoto({
      resultType: 'dataUrl', source: 'PROMPT', quality: 80, width: 1600, correctOrientation: true, saveToGallery: false,
      promptLabelHeader: 'Rasm', promptLabelPhoto: 'Galereyadan tanlash', promptLabelPicture: 'Suratga olish', promptLabelCancel: 'Bekor qilish',
    });
    if (!photo.dataUrl) return null;
    const blob = await (await fetch(photo.dataUrl)).blob();
    return new File([blob], 'photo.' + (photo.format || 'jpeg'), { type: blob.type || 'image/jpeg' });
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

let push: PushPlugin | null = null;
let sendToken: (token: string) => Promise<unknown> = async () => undefined;
let openUrl: (url: string) => void = () => undefined;
let registered = false;

/**
 * Order alerts on the lock screen: once signed in, the app asks iOS for permission (iOS shows its
 * prompt only once), hands the device token to the server, and opens the order when an alert is tapped.
 * Runs once per sign-in, however many pages mount it.
 */
export async function startNativePush(send: (token: string) => Promise<unknown>, open: (url: string) => void, serverEnabled: () => Promise<boolean>) {
  if (!inIosApp()) return;
  sendToken = send; openUrl = open;
  if (registered) return;
  registered = true;
  try {
    if (!push) {
      push = await plugin<PushPlugin>('PushNotifications');
      // Taps first: an alert that launched the app is delivered as soon as this listener exists.
      await push.addListener('pushNotificationActionPerformed', a => {
        const url = a.notification.data?.url;
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) openUrl(url);
      });
      await push.addListener('registration', t => {
        savePushToken(t.value);
        void sendToken(t.value).catch(() => undefined);
      });
      await push.addListener('registrationError', () => undefined);
    }
    if (!await serverEnabled()) return;
    let permission = await push.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await push.requestPermissions();
    if (permission.receive === 'granted') await push.register();
  } catch { registered = false; }
}

// Signed out: the next sign-in registers the phone again.
onPushTokenTaken(() => { registered = false; });
