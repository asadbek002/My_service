'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';

type Sub = {
  status: string; expiresAt: string; graceUntil?: string | null;
  plan: { name: string; maxBranches: number | null; maxStaff: number | null; monthlyOrders: number | null; monthlyPrice: string; features: Record<string, boolean> };
};
const FEATURES: [string, string][] = [
  ['inventory', 'Ombor'], ['telegram', 'Telegram'], ['sms', 'SMS'], ['advanced_reports', 'Kengaytirilgan hisobotlar'],
  ['multi_branch', 'Bir nechta filial'], ['staff_commission', 'Usta komissiyasi'], ['exports', 'Eksport (CSV)'],
];
const STATUS: Record<string, string> = { ACTIVE: 'Faol', TRIAL: 'Sinov muddati', SUSPENDED: "To'xtatilgan", EXPIRED: 'Muddati tugagan' };

export default function SubscriptionSettings() {
  const { data: sub, isLoading } = useQuery({ queryKey: ['settings', 'subscription'], queryFn: () => api<Sub | null>('/settings/subscription') });
  const daysLeft = sub ? Math.ceil((new Date(sub.graceUntil ?? sub.expiresAt).getTime() - Date.now()) / 86400000) : 0;
  const writable = !!sub && ['ACTIVE', 'TRIAL'].includes(sub.status) && daysLeft > 0;
  return (
    <AppShell title="Obuna" subtitle="Sozlamalar" action={<Link href="/settings"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Sozlamalar</Button></Link>}>
      <div className="space-y-6 max-w-3xl">
        {isLoading && <p className="text-sm text-zinc-400">Yuklanmoqda...</p>}
        {!isLoading && !sub && <p className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">Obuna topilmadi. Platforma administratoriga murojaat qiling.</p>}
        {sub && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-3">{sub.plan.name}<Badge variant={writable ? 'success' : 'destructive'}>{STATUS[sub.status] ?? sub.status}</Badge></CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>Amal qiladi: <b>{new Date(sub.expiresAt).toLocaleDateString('ru-RU')}</b> gacha{daysLeft > 0 ? ` (${daysLeft} kun qoldi)` : ''}</p>
                {sub.graceUntil && <p>Imtiyozli muddat: {new Date(sub.graceUntil).toLocaleDateString('ru-RU')} gacha</p>}
                {!writable && <p className="text-red-600">Obuna faol emas: ma&apos;lumotlarni ko&apos;rish mumkin, lekin o&apos;zgartirish bloklangan. Ma&apos;lumotlar o&apos;chirilmaydi.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {[['Filiallar', sub.plan.maxBranches], ['Xodimlar', sub.plan.maxStaff], ['Buyurtma/oy', sub.plan.monthlyOrders]].map(([k, v]) => (
                    <div key={String(k)} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"><p className="text-[11px] text-zinc-500 uppercase">{k}</p><p className="font-bold">{v ?? 'Cheksiz'}</p></div>
                  ))}
                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"><p className="text-[11px] text-zinc-500 uppercase">Narx/oy</p><p className="font-bold">{Number(sub.plan.monthlyPrice).toLocaleString('ru-RU')} so&apos;m</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Imkoniyatlar</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {FEATURES.map(([key, label]) => (
                  <p key={key} className="flex items-center gap-2">{sub.plan.features?.[key] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-zinc-300" />}{label}</p>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
