'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

type Device = {
  id: string; category: string; brand: string; model: string; imei?: string | null; serialNumber?: string | null; color?: string | null;
  customer: { id: string; firstName: string; lastName?: string | null; phone: string };
  orders: { id: string; number: string; status: string; createdAt: string; complaint: string; total: string }[];
};

export default function DevicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, isLoading } = useQuery({ queryKey: ['devices', id], queryFn: () => api<Device>('/devices/' + id), enabled: !!id });
  if (isLoading) return <AppShell title="Qurilma"><p className="p-10 text-center text-sm text-zinc-400">Yuklanmoqda...</p></AppShell>;
  if (!d) return <AppShell title="Qurilma"><p className="p-10 text-center text-sm text-red-500">{error?.message ?? 'Qurilma topilmadi'}</p></AppShell>;
  return (
    <AppShell title={`${d.brand} ${d.model}`} subtitle="Qurilma" action={<Link href={'/customers/' + d.customer.id}><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Mijoz</Button></Link>}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Ma&apos;lumot</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {[['Mijoz', `${d.customer.firstName} ${d.customer.lastName ?? ''} · ${d.customer.phone}`], ['Kategoriya', d.category], ['IMEI', d.imei || '—'], ['Serial', d.serialNumber || '—'], ['Rang', d.color || '—']].map(([k, v]) => (
              <p key={k} className="flex justify-between gap-3"><span className="text-zinc-500">{k}</span><b className="text-right">{v}</b></p>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Ta&apos;mirlash tarixi ({d.orders.length})</CardTitle></CardHeader>
          <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
            {d.orders.map(o => (
              <Link key={o.id} href={'/orders/' + o.id} className="p-4 flex flex-wrap items-center justify-between gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <span><b className="font-mono">{o.number}</b><span className="block text-xs text-zinc-400">{new Date(o.createdAt).toLocaleDateString('ru-RU')} · {o.complaint}</span></span>
                <StatusBadge status={o.status} />
              </Link>
            ))}
            {d.orders.length === 0 && <p className="p-6 text-center text-zinc-400">Buyurtma yo&apos;q</p>}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
