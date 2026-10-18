'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, ClipboardPlus, ImageIcon, LifeBuoy, MapPin, Send, ShieldCheck, UserPlus, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { can, useMe } from '../lib/queries';
import { cn } from '../lib/utils';

export type Setup = { steps: { key: string; done: boolean }[]; done: number; total: number; dismissed: boolean };

/** Each step: what to do, why, and where in the app it is done. */
export const STEPS: Record<string, { title: string; text: string; href: string; icon: LucideIcon; optional?: boolean }> = {
  profile: { title: "Ustaxona ma'lumotlari", text: 'Telefon va manzil chekda va mijoz sahifasida chiqadi.', href: '/settings#service', icon: MapPin },
  logo: { title: 'Logotip', text: 'Ilova, chek va telefon ikonkasida ko‘rinadi.', href: '/settings#logo', icon: ImageIcon },
  warranty: { title: 'Kafolat shartlari', text: 'Qurilma berilganda chekka chiqadi.', href: '/settings#warranty', icon: ShieldCheck },
  telegram: { title: 'Telegramni ulash', text: 'Yangi qabul va kunlik hisobot sizga Telegramda keladi.', href: '/settings#telegram', icon: Send },
  staff: { title: "Xodim qo'shish", text: "Ustalar o'z loginida ishlaydi. Yolg'iz ishlasangiz — shart emas.", href: '/staff', icon: UserPlus, optional: true },
  order: { title: 'Birinchi qabul', text: 'Birinchi qurilmani qabul qilib, chek chiqarib ko‘ring.', href: '/orders/new', icon: ClipboardPlus },
};

export function useSetup() {
  const { data: me } = useMe();
  return useQuery({ queryKey: ['setup'], queryFn: () => api<Setup>('/settings/setup'), enabled: can(me, 'settings.manage') && !me?.support });
}
export function useDismissSetup() {
  const qc = useQueryClient();
  return async () => { await api('/settings/setup/dismiss', { method: 'PUT' }); await qc.invalidateQueries({ queryKey: ['setup'] }); };
}

/** Progress bar: one segment per step, filled when done. */
export function SetupBar({ setup, className }: { setup: Setup; className?: string }) {
  return (
    <div className={cn('flex h-2 gap-1', className)} role="img" aria-label={`${setup.done} / ${setup.total} bajarildi`}>
      {setup.steps.map(s => <span key={s.key} className={cn('flex-1 rounded-full', s.done ? 'bg-st-tayyor' : 'bg-tick')} />)}
    </div>
  );
}

/** Dashboard card for a service still setting up: progress and the next step, until done or hidden. */
export function SetupCard() {
  const { data } = useSetup();
  if (!data || data.dismissed || data.done >= data.total) return null;
  const next = data.steps.find(s => !s.done && !STEPS[s.key]?.optional) ?? data.steps.find(s => !s.done);
  const step = next ? STEPS[next.key] : undefined;
  return (
    <Link href="/setup" className="block rounded-2xl border bg-white p-4 transition-colors hover:border-ink/30 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Sozlash · {data.done}/{data.total}</p>
          <p className="mt-1 font-bold leading-snug">{step ? 'Keyingi qadam: ' + step.title : 'Deyarli tayyor'}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-mute" />
      </div>
      <SetupBar setup={data} className="mt-3" />
    </Link>
  );
}

export function SupportLink({ className }: { className?: string }) {
  return (
    <Link href="/help" className={cn('flex items-center gap-3 rounded-2xl border bg-white p-4 text-sm hover:border-ink/30', className)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper"><LifeBuoy className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><b className="block">Qiyinchilik bo&apos;ldimi?</b><span className="text-mute">Yordam bo&apos;limiga yozing — sozlab beramiz.</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
    </Link>
  );
}

export function StepRow({ k, done, index }: { k: string; done: boolean; index: number }) {
  const step = STEPS[k];
  if (!step) return null;
  const Icon = step.icon;
  return (
    <li>
      <Link href={step.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#F3F7F6]">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', done ? 'bg-st-tayyor text-white' : 'bg-paper text-ink')}>
          {done ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Icon className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block font-semibold', done && 'text-mute line-through decoration-1')}><span className="mr-1.5 font-mono text-[11px] text-mute no-underline">{String(index + 1).padStart(2, '0')}</span>{step.title}{step.optional && <span className="ml-1.5 text-xs font-normal text-mute">(ixtiyoriy)</span>}</span>
          {!done && <span className="block text-[13px] text-mute">{step.text}</span>}
        </span>
        {!done && <ChevronRight className="h-4 w-4 shrink-0 text-mute" />}
      </Link>
    </li>
  );
}
