'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Send } from 'lucide-react';
import { publicPost } from '../lib/api';
import { errorText } from '../lib/errors';
import { normalizePhone } from '../lib/format';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FormField } from './ui/form-field';
import { ErrorBox, Notice } from './ui/feedback';

type Purpose = 'signup' | 'reset';
type Mode = { kind: 'idle' } | { kind: 'sms'; devCode?: string | undefined } | { kind: 'telegram'; token: string; url: string };

/**
 * Proves the phone: an SMS code, or the Telegram bot (open the link, tap "Raqamni tasdiqlash").
 * Calls onVerified with the single-use proof the next step sends to the server.
 */
export function PhoneVerify({ purpose, sms, telegram, onVerified }: { purpose: Purpose; sms: boolean; telegram: boolean; onVerified: (proof: string, phone: string) => void }) {
  const [phoneInput, setPhoneInput] = useState('+998 ');
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const phone = normalizePhone(phoneInput);
  const phoneValid = /^\+998\d{9}$/.test(phone);
  const verified = useRef(false);

  // Resend countdown.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Telegram: ask every 2 s whether the contact was shared, for as long as the link lives.
  useEffect(() => {
    if (mode.kind !== 'telegram') return;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop || verified.current) return;
      try {
        const r = await publicPost<{ verified: boolean; phone?: string; proof?: string }>('/auth/verify/telegram/status', { token: mode.token });
        if (r.verified && r.proof && r.phone) { verified.current = true; onVerified(r.proof, r.phone); return; }
      } catch (e) { if (!stop) { setError(errorText(e)); setMode({ kind: 'idle' }); } return; }
      if (Date.now() - started < 15 * 60_000) setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 2000);
    return () => { stop = true; clearTimeout(t); };
  }, [mode, onVerified]);

  async function sendSms() {
    if (!phoneValid) { setError("Telefon raqamini to'liq yozing: +998 va 9 ta raqam"); return; }
    setBusy(true); setError('');
    try {
      const r = await publicPost<{ resendAfter: number; devCode?: string }>('/auth/verify/sms', { purpose, phone });
      setMode({ kind: 'sms', devCode: r.devCode }); setWait(r.resendAfter); setCode('');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function checkSms() {
    if (!/^\d{6}$/.test(code)) { setError('6 xonali kodni yozing'); return; }
    setBusy(true); setError('');
    try {
      const r = await publicPost<{ proof: string }>('/auth/verify/check', { purpose, phone, code });
      verified.current = true; onVerified(r.proof, phone);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function startTelegram() {
    setBusy(true); setError('');
    try {
      const r = await publicPost<{ token: string; url: string }>('/auth/verify/telegram', { purpose });
      setMode({ kind: 'telegram', ...r });
      window.open(r.url, '_blank', 'noopener');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (mode.kind === 'telegram') {
    return (
      <div className="grid gap-4">
        <div className="rounded-xl bg-paper p-4 text-sm">
          <p className="font-semibold">Telegramda tasdiqlang</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-mute">
            <li>Telegram ochiladi (ochilmasa, pastdagi tugmani bosing).</li>
            <li><b className="text-ink">«Start»</b>, keyin <b className="text-ink">«📱 Raqamni tasdiqlash»</b> tugmasini bosing.</li>
            <li>Shu sahifaga qayting: o&apos;zi davom etadi.</li>
          </ol>
        </div>
        <Button asChild variant="brand" size="lg" className="w-full"><a href={mode.url} target="_blank" rel="noopener noreferrer"><Send className="h-4 w-4" /> Telegramni ochish</a></Button>
        <p className="flex items-center justify-center gap-2 text-sm text-mute"><span className="h-2 w-2 animate-pulse rounded-full bg-st-tamir" /> Tasdiqlash kutilmoqda…</p>
        <ErrorBox>{error}</ErrorBox>
        <button type="button" className="text-sm font-medium text-mute underline" onClick={() => { setMode({ kind: 'idle' }); setError(''); }}>Boshqa usul bilan</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <FormField label="Telefon raqamingiz">
        <Input value={phoneInput} onChange={e => { setPhoneInput(e.target.value); if (mode.kind === 'sms') setMode({ kind: 'idle' }); }} inputMode="tel" autoComplete="tel" className="num font-mono" autoFocus />
      </FormField>
      {mode.kind === 'sms' ? (
        <>
          <FormField label={`Kod ${phone} raqamiga yuborildi`}>
            <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="num text-center font-mono text-lg tracking-[0.4em]" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void checkSms(); } }} />
          </FormField>
          {mode.devCode && <Notice>Sinov rejimi (SMS yuborilmadi): kod <b className="font-mono">{mode.devCode}</b></Notice>}
          <ErrorBox>{error}</ErrorBox>
          <Button type="button" variant="brand" size="lg" className="w-full" disabled={busy || code.length !== 6} onClick={checkSms}>Tasdiqlash</Button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="font-medium text-mute underline disabled:no-underline disabled:opacity-60" disabled={wait > 0 || busy} onClick={sendSms}>{wait > 0 ? `Qayta yuborish ${wait} s` : 'Kodni qayta yuborish'}</button>
            {telegram && <button type="button" className="font-medium text-mute underline" onClick={startTelegram}>Telegram orqali</button>}
          </div>
        </>
      ) : (
        <>
          <ErrorBox>{error}</ErrorBox>
          {sms && <Button type="button" variant="brand" size="lg" className="w-full" disabled={busy} onClick={sendSms}><MessageSquareText className="h-4 w-4" /> SMS kod olish</Button>}
          {telegram && <Button type="button" variant={sms ? 'secondary' : 'brand'} size="lg" className="w-full" disabled={busy} onClick={startTelegram}><Send className="h-4 w-4" /> Telegram orqali tasdiqlash</Button>}
          {!sms && !telegram && <ErrorBox>Telefonni tasdiqlash hozir ishlamayapti. Yordam bo&apos;limiga yozing.</ErrorBox>}
          {telegram && <p className="text-xs text-mute">Telegram orqali tasdiqlash bepul: bot raqamingizni Telegram akkauntingizdan oladi.</p>}
        </>
      )}
    </div>
  );
}
