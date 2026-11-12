import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import type { Database } from '../database';
import { createLink } from '../notifications/link-tokens';
import { photoFile } from '../orders/photo-files';
import { esc, fmtDate, som, STATUS_LABEL, type Keyboard, type TelegramClient } from './telegram.client';

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
const STAGES = [['RECEIVED', 'Qabul'], ['IN_REPAIR', "Ta'mir"], ['READY', 'Tayyor'], ['DELIVERED', 'Berildi']] as const;

/** «/rasm_261112_001» for order MS-261112-001: a tappable command in the chat that sends that order's intake photos. */
export const photosCommand = (number: string) => '/rasm_' + number.replace(/^MS-/, '').replace(/-/g, '_');
export function numberFromCommand(text: string) {
  const m = /^\/rasm_(\d{6})_(\d{3,})(?:@\w+)?$/.exec(text);
  return m ? `MS-${m[1]}-${m[2]}` : null;
}

/** ✔ Qabul → ● Ta'mir → ○ Tayyor → ○ Berildi */
function stages(status: string) {
  if (status === 'CANCELLED') return '✖ Bekor qilindi';
  const at = STAGES.findIndex(([s]) => s === status);
  return STAGES.map(([, label], i) => (i < at ? '✔ ' : i === at ? '● ' : '○ ') + label).join(' → ');
}

/**
 * The order's link from the receipt QR or the «Mijozga havola» button, pressed in the bot: it ties this chat to
 * the order's customer. It can be used again (the customer opens it twice, on a new phone, after /stop), but never
 * takes a customer away from another Telegram account: then the customer proves the number by sharing it.
 */
export async function linkByOrderToken(db: Database, token: string, chatId: string, bot: 'own' | null, orgId?: string) {
  return db.$transaction(async tx => {
    const link = await tx.customerLink.findUnique({ where: { tokenHash: hash(token) } });
    if (!link || link.purpose !== 'TELEGRAM' || link.expiresAt <= new Date() || (orgId && link.organizationId !== orgId)) return { error: 'EXPIRED' as const };
    const order = await tx.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId }, include: { customer: true, organization: true } });
    if (!order) return { error: 'EXPIRED' as const };
    const c = order.customer;
    if (c.telegramChatId && c.telegramChatId !== chatId) return { error: 'TAKEN' as const };
    if (c.telegramChatId !== chatId || (c.telegramBot ?? null) !== bot) {
      await tx.customer.update({ where: { organizationId_id: { organizationId: link.organizationId, id: c.id } }, data: { telegramChatId: chatId, telegramBot: bot } });
      await tx.auditLog.create({ data: { organizationId: link.organizationId, action: 'TELEGRAM_LINKED', entityId: c.id, ...(bot ? { newValue: { bot } } : {}) } });
    }
    if (!link.consumedAt) await tx.customerLink.update({ where: { id: link.id }, data: { consumedAt: new Date() } });
    return { order };
  });
}

/** The tracking page of an order, for the «Saytda ko'rish» button (Telegram takes only https buttons). */
async function trackUrl(db: Database, orgId: string, orderId: string) {
  const web = (process.env.WEB_URL ?? '').replace(/\/$/, '');
  if (!/^https:\/\//.test(web) && process.env.NODE_ENV !== 'test') return null;
  return web + '/track/' + await createLink(db, orgId, orderId, 'TRACK');
}

/** One order in full: device, complaint, stages, price and balance, warranty, a command for its photos. */
export async function orderCard(db: Database, orgId: string, orderId: string, showOrg = false): Promise<{ text: string; keyboard?: Keyboard } | null> {
  const o = await db.order.findFirst({
    where: { id: orderId, organizationId: orgId },
    include: { device: true, organization: true, warranty: true, payments: { select: { kind: true, amount: true } }, _count: { select: { photos: true } } },
  });
  if (!o) return null;
  const paid = o.payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
  const due = o.total.minus(paid);
  const lines = [
    `<b>${esc(o.number)}</b>${showOrg ? ' · ' + esc(o.organization.name) : ''}`,
    `📱 ${esc(`${o.device.brand} ${o.device.model}`.trim())}`,
    ...(o.complaint ? [`Muammo: ${esc(o.complaint)}`] : []),
    `Holat: <b>${STATUS_LABEL[o.status] ?? o.status}</b>`,
    stages(o.status),
    '',
    o.total.greaterThan(0) ? `Narx: <b>${som(o.total)}</b>` + (paid.greaterThan(0) ? ` · To‘langan: ${som(paid)}` : '') : 'Narx: aniqlanmoqda',
    ...(due.greaterThan(0) && paid.greaterThan(0) ? [`To‘lash kerak: <b>${som(due)}</b>`] : []),
    ...(o.warranty && o.warranty.endDate > new Date() ? [`🛡 Kafolat: <b>${fmtDate(o.warranty.endDate)}</b> gacha`] : []),
    ...(o._count.photos ? [`📷 Qabul rasmlari (${o._count.photos}): ${photosCommand(o.number)}`] : []),
  ];
  const url = await trackUrl(db, orgId, o.id);
  return { text: lines.join('\n'), ...(url ? { keyboard: { inline_keyboard: [[{ text: "🌐 Saytda ko'rish", url }]] } } : {}) };
}

/** The intake photos of an order as one album (Telegram allows 10 per album; we keep at most 10). */
export async function sendOrderPhotos(client: TelegramClient, db: Database, chatId: string, orgId: string, orderId: string, number: string) {
  const photos = await db.orderPhoto.findMany({ where: { organizationId: orgId, orderId }, orderBy: { createdAt: 'asc' }, take: 10 });
  const files: { name: string; mime: string; bytes: Buffer }[] = [];
  for (const p of photos) {
    try { files.push({ name: `p${files.length}`, mime: p.mime, bytes: await readFile(photoFile(p)) }); } catch { /* file removed; skip it */ }
  }
  if (!files.length) return false;
  const caption = `📷 ${number}: qabul paytidagi holati`;
  return (await client.sendPhotos(chatId, files, caption)).ok;
}
