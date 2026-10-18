import { Prisma } from '@prisma/client';
import type { Database } from '../database';

/** Platform-wide billing knobs, edited in the platform console (Tariflar → Umumiy sozlamalar). */
export interface BillingSettings {
  /** Free trial for a new service, in days. */
  trialDays: number;
  /** Days a service keeps writing after its subscription ends, before read-only. */
  graceDays: number;
  /** Price of one SMS above the plan's monthly allowance, in so'm. */
  extraSmsPrice: string;
  /** Months given free when paying for a year (yearly price = monthly × (12 − this), unless the plan sets its own). */
  yearlyFreeMonths: number;
}
export const DEFAULT_BILLING: BillingSettings = { trialDays: 60, graceDays: 5, extraSmsPrice: '150', yearlyFreeMonths: 2 };

export async function billingSettings(db: Database): Promise<BillingSettings> {
  const row = await db.platformSetting.findUnique({ where: { key: 'billing' } });
  return { ...DEFAULT_BILLING, ...(row?.value as Partial<BillingSettings> | undefined) };
}
export async function saveBillingSettings(db: Database, value: BillingSettings) {
  const json = value as unknown as Prisma.InputJsonObject;
  await db.platformSetting.upsert({ where: { key: 'billing' }, create: { key: 'billing', value: json }, update: { value: json } });
}

/** What a year costs on a plan: its own yearly price, or monthly × (12 − free months). */
export function yearlyPriceOf(plan: { monthlyPrice: Prisma.Decimal | string; yearlyPrice: Prisma.Decimal | string | null }, s: BillingSettings) {
  if (plan.yearlyPrice !== null) return new Prisma.Decimal(plan.yearlyPrice).toFixed(2);
  return new Prisma.Decimal(plan.monthlyPrice).mul(12 - s.yearlyFreeMonths).toFixed(2);
}
