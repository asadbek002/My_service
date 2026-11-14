/**
 * How fast the app is for the person using it, measured in their browser (network included), for the
 * platform's "Foydalanuvchida tezlik" card: the page load once per visit and every API round trip,
 * summed and sent in the background. Only numbers go: no addresses, ids or page contents.
 */
const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const API_BASE = rawBase.endsWith('/api') ? rawBase : rawBase.replace(/\/+$/, '') + '/api';

const on = () => typeof window !== 'undefined' && process.env.NODE_ENV === 'production' && !navigator.webdriver;
let api = { n: 0, ms: 0, b300: 0, b1000: 0 };
let listening = false;

function send(body: object) {
  // keepalive: still delivered when the page is closing.
  void fetch(API_BASE + '/public/perf', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
}

function flush() {
  if (!api.n) return;
  send({ api: { ...api, ms: Math.round(api.ms) } });
  api = { n: 0, ms: 0, b300: 0, b1000: 0 };
}

/** One API round trip, as the user waited for it. */
export function noteApiTime(ms: number) {
  if (!on() || !(ms >= 0) || ms > 60_000) return;
  api.n++; api.ms += ms; if (ms < 300) api.b300++; if (ms < 1000) api.b1000++;
  if (!listening) {
    listening = true;
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    addEventListener('pagehide', flush);
  }
  if (api.n >= 30) flush();
}

/** The page load (once per visit), once the browser has finished it. */
export function reportPageLoad() {
  if (!on()) return;
  try { if (sessionStorage.getItem('ms_pl')) return; sessionStorage.setItem('ms_pl', '1'); } catch { /* count anyway */ }
  const measure = () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav || nav.loadEventEnd <= 0) return;
    const ttfb = Math.round(nav.responseStart), load = Math.round(nav.loadEventEnd);
    if (ttfb >= 0 && ttfb <= 60_000 && load >= ttfb && load <= 120_000) send({ page: { ttfb, load } });
  };
  if (document.readyState === 'complete') setTimeout(measure, 0); else addEventListener('load', () => setTimeout(measure, 0), { once: true });
}
