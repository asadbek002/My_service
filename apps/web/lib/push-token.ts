/** The iPhone app's push device token for the signed-in user (kept to forget it on the server at sign-out). */
const KEY = 'ms_push_token';
let onTake: () => void = () => undefined;

export function savePushToken(token: string) {
  try { localStorage.setItem(KEY, token); } catch { /* private storage: unregistering on sign-out is then best effort */ }
}
/** Signing out: the token to unregister; the next sign-in registers the phone again. */
export function takePushToken(): string | null {
  onTake();
  try { const t = localStorage.getItem(KEY); localStorage.removeItem(KEY); return t; } catch { return null; }
}
export function onPushTokenTaken(cb: () => void) { onTake = cb; }
