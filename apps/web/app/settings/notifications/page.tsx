'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';

type Template = { id: string; type: string; channel: string; body: string; active: boolean };
// Keys match the API's event types (spec §42 names in brackets).
const TYPES: [string, string][] = [
  ['ORDER_RECEIVED', 'Buyurtma qabul qilindi'],
  ['ORDER_WAITING_CUSTOMER_APPROVAL', 'Diagnostika tugadi — narxni tasdiqlash'],
  ['ORDER_WAITING_PART', 'Detal kutilmoqda'],
  ['REPAIR_STARTED', "Ta'mir boshlandi"],
  ['ORDER_READY', 'Qurilma tayyor'],
  ['ORDER_DELIVERED', 'Qurilma topshirildi'],
  ['WARRANTY_CREATED', 'Kafolat rasmiylashtirildi'],
];
const VARIABLES = ['customer_name', 'order_number', 'device', 'repair', 'price', 'paid', 'balance', 'status', 'warranty_end', 'link'];
const EXAMPLE = 'Hurmatli {{customer_name}}, {{device}} ({{order_number}}) holati: {{status}}. Batafsil: {{link}}';

export default function NotificationTemplates() {
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['settings', 'notifications'], queryFn: () => api<Template[]>('/settings/notifications') });
  const [channel, setChannel] = useState<'TELEGRAM' | 'SMS'>('TELEGRAM');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const find = (type: string) => templates.data?.find(t => t.type === type && t.channel === channel);

  async function save(e: React.FormEvent<HTMLFormElement>, type: string) {
    e.preventDefault(); setError(''); setNotice('');
    const d = new FormData(e.currentTarget);
    try {
      await api(`/settings/notifications/${type}/${channel}`, { method: 'PUT', body: JSON.stringify({ body: String(d.get('body')), active: d.get('active') === 'on' }) });
      await qc.invalidateQueries({ queryKey: ['settings', 'notifications'] });
      setNotice('Shablon saqlandi');
    } catch (err) { setError(err instanceof Error && err.message === 'Unknown template variable' ? "Shablonda noma'lum o'zgaruvchi bor" : err instanceof Error ? err.message : 'Saqlanmadi'); }
  }

  return (
    <AppShell title="Xabarnoma shablonlari" subtitle="Sozlamalar" action={<Link href="/settings"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Sozlamalar</Button></Link>}>
      <div className="space-y-4 max-w-4xl">
        <Card>
          <CardContent className="p-4 text-sm space-y-2">
            <p>Shablon faol bo&apos;lmasa, standart matn yuboriladi. Mavjud o&apos;zgaruvchilar:</p>
            <p className="flex flex-wrap gap-1.5">{VARIABLES.map(v => <code key={v} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs">{`{{${v}}}`}</code>)}</p>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          {(['TELEGRAM', 'SMS'] as const).map(c => <Button key={c} size="sm" variant={channel === c ? 'default' : 'outline'} onClick={() => setChannel(c)}>{c === 'TELEGRAM' ? 'Telegram' : 'SMS'}</Button>)}
        </div>
        {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</p>}
        {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{notice}</p>}
        {TYPES.map(([type, label]) => {
          const t = find(type);
          return (
            <Card key={type + channel}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle><CardDescription className="font-mono text-[11px]">{type}</CardDescription></CardHeader>
              <CardContent>
                <form className="space-y-2" onSubmit={e => save(e, type)}>
                  <Textarea name="body" rows={channel === 'SMS' ? 3 : 4} maxLength={4000} required defaultValue={t?.body ?? ''} placeholder={EXAMPLE} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="h-4 w-4" />Faol</label>
                    <Button type="submit" size="sm">Saqlash</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
