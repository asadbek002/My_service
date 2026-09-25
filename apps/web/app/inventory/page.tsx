'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Package,
  Plus,
  ArrowDownLeft,
  Search,
  ChevronRight,
  AlertTriangle,
  Boxes,
  Barcode,
  Tag,
} from 'lucide-react';
import { clean } from '../../lib/utils';
import { api } from '../../lib/api';
import { useMe, useBranches } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import BarcodeScanner from './barcode-scanner';

type Part = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  brand?: string;
  salePrice: string;
  purchasePrice?: string;
  minimumQuantity?: number;
  stocks: { branchId: string; onHand: number; reserved: number }[];
};
type Supplier = { id: string; name: string };

const partSchema = z.object({
  name: z.string().min(1, 'Nomi majburiy'),
  sku: z.string().min(1, 'SKU majburiy'),
  barcode: z.string().optional(),
  brand: z.string().optional(),
  salePrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri narx"),
  purchasePrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri narx"),
  minimumQuantity: z.string().optional(),
  compatibleModels: z.string().optional(),
  storageLocation: z.string().optional(),
  supplierId: z.string().optional(),
});
const receiveSchema = z.object({
  partId: z.string().min(1, 'Detal tanlang'),
  branchId: z.string().min(1, 'Filial tanlang'),
  quantity: z.string().regex(/^\d+$/, 'Butun son kiriting').refine(v => Number(v) > 0),
  reason: z.string().optional(),
});
type PartInput = z.infer<typeof partSchema>;
type ReceiveInput = z.infer<typeof receiveSchema>;

