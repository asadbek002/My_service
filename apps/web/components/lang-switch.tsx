'use client';

import { useEffect, useState } from 'react';
import { getLang, setLang, type Lang } from '../lib/i18n';
import { cn } from '../lib/utils';

/** O'zbekcha | Русский. `dark` for the ink-coloured bands (landing header, sidebar). */
export function LangSwitch({ dark, className }: { dark?: boolean; className?: string }) {
  const [lang, set] = useState<Lang>('uz');
  useEffect(() => set(getLang()), []);
  const item = (l: Lang, label: string, title: string) => (
    <button type="button" lang={l} title={title} aria-pressed={lang === l} onClick={() => { if (l !== lang) setLang(l); }}
      className={cn('rounded-md px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.08em] transition-colors',
        lang === l ? (dark ? 'bg-white/15 text-white' : 'bg-ink text-white') : (dark ? 'text-white/60 hover:text-white' : 'text-mute hover:text-ink'))}>{label}</button>
  );
  return (
    <span translate="no" data-no-i18n role="group" aria-label="Til / Язык" className={cn('inline-flex items-center gap-0.5', className)}>
      {item('uz', 'UZ', "O'zbekcha")}
      {item('ru', 'RU', 'Русский')}
    </span>
  );
}
