'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download, FileDown } from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime, date, EXPENSE_CATEGORIES, money, PAYMENT_METHODS, phone } from '../../lib/format';
import { can, useMe, usePaymentMethods } from '../../lib/queries';
import { periodLabel, periodQuery, preset, type Period, type PeriodKey } from '../../lib/period';
import { downloadPdf, type PdfSection } from '../../lib/pdf';
import { useCurrentBranch } from '../../lib/branches';
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
  deliveredItems: { id: string; number: string; deliveredAt: string | null; customer: { firstName: string; phone: string }; device: { brand: string; model: string }; labor: string; parts: string; total: string; paid: string }[];
  paymentItems: { id: string; kind: 'PAYMENT' | 'REFUND'; method: string; amount: string; createdAt: string; number: string; customer: string }[];
};

const catLabel = (c: string) => EXPENSE_CATEGORIES[c] ?? c;
type PdfPart = 'revenue' | 'cash' | 'expenses' | 'debtors';
// Report parts in the order of the page: key, PDF title, file name.
const PDF_PARTS: [PdfPart, string, string][] = [['revenue', 'Tushum va foyda', 'tushum'], ['cash', 'Kassa', 'kassa'], ['expenses', 'Xarajatlar', 'xarajatlar'], ['debtors', 'Qarzdorlar', 'qarzdorlar']];
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
// Debt proper: the device left the shop unpaid. Unpaid work still in the shop is not a debt yet.
const DEBT_KINDS = [['delivered', 'Qarzga berilgan'], ['open', 'Ustaxonada, to‘lanmagan'], ['all', 'Hammasi']] as const;
const SORTS = [['amount', "Eng ko'p qarz"], ['old', 'Eng eski'], ['new', 'Eng yangi']] as const;

