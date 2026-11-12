import path from 'node:path';

/** Where photo files live: a folder on the server (docker: ./uploads on the host). Backed up by docker/backup.sh. */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
export const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
export const photoFile = (p: { organizationId: string; orderId: string; id: string; mime: string }) =>
  path.join(UPLOAD_DIR, p.organizationId, p.orderId, `${p.id}.${PHOTO_TYPES[p.mime] ?? 'bin'}`);