export default function InventoryPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useMe();
  const { data: branches = [] } = useBranches();
  const [search, setSearch] = useState('');
  const [activeAction, setActiveAction] = useState<'none' | 'new_part' | 'receive'>('none');

  const { data: parts = [], isLoading } = useQuery<Part[]>({
    queryKey: ['parts'],
    queryFn: () => api('/inventory'),
  });
  // Suppliers are only needed for stock receipts, which require inventory.manage.
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api('/suppliers'),
    enabled: !!me?.permissions.includes('inventory.manage'),
  });

  const createPart = useMutation({
    mutationFn: (d: PartInput) =>
      api('/inventory/parts', {
        method: 'POST',
        body: JSON.stringify(clean({
          ...d,
          minimumQuantity: Number(d.minimumQuantity || 0),
          compatibleModels: d.compatibleModels?.split(',').map(x => x.trim()).filter(Boolean) ?? [],
        }, ['name', 'sku', 'barcode', 'brand', 'compatibleModels', 'storageLocation', 'minimumQuantity', 'purchasePrice', 'salePrice'])),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      partForm.reset();
      setActiveAction('none');
    },
  });

  const receivePart = useMutation({
    mutationFn: (d: ReceiveInput) =>
      api('/inventory/receive', {
        method: 'POST',
        body: JSON.stringify(clean({
          ...d,
          quantity: Number(d.quantity),
          reason: d.reason || 'Kirim hujjati',
        }, ['branchId', 'partId', 'quantity', 'supplierId', 'reason'])),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parts'] });
      receiveForm.reset();
      setActiveAction('none');
    },
  });

  const partForm = useForm<PartInput>({ resolver: zodResolver(partSchema) });
  const receiveForm = useForm<ReceiveInput>({ resolver: zodResolver(receiveSchema) });

  const canManage = me?.permissions.includes('inventory.manage');
  const q = search.trim().toLowerCase();
  const visible = q
    ? parts.filter(p => [p.name, p.sku, p.barcode, p.brand].some(v => v?.toLowerCase().includes(q)))
    : parts;

  return (
    <AppShell
      subtitle="Ombor boshqaruvi"
      title="Ehtiyot qismlar va qoldiqlar"
      action={
        canManage ? (
          <div className="flex items-center gap-2">
            <Button
              variant={activeAction === 'receive' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setActiveAction(activeAction === 'receive' ? 'none' : 'receive')}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" />
              Kirim qilish
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs shadow-sm"
              onClick={() => setActiveAction(activeAction === 'new_part' ? 'none' : 'new_part')}
            >
              <Plus className="h-3.5 w-3.5" />
              Yangi detal
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-6">
        {/* Action Panel: New Part */}
        {activeAction === 'new_part' && (
          <Card className="border-zinc-300 dark:border-zinc-700 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Yangi ehtiyot qism katalogi</CardTitle>
              <CardDescription>Katalogga yangi ehtiyot qism kiritish.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={partForm.handleSubmit(d => createPart.mutate(d))} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Detal nomi" error={partForm.formState.errors.name?.message} required>
                    <Input {...partForm.register('name')} placeholder="OLED Display Module" />
                  </FormField>
                  <FormField label="SKU kodi" error={partForm.formState.errors.sku?.message} required>
                    <Input {...partForm.register('sku')} placeholder="OLED-IP15-001" />
                  </FormField>
                  <FormField label="Brend">
                    <Input {...partForm.register('brand')} placeholder="Apple, Samsung..." />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Sotish narxi (soʻm)" error={partForm.formState.errors.salePrice?.message} required>
                    <Input {...partForm.register('salePrice')} placeholder="700000" />
                  </FormField>
                  <FormField label="Tannarxi (soʻm)" error={partForm.formState.errors.purchasePrice?.message} required>
                    <Input {...partForm.register('purchasePrice')} placeholder="550000" />
                  </FormField>
                  <FormField label="Minimal qoldiq">
                    <Input {...partForm.register('minimumQuantity')} type="number" min="0" defaultValue="2" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Shtrix-kod (Barcode)">
                    <Input {...partForm.register('barcode')} placeholder="4780000000012" />
                  </FormField>
                  <FormField label="Mos modellar (vergul bilan)">
                    <Input {...partForm.register('compatibleModels')} placeholder="iPhone 15, iPhone 15 Pro" />
                  </FormField>
                  <FormField label="Yetkazib beruvchi">
                    <Select {...partForm.register('supplierId')}>
                      <option value="">Yetkazib beruvchini tanlang...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setActiveAction('none')}>
                    Bekor qilish
                  </Button>
                  <Button type="submit" size="sm" disabled={createPart.isPending}>
                    {createPart.isPending ? 'Saqlanmoqda...' : 'Katalogga qoʻshish'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Action Panel: Receive Stock */}
        {activeAction === 'receive' && (
          <Card className="border-zinc-300 dark:border-zinc-700 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Omborga qism qabul qilish (Kirim)</CardTitle>
              <CardDescription>Yetkazib beruvchidan kelgan qismlarni filial omboriga kirim qilish.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={receiveForm.handleSubmit(d => receivePart.mutate(d))} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Ehtiyot qism" error={receiveForm.formState.errors.partId?.message} required>
                    <Select {...receiveForm.register('partId')}>
                      <option value="">Qismni tanlang...</option>
                      {parts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Filial" error={receiveForm.formState.errors.branchId?.message} required>
                    <Select {...receiveForm.register('branchId')}>
                      <option value="">Filialni tanlang...</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Miqdor (dona)" error={receiveForm.formState.errors.quantity?.message} required>
                    <Input {...receiveForm.register('quantity')} type="number" min="1" defaultValue="1" />
                  </FormField>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setActiveAction('none')}>
                    Bekor qilish
                  </Button>
                  <Button type="submit" size="sm" disabled={receivePart.isPending}>
                    {receivePart.isPending ? 'Kirim qilinmoqda...' : 'Kirimni tasdiqlash'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Search & Barcode Scan Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Qidiruv: nom, SKU, brend yoki shtrix-kod..."
              className="pl-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <BarcodeScanner onScan={v => setSearch(v)} />
        </div>

        {/* Inventory Parts Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-zinc-400">Yuklanmoqda...</div>
            ) : visible.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Detal nomi</th>
                      <th className="py-3 px-4">SKU / Shtrix-kod</th>
                      <th className="py-3 px-4">Sotuv narxi</th>
                      <th className="py-3 px-4 text-center">Mavjud qoldiq</th>
                      <th className="py-3 px-4 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {visible.map(p => {
                      const totalFree = p.stocks.reduce((n, s) => n + s.onHand - s.reserved, 0);
                      const isLow = p.minimumQuantity && totalFree <= p.minimumQuantity;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/inventory/${p.id}`)}
                          className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                              {p.name}
                            </div>
                            {p.brand && <div className="text-[11px] text-zinc-400">{p.brand}</div>}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                            <div>{p.sku}</div>
                            {p.barcode && (
                              <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                                <Barcode className="h-3 w-3" />
                                {p.barcode}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {Number(p.salePrice).toLocaleString('uz-UZ')} soʻm
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                isLow
                                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              }`}
                            >
                              {totalFree} dona
                            </span>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-zinc-400">Ehtiyot qismlar topilmadi</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
