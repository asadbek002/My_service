/** How a plan's limits and features read, on Hisobim and on the home page. */
export const FEATURE_TEXT: [string, string][] = [['telegram', 'Telegram xabarlar'], ['sms', 'SMS xabarlar'], ['exports', 'Eksport (CSV, PDF)'], ['own_bot', "O'z Telegram boti"]];
export const limitText = (n: number | null, unit: string) => n === null ? `Cheksiz ${unit}` : `${n} ta ${unit}`;

export type PlanLimits = { maxStaff: number | null; maxBranches: number | null; monthlyOrders: number | null; smsPerMonth: number | null; features: Record<string, boolean> | null };
export const planLines = (p: PlanLimits) => [
  limitText(p.maxStaff, 'xodim'), limitText(p.maxBranches, 'filial'),
  p.monthlyOrders === null ? 'Cheksiz buyurtma' : `Oyiga ${p.monthlyOrders} ta buyurtma`,
  p.smsPerMonth === null ? 'Cheksiz SMS' : `Oyiga ${p.smsPerMonth} ta SMS`,
  ...FEATURE_TEXT.filter(([k]) => p.features?.[k]).map(([, t]) => t),
];
