import { Controller, Get, Header, Module, Param, Post, NotFoundException, UseGuards } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Database } from '../database';
import { CurrentActor, Permissions, Public } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope } from '../orders/orders.module';
import { LoginRateGuard } from '../auth/rate-limit';
export const hashLink = (raw: string) => createHash('sha256').update(raw).digest('hex');
export async function createLink(db: Database, organizationId: string, orderId: string, purpose: 'TRACK' | 'TELEGRAM') {
  const raw = randomBytes(32).toString('base64url');
  await db.customerLink.create({ data: { organizationId, orderId, purpose, tokenHash: hashLink(raw), expiresAt: new Date(Date.now() + (purpose === 'TRACK' ? 90 : 2) * 86400000) } });
  return raw;
}
@Controller('orders')
class LinkController {
  constructor(private readonly db: Database) {}
  @Post(':id/links') @Permissions('orders.edit') @Header('Cache-Control','no-store')
  async links(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(actor) } });
    if (!order) throw new NotFoundException();
    const track = await createLink(this.db, actor.organizationId, id, 'TRACK');
    const telegram = process.env.TELEGRAM_BOT_USERNAME ? await createLink(this.db, actor.organizationId, id, 'TELEGRAM') : null;
    return { tracking: process.env.WEB_URL + '/track/' + track, telegram: telegram ? 'https://t.me/' + process.env.TELEGRAM_BOT_USERNAME + '?start=' + telegram : null };
  }
  @Get(':id/notifications') @Permissions('orders.view')
  async history(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(actor) } });
    if (!order) throw new NotFoundException();
    return this.db.notification.findMany({ where: { organizationId: actor.organizationId, orderId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
@Controller('public')
class TrackingController {
  constructor(private readonly db: Database) {}
  @Get('track/:token') @Public() @UseGuards(LoginRateGuard) @Header('Cache-Control','no-store') @Header('Referrer-Policy','no-referrer')
  async track(@Param('token') token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException();
    const link = await this.db.customerLink.findUnique({ where: { tokenHash: hashLink(token) } });
    if (!link || link.purpose !== 'TRACK' || link.consumedAt || link.expiresAt <= new Date()) throw new NotFoundException();
    const order = await this.db.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId }, include: { device: true, payments: true, warranty: true } });
    if (!order) throw new NotFoundException();
    const balance = order.payments.reduce((s,p) => p.kind === 'REFUND' ? s.plus(p.amount) : s.minus(p.amount), order.total);
    return { number: order.number, status: order.status, device: order.device.brand + ' ' + order.device.model, total: order.total, paid: order.total.minus(balance), balance, receivedAt: order.createdAt, warrantyEnd: order.warranty?.endDate ?? null };
  }
}
@Module({ controllers: [LinkController, TrackingController], providers: [LoginRateGuard] })
export class LinksModule {}
