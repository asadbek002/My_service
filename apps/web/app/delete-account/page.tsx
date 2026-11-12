'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api, clearAccess } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { supportUrl } from '../../lib/support';
import { AuthFrame } from '../../components/layout/auth-frame';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/ui/password-input';
import { FormField } from '../../components/ui/form-field';
import { ErrorBox } from '../../components/ui/feedback';
import type { Me } from '../../lib/queries';

/**
 * Deleting an account, in the app and on the web (the address given to Google Play and the App Store).
 * The owner deletes the whole service with all its data; a staff member deletes only their own account.
 */
export default function DeleteAccount() {
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false });
  const brand = useQuery({ queryKey: ['branding'], queryFn: () => api<{ name: string }>('/settings/branding'), enabled: !!me.data, retry: false });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'user' | 'organization' | null>(null);
  const owner = me.data?.role === 'OWNER';
  const name = brand.data?.name ?? '';

  async function remove() {
    setBusy(true); setError('');
    try {
      const r = await api<{ deleted: 'user' | 'organization' }>('/account/delete', { method: 'POST', body: JSON.stringify({ password, ...(owner ? { confirm } : {}) }) });
      clearAccess();
      setDone(r.deleted);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (done) return (
    <AuthFrame eyebrow="Hisob" title="Hisob o'chirildi">
      <p className="text-sm text-mute">{done === 'organization'
        ? "Servisingiz va undagi barcha ma'lumotlar (buyurtmalar, mijozlar, xodimlar, rasmlar) o'chirildi. Zaxira nusxalardan esa ular saqlash muddati tugagach (14 kun) o'chib ketadi."
        : "Hisobingiz o'chirildi: ismingiz, telefoningiz va loginingiz endi saqlanmaydi. Siz ishlagan buyurtmalar servisda qoladi."}</p>
      <Button className="mt-6 w-full" onClick={() => router.replace('/')}>Bosh sahifa</Button>
    </AuthFrame>
  );

  return (
    <AuthFrame eyebrow="Hisob" title="Hisobni o'chirish">
      {me.isLoading ? <p className="text-sm text-mute">Yuklanmoqda…</p> : !me.data ? (
        <div className="space-y-4 text-sm">
          <p>MyService hisobingizni o'chirish uchun avval unga kiring — keyin shu sahifa ochiladi.</p>
          <ul className="list-disc space-y-1 pl-5 text-mute">
            <li><b>Ustaxona egasi</b> o'chirsa — servis va undagi barcha ma'lumotlar o'chadi.</li>
            <li><b>Xodim</b> o'chirsa — faqat uning shaxsiy ma'lumotlari o'chadi.</li>
            <li>Ustaxonaga qurilma topshirgan <b>mijoz</b> bo'lsangiz — o'sha ustaxonaga yoki bizga yozing.</li>
          </ul>
          <Link href="/login?next=/delete-account" className="flex h-11 w-full items-center justify-center rounded-md bg-ink font-semibold text-white">Kirish</Link>
          <p className="text-mute">Kira olmasangiz, <a href={supportUrl("Hisobimni o'chirmoqchiman")} className="underline">Telegram orqali yozing</a> — ro'yxatdan o'tgan telefon raqamingizni ayting.</p>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void remove(); }}>
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{owner
              ? <>Siz <b>{name || 'servis'}</b> egasisiz. O'chirilsa, servis va undagi <b>barcha ma'lumotlar</b> — buyurtmalar, mijozlar, to'lovlar, xodimlar, rasmlar — butunlay o'chadi. Buni qaytarib bo'lmaydi.</>
              : <>Faqat sizning hisobingiz o'chadi: ism, telefon, login. Siz ishlagan buyurtmalar servisda qoladi. Buni qaytarib bo'lmaydi.</>}</p>
          </div>
          {owner && (
            <FormField label={`Tasdiqlash uchun servis nomini yozing: ${name}`}>
              <Input value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
            </FormField>
          )}
          <FormField label="Parolingiz">
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </FormField>
          <ErrorBox>{error}</ErrorBox>
          <Button type="submit" variant="destructive" disabled={busy || !password || (owner && !confirm.trim())}>
            {busy ? "O'chirilmoqda…" : owner ? "Servisni butunlay o'chirish" : "Hisobimni o'chirish"}
          </Button>
          <Link href="/dashboard" className="text-center text-sm text-mute underline">Bekor qilish</Link>
        </form>
      )}
    </AuthFrame>
  );
}
