'use client';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, CreditCard, Settings as SettingsIcon, ShieldCheck, Bell, Send, MessageSquare, Building2, KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { Badge } from '../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';

type Method = { id: string; key: string; label: string };
type Sub = { status: string; expiresAt: string; plan: { name: string } };
type Audit = { id: string; action: string; entityId: string | null; actorId?: string | null; ip?: string | null; createdAt: string };

const methodSchema = z.object({
  key: z.string().regex(/^[A-Z0-9_]{1,64}$/, 'Faqat katta lotin harf, raqam va _'),
  label: z.string().min(1, 'Nom majburiy').max(100),
});
type MethodInput = z.infer<typeof methodSchema>;

const SECTIONS = [
  ['/settings/general', 'Umumiy', 'Final test checklist, kafolat shartlari, xarajat turlari', SettingsIcon],
  ['/settings/roles', 'Rollar va ruxsatlar', 'Admin, menejer va usta nimalarni qila olishi', KeyRound],
  ['/settings/notifications', 'Xabarnoma shablonlari', 'Telegram va SMS matnlari', Bell],
  ['/settings/telegram', 'Telegram bot', 'Bot holati va mijozlarni ulash', Send],
  ['/settings/sms', 'SMS', 'Eskiz balansi va test SMS', MessageSquare],
  ['/settings/subscription', 'Obuna', 'Tarif, limitlar va muddati', ShieldCheck],
  ['/branches', 'Filiallar', "Filiallar ro'yxati", Building2],
] as const;

export default function Settings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: methods = [] } = useQuery<Method[]>({ queryKey: ['payment-methods'], queryFn: () => api('/settings/payment-methods') });
  const { data: audit = [] } = useQuery<Audit[]>({ queryKey: ['settings', 'audit'], queryFn: () => api('/settings/audit'), enabled: !!me?.permissions.includes('staff.manage') });
  const { data: sub } = useQuery<Sub | null>({ queryKey: ['settings', 'subscription'], queryFn: () => api('/settings/subscription') });
  const methodForm = useForm<MethodInput>({ resolver: zodResolver(methodSchema) });
  const addMethod = useMutation({
    mutationFn: (d: MethodInput) => api('/settings/payment-methods/' + encodeURIComponent(d.key), { method: 'PUT', body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); methodForm.reset(); },
  });

  return (
    <AppShell title="Sozlamalar" subtitle={sub ? `${sub.plan.name} · ${sub.status} · ${new Date(sub.expiresAt).toLocaleDateString('ru-RU')} gacha` : 'Tizim'}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          {SECTIONS.map(([href, title, description, Icon]) => (
            <Link key={href} href={href}>
              <Card className="h-full hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{title}</p>
                    <p className="text-xs text-zinc-500 truncate">{description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Qo&apos;shimcha to&apos;lov usullari</CardTitle>
            <CardDescription>Naqd, Karta, Click, Payme, O&apos;tkazma va Boshqa doim mavjud.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {methods.map(m => <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-zinc-100 dark:border-zinc-800"><span>{m.label}</span><Badge variant="secondary">{m.key}</Badge></div>)}
            <form onSubmit={methodForm.handleSubmit(d => addMethod.mutate(d))} className="grid gap-3">
              <FormField label="Kalit" error={methodForm.formState.errors.key?.message} required><Input {...methodForm.register('key')} placeholder="UZCARD_QR" /></FormField>
              <FormField label="Nomi" error={methodForm.formState.errors.label?.message} required><Input {...methodForm.register('label')} placeholder="UzCard QR" /></FormField>
              {addMethod.error && <p className="text-xs text-red-600">{addMethod.error.message}</p>}
              <Button type="submit" size="sm" disabled={addMethod.isPending}>Qo&apos;shish</Button>
            </form>
          </CardContent>
        </Card>

        {me?.permissions.includes('staff.manage') && (
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle className="text-base">Audit log</CardTitle><CardDescription>So&apos;nggi 100 ta muhim amal</CardDescription></CardHeader>
            <CardContent>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs max-h-96 overflow-y-auto">
                {audit.map(a => (
                  <div key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span><b>{a.action}</b>{a.entityId ? <span className="text-zinc-400"> · {a.entityId.slice(0, 12)}</span> : null}</span>
                    <span className="text-zinc-500">{new Date(a.createdAt).toLocaleString('ru-RU')}{a.ip ? ' · ' + a.ip : ''}</span>
                  </div>
                ))}
                {audit.length === 0 && <p className="text-zinc-400 py-4">Yozuvlar yo&apos;q</p>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
