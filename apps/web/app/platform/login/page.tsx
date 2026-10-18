'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CodeRequired, platformLogin } from '../lib';
import { AuthFrame } from '../../../components/layout/auth-frame';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { ErrorBox } from '../../../components/ui/feedback';

export default function PlatformLogin() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const d = new FormData(e.currentTarget);
    try { await platformLogin(String(d.get('login')), String(d.get('password')), needCode ? String(d.get('code') ?? '') : undefined); router.replace('/platform'); }
    catch (err) { if (err instanceof CodeRequired) setNeedCode(true); setError(err instanceof Error ? err.message : 'Xato'); }
    finally { setBusy(false); }
  }
  return (
    <AuthFrame eyebrow="Platforma" title="Platforma boshqaruvi">
      <form onSubmit={submit} className="grid gap-4">
        <FormField label="Login"><Input name="login" required autoComplete="username" autoCapitalize="none" /></FormField>
        <FormField label="Parol"><Input name="password" type="password" required autoComplete="current-password" /></FormField>
        {needCode && <FormField label="Autentifikator kodi" description="Google Authenticator yoki shunga o'xshash ilovadagi 6 xonali kod"><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus className="num font-mono tracking-[0.3em]" /></FormField>}
        <ErrorBox>{error}</ErrorBox>
        <Button size="lg" disabled={busy} className="w-full">{busy ? 'Kirilmoqda…' : 'Kirish'}</Button>
      </form>
    </AuthFrame>
  );
}
