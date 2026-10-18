'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { publicGet, publicPost, signedIn } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { supportUrl } from '../../lib/support';
import { AuthFrame } from '../../components/layout/auth-frame';
import { PhoneVerify } from '../../components/phone-verify';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { ErrorBox, Loading } from '../../components/ui/feedback';

type Info = { open: boolean; trialDays: number; sms: boolean; telegram: boolean };

/** "Mobile Fix Chilonzor" → "mobilefix": a login suggestion the owner can change. */
const suggestLogin = (name: string) => name.toLowerCase().replace(/[ʻʼ‘’'`]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 16);

/** Self sign-up: confirm the phone, then name the workshop and choose a login. */
export default function Signup() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [infoError, setInfoError] = useState('');
  const [proof, setProof] = useState<{ proof: string; phone: string } | null>(null);
  useEffect(() => { publicGet<Info>('/auth/signup/info').then(setInfo).catch(e => setInfoError(errorText(e))); }, []);
  const onVerified = useCallback((p: string, phone: string) => setProof({ proof: p, phone }), []);

  const trial = info ? (info.trialDays % 30 === 0 ? `${info.trialDays / 30} oy` : `${info.trialDays} kun`) : '';
  return (
    <AuthFrame eyebrow={proof ? '2-qadam · Ustaxona' : "1-qadam · Telefon"} title={proof ? "Ustaxonangizni oching" : "Ro'yxatdan o'tish"}>
      {infoError ? <ErrorBox>{infoError}</ErrorBox> : !info ? <Loading rows={2} /> : !info.open ? (
        <div className="grid gap-3 text-sm">
          <p>Ro&apos;yxatdan o&apos;tish hozircha yopiq.</p>
          <Button asChild variant="brand" size="lg"><a href={supportUrl("Salom! MyService'da ustaxona ochmoqchiman.")} target="_blank" rel="noopener noreferrer">Yordam bo&apos;limiga yozish</a></Button>
        </div>
      ) : proof ? (
        <Details proof={proof.proof} phone={proof.phone} onRestart={() => setProof(null)} onDone={() => router.replace('/setup')} />
      ) : (
        <div className="grid gap-4">
          <p className="rounded-xl bg-brand-soft px-3.5 py-3 text-sm"><b>{trial} tekin.</b> Karta kerak emas. Sinov tugagach tarifni o&apos;zingiz tanlaysiz.</p>
          <PhoneVerify purpose="signup" sms={info.sms} telegram={info.telegram} onVerified={onVerified} />
        </div>
      )}
      <p className="mt-5 text-center text-sm text-mute">Akkauntingiz bormi? <Link href="/login" className="font-semibold text-ink underline">Kirish</Link></p>
    </AuthFrame>
  );
}

function Details({ proof, phone, onRestart, onDone }: { proof: string; phone: string; onRestart: () => void; onDone: () => void }) {
  const [serviceName, setServiceName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [login, setLogin] = useState('');
  const [loginTouched, setLoginTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const shownLogin = loginTouched ? login : suggestLogin(serviceName);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (serviceName.trim().length < 2) return setError('Ustaxona nomini yozing');
    if (!ownerName.trim()) return setError('Ismingizni yozing');
    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(shownLogin)) return setError("Login kamida 3 belgi: lotin harflari, raqam va _ . -");
    if (password.length < 12) return setError("Parol kamida 12 belgidan iborat bo'lsin");
    if (password !== repeat) return setError('Parollar bir xil emas');
    setBusy(true); setError('');
    try {
      signedIn(await publicPost<{ accessToken: string; expiresIn: number }>('/auth/signup', { proof, serviceName: serviceName.trim(), ownerName: ownerName.trim(), login: shownLogin, password }));
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(errorText(err));
      if (message === 'PHONE_NOT_VERIFIED') onRestart();
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800"><Check className="h-4 w-4 shrink-0" /> <span className="num font-mono">{phone}</span> tasdiqlandi</p>
      <FormField label="Ustaxona nomi"><Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Masalan: Mobile Fix" autoCapitalize="words" autoFocus /></FormField>
      <FormField label="Ismingiz"><Input value={ownerName} onChange={e => setOwnerName(e.target.value)} autoComplete="given-name" autoCapitalize="words" /></FormField>
      <FormField label="Login" description="Tizimga kirish uchun. Lotin harflari va raqamlar.">
        <Input value={shownLogin} onChange={e => { setLoginTouched(true); setLogin(e.target.value.trim()); }} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </FormField>
      <FormField label="Parol" description="Kamida 12 belgi"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></FormField>
      <FormField label="Parolni takrorlang"><Input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} autoComplete="new-password" /></FormField>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>{busy ? 'Ochilmoqda…' : 'Ustaxonani ochish'}</Button>
    </form>
  );
}
