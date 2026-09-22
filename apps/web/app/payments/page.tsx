'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Calendar,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

type Payment = {
  id: string;
  kind: string;
  amount: string;
  method: string;
  reason?: string;
  createdAt: string;
  order: {
    number: string;
    status: string;
    customer: { firstName: string; phone: string };
  };
};

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<Payment[]>('/payments')
      .then(setPayments)
      .catch(v => {
        if (v instanceof Error && v.message === 'SESSION_EXPIRED') {
          router.replace('/login');
        } else {
          setError(v instanceof Error ? v.message : 'Xatolik yuz berdi');
        }
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const totalRevenue = payments
    .filter(p => p.kind === 'PAYMENT')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalRefunds = payments
    .filter(p => p.kind === 'REFUND')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const netCash = totalRevenue - totalRefunds;

  const filtered = payments.filter(
    p =>
      p.order.number.toLowerCase().includes(search.toLowerCase()) ||
      p.order.customer.firstName.toLowerCase().includes(search.toLowerCase()) ||
      p.order.customer.phone.includes(search) ||
      p.method.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell subtitle="Moliya va toʻlovlar" title="Kassa va toʻlovlar jurnali">
      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Sof tushum (Net Cash)
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">
                  {netCash.toLocaleString('uz-UZ')} soʻm
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center font-bold">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Jami qabul qilingan
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  +{totalRevenue.toLocaleString('uz-UZ')} soʻm
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 flex items-center justify-center">
                <ArrowDownLeft className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Qaytarilgan mablagʻlar
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                  -{totalRefunds.toLocaleString('uz-UZ')} soʻm
                </h3>
              </div>
              <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Filter */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Buyurtma raqami, mijoz yoki toʻlov usuli..."
              className="pl-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-zinc-500 font-medium">
            Jami: <strong className="text-zinc-900 dark:text-zinc-100">{filtered.length}</strong> ta operatsiya
          </span>
        </div>

        {/* Transactions Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-zinc-400">Yuklanmoqda...</div>
            ) : filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Sana & Vaqt</th>
                      <th className="py-3 px-4">Buyurtma</th>
                      <th className="py-3 px-4">Mijoz</th>
                      <th className="py-3 px-4">Turi</th>
                      <th className="py-3 px-4">Toʻlov usuli</th>
                      <th className="py-3 px-4 text-right">Summa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filtered.map(p => (
                      <tr
                        key={p.id}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 text-xs text-zinc-500">
                          {new Date(p.createdAt).toLocaleString('uz-UZ')}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {p.order.number}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {p.order.customer.firstName}
                          </div>
                          <div className="text-zinc-400 text-[11px]">{p.order.customer.phone}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            variant={p.kind === 'REFUND' ? 'destructive' : 'success'}
                            className="text-[10px]"
                          >
                            {p.kind === 'REFUND' ? 'Qaytarish' : 'Kirim toʻlov'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-[10px]">
                            {p.method}
                          </Badge>
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-bold text-xs ${
                            p.kind === 'REFUND'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {p.kind === 'REFUND' ? '-' : '+'}
                          {Number(p.amount).toLocaleString('uz-UZ')} soʻm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-zinc-400">Toʻlovlar topilmadi</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
