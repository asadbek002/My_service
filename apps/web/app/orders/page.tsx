'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  PlusCircle,
  Filter,
  ChevronRight,
  Smartphone,
  Calendar,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import { useOrders, useMe } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { StatusBadge } from '../../components/ui/status-badge';
import { Card, CardContent } from '../../components/ui/card';

const STATUS_TABS = [
  { id: 'ALL', label: 'Barchasi' },
  { id: 'DIAGNOSING', label: 'Diagnostikada' },
  { id: 'WAITING_CUSTOMER_APPROVAL', label: "Mijoz tasdig'i" },
  { id: 'WAITING_PART', label: 'Detal kutilmoqda' },
  { id: 'IN_REPAIR', label: "Ta'mirda" },
  { id: 'READY', label: 'Tayyor' },
  { id: 'DELIVERED', label: 'Berildi' },
];

export default function OrdersPage() {
  const router = useRouter();
  const { data: me, error: meError } = useMe();
  const { data: orders = [], isLoading } = useOrders();

  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (meError?.message === 'SESSION_EXPIRED') {
    router.replace('/login');
    return null;
  }

  const filteredOrders = orders.filter(o => {
    const matchesTab = activeTab === 'ALL' || o.status === activeTab;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      o.number.toLowerCase().includes(q) ||
      o.customer?.firstName?.toLowerCase().includes(q) ||
      o.customer?.lastName?.toLowerCase().includes(q) ||
      o.customer?.phone?.includes(q) ||
      o.device?.brand?.toLowerCase().includes(q) ||
      o.device?.model?.toLowerCase().includes(q) ||
      o.device?.imei?.includes(q);

    return matchesTab && matchesSearch;
  });

  return (
    <AppShell
      subtitle="Servis jarayoni"
      title="Buyurtmalar roʻyxati"
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
        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Raqam, mijoz, telefon yoki model..."
              className="pl-10"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="text-xs text-zinc-500 font-medium">
            Jami: <span className="font-bold text-zinc-900 dark:text-zinc-100">{filteredOrders.length}</span> ta buyurtma
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-zinc-200 dark:border-zinc-800">
          {STATUS_TABS.map(tab => {
            const count =
              tab.id === 'ALL'
                ? orders.length
                : orders.filter(o => o.status === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Orders Table & Mobile Cards */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-zinc-400">
                Buyurtmalar yuklanmoqda...
              </div>
            ) : filteredOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Buyurtma</th>
                      <th className="py-3 px-4">Mijoz</th>
                      <th className="py-3 px-4">Qurilma</th>
                      <th className="py-3 px-4">Holat</th>
                      <th className="py-3 px-4 text-right">Summa</th>
                      <th className="py-3 px-4 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredOrders.map(order => (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {order.number}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                            {order.customer?.firstName} {order.customer?.lastName}
                          </div>
                          <div className="text-xs text-zinc-500">{order.customer?.phone}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-xs text-zinc-800 dark:text-zinc-200">
                            {order.device?.brand} {order.device?.model}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate max-w-xs">
                            {order.complaint}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {Number(order.total || 0).toLocaleString('uz-UZ')} soʻm
                          </div>
                          {Number(order.balance || 0) > 0 && (
                            <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                              Qarz: {Number(order.balance).toLocaleString('uz-UZ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center space-y-3">
                <Smartphone className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mx-auto" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Mos buyurtmalar topilmadi
                </p>
                <p className="text-xs text-zinc-400">
                  Qidiruv mezonlarini oʻzgartirib koʻring yoki yangi buyurtma yarating.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
