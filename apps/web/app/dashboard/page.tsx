'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Package,
  Users,
  PlusCircle,
  ArrowRight,
  ChevronRight,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { useMe, useDashboard, useOrders, useStaff } from '../../lib/queries';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '../../lib/schemas';
import { api, setAccessToken } from '../../lib/api';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';

export default function Dashboard() {
  const router = useRouter();
  const { data: me, error: meError, isLoading: meLoading } = useMe();
  const { data: report, isLoading: reportLoading } = useDashboard();
  const { data: orders = [], isLoading: ordersLoading } = useOrders();

  const pwForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  if (meError?.message === 'SESSION_EXPIRED') {
    router.replace('/login');
    return null;
  }

  async function onChangePassword(data: ChangePasswordInput) {
    const result = await api<{ accessToken: string; expiresIn: number }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    });
    setAccessToken(result.accessToken, result.expiresIn);
    window.location.reload();
  }

  if (me?.mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
        <Card className="w-full max-w-md shadow-xl border-zinc-200 dark:border-zinc-800">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Parolni yangilang</CardTitle>
            <CardDescription>
              Xavfsizlik uchun vaqtinchalik parolni o'zgartirishingiz shart.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="space-y-4">
              <FormField
                label="Joriy parol"
                error={pwForm.formState.errors.currentPassword?.message}
                required
              >
                <Input {...pwForm.register('currentPassword')} type="password" />
              </FormField>
              <FormField
                label="Yangi parol"
                error={pwForm.formState.errors.newPassword?.message}
                required
              >
                <Input
                  {...pwForm.register('newPassword')}
                  type="password"
                  placeholder="Kamida 12 belgi"
                />
              </FormField>
              <FormField
                label="Yangi parolni tasdiqlang"
                error={pwForm.formState.errors.confirmPassword?.message}
                required
              >
                <Input {...pwForm.register('confirmPassword')} type="password" />
              </FormField>
              {pwForm.formState.errors.root && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg">
                  {pwForm.formState.errors.root.message}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={pwForm.formState.isSubmitting}>
                Parolni yangilash
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isTechnician = me?.role === 'TECHNICIAN';
  const recentOrders = orders.slice(0, 7);

  // Technician-focused calculations
  const myAssignedOrders = orders.filter(o =>
    o.assignments?.some(a => a.technicianId === me?.id)
  );

  return (
    <AppShell
      subtitle="Boshqaruv paneli"
      title={isTechnician ? `Salom, ${me?.firstName || 'Usta'}` : 'Umumiy koʻrsatkichlar'}
      action={
        me?.permissions.includes('orders.create') ? (
          <Link href="/orders/new">
            <Button className="gap-2 shadow-sm">
              <PlusCircle className="h-4 w-4" />
              <span>Yangi qabul</span>
            </Button>
          </Link>
        ) : null
      }
    >
      <div className="space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Bugun qabul
                </p>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-1">
                  {report?.todayReceived ?? 0}
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                <Smartphone className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Ta'mirda
                </p>
                <h3 className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400 mt-1">
                  {report?.statuses?.find(s => s.status === 'IN_REPAIR')?.count ?? 0}
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Wrench className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Tayyor
                </p>
                <h3 className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
                  {report?.statuses?.find(s => s.status === 'READY')?.count ?? 0}
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  {isTechnician ? 'Mening faol ishlarim' : 'Bugungi tushum'}
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-1">
                  {isTechnician
                    ? myAssignedOrders.length
                    : report?.todayCash
                    ? `${Number(report.todayCash).toLocaleString('uz-UZ')} soʻm`
                    : '0 soʻm'}
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                {isTechnician ? <Clock className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Debt Warning Banner (if any) */}
        {!isTechnician && Number(report?.debt || 0) > 0 && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                  Mijozlar qarzdorligi mavjud
                </p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  Umumiy toʻlanmagan summa:{' '}
                  <strong className="font-bold">
                    {Number(report?.debt).toLocaleString('uz-UZ')} soʻm
                  </strong>
                </p>
              </div>
            </div>
            <Link href="/payments">
              <Button size="sm" variant="outline" className="text-xs border-red-300 dark:border-red-800">
                Toʻlovlar roʻyxati →
              </Button>
            </Link>
          </div>
        )}

        {/* Main Grid: Orders & Side Widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Orders List (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">
                    {isTechnician ? 'Menga biriktirilgan buyurtmalar' : "So'nggi buyurtmalar"}
                  </CardTitle>
                  <CardDescription>
                    {isTechnician
                      ? 'Siz ishlayotgan yoki kutilayotgan qurilmalar'
                      : "Eng so'nggi qabul qilingan va yangilangan ta'mirlar"}
                  </CardDescription>
                </div>
                <Link href="/orders">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-zinc-500">
                    Barchasi <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {(isTechnician ? myAssignedOrders.slice(0, 6) : recentOrders).map(order => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="p-4 flex items-center justify-between hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors block"
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {order.number}
                          </span>
                          <span className="text-xs text-zinc-400">·</span>
                          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 truncate">
                            {order.device?.brand} {order.device?.model}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
                          {order.complaint || "Shikoyat ko'rsatilmagan"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={order.status} />
                        <ChevronRight className="h-4 w-4 text-zinc-400 hidden sm:block" />
                      </div>
                    </Link>
                  ))}
                  {recentOrders.length === 0 && (
                    <div className="p-8 text-center text-sm text-zinc-400">
                      Hozircha buyurtmalar yoʻq
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 7-Day Revenue Trend Chart (Owner / Admin) */}
            {!isTechnician && report?.revenueByDay && report.revenueByDay.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Haftalik tushum dinamikasi</CardTitle>
                  <CardDescription>Soʻnggi 7 kunlik yopilgan taʼmirlar daromadi</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {report.revenueByDay.map(d => {
                    const max = Math.max(...report.revenueByDay!.map(x => Number(x.revenue)));
                    const pct = max > 0 ? Math.round((Number(d.revenue) / max) * 100) : 0;
                    return (
                      <div key={d.day} className="flex items-center gap-3 text-xs">
                        <span className="w-14 font-medium text-zinc-500 shrink-0">
                          {d.day.slice(5)}
                        </span>
                        <div className="flex-1 h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-28 text-right font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">
                          {Number(d.revenue).toLocaleString('uz-UZ')} soʻm
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Side Panels: Low Stock & Technicians (1 col) */}
          <div className="space-y-6">
            {/* Low Stock Alerts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-500" />
                  <span>Kam qolgan ehtiyot qismlar</span>
                </CardTitle>
                <Link href="/inventory">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500">
                    Ombor →
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {report?.lowStock && report.lowStock.length > 0 ? (
                  report.lowStock.map(s => (
                    <div key={s.partId} className="p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{s.branch}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold text-xs shrink-0">
                        {s.free} dona (min: {s.minimum})
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-zinc-400">
                    Barcha qismlar yetarli miqdorda
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Technicians Workload (Owner/Manager view) */}
            {!isTechnician && report?.workload && report.workload.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-zinc-600" />
                    <span>Ustalar ish yuki</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {report.workload.map(w => (
                    <div key={w.id} className="p-3.5 flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {w.name}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {w.active} ta faol
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Quick Links / Help */}
            <Card className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white border-0 shadow-md">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-zinc-300 text-xs font-medium">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Kafolat va Hujjatlar</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Har bir yopilgan buyurtma uchun avtomatik QR-kodli kafolat taloni va kvitansiya PDF
                  fayllari generatsiya qilinadi.
                </p>
                <Link href="/warranties" className="inline-block pt-1">
                  <Button size="sm" variant="secondary" className="text-xs font-medium">
                    Kafolatlarni tekshirish →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
