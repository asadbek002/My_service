'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime, EXPENSE_CATEGORIES, money } from '../../lib/format';
import { can, useDefaults, useMe } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MoneyInput } from '../../components/ui/money-input';
import { Empty, ErrorBox, Loading, Notice } from '../../components/ui/feedback';
import { List, ListRow } from '../../components/list-row';

type Expense = { id: string; category: string; amount: string; note: string; createdAt: string };
const label = (c: string) => EXPENSE_CATEGORIES[c] ?? c;

export default function Expenses() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: ['expenses'], queryFn: () => api<Expense[]>('/expenses') });
  return (
    <AppShell title="Xarajatlar" narrow>
      <div className="space-y-4">
        {can(me, 'expenses.manage') && <ExpenseForm />}
        {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={4} /> : !data?.length ? <Empty title="Hali xarajat yozilmagan" /> : (
          <List>
            {data.map(e => <ListRow key={e.id} title={label(e.category)} sub={`${dateTime(e.createdAt)} · ${e.note}`} right={money(e.amount)} />)}
          </List>
        )}
      </div>
    </AppShell>
  );
}

function ExpenseForm() {
  const qc = useQueryClient();
  const { data: defaults } = useDefaults();
  const categories = defaults?.expenseCategories ?? Object.keys(EXPENSE_CATEGORIES);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const chosen = category || categories[0] || 'OTHER';
  async function save() {
    setBusy(true); setState({});
    try {
      await api('/expenses', { method: 'POST', body: JSON.stringify({ category: chosen, amount, note: note.trim() }) });
      setAmount(''); setNote('');
      await Promise.all([qc.invalidateQueries({ queryKey: ['expenses'] }), qc.invalidateQueries({ queryKey: ['finance'] })]);
      setState({ ok: 'Yozildi' });
    } catch (e) { setState({ error: errorText(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-3 font-semibold">Xarajat yozish</h2>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {categories.map(c => (
          <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={chosen === c}
            className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm', chosen === c ? 'border-ink bg-ink text-white' : 'bg-white')}>{label(c)}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <MoneyInput value={amount} onChange={setAmount} aria-label="Summa" />
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Izoh (masalan: oktyabr ijarasi)" />
      </div>
      <ErrorBox className="mt-3">{state.error}</ErrorBox><Notice className="mt-3">{state.ok}</Notice>
      <Button className="mt-3 w-full sm:w-auto" disabled={busy || !Number(amount) || note.trim().length < 3} onClick={save}>Saqlash</Button>
    </section>
  );
}
