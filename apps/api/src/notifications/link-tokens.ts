import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '../database';

/** Customer links (tracking page, bot start) are stored hashed; the raw token is only in the link. */
export const hashLink = (raw: string) => createHash('sha256').update(raw).digest('hex');
export async function createLink(db: Database, organizationId: string, orderId: string, purpose: 'TRACK' | 'TELEGRAM') {
  const raw = randomBytes(32).toString('base64url');
  await db.customerLink.create({ data: { organizationId, orderId, purpose, tokenHash: hashLink(raw), expiresAt: new Date(Date.now() + (purpose === 'TRACK' ? 90 : 2) * 86400000) } });
  return raw;
}
