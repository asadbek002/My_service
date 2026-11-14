'use client';
import { useEffect } from 'react';
import { useListenForInstall } from '../lib/install';
import { reportError } from '../lib/report-error';
import { reportPageLoad } from '../lib/perf';
import { API_BASE, ApiError } from '../lib/api';
import { usePathname } from 'next/navigation';
import { startTranslating } from '../lib/i18n';
export function ServiceWorkerRegister() {
  // Chrome offers installing once, early: catch it here for the install page and the dashboard card.
  useListenForInstall();
  // Errors users hit reach the platform owner (see lib/report-error).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => { if (!(e.reason instanceof ApiError)) reportError(e.reason); };
    addEventListener('error', onError); addEventListener('unhandledrejection', onRejection);
    return () => { removeEventListener('error', onError); removeEventListener('unhandledrejection', onRejection); };
  }, []);
  // How fast the page opened for this user (platform statistics).
  useEffect(() => { reportPageLoad(); }, []);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

/** iOS Safari ignores user-scalable=no, so pinch is stopped here; double-tap zoom is off via touch-action in CSS. */
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('touchmove', pinch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('touchmove', pinch);
    };
  }, []);
  return null;
}

/** Lays the Russian text over the page once React has hydrated it (see lib/i18n). */
export function Translator() {
  useEffect(() => {
    // Suspense boundaries hydrate after this effect; touching their text first would break hydration.
    let timer = 0;
    const go = () => { timer = window.setTimeout(() => { if ('requestIdleCallback' in window) requestIdleCallback(startTranslating, { timeout: 300 }); else startTranslating(); }, 0); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    return () => { window.removeEventListener('load', go); clearTimeout(timer); };
  }, []);
  return null;
}

const PUBLIC_PAGES = new Set(['/', '/ru', '/signup', '/login', '/install', '/contact', '/terms', '/privacy']);
/** Counts a visit to a public page for the platform's statistics (no cookies, nothing personal; see api monitoring/visits). */
export function TrackVisit() {
  const path = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !PUBLIC_PAGES.has(path) || navigator.webdriver) return;
    try { if (sessionStorage.getItem('ms_v:' + path)) return; sessionStorage.setItem('ms_v:' + path, '1'); } catch { /* private mode: count anyway */ }
    const source = new URLSearchParams(location.search).get('utm_source') ?? undefined;
    void fetch(API_BASE + '/public/visit', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, ref: document.referrer || undefined, source }) }).catch(() => undefined);
  }, [path]);
  return null;
}
