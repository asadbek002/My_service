'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { platformLogin } from '../lib';
import { AuthFrame } from '../../../components/layout/auth-frame';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { ErrorBox } from '../../../components/ui/feedback';

export default function PlatformLogin() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const d = new FormData(e.currentTarget);
    try { await platformLogin(String(d.get('login')), String(d.get('password'))); router.replace('/platform'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Xato'); }
    finally { setBusy(false); }
  }
  return (
    <AuthFrame eyebrow="Platforma" title="Platforma boshqaruvi">
      <form onSubmit={submit} className="grid gap-4">
        <FormField label="Login"><Input name="login" required autoComplete="username" autoCapitalize="none" /></FormField>
        <FormField label="Parol"><Input name="password" type="password" required autoComplete="current-password" /></FormField>
        <ErrorBox>{error}</ErrorBox>
        <Button size="lg" disabled={busy} className="w-full">{busy ? 'Kirilmoqda…' : 'Kirish'}</Button>
      </form>
    </AuthFrame>
  );
}
