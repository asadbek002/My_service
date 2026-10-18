'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ApiError, publicGet, publicPost, signedIn } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { AuthFrame } from '../../components/layout/auth-frame';
import { PhoneVerify } from '../../components/phone-verify';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { ErrorBox, Loading } from '../../components/ui/feedback';
import { cn } from '../../lib/utils';

type Info = { sms: boolean; telegram: boolean };
type Account = { login: string; service: string };

/** Forgot password: confirm the phone the account was opened with, then set a new password. */
export default function Reset() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [proof, setProof] = useState<{ proof: string; phone: string } | null>(null);
  useEffect(() => { publicGet<Info>('/auth/signup/info').then(setInfo).catch(() => setInfo({ sms: true, telegram: false })); }, []);
  const onVerified = useCallback((p: string, phone: string) => setProof({ proof: p, phone }), []);
  return (
    <AuthFrame eyebrow={proof ? '2-qadam · Yangi parol' : '1-qadam · Telefon'} title="Parolni tiklash">
      {!info ? <Loading rows={2} /> : proof ? (
        <NewPassword proof={proof.proof} phone={proof.phone} onRestart={() => setProof(null)} onDone={() => router.replace('/dashboard')} />
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-mute">Akkauntingizga yozilgan telefon raqamini tasdiqlang. Xodim bo&apos;lsangiz va raqam yozilmagan bo&apos;lsa, parolni boshliq «Xodimlar» bo&apos;limida yangilaydi.</p>
          <PhoneVerify purpose="reset" sms={info.sms} telegram={info.telegram} onVerified={onVerified} />
        </div>
      )}
      <p className="mt-5 text-center text-sm text-mute"><Link href="/login" className="font-semibold text-ink underline">Kirish sahifasiga qaytish</Link></p>
    </AuthFrame>
  );
}

function NewPassword({ proof, phone, onRestart, onDone }: { proof: string; phone: string; onRestart: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [login, setLogin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) return setError("Parol kamida 12 belgidan iborat bo'lsin");
    if (password !== repeat) return setError('Parollar bir xil emas');
    if (accounts && !login) return setError('Qaysi akkaunt ekanini tanlang');
    setBusy(true); setError('');
    try {
      signedIn(await publicPost<{ accessToken: string; expiresIn: number }>('/auth/reset', { proof, newPassword: password, ...(login ? { login } : {}) }));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.message === 'MANY_ACCOUNTS' && Array.isArray(err.data?.accounts)) {
        setAccounts(err.data.accounts as Account[]); setError('Bu raqamda bir nechta akkaunt bor. Qaysi biri ekanini tanlang.');
      } else {
        setError(errorText(err));
        if (err instanceof Error && err.message === 'PHONE_NOT_VERIFIED') onRestart();
      }
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800"><Check className="h-4 w-4 shrink-0" /> <span className="num font-mono">{phone}</span> tasdiqlandi</p>
      {accounts && (
        <div className="grid gap-2" role="radiogroup" aria-label="Akkaunt">
          {accounts.map(a => (
            <button type="button" key={a.login} role="radio" aria-checked={login === a.login} onClick={() => setLogin(a.login)}
              className={cn('flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm', login === a.login ? 'border-ink bg-ink text-white' : 'bg-white')}>
              <span className="font-mono">{a.login}</span><span className={login === a.login ? 'text-white/70' : 'text-mute'}>{a.service}</span>
            </button>
          ))}
        </div>
      )}
      <FormField label="Yangi parol" description="Kamida 12 belgi"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" autoFocus /></FormField>
      <FormField label="Parolni takrorlang"><Input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} autoComplete="new-password" /></FormField>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Parolni saqlash va kirish'}</Button>
    </form>
  );
}
