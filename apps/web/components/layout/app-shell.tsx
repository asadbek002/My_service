'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, ClipboardList, Users, CreditCard, BarChart3, Receipt, ShieldCheck, Bell, UserCog, Settings,
  Plus, Menu, X, LogOut, Search, ChevronLeft, LifeBuoy, Wrench,
} from 'lucide-react';
import { useMe, can } from '../../lib/queries';
import { logout } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Mark } from './mark';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  /** Where the back arrow leads; shown instead of the logo on phones. */
  back?: string;
  action?: React.ReactNode;
  /** Narrow reading column for forms and single records. */
  narrow?: boolean;
}

const NAV = [
  { href: '/dashboard', label: 'Asosiy', icon: Home, permission: null },
  { href: '/orders', label: 'Buyurtmalar', icon: ClipboardList, permission: 'orders.view' },
  { href: '/customers', label: 'Mijozlar', icon: Users, permission: 'customers.view' },
  { href: '/payments', label: "To'lovlar", icon: CreditCard, permission: 'payments.view' },
  { href: '/reports', label: 'Hisobot', icon: BarChart3, permission: 'reports.view' },
  { href: '/parts', label: 'Zapchastlar', icon: Wrench, permission: 'orders.view' },
  { href: '/expenses', label: 'Xarajatlar', icon: Receipt, permission: 'reports.finance' },
  { href: '/warranties', label: 'Kafolatlar', icon: ShieldCheck, permission: 'orders.view' },
  { href: '/notifications', label: 'Xabarlar', icon: Bell, permission: 'orders.view' },
  { href: '/staff', label: 'Xodimlar', icon: UserCog, permission: 'staff.view' },
  { href: '/settings', label: 'Sozlamalar', icon: Settings, permission: 'settings.manage' },
] as const;

const isActive = (pathname: string, href: string) =>
  href === '/dashboard' ? pathname === href : pathname === href || (pathname.startsWith(href + '/') && !(href === '/orders' && pathname === '/orders/new'));

