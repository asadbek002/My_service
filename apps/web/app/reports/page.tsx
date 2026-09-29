'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download, FileDown } from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime, date, EXPENSE_CATEGORIES, money, phone } from '../../lib/format';
import { can, useMe } from '../../lib/queries';
import { periodLabel, periodQuery, preset, type Period, type PeriodKey } from '../../lib/period';
import { downloadPdf } from '../../lib/pdf';
import { statusLabel } from '../../components/ui/status-badge';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { ErrorBox, Loading, Row } from '../../components/ui/feedback';
import { List, ListRow } from '../../components/list-row';
import { PeriodPicker } from '../../components/period-picker';

type Debtor = { id: string; number: string; status: string; createdAt: string; customer: { firstName: string; lastName?: string | null; phone: string }; device: { brand: string; model: string }; total: string; paid: string; balance: string };
type Expense = { id: string; category: string; amount: string; note: string; createdAt: string };
type Finance = {
  received: number; delivered: number; revenue: string; labor: string; parts: string; averageCheck: string;
  cashIn: string; refunds: string; netCash: string; expenses: { category: string; amount: string }[]; operatingExpenses: string; profit: string;
  debt: string; shopDebt: string; debtors: Debtor[]; expenseItems: Expense[]; basis: string;
};

const catLabel = (c: string) => EXPENSE_CATEGORIES[c] ?? c;
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
// Debt proper: the device left the shop unpaid. Unpaid work still in the shop is not a debt yet.
const DEBT_KINDS = [['delivered', 'Qarzga berilgan'], ['open', 'Ustaxonada, to‘lanmagan'], ['all', 'Hammasi']] as const;
const SORTS = [['amount', "Eng ko'p qarz"], ['old', 'Eng eski'], ['new', 'Eng yangi']] as const;

