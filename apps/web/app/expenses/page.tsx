'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime, EXPENSE_CATEGORIES, money } from '../../lib/format';
import { can, invalidateBusiness, useDefaults, useMe } from '../../lib/queries';
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
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !Number(amount) || note.trim().length < 3) return;
    setBusy(true); setState({});
    try {
      await api('/expenses', { method: 'POST', body: JSON.stringify({ category: chosen, amount, note: note.trim() }) });
      // Ready for the next one straight away: clear the fields and put the cursor back on the amount.
      setAmount(''); setNote('');
      setState({ ok: `Yozildi: ${label(chosen)}` });
      document.getElementById('expense-amount')?.focus();
      await invalidateBusiness(qc);
    } catch (err) { setState({ error: errorText(err) }); } finally { setBusy(false); }
  }
  // The last result disappears as soon as the next expense is being typed.
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (state.ok || state.error) setState({}); };
  return (
    <form onSubmit={save} className="rounded-lg border bg-white p-4" noValidate>
      <h2 className="mb-3 font-semibold">Xarajat yozish</h2>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {categories.map(c => (
          <button key={c} type="button" onClick={() => edit(setCategory)(c)} aria-pressed={chosen === c}
            className="chip">{label(c)}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <MoneyInput id="expense-amount" value={amount} onChange={edit(setAmount)} aria-label="Summa" />
        <Input value={note} onChange={e => edit(setNote)(e.target.value)} placeholder="Izoh (masalan: oktyabr ijarasi)" enterKeyHint="done" />
      </div>
      <ErrorBox className="mt-3">{state.error}</ErrorBox><Notice className="mt-3">{state.ok}</Notice>
      <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={busy || !Number(amount) || note.trim().length < 3}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</Button>
    </form>
  );
}
