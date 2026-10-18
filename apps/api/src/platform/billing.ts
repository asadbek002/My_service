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
  /** Whether new services may register themselves on the sign-up page. */
  signupOpen: boolean;
  /** Plan a self-registered service tries during its trial; null = the most expensive active plan. */
  signupPlanId: string | null;
}
export const DEFAULT_BILLING: BillingSettings = { trialDays: 60, graceDays: 5, extraSmsPrice: '150', yearlyFreeMonths: 2, signupOpen: true, signupPlanId: null };

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

/** The plan a self-registered service starts its trial on, or null when none is available. */
export async function signupPlan(db: Database, s: BillingSettings) {
  if (s.signupPlanId) {
    const chosen = await db.plan.findFirst({ where: { id: s.signupPlanId, active: true } });
    if (chosen) return chosen;
  }
  return db.plan.findFirst({ where: { active: true }, orderBy: [{ monthlyPrice: 'desc' }, { sortOrder: 'desc' }] });
}
