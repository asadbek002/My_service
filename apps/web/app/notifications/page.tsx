'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime } from '../../lib/format';
import { AppShell } from '../../components/layout/app-shell';
import { Badge } from '../../components/ui/badge';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';
import { List, ListRow } from '../../components/list-row';

type Notification = { id: string; orderId: string; type: string; channel?: string | null; status: string; errorCode?: string | null; createdAt: string; sentAt?: string | null };
const STATE: Record<string, [string, 'success' | 'destructive' | 'warning']> = { SENT: ['Yuborildi', 'success'], FAILED: ['Yuborilmadi', 'destructive'] };
const ERRORS: Record<string, string> = { SMS_NOT_CONFIGURED: 'SMS sozlanmagan', TELEGRAM_RETRY: 'Telegram javob bermadi', SMS_PROVIDER_REJECTED: 'SMS provayder rad etdi', PROVIDER_UNAVAILABLE: 'Xizmat ishlamadi' };

export default function Notifications() {
  const { data, isLoading, error } = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications') });
  return (
    <AppShell title="Xabarlar" narrow>
      <p className="mb-4 text-sm text-mute">Qurilma tayyor bo&apos;lganda mijozga yuborilgan xabarlar.</p>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={5} /> : !data?.length ? <Empty title="Hali xabar yuborilmagan" /> : (
        <List>
          {data.map(n => {
            const [label, variant] = STATE[n.status] ?? ['Navbatda', 'warning' as const];
            return (
              <ListRow key={n.id} href={`/orders/${n.orderId}`} title={n.channel === 'SMS' ? 'SMS' : n.channel === 'TELEGRAM' ? 'Telegram' : 'Xabar'}
                sub={`${dateTime(n.sentAt ?? n.createdAt)}${n.errorCode ? ' · ' + (ERRORS[n.errorCode] ?? n.errorCode) : ''}`}
                right={<Badge variant={variant}>{label}</Badge>} />
            );
          })}
        </List>
      )}
    </AppShell>
  );
}
