import type { PlanLimits } from './plans';

/** The public address, for canonical links, the sitemap and structured data. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://myserviceuz.uz').replace(/\/$/, '');

export type PublicPlan = PlanLimits & { id: string; name: string; description: string | null; monthlyPrice: string; yearlyTotal: string };
export type Offer = { trialDays: number; yearlyFreeMonths: number; signupOpen: boolean; trialPlanId: string | null; plans: PublicPlan[] };

/**
 * The plans, fetched on the server so search engines and AI crawlers read the prices in the HTML.
 * API_INTERNAL_URL is the API as the web server reaches it; null when it is not reachable (build
 * time, local runs): the page then loads prices in the browser as before.
 */
export async function serverOffer(): Promise<Offer | null> {
  const base = process.env.API_INTERNAL_URL;
  if (!base) return null;
  try {
    const res = await fetch(base.replace(/\/$/, '') + '/public/plans', { next: { revalidate: 600 }, signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() as Offer : null;
  } catch { return null; }
}
