'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { api } from '../../../lib/api';
import { useMe } from '../../../lib/queries';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';

type Role = { id: string; name: string; systemKey?: string | null; permissions: { permission: { key: string } }[] };
const ROLE_LABEL: Record<string, string> = { OWNER: 'Egasi', ADMIN: 'Administrator', MANAGER: 'Menejer (qabul)', TECHNICIAN: 'Usta' };
const PERMISSION_LABEL: Record<string, string> = {
  'orders.view': "Buyurtmalarni ko'rish", 'orders.create': 'Buyurtma qabul qilish', 'orders.edit': 'Tasdiq, topshirish, havolalar', 'orders.assign': 'Usta biriktirish',
  'orders.change_status': "Holatni o'zgartirish, ta'mir", 'customers.view': "Mijozlarni ko'rish", 'customers.edit': 'Mijoz/qurilma qo‘shish', 'diagnostics.create': 'Diagnostika va smeta',
  'inventory.view': "Omborni ko'rish", 'inventory.use': 'Detal rezerv/ishlatish', 'inventory.manage': 'Omborni boshqarish', 'inventory.view_cost': "Xarid narxini ko'rish",
  'payments.view': "To'lovlarni ko'rish", 'payments.create': "To'lov qabul qilish", 'payments.refund': 'Pul qaytarish', 'payments.deliver_with_debt': 'Qarz bilan topshirish',
  'reports.view': 'Hisobotlar', 'reports.finance': 'Moliyaviy hisobotlar, xarajatlar', 'expenses.manage': 'Xarajat kiritish',
  'staff.view': "Xodimlarni ko'rish", 'staff.manage': 'Xodimlarni boshqarish', 'settings.manage': 'Sozlamalar',
};
// The API rejects these for non-owner roles.
const OWNER_ONLY = ['staff.manage', 'settings.manage'];

export default function RolesSettings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const roles = useQuery({ queryKey: ['settings', 'roles'], queryFn: () => api<Role[]>('/settings/roles') });
  const catalogue = useQuery({ queryKey: ['settings', 'permissions'], queryFn: () => api<{ key: string }[]>('/settings/permissions') });
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isOwner = me?.role === 'OWNER';
  const keys = (catalogue.data ?? []).map(p => p.key);
  const current = (r: Role) => draft[r.id] ?? r.permissions.map(p => p.permission.key);

  async function save(role: Role) {
    setError(''); setNotice('');
    try {
      await api('/settings/roles/' + role.id, { method: 'PUT', body: JSON.stringify({ permissions: current(role) }) });
      await qc.invalidateQueries({ queryKey: ['settings', 'roles'] });
      setDraft(d => { const n = { ...d }; delete n[role.id]; return n; });
      setNotice(`${ROLE_LABEL[role.systemKey ?? ''] ?? role.name}: ruxsatlar saqlandi. Xodimlar keyingi so'rovdan boshlab yangi ruxsatlar bilan ishlaydi.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Saqlanmadi'); }
  }
  const order = ['OWNER', 'ADMIN', 'MANAGER', 'TECHNICIAN'];
  const sorted = [...(roles.data ?? [])].sort((a, b) => order.indexOf(a.systemKey ?? '') - order.indexOf(b.systemKey ?? ''));

  return (
    <AppShell title="Rollar va ruxsatlar" subtitle="Sozlamalar" action={<Link href="/settings"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Sozlamalar</Button></Link>}>
      <div className="space-y-4">
        {!isOwner && <p className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">Ruxsatlarni faqat servis egasi o&apos;zgartira oladi.</p>}
        {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</p>}
        {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{notice}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map(role => {
            const locked = role.systemKey === 'OWNER' || !isOwner;
            const selected = current(role);
            return (
              <Card key={role.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">{ROLE_LABEL[role.systemKey ?? ''] ?? role.name}{role.systemKey === 'OWNER' && <Lock className="h-3.5 w-3.5 text-zinc-400" />}</CardTitle>
                  <CardDescription>{role.systemKey === 'OWNER' ? "Egasi barcha ruxsatlarga ega va o'zgartirilmaydi" : `${selected.length} ta ruxsat`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {keys.map(key => {
                      const disabled = locked || OWNER_ONLY.includes(key);
                      return (
                        <label key={key} className={`flex items-start gap-2 ${disabled ? 'opacity-60' : ''}`}>
                          <input type="checkbox" className="h-4 w-4 mt-0.5" checked={selected.includes(key)} disabled={disabled}
                            onChange={e => setDraft(d => ({ ...d, [role.id]: e.target.checked ? [...selected, key] : selected.filter(k => k !== key) }))} />
                          <span>{PERMISSION_LABEL[key] ?? key}<span className="block text-[10px] text-zinc-400 font-mono">{key}</span></span>
                        </label>
                      );
                    })}
                  </div>
                  {!locked && <Button size="sm" disabled={!draft[role.id]} onClick={() => save(role)}>Saqlash</Button>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
