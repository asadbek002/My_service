'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../lib/api';
import { useMe, useBranches, useStaffActivity } from '../../../lib/queries';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { FormField } from '../../../components/ui/form-field';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';

type StaffUser = {
  id: string; login: string; firstName: string; lastName?: string | null; phone: string; email?: string | null; status: string; mustChangePassword: boolean;
  roles: { role: { name: string; systemKey?: string | null } }[]; branches: { branch: { id: string; name: string } }[];
};
type Stats = { assigned: number; completed: number; active: number; averageRepairSeconds: number; warrantyReturns: number; workRevenue: string | number; repairActions: number; commission: string | number };
type Compensation = { type: string; salary?: string | null; percentage?: string | null; fixedPerJob?: string | null; effectiveFrom: string } | null;

const ROLE_LABEL: Record<string, string> = { OWNER: 'Egasi', ADMIN: 'Administrator', MANAGER: 'Menejer', TECHNICIAN: 'Usta' };
const ACTION_LABEL: Record<string, string> = {
  AUTH_LOGIN: 'Tizimga kirdi', AUTH_LOGOUT: 'Tizimdan chiqdi', AUTH_PASSWORD_CHANGED: "Parolni o'zgartirdi",
  ORDER_RECEIVED: 'Buyurtma qabul qildi', ORDER_DIAGNOSING: 'Diagnostikani boshladi', QUOTE_UPDATED: 'Smeta tuzdi', ORDER_WAITING_CUSTOMER_APPROVAL: 'Tasdiqqa yubordi',
  ORDER_WAITING_PART: 'Detal kutishga o‘tkazdi', ORDER_IN_REPAIR: "Ta'mirga o'tkazdi", REPAIR_STARTED: "Ta'mirni boshladi", REPAIR_PAUSED: "Ta'mirni to'xtatdi",
  REPAIR_ACTION_COMPLETED: 'Ish bajardi', ORDER_READY: "Ta'mirni yakunladi", ORDER_DELIVERED: 'Qurilmani topshirdi', ORDER_ASSIGNED: 'Usta biriktirdi',
  PART_RESERVED: 'Detal rezerv qildi', PART_USED: "Detal o'rnatdi", PART_RELEASED: 'Rezervni bekor qildi', PART_RETURNED: 'Detalni omborga qaytardi',
  PAYMENT_RECEIVED: "To'lov qabul qildi", PAYMENT_REFUNDED: 'Pul qaytardi', WARRANTY_CREATED: 'Kafolat berdi', ORDER_CANCELLED: 'Buyurtmani bekor qildi',
};
const money = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('ru-RU') + " so'm";
const hms = (s: number) => `${Math.floor(s / 3600)} soat ${Math.round((s % 3600) / 60)} daq`;

