const TZ = 'Asia/Tashkent';

/** 1500000 → "1 500 000" (amounts arrive from the API as decimal strings). */
export function money(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('ru-RU').replace(/ /g, ' ');
}
export const som = (value: string | number | null | undefined) => money(value) + " so'm";

export function date(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}
export function dateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
/** Today in Tashkent as YYYY-MM-DD. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** +998901234567 → "+998 90 123 45 67". */
export function phone(value: string | null | undefined) {
  if (!value) return '';
  const m = value.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : value;
}
/** Whatever the operator typed → +998XXXXXXXXX when it is a 9-digit Uzbek number. */
export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 9) return '+998' + digits;
  if (digits.length === 12 && digits.startsWith('998')) return '+' + digits;
  return input.trim().startsWith('+') ? '+' + digits : digits ? '+' + digits : '';
}
export const fullName = (p: { firstName: string; lastName?: string | null } | null | undefined) => p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
export const deviceName = (d: { brand: string; model: string } | null | undefined) => d ? `${d.brand} ${d.model}`.trim() : '';

export const PAYMENT_METHODS: Record<string, string> = { CASH: 'Naqd', CARD: 'Karta', CLICK: 'Click', PAYME: 'Payme', TRANSFER: "O'tkazma", OTHER: 'Boshqa' };
export const EXPENSE_CATEGORIES: Record<string, string> = { RENT: 'Ijara', SALARY: 'Ish haqi', DELIVERY: 'Yetkazish', ADVERTISEMENT: 'Reklama', UTILITY: 'Kommunal', TRANSPORT: 'Transport', PURCHASE: 'Zapchast xaridi', OTHER: 'Boshqa' };

/** A key for one money-moving request, so a double tap cannot charge twice. */
export const idempotencyKey = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2));
