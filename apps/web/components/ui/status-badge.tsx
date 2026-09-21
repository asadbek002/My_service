import { Badge } from './badge';
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  RECEIVED:                   { label: 'Qabul qilindi',    variant: 'default' },
  DIAGNOSING:                 { label: 'Diagnostika',       variant: 'info' },
  WAITING_CUSTOMER_APPROVAL:  { label: 'Mijoz tasdig\'i',   variant: 'warning' },
  WAITING_PART:               { label: 'Detal kutilmoqda',  variant: 'warning' },
  IN_REPAIR:                  { label: 'Ta\'mirda',          variant: 'info' },
  READY:                      { label: 'Tayyor',            variant: 'success' },
  DELIVERED:                  { label: 'Berildi',           variant: 'success' },
  CANCELLED:                  { label: 'Bekor',             variant: 'danger' },
  UNREPAIRABLE:               { label: 'Ta\'mirlanmaydi',   variant: 'danger' },
  ACTIVE:                     { label: 'Faol',              variant: 'success' },
  SUSPENDED:                  { label: 'To\'xtatilgan',     variant: 'danger' },
  INVITED:                    { label: 'Taklif yuborildi',  variant: 'warning' },
  ARCHIVED:                   { label: 'Arxivlangan',       variant: 'default' },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, variant: 'default' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
