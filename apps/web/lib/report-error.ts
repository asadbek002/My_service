import { API_BASE } from './api';

let sent = 0;
// Noise that is not our bug: browser extensions, a resize loop warning, a cancelled request.
const IGNORE = /ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|AbortError|Load failed|NetworkError|Failed to fetch/i;

/** Tells the platform owner (Telegram) that a user hit an error. Only the message, stack and page path go. */
export function reportError(error: unknown) {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    const text = `${e.name}: ${e.message}`;
    if (IGNORE.test(text + (e.stack ?? '')) || ++sent > 5) return;
    void fetch(API_BASE + '/public/client-error', {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text.slice(0, 500), stack: (e.stack ?? '').slice(0, 2000), url: location.pathname }),
    }).catch(() => undefined);
  } catch { /* reporting must never break the page */ }
}
