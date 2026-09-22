'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Users,
  Search,
  Plus,
  Phone,
  Send,
  Smartphone,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { useCustomers, useMe, useCreateCustomer } from '../../lib/queries';
import { customerSchema, type CustomerInput } from '../../lib/schemas';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export default function CustomersPage() {
  const router = useRouter();
  const { data: me, error: meError } = useMe();
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { notificationPreference: 'AUTO' },
  });

  if (meError?.message === 'SESSION_EXPIRED') {
    router.replace('/login');
    return null;
  }

  async function onSubmit(data: CustomerInput) {
    try {
      await createCustomer.mutateAsync(data);
      reset();
      setShowAddForm(false);
    } catch {}
  }

  const filtered = customers.filter(
    c =>
      c.firstName.toLowerCase().includes(search.toLowerCase()) ||
      (c.lastName && c.lastName.toLowerCase().includes(search.toLowerCase())) ||
      c.phone.includes(search)
  );

  return (
    <AppShell
      subtitle="Mijozlar bazasi"
      title="Mijozlar roʻyxati"
      action={
        me?.permissions.includes('customers.edit') ? (
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>{showAddForm ? 'Formani yopish' : 'Yangi mijoz'}</span>
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        {/* New Customer Inline Card */}
        {showAddForm && (
          <Card className="border-zinc-300 dark:border-zinc-700 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Yangi mijoz qoʻshish</CardTitle>
              <CardDescription>
                Mijoz maʼlumotlarini kiriting. Keyinchalik unga qurilma va buyurtma biriktirish mumkin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FormField label="Ism" error={errors.firstName?.message} required>
                    <Input {...register('firstName')} placeholder="Aziz" />
                  </FormField>
                  <FormField label="Familiya" error={errors.lastName?.message}>
                    <Input {...register('lastName')} placeholder="Valiyev" />
                  </FormField>
                  <FormField label="Telefon raqam" error={errors.phone?.message} required>
                    <Input {...register('phone')} placeholder="+998901234567" />
                  </FormField>
                  <FormField label="Telegram username" error={errors.telegramUsername?.message}>
                    <Input {...register('telegramUsername')} placeholder="aziz_v" />
                  </FormField>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    Bekor qilish
                  </Button>
                  <Button type="submit" size="sm" disabled={createCustomer.isPending}>
                    {createCustomer.isPending ? 'Saqlanmoqda...' : 'Mijozni saqlash'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Ism yoki telefon boʻyicha qidiring..."
              className="pl-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-zinc-500">
            Jami: <strong className="text-zinc-900 dark:text-zinc-100">{filtered.length}</strong> mijoz
          </span>
        </div>

        {/* Customers Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-zinc-400">Yuklanmoqda...</div>
            ) : filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Mijoz</th>
                      <th className="py-3 px-4">Telefon</th>
                      <th className="py-3 px-4">Telegram</th>
                      <th className="py-3 px-4 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filtered.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300">
                              {c.firstName[0]}
                            </div>
                            <span>
                              {c.firstName} {c.lastName ?? ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {c.phone}
                        </td>
                        <td className="py-3.5 px-4">
                          {c.telegramChatId ? (
                            <Badge variant="success" className="text-[10px] gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ulangan
                            </Badge>
                          ) : c.telegramUsername ? (
                            <span className="text-xs text-sky-600 dark:text-sky-400">
                              @{c.telegramUsername}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                          >
                            Tafsilotlar <ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-zinc-400">
                Mijozlar topilmadi
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
