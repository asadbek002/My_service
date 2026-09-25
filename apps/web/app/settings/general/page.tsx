'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { FormField } from '../../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';

type Setting = { key: string; value: Record<string, unknown> };
// Always required by the API on top of the organization's own items.
const DEFAULT_CHECKS = ['Display', 'Touch', 'Camera', 'Microphone', 'Speaker', 'Charging', 'Wi-Fi', 'Bluetooth'];
const DEFAULT_EXPENSES = ['RENT', 'SALARY', 'DELIVERY', 'ADVERTISEMENT', 'UTILITY', 'TRANSPORT', 'PURCHASE', 'OTHER'];

const lines = (text: string) => [...new Set(text.split('\n').map(l => l.trim()).filter(Boolean))];
const itemsOf = (s: Setting | undefined) => Array.isArray(s?.value?.items) ? (s!.value.items as unknown[]).filter((x): x is string => typeof x === 'string') : [];

export default function GeneralSettings() {
  const qc = useQueryClient();
  const { data: settings = [], isLoading } = useQuery<Setting[]>({ queryKey: ['settings', 'general'], queryFn: () => api('/settings/general') });
  const get = (key: string) => settings.find(s => s.key === key);
  const [checks, setChecks] = useState('');
  const [terms, setTerms] = useState('');
  const [expenses, setExpenses] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    setChecks(itemsOf(get('final_test_checklist')).join('\n'));
    const t = get('warranty_terms')?.value?.text;
    setTerms(typeof t === 'string' ? t : '');
    const e = itemsOf(get('expense_categories'));
    setExpenses((e.length ? e : DEFAULT_EXPENSES).join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, settings]);

  async function save(key: string, value: Record<string, unknown>, label: string) {
    setError(''); setSaved('');
    try {
      await api('/settings/general/' + key, { method: 'PUT', body: JSON.stringify({ value }) });
      await qc.invalidateQueries({ queryKey: ['settings', 'general'] });
      setSaved(label + ' saqlandi');
    } catch (e) { setError(e instanceof Error ? e.message : 'Saqlanmadi'); }
  }

  return (
    <AppShell title="Umumiy sozlamalar" subtitle="Sozlamalar" action={<Link href="/settings"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Sozlamalar</Button></Link>}>
      <div className="space-y-6 max-w-3xl">
        {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</p>}
        {saved && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{saved}</p>}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final test checklist</CardTitle>
            <CardDescription>Standart punktlar doim tekshiriladi: {DEFAULT_CHECKS.join(', ')}. Qo&apos;shimchalarini har qatorga bittadan yozing (masalan, Face ID).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField label="Qo'shimcha punktlar"><Textarea rows={5} value={checks} onChange={e => setChecks(e.target.value)} placeholder={'Face ID\nTrue Tone\nVibro'} /></FormField>
            <Button size="sm" onClick={() => save('final_test_checklist', { items: lines(checks).map(x => x.slice(0, 100)).slice(0, 30) }, 'Checklist')}>Saqlash</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kafolat shartlari</CardTitle>
            <CardDescription>Kafolat taloniga yoziladigan umumiy matn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={4} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Kafolat namlik, zarba va ruxsatsiz ochilish holatlariga tatbiq etilmaydi." />
            <Button size="sm" onClick={() => save('warranty_terms', { text: terms.trim().slice(0, 4000) }, 'Kafolat shartlari')}>Saqlash</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Xarajat turlari</CardTitle>
            <CardDescription>Har qatorga bittadan. PURCHASE (detal xaridi) foyda hisobida alohida hisoblanadi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={8} value={expenses} onChange={e => setExpenses(e.target.value)} />
            <Button size="sm" onClick={() => save('expense_categories', { items: lines(expenses).map(x => x.slice(0, 100)).slice(0, 50) }, 'Xarajat turlari')}>Saqlash</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
