'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import { api } from '../../../../lib/api';
import { errorText } from '../../../../lib/errors';
import { date, dateTime, money, phone } from '../../../../lib/format';
import { statusLabel } from '../../../../components/ui/status-badge';
import { cn } from '../../../../lib/utils';

type Receipt = {
  type: 'receipt' | 'delivery'; width: 58 | 80;
  service: { name: string; phone: string; address: string; footer: string };
  order: { number: string; status: string; createdAt: string; complaint: string; accessories: string[]; labor: string; partsTotal: string; total: string; paid: string; balance: string };
  customer: { name: string; phone: string };
  device: { category: string; brand: string; model: string };
  warranty: { endDate: string; terms: string | null } | null;
  qrSvg: string; printedAt: string;
};

export default function Page() {
  return <Suspense><PrintReceipt /></Suspense>;
}

function PrintReceipt() {
  const { id } = useParams<{ id: string }>();
  const type = useSearchParams().get('type') === 'delivery' ? 'delivery' : 'receipt';
  // Every fetch mints a fresh tracking link for the QR, so fetch once per visit.
  const { data, error } = useQuery({
    queryKey: ['receipt', id, type],
    queryFn: () => api<Receipt>(`/orders/${id}/receipt?type=${type}`),
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const [width, setWidth] = useState<58 | 80 | null>(null);
  const paper = width ?? data?.width ?? 80;
  useEffect(() => { document.title = data ? data.order.number : 'Chek'; }, [data]);

  return (
    <div className="min-h-[100dvh] bg-[#EDEDEA] print:bg-white">
      <style>{`@page { size: ${paper}mm auto; margin: 0; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-4">
          <Link href={`/orders/${id}`} className="-ml-2 rounded-md p-2 hover:bg-black/[0.04]" aria-label="Orqaga"><ChevronLeft className="h-5 w-5" /></Link>
          <p className="min-w-0 flex-1 truncate font-semibold">{type === 'delivery' ? 'Berish cheki' : 'Qabul cheki'}</p>
          <div className="flex rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Qog'oz eni">
            {([58, 80] as const).map(w => (
              <button key={w} role="radio" aria-checked={paper === w} onClick={() => setWidth(w)} className={cn('rounded px-2 py-1', paper === w && 'bg-ink text-white')}>{w} mm</button>
            ))}
          </div>
          <button onClick={() => window.print()} disabled={!data} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:opacity-50">
            <Printer className="h-4 w-4" /> Chop etish
          </button>
        </div>
      </div>

      {error && <p className="no-print mx-auto mt-6 max-w-sm rounded-md bg-red-50 p-3 text-sm text-red-700">{errorText(error)}</p>}
      {data && (
        <div className="flex justify-center px-2 py-6 print:block print:p-0">
          <div className="bg-white shadow-sm print:shadow-none" style={{ width: paper + 'mm' }}>
            <ReceiptBody r={data} paper={paper} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptBody({ r, paper }: { r: Receipt; paper: 58 | 80 }) {
  const small = paper === 58;
  const line = <div className="my-1.5 border-t border-dashed border-black" />;
  const Pair = ({ k, v, b }: { k: string; v: string; b?: boolean }) => (
    <div className={cn('flex justify-between gap-2', b && 'font-bold')}><span>{k}</span><span className="text-right">{v}</span></div>
  );
  return (
    <div className={cn('font-mono leading-snug text-black', small ? 'px-[2mm] py-[3mm] text-[10px]' : 'px-[4mm] py-[4mm] text-[12px]')}>
      <div className="text-center">
        <p className={cn('font-bold uppercase', small ? 'text-[13px]' : 'text-[16px]')}>{r.service.name}</p>
        {r.service.phone && <p>{phone(r.service.phone)}</p>}
        {r.service.address && <p>{r.service.address}</p>}
      </div>
      {line}
      <p className="text-center font-bold">{r.type === 'delivery' ? 'BERISH CHEKI' : 'QABUL CHEKI'}</p>
      <p className={cn('text-center font-bold', small ? 'text-[14px]' : 'text-[18px]')}>{r.order.number}</p>
      <p className="text-center">{dateTime(r.order.createdAt)}</p>
      {line}
      <Pair k="Mijoz:" v={r.customer.name} />
      <Pair k="Tel:" v={phone(r.customer.phone)} />
      <Pair k="Qurilma:" v={`${r.device.brand} ${r.device.model}`} />
      <p className="mt-1">Nosozlik: {r.order.complaint}</p>
      {r.order.accessories.length > 0 && <p>Komplekt: {r.order.accessories.join(', ')}</p>}
      {line}
      <Pair k="Usta haqi" v={money(r.order.labor)} />
      <Pair k="Zapchast" v={money(r.order.partsTotal)} />
      <Pair k="JAMI" v={money(r.order.total) + " so'm"} b />
      <Pair k="To'langan" v={money(r.order.paid)} />
      {Number(r.order.balance) > 0 && <Pair k="Qoldiq" v={money(r.order.balance)} b />}
      {r.type === 'delivery' && (
        <>
          {line}
          <Pair k="Holat:" v={statusLabel(r.order.status)} />
          {r.warranty ? (
            <>
              <p className="font-bold">Kafolat: {date(r.warranty.endDate)} gacha</p>
              {r.warranty.terms && <p>{r.warranty.terms}</p>}
            </>
          ) : <p>Kafolat berilmagan</p>}
        </>
      )}
      {line}
      <div className="flex flex-col items-center gap-1 py-1">
        <div className={cn(small ? 'w-[26mm]' : 'w-[30mm]', '[&>svg]:h-auto [&>svg]:w-full')} dangerouslySetInnerHTML={{ __html: r.qrSvg }} />
        <p className="text-center">Holatni kuzatish uchun skanerlang</p>
      </div>
      {r.type === 'receipt' && <p className="mt-1">Qurilmani olishda ushbu chekni ko&apos;rsating.</p>}
      {r.service.footer && <p className="mt-1 whitespace-pre-wrap text-center">{r.service.footer}</p>}
      <div className="mt-4 flex justify-between gap-4">
        <span>Mijoz: ________</span><span>Usta: ________</span>
      </div>
      <p className="mt-3 text-center text-[9px]">{dateTime(r.printedAt)}</p>
    </div>
  );
}