export default function Reports() {
  const { data: me } = useMe();
  const [mode, setMode] = useState<PeriodKey>('month');
  const [range, setRange] = useState<Period>(() => preset('month'));
  const finance = can(me, 'reports.finance');
  const q = periodQuery(range);
  const { data, isLoading, error } = useQuery({ queryKey: ['finance', q], queryFn: () => api<Finance>('/reports/finance?' + q), enabled: finance });

  // Expense filters
  const [category, setCategory] = useState('');
  const [expenseText, setExpenseText] = useState('');
  const expenses = useMemo(() => (data?.expenseItems ?? []).filter(e =>
    (!category || e.category === category) && (!expenseText.trim() || e.note.toLowerCase().includes(expenseText.trim().toLowerCase()))), [data, category, expenseText]);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const categories = [...new Set((data?.expenseItems ?? []).map(e => e.category))];

  // Debtor filters
  const [kind, setKind] = useState<(typeof DEBT_KINDS)[number][0]>('delivered');
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('amount');
  const [who, setWho] = useState('');
  const debtors = useMemo(() => {
    const text = who.trim().toLowerCase(), digits = text.replace(/\D/g, '');
    return (data?.debtors ?? [])
      .filter(d => kind === 'all' || (kind === 'delivered' ? d.status === 'DELIVERED' : d.status !== 'DELIVERED'))
      .filter(d => !text || d.customer.firstName.toLowerCase().includes(text) || d.number.toLowerCase().includes(text) || (digits.length >= 3 && d.customer.phone.includes(digits)))
      .sort((x, y) => sort === 'amount' ? Number(y.balance) - Number(x.balance) : sort === 'old' ? x.createdAt.localeCompare(y.createdAt) : y.createdAt.localeCompare(x.createdAt));
  }, [data, kind, sort, who]);
  const debtorTotal = debtors.reduce((s, d) => s + Number(d.balance), 0);
  const deliveredDebt = (data?.debtors ?? []).filter(d => d.status === 'DELIVERED').reduce((s, d) => s + Number(d.balance), 0);

  const [state, setState] = useState('');
  async function exportCsv() {
    setState('');
    try {
      const blob = await apiBlob('/reports/export?' + q);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `buyurtmalar-${range[0]}-${range[1]}.csv` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { setState(errorText(e)); }
  }
  async function exportPdf() {
    if (!data) return;
    setState('');
    try {
      const kindLabel = DEBT_KINDS.find(k => k[0] === kind)![1];
      await downloadPdf({
        fileName: `hisobot-${range[0]}-${range[1]}.pdf`,
        title: 'Moliyaviy hisobot',
        subtitle: periodLabel(range),
        sections: [
          { title: 'Tushum va foyda', summary: [
            ['Tushum (berilgan qurilmalar)', money(data.revenue) + " so'm"],
            ['— usta haqi', money(data.labor)], ['— zapchast', money(data.parts)],
            ['Xarajatlar (zapchast xaridisiz)', '−' + money(data.operatingExpenses)],
            ['Foyda = usta haqi − xarajatlar', money(data.profit) + " so'm"],
            ['Qabul qilindi / berildi', `${data.received} / ${data.delivered} ta`], ["O'rtacha chek", money(data.averageCheck)],
          ], note: data.basis },
          { title: 'Kassa', summary: [['Tushgan pul', money(data.cashIn)], ['Qaytarilgan', '−' + money(data.refunds)], ['Sof', money(data.netCash) + " so'm"]] },
          { title: 'Xarajatlar' + (category ? ' · ' + catLabel(category) : '') + (expenseText.trim() ? ` · "${expenseText.trim()}"` : ''), table: {
            head: ['Sana', 'Turi', 'Izoh', 'Summa'], right: [3],
            rows: expenses.map(e => [dateTime(e.createdAt), catLabel(e.category), e.note, money(e.amount)]),
            foot: ['', '', 'Jami', money(expenseTotal)],
          } },
          { title: `Qarzdorlar · ${kindLabel}` + (who.trim() ? ` · "${who.trim()}"` : ''), table: {
            head: ['Buyurtma', 'Mijoz', 'Telefon', 'Qurilma', 'Holat', 'Kun', 'Qoldiq'], right: [5, 6],
            rows: debtors.map(d => [d.number, d.customer.firstName, phone(d.customer.phone), `${d.device.brand} ${d.device.model}`, statusLabel(d.status), String(days(d.createdAt)), money(d.balance)]),
            foot: ['', '', '', '', '', 'Jami', money(debtorTotal)],
          } },
          ...(Number(data.shopDebt) > 0 ? [{ title: "Do'konlarga zapchast qarzi", summary: [['Jami', money(data.shopDebt) + " so'm"]] as [string, string][] }] : []),
        ],
      });
    } catch (e) { setState(errorText(e)); }
  }

  return (
    <AppShell title="Hisobot" narrow action={
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={exportCsv} aria-label="Excel uchun CSV"><Download className="h-4 w-4" /><span className="hidden sm:inline">CSV</span></Button>
        <Button size="sm" onClick={exportPdf} disabled={!data}><FileDown className="h-4 w-4" /> PDF</Button>
      </div>
    }>
      <div className="space-y-4">
        <PeriodPicker mode={mode} value={range} onChange={(m, v) => { setMode(m); setRange(v); }} allowAll={false} />
        <ErrorBox>{state}</ErrorBox>
        {!finance ? <p className="text-sm text-mute">Moliyaviy hisobotni ko&apos;rish uchun ruxsat yo&apos;q.</p> : error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
          <>
            <section className="talon">
              <div className="p-4">
                <p className="eyebrow">Tushum · {periodLabel(range)}</p>
                <p className="num mt-1 font-mono text-3xl font-semibold">{money(data.revenue)}</p>
                <p className="text-sm text-mute">{data.delivered} ta qurilma berildi · {data.received} ta qabul · o&apos;rtacha chek {money(data.averageCheck)}</p>
              </div>
              <div className="talon-cut" />
              <div className="p-4">
                <Row label="Usta haqi">{money(data.labor)}</Row>
                <Row label="Zapchast">{money(data.parts)}</Row>
                <Row label="Xarajatlar">−{money(data.operatingExpenses)}</Row>
                <div className="mt-1 border-t pt-1"><Row label="Foyda" strong>{money(data.profit)}</Row></div>
                <p className="mt-2 text-xs text-mute">Tushum — shu davrda mijozga berilgan qurilmalar summasi. Foyda = usta haqi − xarajatlar (zapchast xaridi mijoz to&apos;lagan zapchast pulidan qoplanadi).</p>
              </div>
            </section>

            <section className="rounded-lg border bg-white p-4">
              <h2 className="font-semibold">Kassa</h2>
              <p className="mb-2 text-xs text-mute">Shu davrda qo&apos;lga tushgan pul (oldindan to&apos;lovlar ham).</p>
              <Row label="Tushgan pul">{money(data.cashIn)}</Row>
              <Row label="Qaytarilgan">−{money(data.refunds)}</Row>
              <Row label="Sof" strong>{money(data.netCash)}</Row>
            </section>

            {Number(data.shopDebt) > 0 && (
              <Link href="/parts" className="flex items-center justify-between rounded-lg border bg-white p-4 text-sm hover:border-ink/40">
                <span><span className="font-semibold">Do&apos;konlarga zapchast qarzi</span><span className="block text-xs text-mute">Olingan, lekin hali to&apos;lanmagan zapchastlar</span></span>
                <span className="num font-mono font-semibold text-amber-700">{money(data.shopDebt)}</span>
              </Link>
            )}

            <section className="space-y-3 rounded-lg border bg-white p-4">
              <div className="flex items-baseline justify-between"><h2 className="font-semibold">Xarajatlar</h2><Link href="/expenses" className="text-sm text-mute hover:text-ink">Yozish</Link></div>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                <button className="chip" aria-pressed={!category} onClick={() => setCategory('')}>Hammasi</button>
                {categories.map(c => <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{catLabel(c)}</button>)}
              </div>
              <Input value={expenseText} onChange={e => setExpenseText(e.target.value)} placeholder="Izoh bo'yicha qidirish" type="search" />
              <Row label={`${expenses.length} ta xarajat`} strong>{money(expenseTotal)}</Row>
              {expenses.length === 0 ? <p className="py-3 text-center text-sm text-mute">Tanlangan bo&apos;yicha xarajat yo&apos;q</p> : (
                <ul className="-mx-4 divide-y border-t">
                  {expenses.map(e => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{catLabel(e.category)}</p><p className="truncate text-xs text-mute">{dateTime(e.createdAt)} · {e.note}</p></div>
                      <span className="num shrink-0 font-mono text-sm">{money(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {categories.includes('PURCHASE') && <p className="text-xs text-mute">«Zapchast xaridi» foydadan ayrilmaydi: bu pulni mijoz zapchast narxida to&apos;laydi.</p>}
            </section>

            <section id="debtors" className="space-y-3 rounded-lg border bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Qarzdorlar</h2>
                <span className="text-right text-xs text-mute">Qarzga berilgan jami<br /><b className="num font-mono text-sm text-amber-700">{money(deliveredDebt)}</b></span>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                {DEBT_KINDS.map(([key, text]) => <button key={key} className="chip" aria-pressed={kind === key} onClick={() => setKind(key)}>{text}</button>)}
              </div>
              <p className="text-xs text-mute">{kind === 'delivered' ? "Qurilmani olib ketgan, lekin to'liq to'lamagan mijozlar — haqiqiy qarz." : kind === 'open' ? "Qurilma hali ustaxonada: to'lov berishda olinadi, bu hali qarz emas." : 'Ikkalasi birga.'} Qarzdorlar davrga bog&apos;liq emas: hozirgi holat.</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={who} onChange={e => setWho(e.target.value)} placeholder="Ism, telefon yoki raqam" type="search" />
                <Select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Tartib" className="w-40">
                  {SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </Select>
              </div>
              <Row label={`${debtors.length} ta`} strong><span className="text-amber-700">{money(debtorTotal)}</span></Row>
              {debtors.length === 0 ? <p className="py-3 text-center text-sm text-mute">Qarz yo&apos;q</p> : (
                <div className="-mx-4 border-t">
                  <List>
                    {debtors.map(d => (
                      <ListRow key={d.id} href={`/orders/${d.id}`} title={`${d.customer.firstName} · ${d.device.brand} ${d.device.model}`}
                        sub={<span className="num font-mono">{d.number} · {phone(d.customer.phone)} · {days(d.createdAt)} kun · {statusLabel(d.status)}</span>}
                        right={<span className="text-amber-700">{money(d.balance)}</span>} rightSub={`${money(d.paid)} / ${money(d.total)}`} />
                    ))}
                  </List>
                </div>
              )}
            </section>
            <p className="text-xs text-mute">Davr: {date(range[0] + 'T12:00:00+05:00')} – {date(range[1] + 'T12:00:00+05:00')}</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
