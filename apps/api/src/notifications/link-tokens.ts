import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '../database';

/** Customer links (tracking page, bot start) are stored hashed; the raw token is only in the link. */
export const hashLink = (raw: string) => createHash('sha256').update(raw).digest('hex');
/**
 * How long a link opens: a year, so the receipt's QR still works through the repair and the warranty.
 * The bot link can be used again by the same customer (see bot/order-card.ts).
 */
const LINK_DAYS = { TRACK: 365, TELEGRAM: 365 } as const;
export async function createLink(db: Database, organizationId: string, orderId: string, purpose: 'TRACK' | 'TELEGRAM') {
  const raw = randomBytes(32).toString('base64url');
  await db.customerLink.create({ data: { organizationId, orderId, purpose, tokenHash: hashLink(raw), expiresAt: new Date(Date.now() + LINK_DAYS[purpose] * 86400000) } });
  return raw;
}
