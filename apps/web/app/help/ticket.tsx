import { cn } from '../../lib/utils';

export type Ticket = { id: string; subject: string; status: 'OPEN' | 'ANSWERED' | 'CLOSED'; createdAt: string; updatedAt: string };
export type Message = { id: string; author: 'SERVICE' | 'PLATFORM'; authorName: string; body: string; createdAt: string };

const STAMP: Record<string, [string, string]> = { OPEN: ['Kutilmoqda', 'text-st-kutish-ink'], ANSWERED: ['Javob berildi', 'text-st-tayyor-ink'], CLOSED: ['Yopilgan', 'text-mute'] };
export function TicketStamp({ status }: { status: string }) {
  const [label, color] = STAMP[status] ?? [status, 'text-mute'];
  return <span className={cn('inline-flex rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]', color)}>{label}</span>;
}
