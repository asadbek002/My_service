'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await login(String(data.get('login')), String(data.get('password')));
      router.replace('/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ulanishda xato'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <p className="eyebrow">PREMIUM REPAIR SERVICE</p><h1>MyService</h1>
    <p className="muted">Ish joyingizga xush kelibsiz.</p>
    <form onSubmit={submit}>
      <label>Login<input name="login" autoComplete="username" required maxLength={64} /></label>
      <label>Parol<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button disabled={busy}>{busy ? 'Tekshirilmoqda…' : 'Kirish'}</button>
    </form>
  </section></main>;
}
