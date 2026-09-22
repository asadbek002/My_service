'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Wrench,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  CreditCard,
  User,
  Smartphone,
  ShieldCheck,
  Send,
  Upload,
  Link as LinkIcon,
  PackagePlus,
  CheckSquare,
  AlertTriangle,
  QrCode,
} from 'lucide-react';
import {
  useOrder,
  useMe,
  useParts,
  useStaff,
  useCreatePayment,
  useDownloadDocument,
} from '../../../lib/queries';
import {
  diagnosisSchema,
  paymentSchema,
  type DiagnosisInput,
  type PaymentInput,
} from '../../../lib/schemas';
import { api, uploadAttachment } from '../../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Select } from '../../../components/ui/select';
import { FormField } from '../../../components/ui/form-field';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

const ORDER_STEPS = [
  'RECEIVED',
  'DIAGNOSING',
  'WAITING_CUSTOMER_APPROVAL',
  'IN_REPAIR',
  'READY',
  'DELIVERED',
];

const CHECKLIST_ITEMS = [
  { id: 'Display', label: 'Display (Ekran tasviri)' },
  { id: 'Touch', label: 'Touch (Sensor)' },
  { id: 'Camera', label: 'Camera (Oldi/Orqa kamera)' },
  { id: 'Microphone', label: 'Microphone (Mikrofon)' },
  { id: 'Speaker', label: 'Speaker (Dinamik)' },
  { id: 'Charging', label: 'Charging (Zaryad olish)' },
  { id: 'Wi-Fi', label: 'Wi-Fi' },
  { id: 'Bluetooth', label: 'Bluetooth' },
];

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: order, isLoading, error: orderError } = useOrder(id);
  const { data: me } = useMe();
  const { data: parts = [] } = useParts();
  const { data: staffList = [] } = useStaff();
  const createPayment = useCreatePayment();
  const downloadDoc = useDownloadDocument();

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [links, setLinks] = useState<{ tracking: string; telegram: string | null } | null>(null);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);

  // Timer simulation state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const can = (p: string) => me?.permissions.includes(p) ?? false;

  const diagForm = useForm<DiagnosisInput>({
    resolver: zodResolver(diagnosisSchema),
  });

  const payForm = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'CASH' },
  });

  useEffect(() => {
    let interval: any = null;
    if (timerRunning) {
      interval = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning]);

  if (orderError?.message === 'SESSION_EXPIRED') {
    router.replace('/login');
    return null;
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-16 text-center text-sm text-zinc-400">
          Buyurtma maʼlumotlari yuklanmoqda...
        </div>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell>
        <div className="p-16 text-center text-sm text-red-500">
          {actionError || 'Buyurtma topilmadi'}
        </div>
      </AppShell>
    );
  }

  async function performAction(endpoint: string, body?: unknown, method = 'POST') {
    if (!navigator.onLine) {
      setActionError("Internet aloqasi yo'q.");
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      await api('/orders/' + id + endpoint, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      qc.invalidateQueries({ queryKey: ['orders', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e: any) {
      setActionError(e.message || 'Xatolik yuz berdi');
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(type: string) {
    try {
      const blob = await downloadDoc.mutateAsync({ orderId: id, type });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setActionError(e.message || 'Hujjat yuklashda xatolik');
    }
  }

  async function handleDiagnosis(data: DiagnosisInput) {
    await performAction('/diagnosis', {
      diagnosis: data.diagnosis,
      requiredWork: data.requiredWork,
      labor: data.labor,
      partsTotal: data.partsTotal,
    });
    diagForm.reset();
  }

  async function handlePayment(data: PaymentInput) {
    try {
      await createPayment.mutateAsync({
        orderId: id,
        data: { ...data, idempotencyKey: crypto.randomUUID() },
      });
      payForm.reset();
      qc.invalidateQueries({ queryKey: ['orders', id] });
    } catch (e: any) {
      setActionError(e.message || 'Toʻlov qabul qilishda xatolik');
    }
  }

  const toggleCheck = (item: string) => {
    setCheckedItems(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentStepIdx = ORDER_STEPS.indexOf(order.status);

  return (
    <AppShell
      subtitle="Buyurtma tafsilotlari"
      title={order.number}
      action={
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} className="text-xs" />
          <Link href="/orders">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              Roʻyxatga
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Error notification banner */}
        {actionError && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs rounded-xl border border-red-200 dark:border-red-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError('')} className="text-red-500 font-bold">
              ×
            </button>
          </div>
        )}

        {/* Status Stepper Progression Header */}
        <Card className="bg-white dark:bg-zinc-900 overflow-hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between overflow-x-auto min-w-[560px]">
              {ORDER_STEPS.map((st, idx) => {
                const isPassed = currentStepIdx >= idx;
                const isCurrent = order.status === st;
                return (
                  <React.Fragment key={st}>
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                          isCurrent
                            ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 ring-4 ring-zinc-200 dark:ring-zinc-800'
                            : isPassed
                            ? 'bg-emerald-500 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {isPassed && !isCurrent ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider ${
                          isCurrent
                            ? 'text-zinc-900 dark:text-zinc-50 font-bold'
                            : 'text-zinc-400 dark:text-zinc-600'
                        }`}
                      >
                        {st.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {idx < ORDER_STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 rounded ${
                          currentStepIdx > idx ? 'bg-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Device info, History, Photos (1 col) */}
          <div className="space-y-6">
            {/* Device & Customer Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-zinc-500" />
                  <span>
                    {order.device?.brand} {order.device?.model}
                  </span>
                </CardTitle>
                <CardDescription>IMEI: {order.device?.imei || 'Mavjud emas'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {/* Customer */}
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 space-y-1">
                  <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
                    Mijoz
                  </span>
                  <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {order.customer?.firstName} {order.customer?.lastName}
                  </p>
                  <p className="text-zinc-500">{order.customer?.phone}</p>
                </div>

                {/* Complaint */}
                <div className="space-y-1">
                  <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
                    Mijoz shikoyati
                  </span>
                  <p className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-900 font-medium text-zinc-800 dark:text-zinc-200">
                    {order.complaint}
                  </p>
                </div>

                {/* Accessories & Conditions */}
                {(order.accessories?.length ?? 0) > 0 && (
                  <div className="space-y-1">
                    <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
                      Komplektatsiya
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {order.accessories?.map((a: string) => (
                        <Badge key={a} variant="secondary" className="text-[10px]">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer Links */}
                {can('orders.edit') && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          setLinks(await api('/orders/' + id + '/links', { method: 'POST' }));
                        } catch (e: any) {
                          setActionError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      Mijoz uchun havolalar yaratish
                    </Button>

                    {links && (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg space-y-1 text-xs">
                        <a
                          href={links.tracking}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          🔗 Onlayn kuzatuv havolasi
                        </a>
                        {links.telegram && (
                          <a
                            href={links.telegram}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                          >
                            ✈️ Telegram Bot ulash
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document Print Bar */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Printer className="h-4 w-4 text-zinc-500" />
                  <span>Hujjatlarni chop etish</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => openDocument('receipt')}
                  disabled={downloadDoc.isPending}
                >
                  📄 Kvitansiya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => openDocument('repair')}
                  disabled={downloadDoc.isPending}
                >
                  🔧 Taʼmir cheki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => openDocument('payment')}
                  disabled={downloadDoc.isPending}
                >
                  💳 Toʻlov cheki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => openDocument('warranty')}
                  disabled={downloadDoc.isPending}
                >
                  🛡 Kafolat taloni
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Workflow Actions & Diagnostics (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. RECEIVED -> DIAGNOSING Action */}
            {order.status === 'RECEIVED' && can('orders.change_status') && (
              <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20">
                <CardHeader>
                  <CardTitle className="text-base text-blue-900 dark:text-blue-100">
                    Qurilma qabul qilingan
                  </CardTitle>
                  <CardDescription>
                    Diagnostika jarayonini boshlash uchun quyidagi tugmani bosing.
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button
                    onClick={() =>
                      performAction(
                        '/status',
                        { status: 'DIAGNOSING', comment: 'Diagnostika boshlandi' },
                        'PATCH'
                      )
                    }
                    disabled={busy}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Wrench className="h-4 w-4" />
                    Diagnostikani boshlash
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* 2. DIAGNOSTICS FORM */}
            {['DIAGNOSING', 'WAITING_CUSTOMER_APPROVAL'].includes(order.status) &&
              can('diagnostics.create') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Diagnostika va smeta</CardTitle>
                    <CardDescription>
                      Aniqlangan nosozlik, bajariladigan ish va ehtiyot qism narxlarini belgilang.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={diagForm.handleSubmit(handleDiagnosis)} className="space-y-4">
                      <FormField
                        label="Diagnostika xulosasi"
                        error={diagForm.formState.errors.diagnosis?.message}
                        required
                      >
                        <Textarea
                          {...diagForm.register('diagnosis')}
                          placeholder="Ekran modulining shleyfi uzilgan, batareya quvvati 72%..."
                        />
                      </FormField>

                      <FormField
                        label="Bajariladigan ish turi"
                        error={diagForm.formState.errors.requiredWork?.message}
                        required
                      >
                        <Input
                          {...diagForm.register('requiredWork')}
                          placeholder="Displey almashtirish va batareyani tiklash"
                        />
                      </FormField>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          label="Xizmat haqi (soʻm)"
                          error={diagForm.formState.errors.labor?.message}
                          required
                        >
                          <Input {...diagForm.register('labor')} placeholder="150000" />
                        </FormField>
                        <FormField
                          label="Ehtiyot qismlar (soʻm)"
                          error={diagForm.formState.errors.partsTotal?.message}
                          required
                        >
                          <Input {...diagForm.register('partsTotal')} placeholder="700000" />
                        </FormField>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={diagForm.formState.isSubmitting} className="gap-2">
                          <Send className="h-4 w-4" />
                          Smetani saqlash va tasdiqqa yuborish
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

            {/* 3. CUSTOMER APPROVAL PANEL */}
            {order.status === 'WAITING_CUSTOMER_APPROVAL' && can('orders.edit') && (
              <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/20 dark:bg-amber-950/10">
                <CardHeader>
                  <CardTitle className="text-base text-amber-900 dark:text-amber-100 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <span>Mijoz roziligini qayd etish</span>
                  </CardTitle>
                  <CardDescription>
                    Mijoz bilan telefon yoki Telegram orqali bogʻlanib, narxni tasdiqlang.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Smeta versiyasi: v{order.quoteVersion} · Jami: {Number(order.total).toLocaleString('uz-UZ')} soʻm
                    </p>
                    <p className="text-zinc-500">{order.diagnosis} · {order.requiredWork}</p>
                  </div>

                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      performAction('/approve', {
                        quoteVersion: order.quoteVersion,
                        approved: d.get('approved') === 'yes',
                        evidence: d.get('evidence'),
                      });
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Mijoz qarori">
                        <Select name="approved">
                          <option value="yes">✓ Tasdiqladi (Rozilik berdi)</option>
                          <option value="no">✕ Rad etdi (Bekor qildi)</option>
                        </Select>
                      </FormField>
                      <FormField label="Asos / Izoh">
                        <Input
                          name="evidence"
                          placeholder="Telefon orqali tasdiqlandi"
                          required
                          minLength={3}
                        />
                      </FormField>
                    </div>
                    <Button type="submit" disabled={busy} className="gap-2">
                      Qarorni saqlash
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* 4. REPAIR WORKSPACE (TIMER & FINAL TEST) */}
            {['WAITING_PART', 'IN_REPAIR'].includes(order.status) && (
              <div className="space-y-6">
                {/* Active Repair Session Timer Widget */}
                <Card className="bg-zinc-900 text-white border-zinc-800">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center text-emerald-400 font-mono font-bold text-lg">
                        <Clock className="h-6 w-6" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-400">
                          Taʼmirlash vaqti
                        </span>
                        <div className="text-2xl font-bold font-mono text-zinc-50">
                          {formatTimer(timerSeconds)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!timerRunning ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setTimerRunning(true);
                            performAction('/repair/start');
                          }}
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Play className="h-4 w-4" />
                          Ishni boshlash
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setTimerRunning(false);
                            performAction('/repair/pause');
                          }}
                          className="gap-1.5 bg-zinc-800 text-white hover:bg-zinc-700"
                        >
                          <Pause className="h-4 w-4" />
                          Tanaffus
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Final Testing Checklist */}
                {can('orders.change_status') && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 text-emerald-500" />
                        <span>Yakuniy tekshiruv (Final Test Checklist)</span>
                      </CardTitle>
                      <CardDescription>
                        Barcha modullarning sozligini tekshirib chiqing va belgilang.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {CHECKLIST_ITEMS.map(item => {
                          const isChecked = checkedItems.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleCheck(item.id)}
                              className={`p-3 rounded-lg text-xs font-semibold border text-left flex items-center justify-between transition-all ${
                                isChecked
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              <span>{item.label}</span>
                              {isChecked && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCheckedItems(CHECKLIST_ITEMS.map(x => x.id))}
                        >
                          Hammasini belgilash
                        </Button>
                        <Button
                          disabled={busy || checkedItems.length < 8}
                          onClick={() =>
                            performAction('/repair/finish', { passedChecks: checkedItems })
                          }
                          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Taʼmir tugadi (READY)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* 5. READY -> DELIVERED & WARRANTY */}
            {order.status === 'READY' && can('orders.edit') && (
              <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/20 dark:bg-emerald-950/10">
                <CardHeader>
                  <CardTitle className="text-base text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <span>Qurilmani mijozga topshirish va kafolat berish</span>
                  </CardTitle>
                  <CardDescription>
                    Kafolat muddatini belgilab, buyurtmani yoping.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      performAction('/deliver', {
                        warrantyDays: Number(d.get('days')),
                        warrantyTerms: d.get('terms'),
                        allowDebt: d.get('allowDebt') === 'on',
                        coveredOrderPartIds: [],
                        coveredRepairActionIds: [],
                      });
                    }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Kafolat muddati (kun)">
                        <Input name="days" type="number" defaultValue="90" required />
                      </FormField>
                      <FormField label="Kafolat shartlari">
                        <Input
                          name="terms"
                          defaultValue="OLED modul va taʼmirlangan tugmalar uchun 90 kun kafolat"
                          required
                        />
                      </FormField>
                    </div>

                    {can('payments.deliver_with_debt') && (
                      <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        <input type="checkbox" name="allowDebt" className="h-4 w-4 rounded" />
                        Qarzdorlik mavjud boʻlsa ham topshirishga ruxsat
                      </label>
                    )}

                    <Button type="submit" disabled={busy} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="h-4 w-4" />
                      Qurilmani topshirish (DELIVERED)
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* 6. PAYMENTS LEDGER */}
            {can('payments.view') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-zinc-500" />
                    <span>Toʻlovlar tarixi va qabul qilish</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-xs">
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                        Umumiy summa
                      </span>
                      <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {Number(order.total).toLocaleString('uz-UZ')} soʻm
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                        Qoldiq qarz
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          Number(order.balance || 0) > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600'
                        }`}
                      >
                        {Number(order.balance || 0).toLocaleString('uz-UZ')} soʻm
                      </span>
                    </div>
                  </div>

                  {/* Payment Intake Form */}
                  {can('payments.create') && !['DELIVERED', 'CANCELLED'].includes(order.status) && (
                    <form onSubmit={payForm.handleSubmit(handlePayment)} className="space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField
                          label="Toʻlov summasi (soʻm)"
                          error={payForm.formState.errors.amount?.message}
                          required
                        >
                          <Input
                            {...payForm.register('amount')}
                            placeholder={order.balance || '100000'}
                          />
                        </FormField>
                        <FormField label="Toʻlov usuli">
                          <Select {...payForm.register('method')}>
                            <option value="CASH">Naqd pul (CASH)</option>
                            <option value="CARD">Plastik karta (CARD)</option>
                            <option value="CLICK">Click</option>
                            <option value="PAYME">Payme</option>
                            <option value="TRANSFER">Bank oʻtkazmasi</option>
                            <option value="OTHER">Boshqa</option>
                          </Select>
                        </FormField>
                      </div>
                      <Button
                        type="submit"
                        disabled={createPayment.isPending}
                        className="gap-2"
                        size="sm"
                      >
                        {createPayment.isPending ? 'Qabul qilinmoqda...' : 'Toʻlovni saqlash'}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
