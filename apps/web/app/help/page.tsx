'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime } from '../../lib/format';
import { supportUrl } from '../../lib/support';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';
import { TicketStamp, type Ticket } from './ticket';

/** Yordam: write to the platform and follow the answers. Works even when the service is blocked. */
export default function Help() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: ['support'], queryFn: () => api<(Ticket & { last: { body: string; author: string } | null })[]>('/support/tickets') });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3) return setState('Mavzuni yozing (kamida 3 harf)');
    if (!body.trim()) return setState('Savolingizni yozing');
    setBusy(true); setState('');
    try {
      const t = await api<{ id: string }>('/support/tickets', { method: 'POST', body: JSON.stringify({ subject: subject.trim(), body: body.trim() }) });
      await qc.invalidateQueries({ queryKey: ['support'] });
      router.push('/help/' + t.id);
    } catch (err) { setState(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <AppShell title="Yordam" narrow>
      <div className="space-y-4">
        <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5" noValidate>
          <div><h2 className="font-bold">Savol yoki muammo</h2><p className="text-sm text-mute">Yozing — yordam bo&apos;limi shu yerda va Telegramingizda javob beradi.</p></div>
          <FormField label="Mavzu"><Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} placeholder="Masalan: chek printeri chiqarmayapti" /></FormField>
          <FormField label="Batafsil"><Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={4000} placeholder="Nima qildingiz, nima bo'ldi, qaysi sahifada…" /></FormField>
          <ErrorBox>{state}</ErrorBox>
          <Button type="submit" variant="brand" disabled={busy} className="w-full sm:w-auto">{busy ? 'Yuborilmoqda…' : 'Yuborish'}</Button>
        </form>
        <a href={supportUrl('Salom! MyService bo‘yicha yordam kerak.')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border bg-white p-4 text-sm hover:border-ink/30">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper"><Send className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><b className="block">Shoshilinchmi?</b><span className="text-mute">Telegramda to&apos;g&apos;ridan-to&apos;g&apos;ri yozing</span></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
        </a>
        <h2 className="pt-2 text-base font-bold">Murojaatlarim</h2>
        {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={2} /> : !data?.length ? <Empty title="Hali murojaat yo'q" /> : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-white">
            {data.map(t => (
              <li key={t.id}>
                <Link href={'/help/' + t.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F3F7F6]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.subject}</p>
                    <p className="truncate text-[13px] text-mute">{t.last?.author === 'PLATFORM' ? 'Javob: ' : ''}{t.last?.body}</p>
                  </div>
                  <div className="shrink-0 text-right"><TicketStamp status={t.status} /><p className="num mt-1 font-mono text-[11px] text-mute">{dateTime(t.updatedAt)}</p></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
