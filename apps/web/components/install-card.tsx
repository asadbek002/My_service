'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Smartphone, X } from 'lucide-react';
import { detectPlatform } from '../lib/install';

const HIDDEN = 'ms_install_card_hidden';

/** On a phone, until installed or closed: put MyService on the home screen. */
export function InstallCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const p = detectPlatform();
    let hidden = false;
    try { hidden = localStorage.getItem(HIDDEN) === '1'; } catch { /* private mode */ }
    setShow(!hidden && ['android', 'ios', 'ios-other', 'in-app'].includes(p));
  }, []);
  if (!show) return null;
  const hide = () => { setShow(false); try { localStorage.setItem(HIDDEN, '1'); } catch { /* private mode */ } };
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong"><Smartphone className="h-5 w-5" /></span>
      <Link href="/install" className="min-w-0 flex-1 text-sm">
        <b className="block">Ilovani telefonga o&apos;rnating</b>
        <span className="text-mute">Bosh ekrandan bir bosishda ochiladi</span>
      </Link>
      <button onClick={hide} className="-mr-1 rounded-full p-1.5 text-mute hover:bg-black/[0.05]" aria-label="Yopish"><X className="h-4 w-4" /></button>
    </div>
  );
}
