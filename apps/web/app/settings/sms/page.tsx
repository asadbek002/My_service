'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Zap,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useMe } from '../../../lib/queries';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

type EskizStatus = {
  provider: string;
  sender: string;
  testMode: boolean;
  balance: number;
  smsCount: number;
  configured: boolean;
  error?: string | null;
};

export default function SmsSettingsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Bu Eskiz dan test');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string; id?: string } | null>(null);

  const { data: eskiz, refetch, isFetching } = useQuery<EskizStatus>({
    queryKey: ['settings', 'eskiz-status'],
    queryFn: () => api<EskizStatus>('/notifications/eskiz-status'),
  });

  const sendTest = useMutation({
    mutationFn: (data: { phone: string; message: string }) =>
      api<{ ok: boolean; result: { id: string; status: string }; message: string }>('/notifications/test-sms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: res => {
      setStatusMessage({
        type: 'success',
        text: `SMS muvaffaqiyatli yuborildi! (ID: ${res.result?.id || 'OK'}, Matn: "${res.message}")`,
        id: res.result?.id,
      });
      qc.invalidateQueries({ queryKey: ['settings', 'eskiz-status'] });
    },
    onError: (err: Error) => {
      setStatusMessage({
        type: 'error',
        text: `SMS yuborishda xatolik: ${err.message}`,
      });
    },
  });

  const handleSendTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;
    setStatusMessage(null);
    sendTest.mutate({ phone: testPhone.trim(), message: testMessage.trim() });
  };

  return (
    <AppShell
      subtitle="Xabarnomalar va SMS shlyuzi integratsiyasi"
      title="SMS Sozlamalari (Eskiz.uz)"
      action={
        <Link href="/settings">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Sozlamalarga qaytish
          </Button>
        </Link>
      }
    >
      <div className="max-w-5xl space-y-6">
        {/* Connection & Balance Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  <span>Eskiz.uz SMS Provayderi</span>
                </CardTitle>
                <CardDescription>
                  Oʻzbekiston boʻyicha avtomatik SMS xabarnomalar tizimi
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Yangilash
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Status</span>
                  {(() => {
                    const ok = !!eskiz?.configured && !eskiz?.error;
                    const label = !eskiz ? '...' : !eskiz.configured ? 'Sozlanmagan' : eskiz.error ? 'Ulanishda xato' : 'Ulangan (Faol)';
                    return (
                      <div className="flex items-center gap-1.5 mt-0.5" title={eskiz?.error ?? undefined}>
                        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className={`text-xs font-bold ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>{label}</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Hisob balansi</span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                    {eskiz ? eskiz.balance.toLocaleString('ru-RU') : '...'} UZS
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Yuboruvchi (Header)</span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                    {eskiz?.sender || '4546'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>JWT Token kesh orqali (Redis) boshqariladi, 24 soat avtomatik yangilanadi.</span>
              </div>
            </CardContent>
          </Card>

          {/* Mode Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 shadow-sm flex flex-col justify-between">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Radio className="h-4 w-4 text-amber-500" />
                <span>Rejim</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {eskiz?.testMode ? 'Test rejimi faol' : 'Ishchi (Production) rejim'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <p>
                {eskiz?.testMode ? (
                  <>
                    <Badge variant="warning" className="mb-2">TEST REJIMI</Badge>
                    <br />
                    Eskiz test rejimida faqat belgilangan test matnlari qabul qilinadi (balans sarflanmaydi).
                  </>
                ) : (
                  <>
                    <Badge variant="success" className="mb-2">PRODUCTION</Badge>
                    <br />
                    Barcha haqiqiy SMS xabarlar mijozlar telefoniga yetkaziladi.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Live Test Form */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <span>Jonli SMS Yuborishni Test Qilish</span>
            </CardTitle>
            <CardDescription>
              Istalgan telefon raqamiga Eskiz.uz orqali sinov SMS xabarini yuborib koʻring
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusMessage && (
              <div
                className={`p-3.5 rounded-lg text-xs flex items-center gap-2 border ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSendTest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Telefon raqami" required description="+998 formatida kiriting">
                  <Input
                    value={testPhone}
                    onChange={e => setTestPhone(e.target.value)}
                    placeholder="+998901234567"
                    required
                  />
                </FormField>

                <FormField label="SMS matni" required description="Test rejimida ruxsat berilgan matnlar">
                  <Input
                    value={testMessage}
                    onChange={e => setTestMessage(e.target.value)}
                    placeholder="Bu Eskiz dan test"
                    required
                  />
                </FormField>
              </div>

              {/* Quick Template chips */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-xs text-zinc-400 font-medium">Tayyor test shablonlari:</span>
                {['Bu Eskiz dan test', 'This is test from Eskiz', 'Это тест от Eskiz'].map(tpl => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setTestMessage(tpl)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                  >
                    {tpl}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={sendTest.isPending}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Send className={`h-4 w-4 ${sendTest.isPending ? 'animate-pulse' : ''}`} />
                  {sendTest.isPending ? 'Yuborilmoqda...' : 'Sinov SMS yuborish'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Automatic Triggers Guide */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <span>Avtomatik SMS Xabarnoma Hodisalari</span>
            </CardTitle>
            <CardDescription>
              Buyurtma holati oʻzgarganda tizim orqali mijozga avtomatik joʻnatiladigan xabarlar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 block mb-1">1. Qabul qilinganda (RECEIVED)</span>
                <p className="text-zinc-500">Mijozga buyurtma raqami va onlayn kuzatuv havolasi yuboriladi.</p>
              </div>
              <div className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 block mb-1">2. Diagnostika yakunlanganda</span>
                <p className="text-zinc-500">Taʼmirlash narxi va mijoz tasdiqlashi uchun havola yuboriladi.</p>
              </div>
              <div className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 block mb-1">3. Taʼmir tayyor boʻlganda (READY)</span>
                <p className="text-zinc-500">Qurilmani olib ketishga tayyorligi va toʻlov summasi eslatiladi.</p>
              </div>
              <div className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 block mb-1">4. Topshirilganda (DELIVERED)</span>
                <p className="text-zinc-500">Kafolat muddati, chek va elektron kafolat taloni taqdim etiladi.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