export function AppShell({ children, title, back, action, narrow }: AppShellProps) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { data: me, error } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);

  // A temporary password blocks every business request; the dashboard hosts the change form.
  useEffect(() => {
    if (me?.mustChangePassword && pathname !== '/dashboard') router.replace('/dashboard');
  }, [me?.mustChangePassword, pathname, router]);
  useEffect(() => {
    if (error?.message === 'SESSION_EXPIRED') router.replace('/login');
  }, [error, router]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const onLogout = async () => {
    try { await logout(); } finally { router.replace(me?.support ? '/platform' : '/login'); }
  };
  const nav = NAV.filter(item => !item.permission || can(me, item.permission));
  const canCreate = can(me, 'orders.create');

  // Sub-pages (a back arrow) drop the phone tab bar: the screen belongs to the task, and
  // the ActionBar takes the bottom edge instead of stacking two bars under the thumb.
  const tabs = !back;

  return (
    <div className="min-h-[100dvh] lg:flex" style={{
      // Where a pinned ActionBar sits on phones: on top of the tab bar, or on the screen edge.
      ['--ab-bottom' as string]: tabs ? 'calc(4rem + env(safe-area-inset-bottom))' : '0px',
      ['--ab-pad' as string]: tabs ? '0.75rem' : 'calc(0.75rem + env(safe-area-inset-bottom))',
    }}>
      {/* Desktop sidebar — ink, so the work area stays paper */}
      <aside className="on-ink sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-ink text-white lg:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-2.5 px-5">
          <Mark />
          <span className="text-sm font-bold tracking-[0.14em]">MY SERVICE</span>
        </Link>
        {canCreate && (
          <div className="px-3 pb-2 pt-2">
            <Link href="/orders/new" className="flex h-11 items-center justify-center gap-2 rounded-md bg-brand text-sm font-semibold text-ink transition-colors hover:bg-brand-strong">
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Yangi qabul
            </Link>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map(item => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                className={cn('group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors', active ? 'bg-white/10 font-semibold text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white')}>
                <item.icon className={cn('h-4 w-4 shrink-0', active && 'text-brand')} />
                <span className="flex-1">{item.label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-lg bg-white/[0.06] p-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">{me?.firstName?.[0] ?? '·'}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me?.firstName ?? '…'}</p>
            <p className="text-xs text-white/60">{me?.role === 'OWNER' ? 'Boshliq' : 'Xodim'}</p>
          </div>
          <button onClick={onLogout} className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Chiqish" title="Chiqish">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {me?.support && (
          <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            <LifeBuoy className="h-3.5 w-3.5 shrink-0" /> Yordam rejimi: siz servisga boshliq nomidan kirdingiz. Amallar jurnalga yoziladi.
          </div>
        )}
        <header className="sticky top-0 z-20 border-b bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
          <div className={cn('mx-auto flex h-14 items-center gap-2 px-4 lg:h-16 lg:px-8', narrow ? 'max-w-3xl' : 'max-w-6xl')}>
            {back ? (
              <Link href={back} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/[0.05] active:bg-black/[0.08]" aria-label="Orqaga"><ChevronLeft className="h-6 w-6" /></Link>
            ) : (
              <Link href="/dashboard" className="lg:hidden" aria-label="Asosiy"><Mark /></Link>
            )}
            <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight lg:text-xl">{title}</h1>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
            {can(me, 'orders.view') && (
              <Link href="/search" className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-black/[0.05] active:bg-black/[0.08]" aria-label="Qidirish"><Search className="h-5 w-5" /></Link>
            )}
          </div>
        </header>
        <main className={cn('mx-auto w-full flex-1 px-4 pt-4 lg:px-8 lg:pb-12 lg:pt-8', tabs ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(2rem+env(safe-area-inset-bottom))]', narrow ? 'max-w-3xl' : 'max-w-6xl')}>
          {children}
        </main>
      </div>

      {/* Phone tab bar */}
      {tabs && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur lg:hidden" aria-label="Asosiy menyu">
          <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-1">
            <Tab href="/dashboard" label="Asosiy" icon={Home} active={isActive(pathname, '/dashboard')} />
            <Tab href="/orders" label="Buyurtma" icon={ClipboardList} active={isActive(pathname, '/orders')} />
            {canCreate ? (
              <Link href="/orders/new" className="flex flex-col items-center justify-end gap-0.5 pb-1.5" aria-label="Yangi qabul">
                <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-ink shadow-[0_6px_16px_-6px_rgba(255,106,43,0.7)] ring-4 ring-white transition-transform active:scale-95"><Plus className="h-6 w-6" strokeWidth={2.5} /></span>
                <span className="text-[11px] font-semibold">Qabul</span>
              </Link>
            ) : <span />}
            <Tab href="/customers" label="Mijozlar" icon={Users} active={isActive(pathname, '/customers')} />
            <button onClick={() => setMenuOpen(true)} className="flex flex-col items-center justify-center gap-1 text-mute" aria-haspopup="dialog">
              <span className="flex h-7 w-14 items-center justify-center rounded-full"><Menu className="h-5 w-5" /></span>
              <span className="text-[11px] font-medium">Menyu</span>
            </button>
          </div>
        </nav>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
          <button className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} aria-label="Yopish" />
          <div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white">
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-black/15" aria-hidden="true" />
            <div className="flex items-center gap-3 px-4 pb-3 pt-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-base font-semibold text-white">{me?.firstName?.[0] ?? '·'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{me?.firstName}</p>
                <p className="text-xs text-mute">{me?.login} · {me?.role === 'OWNER' ? 'Boshliq' : 'Xodim'}</p>
              </div>
              <button onClick={() => setMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05]" aria-label="Yopish"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
              {nav.map(item => {
                const active = isActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                    className={cn('flex min-h-[5rem] flex-col items-center justify-center gap-2 rounded-xl px-1 text-center text-xs transition-colors', active ? 'bg-ink font-semibold text-white' : 'bg-paper text-ink active:bg-black/[0.06]')}>
                    <item.icon className={cn('h-5 w-5', active && 'text-brand')} />{item.label}
                  </Link>
                );
              })}
            </div>
            <div className="px-3 pb-4">
              <button onClick={onLogout} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-semibold text-red-700">
                <LogOut className="h-4 w-4" /> Chiqish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center justify-center gap-1', active ? 'text-ink' : 'text-mute')}>
      <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', active && 'bg-brand-soft')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className={cn('text-[11px]', active ? 'font-semibold' : 'font-medium')}>{label}</span>
    </Link>
  );
}


/** Primary action pinned above the tab bar on phones, inline at the end of the form on desktop. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (<>
    {/* Keeps the last field clear of the pinned bar on phones. */}
    <div className="h-24 lg:hidden" aria-hidden="true" />
    <div className="fixed inset-x-0 bottom-[var(--ab-bottom,0px)] z-20 border-t bg-white/95 px-4 pb-[var(--ab-pad,0.75rem)] pt-3 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <div className="mx-auto flex max-w-3xl gap-2 [&>*]:flex-1 lg:justify-end lg:[&>*]:flex-none">{children}</div>
    </div>
  </>);
}
