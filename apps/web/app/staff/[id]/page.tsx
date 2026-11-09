'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { dateTime, fullName, normalizePhone, phone } from '../../../lib/format';
import { can, useMe, type Staff } from '../../../lib/queries';
import { useCurrentBranch } from '../../../lib/branches';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { StatusBadge } from '../../../components/ui/status-badge';
import { ErrorBox, Loading, Notice } from '../../../components/ui/feedback';

const ACTIONS: Record<string, string> = {
  ORDER_RECEIVED: 'Qurilma qabul qildi', ORDER_IN_REPAIR: "Ta'mirga oldi", ORDER_READY: 'Tayyor deb belgiladi', ORDER_DELIVERED: 'Mijozga berdi',
  ORDER_CANCELLED: 'Bekor qildi', PRICE_CHANGE: "Narxni o'zgartirdi", PAYMENT_RECEIVED: "To'lov oldi", PAYMENT_REFUNDED: 'Pul qaytardi',
  CUSTOMER_CREATED: "Mijoz qo'shdi", DEVICE_CREATED: "Qurilma qo'shdi", EXPENSE_CREATED: "Xarajat yozdi", STAFF_CREATED: "Xodim qo'shdi",
  STAFF_UPDATED: "Xodimni o'zgartirdi", STAFF_PASSWORD_RESET: 'Parolni yangiladi', SETTING_CHANGED: "Sozlamani o'zgartirdi",
  AUTH_LOGIN: "Tizimga kirdi", AUTH_LOGOUT: "Tizimdan chiqdi", AUTH_PASSWORD_CHANGED: "Parolini o'zgartirdi", AUTH_PASSWORD_RESET: "Parolni tikladi", CUSTOMER_UPDATED: "Mijozni o'zgartirdi", BRANCH_CREATED: "Filial ochdi", BRANCH_UPDATED: "Filialni o'zgartirdi", BRANCH_CLOSED: "Filialni yopdi", BRANCH_REOPENED: "Filialni qayta ochdi", STAFF_BRANCHES_CHANGED: "Xodim filiallarini o'zgartirdi", RECEIPT_SENT_TELEGRAM: "Chekni Telegramga yubordi", TELEGRAM_LINKED: "Telegramni uladi", OWN_BOT_CONNECTED: "Botni uladi", OWN_BOT_DISCONNECTED: "Botni uzdi", PLAN_CHOSEN: "Tarif tanladi", ROLE_PERMISSIONS_CHANGED: "Ruxsatlarni o'zgartirdi", SMS_TEST: "Test SMS yubordi", TERMS_ACCEPTED: "Ofertaga rozilik berdi", ALERT_CHAT_LINKED: "Xabar oluvchi qo'shdi",
};

