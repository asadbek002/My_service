'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  Package,
  Receipt,
  Users,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

type Finance = {
  revenue: string;
  received: string;
  refunds: string;
  netCash: string;
  partCost: string;
  operatingExpenses: string;
  contributionAfterExpenses: string;
  basis: string;
};
type Tech = {
  id: string;
  firstName: string;
  assigned: number;
  completed: number;
  repairSeconds: number;
};

export default function ReportsPage() {
  const router = useRouter();
  const [range, setRange] = useState('');
  const [activePreset, setActivePreset] = useState<number | 'custom'>(30);
  const [downloading, setDownloading] = useState(false);

  const { data: finance, isLoading: financeLoading } = useQuery<Finance>({
    queryKey: ['reports', 'finance', range],
    queryFn: () => api('/reports/finance' + range),
  });
  const { data: tech = [], isLoading: techLoading } = useQuery<Tech[]>({
    queryKey: ['reports', 'technicians'],
    queryFn: () => api('/reports/technicians'),
  });

  function applyPreset(days: number) {
    setActivePreset(days);
    const to = new Date(),
      from = new Date();
    from.setDate(to.getDate() - days + 1);
    setRange('?from=' + from.toISOString().slice(0, 10) + '&to=' + to.toISOString().slice(0, 10));
  }

  async function handleExport() {
    setDownloading(true);
    try {
      const blob = await apiBlob('/reports/export' + range);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myservice-orders-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AppShell
      subtitle="Tahlil va hisobotlar"
      title="Moliyaviy va operatsion hisobotlar"
      action={
        <Button
          onClick={handleExport}
          disabled={downloading}
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? 'Yuklanmoqda...' : 'CSV Eksport'}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Period Preset Selectors */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { days: 1, label: 'Bugun' },
              { days: 7, label: '7 kun' },
              { days: 30, label: '30 kun' },
              { days: 90, label: '3 oy' },
            ].map(p => (
              <Button
                key={p.days}
                variant={activePreset === p.days ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-8"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          <form
            className="flex items-center gap-2"
            onSubmit={e => {
              e.preventDefault();
              setActivePreset('custom');
              const d = new FormData(e.currentTarget as HTMLFormElement);
              setRange('?from=' + d.get('from') + '&to=' + d.get('to'));
            }}
          >
            <Input name="from" type="date" required className="h-8 text-xs w-36" />
            <span className="text-zinc-400 text-xs">—</span>
            <Input name="to" type="date" required className="h-8 text-xs w-36" />
            <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs">
              Koʻrsatish
            </Button>
          </form>
        </div>

        {/* Financial KPI Cards */}
        {finance && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Yetkazilgan tushum
                </span>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">
                  {Number(finance.revenue).toLocaleString('uz-UZ')} soʻm
                </h3>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Sof naqd pul oqimi
                </span>
                <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {Number(finance.netCash).toLocaleString('uz-UZ')} soʻm
                </h3>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Ehtiyot qismlar tannarxi
                </span>
                <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {Number(finance.partCost).toLocaleString('uz-UZ')} soʻm
                </h3>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Operatsion xarajatlar
                </span>
                <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {Number(finance.operatingExpenses).toLocaleString('uz-UZ')} soʻm
                </h3>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Technicians Productivity Table */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-500" />
              <span>Ustalar samaradorligi va ish vaqti</span>
            </CardTitle>
            <CardDescription>
              Har bir ustaning taʼmir soni va oʻrtacha sarflangan vaqti.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {techLoading ? (
              <div className="p-12 text-center text-sm text-zinc-400">Yuklanmoqda...</div>
            ) : tech.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Usta</th>
                      <th className="py-3 px-4 text-center">Biriktirilgan</th>
                      <th className="py-3 px-4 text-center">Tugatilgan</th>
                      <th className="py-3 px-4 text-right">Oʻrtacha ish vaqti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {tech.map(t => (
                      <tr
                        key={t.id}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          <Link href={`/staff/${t.id}`} className="hover:underline">
                            {t.firstName}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-zinc-600 dark:text-zinc-400">
                          {t.assigned} ta
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                            {t.completed} ta
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                          {Math.round(t.repairSeconds / 60)} daqiqa
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-zinc-400">Maʼlumotlar topilmadi</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
