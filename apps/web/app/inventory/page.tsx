'use client';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/api';
import { useMe, useBranches } from '../../lib/queries';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import BarcodeScanner from './barcode-scanner';
import { useState } from 'react';

type Part = { id: string; name: string; sku: string; barcode?: string; brand?: string; salePrice: string; stocks: { branchId: string; onHand: number; reserved: number }[] };
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
  note: z.string().optional(),
});
type PartInput = z.infer<typeof partSchema>;
type ReceiveInput = z.infer<typeof receiveSchema>;

export default function Inventory() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: branches = [] } = useBranches();
  const [search, setSearch] = useState('');

  const { data: parts = [], isLoading } = useQuery<Part[]>({ queryKey: ['parts'], queryFn: () => api('/inventory') });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ['suppliers'], queryFn: () => api('/suppliers') });

  const createPart = useMutation({
    mutationFn: (d: PartInput) => api('/inventory/parts', { method: 'POST', body: JSON.stringify({
      ...d,
      minimumQuantity: Number(d.minimumQuantity || 0),
      compatibleModels: d.compatibleModels?.split(',').map(x => x.trim()).filter(Boolean) ?? [],
      supplierId: d.supplierId || undefined,
    })}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parts'] }); partForm.reset(); },
  });
  const receivePart = useMutation({
    mutationFn: (d: ReceiveInput) => api('/inventory/receive', { method: 'POST', body: JSON.stringify({ ...d, quantity: Number(d.quantity) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parts'] }); receiveForm.reset(); },
  });

  const partForm = useForm<PartInput>({ resolver: zodResolver(partSchema) });
  const receiveForm = useForm<ReceiveInput>({ resolver: zodResolver(receiveSchema) });

  const canManage = me?.permissions.includes('inventory.manage');
  const q = search.trim().toLowerCase();
  const visible = q ? parts.filter(p => [p.name, p.sku, p.barcode, p.brand].some(v => v?.toLowerCase().includes(q))) : parts;

  return (
    <main className="page">
      <header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/dashboard">Bosh sahifa</Link></header>
      <div className="title-row"><div><p className="eyebrow">OMBOR</p><h1>Inventar</h1></div></div>

      <div className="search-form">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Qidirish: nom, SKU, barcode..." />
        <BarcodeScanner onScan={v => setSearch(v)} />
      </div>

      <div className="detail-grid">
        <section>
          {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Nomi</th><th>SKU</th><th>Narx</th><th>Qoldiq</th><th></th></tr></thead>
                <tbody>
                  {visible.map(p => {
                    const total = p.stocks.reduce((n, s) => n + s.onHand - s.reserved, 0);
                    return (
                      <tr key={p.id}>
                        <td>{p.name}{p.brand && <small>{p.brand}</small>}</td>
                        <td style={{ fontSize: 12 }}>{p.sku}{p.barcode && <small>{p.barcode}</small>}</td>
                        <td>{Number(p.salePrice).toLocaleString('uz-UZ')}</td>
                        <td>{total}</td>
                        <td><Link href={'/inventory/' + p.id}><Button variant="ghost" size="sm">Ko'rish</Button></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length === 0 && <p className="muted">Detal topilmadi.</p>}
            </div>
          )}
        </section>

        {canManage && (
          <div className="grid gap-4">
            <Card>
              <CardHeader><CardTitle>Yangi detal</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={partForm.handleSubmit(d => createPart.mutate(d))} className="grid gap-3">
                  <FormField label="Nomi" error={partForm.formState.errors.name?.message} required>
                    <Input {...partForm.register('name')} placeholder="OLED Panel" />
                  </FormField>
                  <FormField label="SKU" error={partForm.formState.errors.sku?.message} required>
                    <Input {...partForm.register('sku')} placeholder="OLED-IP15-001" />
                  </FormField>
                  <FormField label="Barcode"><Input {...partForm.register('barcode')} /></FormField>
                  <FormField label="Brend"><Input {...partForm.register('brand')} /></FormField>
                  <FormField label="Sotish narxi" error={partForm.formState.errors.salePrice?.message} required>
                    <Input {...partForm.register('salePrice')} placeholder="700000" />
                  </FormField>
                  <FormField label="Tannarx" error={partForm.formState.errors.purchasePrice?.message} required>
                    <Input {...partForm.register('purchasePrice')} placeholder="550000" />
                  </FormField>
                  <FormField label="Minimal miqdor"><Input {...partForm.register('minimumQuantity')} type="number" min="0" defaultValue="0" /></FormField>
                  <FormField label="Mos modellar"><Input {...partForm.register('compatibleModels')} placeholder="iPhone 15, iPhone 15 Pro" /></FormField>
                  <FormField label="Saqlash joyi"><Input {...partForm.register('storageLocation')} /></FormField>
                  <FormField label="Yetkazib beruvchi">
                    <Select {...partForm.register('supplierId')}>
                      <option value="">Tanlang</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </FormField>
                  {createPart.error && <p className="error">{(createPart.error as Error).message}</p>}
                  <Button type="submit" disabled={createPart.isPending}>{createPart.isPending ? 'Saqlanmoqda...' : 'Detal qo\'shish'}</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Kirim qilish</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={receiveForm.handleSubmit(d => receivePart.mutate(d))} className="grid gap-3">
                  <FormField label="Detal" error={receiveForm.formState.errors.partId?.message} required>
                    <Select {...receiveForm.register('partId')}>
                      <option value="">Tanlang</option>
                      {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Filial" error={receiveForm.formState.errors.branchId?.message} required>
                    <Select {...receiveForm.register('branchId')}>
                      <option value="">Tanlang</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Miqdor" error={receiveForm.formState.errors.quantity?.message} required>
                    <Input {...receiveForm.register('quantity')} type="number" min="1" defaultValue="1" />
                  </FormField>
                  {receivePart.error && <p className="error">{(receivePart.error as Error).message}</p>}
                  <Button type="submit" disabled={receivePart.isPending}>{receivePart.isPending ? 'Kirim qilinmoqda...' : 'Kirim'}</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