export default function StaffMember() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: s, isLoading, error } = useQuery({ queryKey: ['staff', id], queryFn: () => api<Staff>('/staff/' + id) });
  const { data: activity } = useQuery({ queryKey: ['staff', id, 'activity'], queryFn: () => api<{ id: string; action: string; createdAt: string }[]>('/staff/' + id + '/activity') });
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [password, setPassword] = useState('');
  if (isLoading || !s) return <AppShell title="Xodim" back="/staff" narrow>{error ? <ErrorBox>{errorText(error)}</ErrorBox> : <Loading />}</AppShell>;

  const owner = s.roles.some(r => r.role.systemKey === 'OWNER');
  const self = me?.id === s.id;
  // Colleagues manage each other; only the owner account is off-limits to them.
  const editable = can(me, 'staff.manage') && (!owner || me?.role === 'OWNER');
  async function run(fn: () => Promise<unknown>, ok: string) {
    setState({});
    try { await fn(); await qc.invalidateQueries({ queryKey: ['staff'] }); setState({ ok }); } catch (e) { setState({ error: errorText(e) }); }
  }
  async function saveProfile(d: FormData) {
    const lastName = String(d.get('lastName') ?? '').trim();
    await run(() => api('/staff/' + id, { method: 'PATCH', body: JSON.stringify({ firstName: String(d.get('firstName')).trim(), lastName, phone: normalizePhone(String(d.get('phone'))) }) }), 'Saqlandi');
  }

  return (
    <AppShell title={fullName(s)} back="/staff" narrow>
      <div className="space-y-4">
        <section className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{owner ? 'Boshliq' : 'Xodim'}</p>
              <p className="num font-mono text-sm text-mute">{s.login} · {phone(s.phone)}</p>
            </div>
            <StatusBadge status={s.status} />
          </div>
          {s.mustChangePassword && <p className="mt-2 text-sm text-amber-700">Hali vaqtinchalik parol bilan. Birinchi kirishda o&apos;z parolini qo&apos;yadi.</p>}
        </section>

        <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>

        {editable && (
          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 font-semibold">Ma&apos;lumotlar</h2>
            <form onSubmit={e => { e.preventDefault(); void saveProfile(new FormData(e.currentTarget)); }} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Ism"><Input name="firstName" defaultValue={s.firstName} required /></FormField>
                <FormField label="Familiya"><Input name="lastName" defaultValue={s.lastName ?? ''} /></FormField>
              </div>
              <FormField label="Telefon"><Input name="phone" defaultValue={s.phone} inputMode="tel" required /></FormField>
              <Button className="sm:w-fit">Saqlash</Button>
            </form>
          </section>
        )}

        {me?.role === 'OWNER' && !owner && <StaffBranches staff={s} onSaved={() => run(async () => undefined, 'Filiallar saqlandi')} />}

        {editable && !self && (
          <section className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Parolni unutdimi?</h2>
            <p className="mt-0.5 text-sm text-mute">Yangi vaqtinchalik parol bering. Barcha qurilmalardan chiqib ketadi.</p>
            <div className="mt-3 flex gap-2">
              <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Kamida 12 belgi" autoCapitalize="none" autoComplete="new-password" aria-label="Vaqtinchalik parol" />
              <Button variant="secondary" disabled={password.length < 12} onClick={() => run(() => api(`/staff/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword: password }) }).then(() => setPassword('')), `Yangi parol o'rnatildi. Xodimga ayting.`)}>O&apos;rnatish</Button>
            </div>
          </section>
        )}

        {editable && !self && !owner && (
          <section className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">{s.status === 'ACTIVE' ? "Ishdan ketdimi?" : 'Qayta faollashtirish'}</h2>
            <p className="mt-0.5 text-sm text-mute">{s.status === 'ACTIVE' ? "To'xtatilgan xodim tizimga kira olmaydi. Uning yozuvlari saqlanadi." : 'Xodim yana tizimga kira oladi.'}</p>
            <Button className="mt-3" variant={s.status === 'ACTIVE' ? 'destructive' : 'default'}
              onClick={() => run(() => api(`/staff/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }) }), s.status === 'ACTIVE' ? "To'xtatildi" : 'Faollashtirildi')}>
              {s.status === 'ACTIVE' ? "To'xtatish" : 'Faollashtirish'}
            </Button>
          </section>
        )}

        <section className="rounded-lg border bg-white">
          <h2 className="border-b px-4 py-3 font-semibold">Oxirgi amallar</h2>
          {activity?.length ? (
            <ul className="divide-y">
              {activity.slice(0, 50).map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{ACTIONS[a.action] ?? a.action}</span>
                  <span className="shrink-0 text-xs text-mute">{dateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-sm text-mute">Hali amal yo&apos;q</p>}
        </section>
      </div>
    </AppShell>
  );
}

/** Where a colleague works: they see and take in work only in the ticked branches. */
function StaffBranches({ staff, onSaved }: { staff: Staff; onSaved: () => void }) {
  const qc = useQueryClient();
  const { open, all } = useCurrentBranch();
  const initial = (staff.branches ?? []).map(b => b.branchId);
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (all.length < 2) return null;
  const chosen = ids ?? initial;
  const shown = all.filter(b => !b.archived || initial.includes(b.id));
  const changed = ids !== null && (ids.length !== initial.length || ids.some(x => !initial.includes(x)));
  async function save() {
    if (!chosen.length) { setError('Kamida bitta filialni belgilang'); return; }
    setBusy(true); setError('');
    try { await api(`/staff/${staff.id}/branches`, { method: 'PUT', body: JSON.stringify({ branchIds: chosen }) }); await qc.invalidateQueries({ queryKey: ['staff'] }); setIds(null); onSaved(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="font-semibold">Qaysi filialda ishlaydi?</h2>
      <p className="mt-0.5 text-sm text-mute">Xodim faqat belgilangan filiallarning buyurtmalarini ko&apos;radi va qabul qiladi.</p>
      <div className="mt-3 grid gap-2">
        {shown.map(b => (
          <label key={b.id} className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-ink" checked={chosen.includes(b.id)} disabled={b.archived && !chosen.includes(b.id)}
              onChange={e => setIds(e.target.checked ? [...chosen, b.id] : chosen.filter(x => x !== b.id))} />
            {b.name}{b.archived && <span className="text-xs text-mute">(yopilgan)</span>}
          </label>
        ))}
      </div>
      {open.length === 0 && <p className="mt-2 text-xs text-mute">Ochiq filial yo&apos;q.</p>}
      <ErrorBox className="mt-3">{error}</ErrorBox>
      {changed && <Button className="mt-3" disabled={busy} onClick={save}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</Button>}
    </section>
  );
}
