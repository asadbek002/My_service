'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Phone, Plus, Users, Wrench } from 'lucide-react';
import { api } from '../../lib/api';
import { useCurrentBranch, type Branch } from '../../lib/branches';
import { errorText } from '../../lib/errors';
import { fullName, normalizePhone, phone as fmtPhone } from '../../lib/format';
import { invalidateBusiness, useStaff } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { ErrorBox, Loading, Notice } from '../../components/ui/feedback';

/**
 * Filiallar: the owner opens branches within the plan, gives each its address and phone (printed on
 * its receipts), says who works where, and closes a branch once its devices have left.
 */
export default function BranchesPage() {
  const qc = useQueryClient();
  const current = useCurrentBranch();
  const [adding, setAdding] = useState(false);
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const list = current.all;
  const openCount = current.open.length;
  const full = current.limit !== null && openCount >= current.limit;
  const loaded = !!list.length;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setState({});
    try { await fn(); await invalidateBusiness(qc); setState({ ok }); return true; }
    catch (e) { setState({ error: errorText(e) }); return false; }
  }

  return (
    <AppShell title="Filiallar" narrow action={current.manage && !adding && !full && <Button size="sm" onClick={() => { setAdding(true); setState({}); }}><Plus className="h-4 w-4" /> Filial qo&apos;shish</Button>}>
      <div className="space-y-4">
        <section className="rounded-2xl border bg-white p-4 text-sm sm:p-5">
          <p className="font-semibold">{current.limit === null ? `${openCount} ta ochiq filial · tarifingizda cheklov yo'q` : `${openCount} / ${current.limit} filial · tarifingiz bo'yicha`}</p>
          <p className="mt-1 text-mute">Har bir filialning o&apos;z manzili va telefoni uning chekida chiqadi. Xodim faqat o&apos;zi ishlaydigan filialning buyurtmalarini ko&apos;radi; siz (boshliq) hammasini ko&apos;rasiz va tepadagi tanlov orqali filialni almashtirasiz.</p>
          {full && current.manage && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">Tarifdagi filiallar soni tugadi. Ko&apos;proq filial uchun «Hisobim» bo&apos;limida kattaroq tarifni tanlang.</p>}
        </section>

        <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
        {adding && <BranchForm onCancel={() => setAdding(false)} onSave={async d => { if (await run(() => api('/branches', { method: 'POST', body: JSON.stringify(d) }), `«${d.name}» filiali ochildi`)) setAdding(false); }} withStaff />}

        {!loaded ? <Loading rows={2} /> : (
          <ul className="space-y-3">
            {list.map(b => <BranchCard key={b.id} b={b} manage={current.manage} chosen={current.branch === b.id} multi={current.multi}
              onPick={() => current.set(b.id)}
              onSave={d => run(() => api('/branches/' + b.id, { method: 'PATCH', body: JSON.stringify(d) }), 'Saqlandi')}
              onArchive={archived => {
                if (archived && !window.confirm(`«${b.name}» filiali yopilsinmi? Uning buyurtmalari va tarixi saqlanadi, lekin yangi qabul qilinmaydi.`)) return Promise.resolve(false);
                return run(() => api('/branches/' + b.id, { method: 'PATCH', body: JSON.stringify({ archived }) }), archived ? 'Filial yopildi' : 'Filial qayta ochildi');
              }} />)}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

type BranchInput = { name: string; address: string; phone: string; staffIds?: string[] };

function BranchCard({ b, manage, chosen, multi, onPick, onSave, onArchive }: {
  b: Branch; manage: boolean; chosen: boolean; multi: boolean; onPick: () => void;
  onSave: (d: BranchInput) => Promise<boolean>; onArchive: (archived: boolean) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return <li><BranchForm initial={b} onCancel={() => setEditing(false)} onSave={async d => { if (await onSave(d)) setEditing(false); }} /></li>;
  return (
    <li className={cn('rounded-2xl border bg-white p-4 sm:p-5', b.archived && 'bg-paper/60', chosen && 'border-ink ring-1 ring-ink')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">{b.name}
            {b.archived && <span className="rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Yopilgan</span>}
            {chosen && <span className="rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-st-tayyor-ink">Hozir shu yerda</span>}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-mute"><MapPin className="h-3.5 w-3.5 shrink-0" />{b.address || 'Manzil yozilmagan'}</p>
          {b.phone && <a href={'tel:' + b.phone} className="mt-0.5 flex items-center gap-1.5 text-sm text-mute hover:text-ink"><Phone className="h-3.5 w-3.5 shrink-0" />{fmtPhone(b.phone)}</a>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-mute" /><b className="num font-mono">{b.open}</b> ta qurilma ustaxonada</span>
        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-mute" /><b className="num font-mono">{b.staff}</b> xodim</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {multi && !b.archived && !chosen && <Button size="sm" variant="secondary" onClick={onPick}>Shu filialga o&apos;tish</Button>}
        {manage && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>O&apos;zgartirish</Button>}
        {manage && (b.archived
          ? <Button size="sm" variant="secondary" onClick={() => void onArchive(false)}>Qayta ochish</Button>
          : <Button size="sm" variant="ghost" className="text-red-600" disabled={b.open > 0} title={b.open > 0 ? 'Avval qurilmalarni mijozga bering yoki bekor qiling' : undefined} onClick={() => void onArchive(true)}>Filialni yopish</Button>)}
      </div>
      {manage && !b.archived && b.open > 0 && <p className="mt-2 text-xs text-mute">Filialni yopish uchun avval undagi qurilmalarni mijozga bering yoki bekor qiling.</p>}
    </li>
  );
}

function BranchForm({ initial, onSave, onCancel, withStaff }: { initial?: Branch; onSave: (d: BranchInput) => Promise<void>; onCancel: () => void; withStaff?: boolean }) {
  const { data: staff } = useStaff();
  const colleagues = (staff ?? []).filter(s => s.status === 'ACTIVE' && !s.roles.some(r => r.role.systemKey === 'OWNER'));
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phoneInput, setPhoneInput] = useState(initial?.phone ? fmtPhone(initial.phone) : '');
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const phone = phoneInput.trim() ? normalizePhone(phoneInput) : '';
    if (name.trim().length < 2) return setError('Filial nomini yozing (masalan: Chilonzor)');
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) return setError("Telefonni to'liq yozing: +998 va 9 ta raqam");
    setBusy(true); setError('');
    try { await onSave({ name: name.trim(), address: address.trim(), phone, ...(withStaff ? { staffIds } : {}) }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border-2 border-ink bg-white p-4 sm:p-5" noValidate>
      <h2 className="font-semibold">{initial ? 'Filialni o‘zgartirish' : 'Yangi filial'}</h2>
      <FormField label="Filial nomi"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Masalan: Chilonzor" autoFocus maxLength={80} /></FormField>
      <FormField label="Manzil" description="Shu filial chekida chiqadi"><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Chilonzor 9-kvartal, 12-uy" maxLength={200} /></FormField>
      <FormField label="Telefon"><Input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" /></FormField>
      {withStaff && colleagues.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Bu filialda kim ishlaydi?</legend>
          {colleagues.map(s => (
            <label key={s.id} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-ink" checked={staffIds.includes(s.id)} onChange={e => setStaffIds(e.target.checked ? [...staffIds, s.id] : staffIds.filter(x => x !== s.id))} />
              {fullName(s)} <span className="text-xs text-mute">{s.login}</span>
            </label>
          ))}
          <p className="text-xs text-mute">Keyin «Xodimlar» bo&apos;limida ham o&apos;zgartirsa bo&apos;ladi.</p>
        </fieldset>
      )}
      <ErrorBox>{error}</ErrorBox>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Bekor</Button>
        <Button disabled={busy}>{busy ? 'Saqlanmoqda…' : initial ? 'Saqlash' : 'Filialni ochish'}</Button>
      </div>
    </form>
  );
}
