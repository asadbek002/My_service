import { date, today } from './format';

/** Report periods in Tashkent days: [from, to] as YYYY-MM-DD, '' = no limit. */
export type Period = [string, string];
export const PERIODS = [['all', 'Hammasi'], ['today', 'Bugun'], ['month', 'Shu oy'], ['last', "O'tgan oy"], ['custom', 'Sana']] as const;
export type PeriodKey = (typeof PERIODS)[number][0];

export function preset(key: PeriodKey): Period {
  const t = today();
  if (key === 'all') return ['', ''];
  if (key === 'today') return [t, t];
  if (key === 'month' || key === 'custom') return [t.slice(0, 8) + '01', t];
  const d = new Date(t + 'T12:00:00+05:00');
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  const prev = d.toISOString().slice(0, 7);
  const last = new Date(Date.UTC(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return [prev + '-01', last];
}
export const startOf = (day: string) => new Date(day + 'T00:00:00+05:00').toISOString();
export const endOf = (day: string) => new Date(day + 'T23:59:59.999+05:00').toISOString();
/** ?from=&to= for the API (empty when the period is unlimited). */
export const periodQuery = ([from, to]: Period) => [from && 'from=' + encodeURIComponent(startOf(from)), to && 'to=' + encodeURIComponent(endOf(to))].filter(Boolean).join('&');
export const periodLabel = ([from, to]: Period) => !from && !to ? 'Butun davr' : from === to ? date(startOf(from)) : `${from ? date(startOf(from)) : '…'} – ${to ? date(endOf(to)) : '…'}`;
