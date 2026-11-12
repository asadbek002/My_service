'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, QrCode, Send, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import { Button } from './ui/button';
import { ErrorBox } from './ui/feedback';

type State = { connected: boolean; bot: 'own' | 'platform' | null };

/**
 * Whether this customer gets the order's news in Telegram (free) or by SMS. When not connected, the
 * receptionist shows a QR right on the screen: the customer scans it, presses Start, and the bot links them,
 * shows the order and its photos. The screen notices the connection by itself.
 */
export function CustomerTelegram({ orderId, canShow }: { orderId: string; canShow: boolean }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { data } = useQuery({
    queryKey: ['order-telegram', orderId],
    queryFn: () => api<State>(`/orders/${orderId}/telegram`),
    // While the QR is on screen, check every few seconds whether the customer pressed Start.
    refetchInterval: qr ? 3000 : false,
  });
  useEffect(() => { if (data?.connected && qr) setQr(null); }, [data?.connected, qr]);
  useEffect(() => {
    if (!qr) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setQr(null); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [qr]);
  if (!data) return null;

  async function show() {
    setError('');
    try {
      const r = await api<{ telegram: string | null; qrSvg: string }>(`/orders/${orderId}/links`, { method: 'POST' });
      if (!r.telegram) { setError('Telegram bot sozlanmagan'); return; }
      setQr(r.qrSvg);
      void qc.invalidateQueries({ queryKey: ['order-telegram', orderId] });
    } catch (e) { setError(errorText(e)); }
  }

  if (data.connected) return (
    <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <CheckCircle2 className="h-4 w-4 shrink-0" /> Mijoz Telegramga ulangan — xabarlar botdan bepul boradi.
    </p>
  );

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-center gap-3">
        <Send className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">Mijoz Telegramga ulanmagan: qurilma tayyor bo‘lganda SMS ketadi.{canShow && ' QR ni ko‘rsating — skanerlab «Start» ni bossa, xabarlar bepul botdan boradi.'}</p>
        {canShow && <Button size="sm" variant="secondary" onClick={() => void show()}><QrCode className="h-4 w-4" /> QR ko‘rsatish</Button>}
      </div>
      <ErrorBox className="mt-2">{error}</ErrorBox>
      {qr && (
        <div role="dialog" aria-modal="true" aria-label="Telegram QR" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setQr(null)}>
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center text-ink" onClick={e => e.stopPropagation()}>
            <button type="button" aria-label="Yopish" onClick={() => setQr(null)} className="absolute right-3 top-3 rounded-md p-1.5 text-mute hover:bg-black/[0.04]"><X className="h-5 w-5" /></button>
            <p className="text-lg font-semibold">Telefon kamerasi bilan skanerlang</p>
            <p className="mt-1 text-sm text-mute">Telegram ochiladi — «Start» ni bosing. Buyurtma holati va rasmlari shu yerda ko‘rinadi.</p>
            <div role="img" aria-label="Telegram bot QR kodi" className="mx-auto mt-5 w-56 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-mute"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Mijoz ulanishi kutilmoqda…</p>
          </div>
        </div>
      )}
    </section>
  );
}
