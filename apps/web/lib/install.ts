'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Chrome's install offer, kept from the moment the page loads (it fires once, early). */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let offer: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

/** Called once from the root layout so no page misses the offer. */
export function listenForInstall() {
  if (typeof window === 'undefined') return () => undefined;
  const onOffer = (e: Event) => { e.preventDefault(); offer = e as InstallPrompt; notify(); };
  const onInstalled = () => { installed = true; offer = null; notify(); };
  window.addEventListener('beforeinstallprompt', onOffer);
  window.addEventListener('appinstalled', onInstalled);
  return () => { window.removeEventListener('beforeinstallprompt', onOffer); window.removeEventListener('appinstalled', onInstalled); };
}
export function useListenForInstall() { useEffect(() => listenForInstall(), []); }

export type Platform = 'installed' | 'android' | 'ios' | 'ios-other' | 'in-app' | 'desktop';

/** Where the page runs, as far as installing goes. */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || installed) return 'installed';
  // Telegram, Instagram, Facebook and similar open links inside themselves, where nothing can be installed.
  if (/Instagram|FBAN|FBAV|Line\/|TikTok|musical_ly|Snapchat/i.test(ua) || 'TelegramWebview' in window || /Telegram/i.test(ua)) return 'in-app';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua) ? 'ios-other' : 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** The pending offer (Android Chrome, desktop Chrome/Edge) or null, re-rendering when it arrives. */
export function useInstallOffer() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => offer, () => null);
}
export async function install() {
  if (!offer) return false;
  const pending = offer;
  await pending.prompt();
  const { outcome } = await pending.userChoice;
  offer = null; notify();
  return outcome === 'accepted';
}
