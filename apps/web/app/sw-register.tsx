'use client';
import { useEffect } from 'react';
import { useListenForInstall } from '../lib/install';
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