export default function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isOwner = me?.role === 'OWNER';
  const { data: branches = [] } = useBranches();
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const user = useQuery({ queryKey: ['staff', id], queryFn: () => api<StaffUser>('/staff/' + id) });
  const stats = useQuery({ queryKey: ['staff', id, 'stats', days], queryFn: () => api<Stats>(`/staff/${id}/statistics?from=${new Date(Date.now() - days * 86400000).toISOString()}`) });
  const activity = useStaffActivity(id);
  const compensation = useQuery({ queryKey: ['staff', id, 'compensation'], queryFn: () => api<Compensation>('/staff/' + id + '/compensation') });

  async function run(path: string, method: string, body: unknown, done: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await Promise.all([qc.invalidateQueries({ queryKey: ['staff'] })]);
      setNotice(done);
    } catch (e) { setError(e instanceof Error ? e.message : 'Saqlanmadi'); } finally { setBusy(false); }
  }

  const back = <Link href="/staff"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Xodimlar</Button></Link>;
  const u = user.data;
  if (!u) return <AppShell title="Xodim" action={back}><p className="p-10 text-center text-sm text-zinc-400">{user.error?.message ?? 'Yuklanmoqda...'}</p></AppShell>;
  const roleKey = u.roles[0]?.role.systemKey ?? '';
  const isTechnician = u.roles.some(r => r.role.systemKey === 'TECHNICIAN');
  const s = stats.data;

  return (
    <AppShell title={`${u.firstName} ${u.lastName ?? ''}`.trim()} subtitle={ROLE_LABEL[roleKey] ?? roleKey} action={<div className="flex items-center gap-2"><StatusBadge status={u.status} />{back}</div>}>
      <div className="space-y-6">
        {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</p>}
        {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{notice}</p>}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Statistika</CardTitle>
            <Select value={days} onChange={e => setDays(Number(e.target.value))} className="w-36 h-9 text-xs" aria-label="Davr">
              <option value={1}>Bugun</option><option value={7}>7 kun</option><option value={30}>30 kun</option><option value={90}>90 kun</option><option value={365}>Yil</option>
            </Select>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ['Biriktirilgan', s?.assigned], ['Tugatilgan', s?.completed], ['Faol', s?.active], ["O'rtacha vaqt", s ? hms(s.averageRepairSeconds) : undefined],
              ['Kafolat qaytishi', s?.warrantyReturns], ['Ish daromadi', s ? money(s.workRevenue) : undefined], ['Bajarilgan ishlar', s?.repairActions], ['Komissiya', s ? money(s.commission) : undefined],
            ].map(([k, v]) => <div key={String(k)} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"><p className="text-[11px] text-zinc-500 uppercase">{k}</p><p className="font-bold text-base mt-0.5">{v ?? '…'}</p></div>)}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Ma&apos;lumotlar</CardTitle>{!isOwner && <CardDescription>Faqat egasi tahrirlay oladi</CardDescription>}</CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={e => {
                e.preventDefault(); const d = new FormData(e.currentTarget);
                const body: Record<string, unknown> = { firstName: d.get('firstName'), lastName: d.get('lastName') ?? '', phone: d.get('phone') };
                const email = String(d.get('email') ?? '').trim(); if (email) body.email = email;
                if (roleKey !== 'OWNER') { body.role = d.get('role'); body.branchIds = d.getAll('branchIds').map(String); }
                void run('/staff/' + id, 'PATCH', body, "Ma'lumotlar saqlandi");
              }}>
                <p className="text-xs text-zinc-500">Login: <b>{u.login}</b>{u.mustChangePassword ? ' · vaqtinchalik parol' : ''}</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Ism" required><Input name="firstName" defaultValue={u.firstName} required disabled={!isOwner} /></FormField>
                  <FormField label="Familiya"><Input name="lastName" defaultValue={u.lastName ?? ''} disabled={!isOwner} /></FormField>
                  <FormField label="Telefon" required><Input name="phone" defaultValue={u.phone} required pattern="\+[1-9][0-9]{7,14}" disabled={!isOwner} /></FormField>
                  <FormField label="Email"><Input name="email" type="email" defaultValue={u.email ?? ''} disabled={!isOwner} /></FormField>
                </div>
                {roleKey !== 'OWNER' && (
                  <>
                    <FormField label="Lavozim"><Select name="role" defaultValue={roleKey} disabled={!isOwner}>{['ADMIN', 'MANAGER', 'TECHNICIAN'].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></FormField>
                    <fieldset className="text-sm space-y-1"><legend className="text-sm font-medium mb-1">Filiallar</legend>
                      {branches.map(b => <label key={b.id} className="flex items-center gap-2"><input type="checkbox" name="branchIds" value={b.id} defaultChecked={u.branches.some(x => x.branch.id === b.id)} disabled={!isOwner} className="h-4 w-4" />{b.name}</label>)}
                    </fieldset>
                  </>
                )}
                {isOwner && <Button type="submit" size="sm" disabled={busy}>Saqlash</Button>}
              </form>
              {isOwner && roleKey !== 'OWNER' && (
                <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
                  {u.status !== 'ACTIVE' && <Button size="sm" variant="outline" disabled={busy} onClick={() => run('/staff/' + id + '/status', 'PATCH', { status: 'ACTIVE' }, 'Xodim faollashtirildi')}>Faollashtirish</Button>}
                  {u.status === 'ACTIVE' && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Xodim to'xtatilsinmi? U tizimga kira olmaydi.")) void run('/staff/' + id + '/status', 'PATCH', { status: 'SUSPENDED' }, "Xodim to'xtatildi"); }}>To&apos;xtatish</Button>}
                  {u.status !== 'ARCHIVED' && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm('Xodim arxivlansinmi? Uning tarixi saqlanib qoladi.')) void run('/staff/' + id + '/status', 'PATCH', { status: 'ARCHIVED' }, 'Xodim arxivlandi'); }}>Arxivlash</Button>}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {isTechnician && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Komissiya</CardTitle>
                  <CardDescription>
                    {compensation.data ? `Joriy: ${compensation.data.type}${compensation.data.percentage ? ' · ' + compensation.data.percentage + '%' : ''}${compensation.data.salary && Number(compensation.data.salary) > 0 ? ' · oylik ' + money(compensation.data.salary) : ''}${compensation.data.fixedPerJob && Number(compensation.data.fixedPerJob) > 0 ? ' · ' + money(compensation.data.fixedPerJob) + '/ish' : ''}` : 'Belgilanmagan'}
                  </CardDescription>
                </CardHeader>
                {isOwner && (
                  <CardContent>
                    <form className="grid grid-cols-2 gap-3" onSubmit={async e => {
                      e.preventDefault(); const d = new FormData(e.currentTarget);
                      await run('/staff/' + id + '/compensation', 'POST', { type: d.get('type'), salary: d.get('salary') || '0', percentage: d.get('percentage') || '0', fixedPerJob: d.get('fixedPerJob') || '0' }, 'Komissiya saqlandi');
                      await qc.invalidateQueries({ queryKey: ['staff', id, 'compensation'] });
                    }}>
                      <FormField label="Turi" className="col-span-2"><Select name="type" defaultValue={compensation.data?.type ?? 'PERCENTAGE'}>
                        <option value="SALARY">Faqat oylik</option><option value="PERCENTAGE">Foiz</option><option value="FIXED_PER_JOB">Har ish uchun belgilangan</option><option value="SALARY_PLUS_PERCENTAGE">Oylik + foiz</option>
                      </Select></FormField>
                      <FormField label="Oylik"><Input name="salary" inputMode="decimal" pattern="\d{1,12}(\.\d{1,2})?" placeholder="0" /></FormField>
                      <FormField label="Foiz (%)"><Input name="percentage" inputMode="decimal" pattern="\d{1,3}(\.\d{1,2})?" placeholder="30" /></FormField>
                      <FormField label="Har ish uchun"><Input name="fixedPerJob" inputMode="decimal" pattern="\d{1,12}(\.\d{1,2})?" placeholder="0" /></FormField>
                      <Button type="submit" size="sm" className="self-end h-10" disabled={busy}>Saqlash</Button>
                    </form>
                  </CardContent>
                )}
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Faollik</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm max-h-96 overflow-y-auto">
                  {(activity.data ?? []).map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-xs text-zinc-400 w-28 shrink-0">{new Date(a.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>{ACTION_LABEL[a.action] ?? a.action}</span>
                    </li>
                  ))}
                  {activity.data?.length === 0 && <li className="text-zinc-400">Faollik yo&apos;q</li>}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
