'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';

type Status = { botConfigured: boolean; botUsername: string | null; webhookConfigured: boolean; linkedCustomers: number; totalCustomers: number };

function Row({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
      <div><p className="font-semibold text-sm">{label}</p><p className="text-xs text-zinc-500">{hint}</p></div>
    </div>
  );
}

export default function TelegramSettings() {
  const { data, error, isLoading } = useQuery({ queryKey: ['settings', 'telegram'], queryFn: () => api<Status>('/settings/telegram') });
  return (
    <AppShell title="Telegram bot" subtitle="Sozlamalar" action={<Link href="/settings"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Sozlamalar</Button></Link>}>
      <div className="space-y-6 max-w-3xl">
        {isLoading && <p className="text-sm text-zinc-400">Yuklanmoqda...</p>}
        {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error.message}</p>}
        {data && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Holat</CardTitle></CardHeader>
              <CardContent className="divide-y divide-zinc-100 dark:divide-zinc-800">
                <Row ok={data.botConfigured} label="Bot tokeni" hint={data.botConfigured ? 'Server sozlamasida TELEGRAM_BOT_TOKEN bor' : 'Serverda TELEGRAM_BOT_TOKEN o‘rnatilmagan — xabarlar SMS orqali ketadi'} />
                <Row ok={!!data.botUsername} label="Bot nomi" hint={data.botUsername ? '@' + data.botUsername : 'TELEGRAM_BOT_USERNAME o‘rnatilmagan — ulash havolasi yaratilmaydi'} />
                <Row ok={data.webhookConfigured} label="Webhook" hint={data.webhookConfigured ? 'Bot /start xabarlarini qabul qiladi' : 'TELEGRAM_WEBHOOK_SECRET o‘rnatilmagan — mijoz botni ulay olmaydi'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ulangan mijozlar</CardTitle>
                <CardDescription>{data.linkedCustomers} / {data.totalCustomers} mijoz Telegram orqali xabar oladi</CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-zinc-600 dark:text-zinc-300">
                <p>Mijozni ulash: buyurtma sahifasida <b>&quot;Mijoz uchun havolalar&quot;</b> tugmasi bosiladi. Mijoz Telegram havolasini ochib, <b>Start</b> ni bosadi. Qabul kvitansiyasidagi QR ham kuzatuv sahifasiga olib boradi.</p>
                <p>Telegram yetkazilmasa, xabar avtomatik SMS orqali yuboriladi (tarifda SMS yoqilgan bo&apos;lsa).</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