export default function Reports() {
  const { data: me } = useMe();
  const [mode, setMode] = useState<PeriodKey>('month');
  const [range, setRange] = useState<Period>(() => preset('month'));
  const finance = can(me, 'reports.finance');
  const { branch, name: branchName } = useCurrentBranch();
  const q = periodQuery(range) + (branch ? '&branch=' + encodeURIComponent(branch) : '');
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

  const { data: customMethods } = usePaymentMethods();
  const methodLabel = (m: string) => PAYMENT_METHODS[m] ?? customMethods?.find(x => x.key === m)?.label ?? m;

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
  // Each part of the report downloads on its own (its button on the section), or all of them as one file.
  function sectionsOf(part: PdfPart, d: Finance): PdfSection[] {
    if (part === 'revenue') return [{
      title: 'Tushum va foyda', note: d.basis,
      summary: [
        ['Tushum (berilgan qurilmalar)', money(d.revenue) + " so'm"],
        ['— usta haqi', money(d.labor)], ['— zapchast', money(d.parts)],
        ['Xarajatlar (zapchast xaridisiz)', '−' + money(d.operatingExpenses)],
        ['Foyda = usta haqi − xarajatlar', money(d.profit) + " so'm"],
        ['Qabul qilindi / berildi', `${d.received} / ${d.delivered} ta`], ["O'rtacha chek", money(d.averageCheck)],
      ],
      table: {
        head: ['Berildi', 'Buyurtma', 'Mijoz', 'Qurilma', 'Usta haqi', 'Zapchast', 'Jami'], right: [4, 5, 6],
        rows: d.deliveredItems.map(o => [o.deliveredAt ? dateTime(o.deliveredAt) : '—', o.number, o.customer.firstName, `${o.device.brand} ${o.device.model}`, money(o.labor), money(o.parts), money(o.total)]),
        foot: ['', '', '', 'Jami', money(d.labor), money(d.parts), money(d.revenue)],
      },
    }];
    if (part === 'cash') {
      const byMethod = new Map<string, number>();
      for (const p of d.paymentItems) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount));
      return [{
        title: 'Kassa', note: "Shu davrda qo'lga tushgan va qaytarilgan pul (oldindan olingan to'lovlar ham).",
        summary: [['Tushgan pul', money(d.cashIn)], ['Qaytarilgan', '−' + money(d.refunds)], ['Sof', money(d.netCash) + " so'm"],
          ...[...byMethod].map(([m, v]): [string, string] => ['— ' + methodLabel(m), money(v)])],
        table: {
          head: ['Sana', 'Buyurtma', 'Mijoz', 'Usul', 'Summa'], right: [4],
          rows: d.paymentItems.map(p => [dateTime(p.createdAt), p.number, p.customer, (p.kind === 'REFUND' ? 'Qaytarildi · ' : '') + methodLabel(p.method), (p.kind === 'REFUND' ? '−' : '') + money(p.amount)]),
          foot: ['', '', '', 'Sof', money(d.netCash)],
        },
      }];
    }
    if (part === 'expenses') return [{
      title: 'Xarajatlar' + (category ? ' · ' + catLabel(category) : '') + (expenseText.trim() ? ` · "${expenseText.trim()}"` : ''),
      table: {
        head: ['Sana', 'Turi', 'Izoh', 'Summa'], right: [3],
        rows: expenses.map(e => [dateTime(e.createdAt), catLabel(e.category), e.note, money(e.amount)]),
        foot: ['', '', 'Jami', money(expenseTotal)],
      },
    }];
    const kindLabel = DEBT_KINDS.find(k => k[0] === kind)![1];
    return [
      { title: `Qarzdorlar · ${kindLabel}` + (who.trim() ? ` · "${who.trim()}"` : ''), note: "Qarzdorlar davrga bog'liq emas: yuklab olingan paytdagi holat.", table: {
        head: ['Buyurtma', 'Mijoz', 'Telefon', 'Qurilma', 'Holat', 'Kun', 'Qoldiq'], right: [5, 6],
        rows: debtors.map(x => [x.number, x.customer.firstName, phone(x.customer.phone), `${x.device.brand} ${x.device.model}`, statusLabel(x.status), String(days(x.createdAt)), money(x.balance)]),
        foot: ['', '', '', '', '', 'Jami', money(debtorTotal)],
      } },
      ...(Number(d.shopDebt) > 0 ? [{ title: "Do'konlarga zapchast qarzi", summary: [['Jami', money(d.shopDebt) + " so'm"]] as [string, string][] }] : []),
    ];
  }
  async function exportPdf(parts: PdfPart[]) {
    if (!data) return;
    setState('');
    const one = parts.length === 1 ? PDF_PARTS.find(p => p[0] === parts[0])! : null;
    try {
      await downloadPdf({
        fileName: `${one ? one[2] : 'hisobot'}-${range[0]}-${range[1]}.pdf`,
        title: one ? one[1] : 'Moliyaviy hisobot',
        subtitle: periodLabel(range) + (branchName ? ' · ' + branchName : ''),
        sections: parts.flatMap(p => sectionsOf(p, data)),
      });
    } catch (e) { setState(errorText(e)); }
  }
  const pdfButton = (part: PdfPart, dark = false) => (
    <button onClick={() => exportPdf([part])} aria-label={PDF_PARTS.find(p => p[0] === part)![1] + ' — PDF'}
      className={dark ? 'inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-2.5 font-sans text-xs font-semibold normal-case tracking-normal text-white hover:bg-white/20' : 'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold hover:border-ink/40'}>
      <FileDown className="h-3.5 w-3.5" /> PDF
    </button>
  );

  return (
    <AppShell title="Hisobot" narrow action={
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={exportCsv} aria-label="Excel uchun CSV"><Download className="h-4 w-4" /><span className="hidden sm:inline">CSV</span></Button>
        <Button size="sm" onClick={() => exportPdf(PDF_PARTS.map(p => p[0]))} disabled={!data} aria-label="To'liq hisobot — PDF"><FileDown className="h-4 w-4" /> PDF<span className="hidden sm:inline"> (hammasi)</span></Button>
      </div>
    }>
      <div className="space-y-4">
        <PeriodPicker mode={mode} value={range} onChange={(m, v) => { setMode(m); setRange(v); }} allowAll={false} />
        <ErrorBox>{state}</ErrorBox>
        {!finance ? <p className="text-sm text-mute">Moliyaviy hisobotni ko&apos;rish uchun ruxsat yo&apos;q.</p> : error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
          <>
            {/* Revenue split the way the money is earned: labour is the shop's, parts go back to the shops. */}
            <section className="talon-dark on-ink overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white/60"><span>Tushum</span><span className="flex min-w-0 items-center gap-2"><span className="truncate">{periodLabel(range)}</span>{pdfButton('revenue', true)}</span></div>
                <p className="num mt-2 font-mono text-[2.5rem] font-semibold leading-none tracking-tight sm:text-5xl">{money(data.revenue)}</p>
                <p className="mt-2 text-[13px] text-white/70">{data.delivered} ta berildi · {data.received} ta qabul · o&apos;rtacha chek <span className="num font-mono">{money(data.averageCheck)}</span></p>
                <Split labor={Number(data.labor)} parts={Number(data.parts)} />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/80">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Usta haqi <b className="num font-mono font-semibold text-white">{money(data.labor)}</b></span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6E93FF]" />Zapchast <b className="num font-mono font-semibold text-white">{money(data.parts)}</b></span>
                </div>
              </div>
              <div className="talon-cut" />
              <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-4 sm:px-6">
                <div className="min-w-0"><p className="text-xs text-white/60">Xarajatlar</p><p className="num mt-1 font-mono text-lg font-semibold sm:text-xl">{Number(data.operatingExpenses) > 0 ? '−' : ''}{money(data.operatingExpenses)}</p></div>
                <div className="min-w-0"><p className="text-xs text-white/60">Foyda</p><p className={`num mt-1 font-mono text-lg font-semibold sm:text-xl ${Number(data.profit) < 0 ? 'text-[#FF8A80]' : 'text-[#5BE39A]'}`}>{money(data.profit)}</p></div>
              </div>
            </section>
            <p className="-mt-2 px-1 text-xs text-mute">Tushum — shu davrda mijozga berilgan qurilmalar summasi. Foyda = usta haqi − xarajatlar (zapchast xaridi mijoz to&apos;lagan zapchast pulidan qoplanadi).</p>

            <section className="rounded-2xl border bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Kassa <span className="text-xs font-normal text-mute">qo&apos;lga tushgan pul</span></h2>{pdfButton('cash')}</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="min-w-0"><p className="text-xs text-mute">Tushgan</p><p className="num mt-0.5 whitespace-nowrap font-mono text-[15px] font-semibold sm:text-base">{money(data.cashIn)}</p></div>
                <div className="min-w-0"><p className="text-xs text-mute">Qaytarilgan</p><p className="num mt-0.5 whitespace-nowrap font-mono text-[15px] font-semibold sm:text-base">{Number(data.refunds) > 0 ? '−' : ''}{money(data.refunds)}</p></div>
                <div className="min-w-0"><p className="text-xs text-mute">Sof</p><p className="num mt-0.5 whitespace-nowrap font-mono text-[15px] font-semibold sm:text-base">{money(data.netCash)}</p></div>
              </div>
              <p className="mt-2 text-xs text-mute">Oldindan olingan to&apos;lovlar ham shu yerda.</p>
            </section>

            {Number(data.shopDebt) > 0 && (
              <Link href="/parts" className="flex items-center justify-between rounded-2xl border bg-white p-4 text-sm hover:border-ink/40">
                <span><span className="font-semibold">Do&apos;konlarga zapchast qarzi</span><span className="block text-xs text-mute">Olingan, lekin hali to&apos;lanmagan zapchastlar</span></span>
                <span className="num shrink-0 whitespace-nowrap pl-3 font-mono font-semibold text-amber-700">{money(data.shopDebt)}</span>
              </Link>
            )}

            <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Xarajatlar</h2><span className="flex items-center gap-3"><Link href="/expenses" className="text-sm text-mute hover:text-ink">Yozish</Link>{pdfButton('expenses')}</span></div>
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

            <section id="debtors" className="scroll-mt-20 space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 font-bold">Qarzdorlar {pdfButton('debtors')}</h2>
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

/** One bar, labour (orange) then parts (blue), in proportion. */
function Split({ labor, parts }: { labor: number; parts: number }) {
  const sum = labor + parts;
  return (
    <div className="mt-4 flex h-2.5 gap-[3px]" role="img" aria-label={sum ? `Usta haqi ${Math.round(labor / sum * 100)}%, zapchast ${Math.round(parts / sum * 100)}%` : 'Tushum yo‘q'}>
      {sum === 0 ? <span className="flex-1 rounded-full bg-white/15" /> : <>
        {labor > 0 && <span className="rounded-full bg-brand" style={{ flexGrow: labor }} />}
        {parts > 0 && <span className="rounded-full bg-[#6E93FF]" style={{ flexGrow: parts }} />}
      </>}
    </div>
  );
}
