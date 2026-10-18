'use client';

import { useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { dateTime } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { ErrorBox, Loading } from '../../../components/ui/feedback';
import { TicketStamp, type Message, type Ticket } from '../ticket';

/** One support thread: the service's messages on the right, the platform's answers on the left. */
export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: ['support', id], queryFn: () => api<Ticket & { messages: Message[] }>('/support/tickets/' + id), refetchInterval: 30_000 });
  const [body, setBody] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['support', id] }), qc.invalidateQueries({ queryKey: ['support'] })]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setState('');
    try { await api('/support/tickets/' + id + '/messages', { method: 'POST', body: JSON.stringify({ body: body.trim() }) }); setBody(''); await refresh(); }
    catch (err) { setState(errorText(err)); } finally { setBusy(false); }
  }
  async function close() {
    setBusy(true); setState('');
    try { await api('/support/tickets/' + id + '/close', { method: 'POST' }); await refresh(); }
    catch (err) { setState(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <AppShell title="Murojaat" back="/help" narrow>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={3} /> : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-lg font-bold leading-snug">{data.subject}</h2>
            <TicketStamp status={data.status} />
          </div>
          <ol className="space-y-3">
            {data.messages.map(m => (
              <li key={m.id} className={cn('flex', m.author === 'SERVICE' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm', m.author === 'SERVICE' ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border bg-white')}>
                  <p className={cn('mb-1 text-xs font-semibold', m.author === 'SERVICE' ? 'text-white/70' : 'text-st-tamir-ink')}>{m.authorName}</p>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={cn('num mt-1.5 text-right font-mono text-[10px]', m.author === 'SERVICE' ? 'text-white/50' : 'text-mute')}>{dateTime(m.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
          <form onSubmit={send} className="space-y-2 rounded-2xl border bg-white p-3">
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={4000} placeholder={data.status === 'CLOSED' ? 'Yozsangiz, murojaat qayta ochiladi' : 'Javob yozing…'} />
            <ErrorBox>{state}</ErrorBox>
            <div className="flex gap-2">
              <Button type="submit" variant="brand" disabled={busy || !body.trim()} className="flex-1 sm:flex-none">Yuborish</Button>
              {data.status !== 'CLOSED' && <Button type="button" variant="secondary" disabled={busy} onClick={close}>Hal bo&apos;ldi, yopish</Button>}
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
