'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCheck,
  Package,
  CreditCard,
  Receipt,
  ShieldCheck,
  BarChart3,
  Bell,
  Settings,
  Search,
  PlusCircle,
  LogOut,
  Menu,
  X,
  Smartphone,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { useMe } from '../../lib/queries';
import { logout } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: null },
  { href: '/orders', label: 'Buyurtmalar', icon: ClipboardList, permission: 'orders.view' },
  { href: '/customers', label: 'Mijozlar', icon: Users, permission: 'customers.view' },
  { href: '/staff', label: 'Xodimlar', icon: UserCheck, permission: 'staff.view' },
  { href: '/inventory', label: 'Ombor', icon: Package, permission: 'inventory.view' },
  { href: '/payments', label: "To'lovlar", icon: CreditCard, permission: 'payments.view' },
  { href: '/expenses', label: 'Xarajatlar', icon: Receipt, permission: 'reports.finance' },
  { href: '/warranties', label: 'Kafolatlar', icon: ShieldCheck, permission: 'orders.view' },
  { href: '/reports', label: 'Hisobotlar', icon: BarChart3, permission: 'reports.view' },
  { href: '/notifications', label: 'Xabarnomalar', icon: Bell, permission: 'orders.view' },
  { href: '/settings', label: 'Sozlamalar', icon: Settings, permission: 'settings.manage' },
];

export function AppShell({ children, title, subtitle, action }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  const filteredNav = navItems.filter(item => {
    if (!item.permission) return true;
    return me?.permissions?.includes(item.permission);
  });

  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shrink-0 sticky top-0 h-screen z-30">
        {/* Brand Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 flex items-center justify-center font-bold text-sm shadow-sm">
              MS
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50 block leading-tight">
                MY SERVICE
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wider uppercase">
                Premium CRM
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredNav.map(item => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-50'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white dark:text-zinc-900' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout Footer */}
        <div className="p-3 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between p-2 rounded-lg">
            <div className="min-w-0 flex-1 mr-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                {me?.firstName || 'Foydalanuvchi'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {me?.role || 'Xodim'}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={onLogout}
              title="Chiqish"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-8">
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 h-16 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <Link href="/dashboard" className="md:hidden flex items-center gap-2">
              <div className="h-7 w-7 rounded bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 flex items-center justify-center font-bold text-xs">
                MS
              </div>
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50">
                MY SERVICE
              </span>
            </Link>

            {/* Quick Search Shortcut */}
            <Link
              href="/search"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 text-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors w-48 md:w-64"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Qidiruv (telefon, IMEI...)...</span>
              <kbd className="ml-auto text-[10px] bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400 font-mono">
                ⌘K
              </kbd>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {me?.permissions?.includes('orders.create') && (
              <Link href="/orders/new">
                <Button size="sm" className="gap-1.5 shadow-sm font-semibold">
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Yangi qabul</span>
                </Button>
              </Link>
            )}
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden bg-zinc-900/60 backdrop-blur-sm">
            <div className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-white dark:bg-zinc-900 p-5 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <span className="font-bold text-base text-zinc-900 dark:text-zinc-50">Menyu</span>
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 overflow-y-auto py-4 space-y-1">
                {filteredNav.map(item => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <Button variant="destructive" className="w-full gap-2" onClick={onLogout}>
                  <LogOut className="h-4 w-4" />
                  Chiqish
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Page Header (Title + Subtitle + Action) */}
        {(title || action) && (
          <div className="px-4 sm:px-8 pt-6 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                {subtitle && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                    {subtitle}
                  </p>
                )}
                {title && (
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {title}
                  </h1>
                )}
              </div>
              {action && <div className="flex items-center gap-2.5">{action}</div>}
            </div>
          </div>
        )}

        {/* Main Body */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar (PWA Style) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-lg border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-around px-2">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center w-14 py-1 rounded-lg text-xs font-medium transition-colors ${
            pathname === '/dashboard' ? 'text-zinc-950 dark:text-zinc-50' : 'text-zinc-400'
          }`}
        >
          <LayoutDashboard className="h-5 w-5 mb-0.5" />
          <span className="text-[10px]">Asosiy</span>
        </Link>
        <Link
          href="/orders"
          className={`flex flex-col items-center justify-center w-14 py-1 rounded-lg text-xs font-medium transition-colors ${
            pathname?.startsWith('/orders') && pathname !== '/orders/new'
              ? 'text-zinc-950 dark:text-zinc-50'
              : 'text-zinc-400'
          }`}
        >
          <ClipboardList className="h-5 w-5 mb-0.5" />
          <span className="text-[10px]">Buyurtma</span>
        </Link>
        {me?.permissions?.includes('orders.create') && (
          <Link
            href="/orders/new"
            className="flex flex-col items-center justify-center -mt-4 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 h-12 w-12 rounded-full shadow-lg"
          >
            <PlusCircle className="h-6 w-6" />
          </Link>
        )}
        <Link
          href="/inventory"
          className={`flex flex-col items-center justify-center w-14 py-1 rounded-lg text-xs font-medium transition-colors ${
            pathname?.startsWith('/inventory') ? 'text-zinc-950 dark:text-zinc-50' : 'text-zinc-400'
          }`}
        >
          <Package className="h-5 w-5 mb-0.5" />
          <span className="text-[10px]">Ombor</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center w-14 py-1 rounded-lg text-xs font-medium text-zinc-400"
        >
          <Menu className="h-5 w-5 mb-0.5" />
          <span className="text-[10px]">Menyu</span>
        </button>
      </nav>
    </div>
  );
}
