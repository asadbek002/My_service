'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

type Part = {
  id: string; name: string; sku: string; barcode?: string | null; brand?: string | null; compatibleModels: string[]; storageLocation?: string | null;
  purchasePrice?: string; salePrice: string; minimumQuantity: number;
  stocks: { branchId: string; onHand: number; reserved: number; branch: { name: string } }[];
  orderParts: { orderId: string; quantity: number; status: string }[];
  movements: { id: string; branchId: string; type: string; quantity: number; reason: string; createdAt: string; orderId?: string | null; supplier?: { name: string } | null }[];
};
const MOVE: Record<string, string> = { IN: 'Kirim', OUT: 'Chiqim', RESERVE: 'Rezerv', RELEASE: 'Rezerv bekor', USED: "O'rnatildi", RETURN: 'Qaytarildi', ADJUSTMENT: 'Tuzatish', TRANSFER: "Ko'chirish" };
const money = (v: string) => Number(v).toLocaleString('ru-RU') + " so'm";

export default function PartPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, isLoading } = useQuery({ queryKey: ['parts', id], queryFn: () => api<Part>('/inventory/' + id), enabled: !!id });
  const back = <Link href="/inventory"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Ombor</Button></Link>;
  if (isLoading) return <AppShell title="Detal" action={back}><p className="p-10 text-center text-sm text-zinc-400">Yuklanmoqda...</p></AppShell>;
  if (!p) return <AppShell title="Detal" action={back}><p className="p-10 text-center text-sm text-red-500">{error?.message ?? 'Detal topilmadi'}</p></AppShell>;
  return (
    <AppShell title={p.name} subtitle={`SKU ${p.sku}`} action={back}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['Sotuv narxi', money(p.salePrice)], ...(p.purchasePrice !== undefined ? [['Xarid narxi', money(p.purchasePrice)]] : []), ['Minimal qoldiq', String(p.minimumQuantity)], ['Joylashuv', p.storageLocation || '—']].map(([k, v]) => (
            <Card key={k}><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</p><p className="text-lg font-bold mt-1">{v}</p></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Filiallardagi qoldiq</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {p.stocks.map(s => (
                <p key={s.branchId} className="flex justify-between"><span>{s.branch.name}</span><b className={s.onHand - s.reserved <= p.minimumQuantity ? 'text-amber-600' : ''}>{s.onHand - s.reserved} bo&apos;sh · {s.reserved} rezerv</b></p>
              ))}
              {p.stocks.length === 0 && <p className="text-zinc-400">Qoldiq yo&apos;q</p>}
              {p.compatibleModels.length > 0 && <p className="text-xs text-zinc-500 pt-2">Mos modellar: {p.compatibleModels.join(', ')}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Buyurtmalarda</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {p.orderParts.map(o => <p key={o.orderId} className="flex justify-between"><Link href={'/orders/' + o.orderId} className="hover:underline">Buyurtmani ochish</Link><span>{o.quantity} dona · {o.status}</span></p>)}
              {p.orderParts.length === 0 && <p className="text-zinc-400">Ishlatilmagan</p>}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Harakatlar</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">{['Sana', 'Tur', 'Soni', "Ta'minotchi", 'Sabab'].map(h => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {p.movements.map(m => (
                  <tr key={m.id}>
                    <td className="p-3 whitespace-nowrap text-xs">{new Date(m.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="p-3">{MOVE[m.type] ?? m.type}</td>
                    <td className="p-3">{m.quantity}</td>
                    <td className="p-3">{m.supplier?.name ?? '—'}</td>
                    <td className="p-3 text-xs">{m.orderId ? <Link href={'/orders/' + m.orderId} className="hover:underline">{m.reason}</Link> : m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
