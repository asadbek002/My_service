'use client';
import { useEffect } from 'react';
import { useListenForInstall } from '../lib/install';
import { startTranslating } from '../lib/i18n';
export function ServiceWorkerRegister() {
  // Chrome offers installing once, early: catch it here for the install page and the dashboard card.
  useListenForInstall();
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
