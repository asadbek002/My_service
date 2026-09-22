'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Smartphone,
  PackageCheck,
  Eye,
  Camera,
  FileText,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Upload,
  X,
  Search,
  Plus,
} from 'lucide-react';
import {
  useCustomers,
  useBranches,
  useCreateCustomer,
  useCreateOrder,
} from '../../../lib/queries';
import {
  customerSchema,
  deviceSchema,
  type CustomerInput,
  type DeviceInput,
} from '../../../lib/schemas';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Select } from '../../../components/ui/select';
import { FormField } from '../../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

const ACCESSORY_OPTIONS = [
  'Telefon',
  'Quti (Karobka)',
  'Kabel (USB/Type-C)',
  'Adapter (Zaryadchik)',
  'SIM-karta',
  'Chexol',
  'Fleshka',
];

const CONDITION_OPTIONS = [
  'Ekran singan',
  'Korpus tirnalgan',
  'Korpus ezilgan / egilgan',
  'Namlik tekkan (Suv tushgan)',
  'Oldin ochilgan / taʼmirlangan',
  'Kamera shishasi singan',
  'Tugmalar ishlamaydi',
  'Qurilma yoqilmaydi',
];

export default function NewOrderWizard() {
  const router = useRouter();
  const { data: customers = [] } = useCustomers();
  const { data: branches = [] } = useBranches();
  const createCustomer = useCreateCustomer();
  const createOrder = useCreateOrder();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [deviceData, setDeviceData] = useState<DeviceInput | null>(null);

  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['Telefon']);
  const [customAccessory, setCustomAccessory] = useState('');

  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [customCondition, setCustomCondition] = useState('');

  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);

  const [complaint, setComplaint] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [orderError, setOrderError] = useState('');

  const customerForm = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { notificationPreference: 'AUTO' },
  });

  const deviceForm = useForm<DeviceInput>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { category: 'Telefon' },
  });

  // Handle new customer creation
  async function handleCreateCustomer(data: CustomerInput) {
    try {
      const created = await createCustomer.mutateAsync(data);
      setSelectedCustomerId(created.id);
      setSelectedCustomer(created);
      setShowNewCustomerForm(false);
      setCurrentStep(2);
    } catch (err: any) {
      // Error handled by mutation
    }
  }

  // Handle device creation
  async function handleCreateDevice(data: DeviceInput) {
    try {
      const created = await api<{ id: string }>('/devices', {
        method: 'POST',
        body: JSON.stringify({ customerId: selectedCustomerId, ...data }),
      });
      setSelectedDeviceId(created.id);
      setDeviceData(data);
      setCurrentStep(3);
    } catch (err: any) {
      deviceForm.setError('root', { message: err.message || 'Xatolik yuz berdi' });
    }
  }

  // Accessory toggle
  const toggleAccessory = (item: string) => {
    setSelectedAccessories(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };

  // Condition toggle
  const toggleCondition = (item: string) => {
    setSelectedConditions(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };

  // Photo handlers
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const remainingSlots = 6 - photos.length;
    const addedFiles = files.slice(0, remainingSlots).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos(prev => [...prev, ...addedFiles]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Final Order Submission
  async function handleSubmitOrder() {
    if (!selectedBranchId) {
      setOrderError('Iltimos, filialni tanlang');
      return;
    }
    if (!complaint.trim()) {
      setOrderError('Iltimos, mijoz shikoyatini kiriting');
      return;
    }

    try {
      setOrderError('');
      const order = await createOrder.mutateAsync({
        data: {
          customerId: selectedCustomerId,
          deviceId: selectedDeviceId,
          branchId: selectedBranchId,
          complaint,
          accessories: selectedAccessories,
          condition: selectedConditions,
        },
        photos: photos.map(p => p.file),
      });

      router.push(`/orders/${order.id}`);
    } catch (err: any) {
      setOrderError(err.message || "Buyurtma yaratishda xatolik yuz berdi");
    }
  }

  const filteredCustomers = customers.filter(
    c =>
      c.firstName.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.lastName && c.lastName.toLowerCase().includes(customerSearch.toLowerCase())) ||
      c.phone.includes(customerSearch)
  );

  const steps = [
    { num: 1, label: 'Mijoz', icon: User },
    { num: 2, label: 'Qurilma', icon: Smartphone },
    { num: 3, label: 'Komplekt', icon: PackageCheck },
    { num: 4, label: 'Holat', icon: Eye },
    { num: 5, label: 'Rasmlar', icon: Camera },
    { num: 6, label: 'Shikoyat', icon: FileText },
    { num: 7, label: 'Tasdiqlash', icon: CheckCircle2 },
  ];

  return (
    <AppShell
      subtitle="Yangi qabul"
      title="Qurilma qabul qilish (Intake Wizard)"
      action={
        <Link href="/orders">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Buyurtmalarga qaytish
          </Button>
        </Link>
      }
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Wizard Stepper Progress */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between min-w-[620px]">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isCompleted = currentStep > s.num;
              const isCurrent = currentStep === s.num;
              return (
                <React.Fragment key={s.num}>
                  <div
                    onClick={() => {
                      if (isCompleted) setCurrentStep(s.num);
                    }}
                    className={`flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      isCurrent
                        ? 'text-zinc-900 dark:text-zinc-50'
                        : isCompleted
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-400 dark:text-zinc-600'
                    }`}
                  >
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        isCurrent
                          ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 ring-4 ring-zinc-200 dark:ring-zinc-800'
                          : isCompleted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className="text-[11px] font-semibold tracking-tight">{s.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 rounded transition-colors ${
                        currentStep > s.num ? 'bg-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* STEP 1: MIJOZ */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>1-qadam: Mijozni tanlang yoki yangi qoʻshing</CardTitle>
              <CardDescription>
                Mijoz maʼlumotlari xabarnomalar va buyurtmalar tarixi uchun zarur.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!showNewCustomerForm ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                      <Input
                        placeholder="Mijozni ism yoki telefon orqali qidiring..."
                        className="pl-9"
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setShowNewCustomerForm(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Yangi mijoz
                    </Button>
                  </div>

                  {/* Customer Search Results */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    {filteredCustomers.map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setSelectedCustomer(c);
                        }}
                        className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                          selectedCustomerId === c.id
                            ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-sm">
                            {c.firstName} {c.lastName}
                          </p>
                          <p
                            className={`text-xs ${
                              selectedCustomerId === c.id
                                ? 'text-zinc-300 dark:text-zinc-600'
                                : 'text-zinc-500'
                            }`}
                          >
                            {c.phone} {c.telegramUsername && `· @${c.telegramUsername}`}
                          </p>
                        </div>
                        {selectedCustomerId === c.id && <CheckCircle2 className="h-5 w-5" />}
                      </div>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <div className="p-6 text-center text-sm text-zinc-400">
                        Mijoz topilmadi. Yuqoridagi "+ Yangi mijoz" tugmasini bosing.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={customerForm.handleSubmit(handleCreateCustomer)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      label="Ism"
                      error={customerForm.formState.errors.firstName?.message}
                      required
                    >
                      <Input {...customerForm.register('firstName')} placeholder="Aziz" />
                    </FormField>
                    <FormField
                      label="Familiya"
                      error={customerForm.formState.errors.lastName?.message}
                    >
                      <Input {...customerForm.register('lastName')} placeholder="Valiyev" />
                    </FormField>
                    <FormField
                      label="Telefon raqam"
                      error={customerForm.formState.errors.phone?.message}
                      required
                      description="+998 formatida kiriting"
                    >
                      <Input {...customerForm.register('phone')} placeholder="+998901234567" />
                    </FormField>
                    <FormField
                      label="Telegram username"
                      error={customerForm.formState.errors.telegramUsername?.message}
                    >
                      <Input
                        {...customerForm.register('telegramUsername')}
                        placeholder="aziz_v"
                      />
                    </FormField>
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowNewCustomerForm(false)}
                    >
                      Bekor qilish
                    </Button>
                    <Button type="submit" disabled={createCustomer.isPending}>
                      {createCustomer.isPending ? 'Saqlanmoqda...' : 'Mijozni saqlash va davom etish'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
            {!showNewCustomerForm && (
              <CardFooter className="justify-end border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <Button
                  disabled={!selectedCustomerId}
                  onClick={() => setCurrentStep(2)}
                  className="gap-2"
                >
                  Keyingisi: Qurilma <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            )}
          </Card>
        )}

        {/* STEP 2: QURILMA */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>2-qadam: Qurilma maʼlumotlari</CardTitle>
              <CardDescription>
                Mijoz:{' '}
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {selectedCustomer?.firstName} {selectedCustomer?.lastName} ({selectedCustomer?.phone})
                </strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={deviceForm.handleSubmit(handleCreateDevice)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    label="Kategoriya"
                    error={deviceForm.formState.errors.category?.message}
                    required
                  >
                    <Select {...deviceForm.register('category')}>
                      <option value="Telefon">Telefon</option>
                      <option value="Planshet">Planshet</option>
                      <option value="Noutbuk">Noutbuk</option>
                      <option value="Smart soat">Smart soat</option>
                      <option value="Boshqa">Boshqa</option>
                    </Select>
                  </FormField>
                  <FormField
                    label="Brend"
                    error={deviceForm.formState.errors.brand?.message}
                    required
                  >
                    <Input {...deviceForm.register('brand')} placeholder="Apple, Samsung, Xiaomi..." />
                  </FormField>
                  <FormField
                    label="Model"
                    error={deviceForm.formState.errors.model?.message}
                    required
                  >
                    <Input {...deviceForm.register('model')} placeholder="iPhone 15 Pro Max, Galaxy S24..." />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="IMEI raqami" error={deviceForm.formState.errors.imei?.message}>
                    <Input {...deviceForm.register('imei')} placeholder="358492019482710" />
                  </FormField>
                  <FormField label="Serial raqam" error={deviceForm.formState.errors.serialNumber?.message}>
                    <Input {...deviceForm.register('serialNumber')} placeholder="DNPQW0194..." />
                  </FormField>
                  <FormField label="Rangi" error={deviceForm.formState.errors.color?.message}>
                    <Input {...deviceForm.register('color')} placeholder="Qora, Natural Titanium..." />
                  </FormField>
                </div>

                {deviceForm.formState.errors.root && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg">
                    {deviceForm.formState.errors.root.message}
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <Button type="button" variant="ghost" onClick={() => setCurrentStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Orqaga
                  </Button>
                  <Button type="submit" disabled={deviceForm.formState.isSubmitting} className="gap-2">
                    Keyingisi: Komplektatsiya <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* STEP 3: KOMPLEKTATSIYA */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>3-qadam: Komplektatsiya (Qabul qilingan buyumlar)</CardTitle>
              <CardDescription>
                Mijozdan telefon bilan birga topshirilgan aksessuarlarni belgilang.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2.5">
                {ACCESSORY_OPTIONS.map(acc => {
                  const isSelected = selectedAccessories.includes(acc);
                  return (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => toggleAccessory(acc)}
                      className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50 shadow-sm'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                      <span>{acc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Boshqa aksessuar nomi..."
                  value={customAccessory}
                  onChange={e => setCustomAccessory(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customAccessory.trim()) {
                      e.preventDefault();
                      setSelectedAccessories(prev => [...prev, customAccessory.trim()]);
                      setCustomAccessory('');
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (customAccessory.trim()) {
                      setSelectedAccessories(prev => [...prev, customAccessory.trim()]);
                      setCustomAccessory('');
                    }
                  }}
                >
                  Qoʻshish
                </Button>
              </div>
            </CardContent>
            <CardFooter className="justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <Button type="button" variant="ghost" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Orqaga
              </Button>
              <Button onClick={() => setCurrentStep(4)} className="gap-2">
                Keyingisi: Tashqi holat <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 4: TASHQI HOLAT */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>4-qadam: Qurilmaning tashqi holati</CardTitle>
              <CardDescription>
                Mavjud tirnalishlar, sinishlar va vizual nuqsonlarni qayd eting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {CONDITION_OPTIONS.map(cond => {
                  const isSelected = selectedConditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleCondition(cond)}
                      className={`p-3 rounded-lg text-xs font-semibold border text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50 shadow-sm'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800'
                      }`}
                    >
                      <span>{cond}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Qoʻshimcha tashqi holat izohi..."
                  value={customCondition}
                  onChange={e => setCustomCondition(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customCondition.trim()) {
                      e.preventDefault();
                      setSelectedConditions(prev => [...prev, customCondition.trim()]);
                      setCustomCondition('');
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (customCondition.trim()) {
                      setSelectedConditions(prev => [...prev, customCondition.trim()]);
                      setCustomCondition('');
                    }
                  }}
                >
                  Qoʻshish
                </Button>
              </div>
            </CardContent>
            <CardFooter className="justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <Button type="button" variant="ghost" onClick={() => setCurrentStep(3)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Orqaga
              </Button>
              <Button onClick={() => setCurrentStep(5)} className="gap-2">
                Keyingisi: Rasmlar <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 5: RASMLAR */}
        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>5-qadam: Qurilma holati rasmlari (ixtiyoriy, max 6 ta)</CardTitle>
              <CardDescription>
                Oldi, orqa, singan joylari rasmlari nizoli vaziyatlarning oldini oladi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Photo Upload Box */}
              {photos.length < 6 && (
                <label className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-950/50">
                  <Upload className="h-8 w-8 text-zinc-400 mb-2" />
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Rasm yuklash yoki suratga olish
                  </span>
                  <span className="text-xs text-zinc-400 mt-1">
                    PNG, JPG, WEBP (qolgan joy: {6 - photos.length} ta)
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </label>
              )}

              {/* Thumbnails Grid */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {photos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 aspect-square bg-zinc-100 dark:bg-zinc-800"
                    >
                      <img
                        src={photo.preview}
                        alt="Holat rasmi"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <Button type="button" variant="ghost" onClick={() => setCurrentStep(4)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Orqaga
              </Button>
              <Button onClick={() => setCurrentStep(6)} className="gap-2">
                Keyingisi: Shikoyat <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 6: SHIKOYAT */}
        {currentStep === 6 && (
          <Card>
            <CardHeader>
              <CardTitle>6-qadam: Mijoz shikoyati va filial</CardTitle>
              <CardDescription>
                Mijoz taʼrifi boʻyicha nosozlik va qabul qilinayotgan filialni belgilang.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Filial" required description="Qurilma qaysi filialda qabul qilinmoqda?">
                <Select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                >
                  <option value="">Filialni tanlang...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField
                label="Mijoz shikoyati (Batafsil)"
                required
                description="Masalan: Ekran qorayib qolgan, zaryad olmayapti, tushib ketganidan keyin ovoz eshitilmayapti"
              >
                <Textarea
                  placeholder="Mijoz aytgan shikoyat va muammoni batafsil yozing..."
                  value={complaint}
                  onChange={e => setComplaint(e.target.value)}
                  className="min-h-[120px]"
                />
              </FormField>
            </CardContent>
            <CardFooter className="justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <Button type="button" variant="ghost" onClick={() => setCurrentStep(5)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Orqaga
              </Button>
              <Button
                disabled={!selectedBranchId || !complaint.trim()}
                onClick={() => setCurrentStep(7)}
                className="gap-2"
              >
                Keyingisi: Tekshirish <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 7: TASDIQLASH VA QABUL QILISH */}
        {currentStep === 7 && (
          <Card>
            <CardHeader>
              <CardTitle>7-qadam: Maʼlumotlarni tasdiqlash va qabul qilish</CardTitle>
              <CardDescription>
                Barcha qadamlar boʻyicha maʼlumotlarni tekshirib, buyurtmani rasmiylashtiring.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer summary */}
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Mijoz
                  </span>
                  <p className="font-bold text-sm">
                    {selectedCustomer?.firstName} {selectedCustomer?.lastName}
                  </p>
                  <p className="text-xs text-zinc-500">{selectedCustomer?.phone}</p>
                </div>

                {/* Device summary */}
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Qurilma
                  </span>
                  <p className="font-bold text-sm">
                    {deviceData?.brand} {deviceData?.model}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {deviceData?.category} · IMEI: {deviceData?.imei || '—'}
                  </p>
                </div>
              </div>

              {/* Accessories & condition */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-zinc-500">Komplektatsiya:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAccessories.map(a => (
                    <Badge key={a} variant="secondary">
                      {a}
                    </Badge>
                  ))}
                  {selectedAccessories.length === 0 && (
                    <span className="text-xs text-zinc-400">Koʻrsatilmagan</span>
                  )}
                </div>

                <span className="text-xs font-semibold text-zinc-500 block pt-2">
                  Tashqi holat va nuqsonlar:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedConditions.map(c => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                  {selectedConditions.length === 0 && (
                    <span className="text-xs text-zinc-400">Koʻrsatilmagan</span>
                  )}
                </div>

                <span className="text-xs font-semibold text-zinc-500 block pt-2">
                  Mijoz shikoyati:
                </span>
                <p className="text-sm p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-medium">
                  {complaint}
                </p>
              </div>

              {orderError && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs rounded-lg border border-red-200 dark:border-red-900">
                  {orderError}
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <Button type="button" variant="ghost" onClick={() => setCurrentStep(6)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Orqaga
              </Button>
              <Button
                onClick={handleSubmitOrder}
                disabled={createOrder.isPending}
                className="gap-2 shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                {createOrder.isPending ? 'Qabul qilinmoqda...' : 'Qabul qilishni yakunlash'}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
