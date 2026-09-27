'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { dateTime, fullName, normalizePhone, phone } from '../../../lib/format';
import { can, useMe, type Staff } from '../../../lib/queries';
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
