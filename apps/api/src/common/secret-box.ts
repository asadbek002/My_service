import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Secrets a service gives us (its bot token, its Eskiz password) are stored encrypted with
// AES-256-GCM. The key comes from SECRETS_KEY, or from JWT_ACCESS_SECRET when that is not set.
const key = () => createHash('sha256').update('myservice-secrets:' + (process.env.SECRETS_KEY || process.env.JWT_ACCESS_SECRET || '')).digest();

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
/** Null when the value was not sealed by us or the key changed. */
export function unseal(sealed: unknown): string | null {
  if (typeof sealed !== 'string') return null;
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
