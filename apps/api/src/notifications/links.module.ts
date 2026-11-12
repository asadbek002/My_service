import { Controller, Get, Header, Module, Param, Post, NotFoundException, StreamableFile, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import QRCode from 'qrcode';
import { photoFile } from '../orders/photo-files';
import { Database } from '../database';
import { createLink, hashLink } from './link-tokens';
import { CurrentActor, Permissions, Public } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope } from '../orders/orders.module';
import { LoginRateGuard } from '../auth/rate-limit';
import { BotModule } from '../bot/bot.module';
import { OwnBots } from '../bot/own-bot';
export { createLink, hashLink } from './link-tokens';
@Controller('orders')
class LinkController {
  constructor(private readonly db: Database, private readonly own: OwnBots) {}
  @Post(':id/links') @Permissions('orders.edit') @Header('Cache-Control','no-store')
  async links(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(actor) } });
    if (!order) throw new NotFoundException();
    const track = await createLink(this.db, actor.organizationId, id, 'TRACK');
    // The service's own bot when it has one, else the platform bot.
    const ownBot = await this.own.client(actor.organizationId);
    const username = ownBot?.username ?? process.env.TELEGRAM_BOT_USERNAME;
    const telegram = username ? await createLink(this.db, actor.organizationId, id, 'TELEGRAM') : null;
    const tracking = process.env.WEB_URL + '/track/' + track;
    const bot = telegram ? 'https://t.me/' + username + '?start=' + telegram : null;
    // For the QR on the order screen: the customer scans it with the phone camera right at the counter.
    return { tracking, telegram: bot, qrSvg: await QRCode.toString(bot ?? tracking, { type: 'svg', margin: 0, width: 220 }) };
  }
  /** Whether the order's customer gets messages in Telegram (free) or by SMS, for the order page. */
  @Get(':id/telegram') @Permissions('orders.view')
  async telegramState(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(actor) }, include: { customer: { select: { telegramChatId: true, telegramBot: true } } } });
    if (!order) throw new NotFoundException();
    return { connected: !!order.customer.telegramChatId, bot: order.customer.telegramChatId ? (order.customer.telegramBot === 'own' ? 'own' : 'platform') : null };
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
  constructor(private readonly db: Database, private readonly own: OwnBots) {}

  private async link(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException();
    const link = await this.db.customerLink.findUnique({ where: { tokenHash: hashLink(token) } });
    if (!link || link.purpose !== 'TRACK' || link.consumedAt || link.expiresAt <= new Date()) throw new NotFoundException();
    return link;
  }

  /** An intake photo on the tracking page; the link itself is the key (no rate guard: the page loads several). */
  @Get('track/:token/photos/:photoId') @Public() @Header('Cache-Control','private, max-age=3600') @Header('Referrer-Policy','no-referrer')
  async photo(@Param('token') token: string, @Param('photoId') photoId: string) {
    const link = await this.link(token);
    const photo = await this.db.orderPhoto.findFirst({ where: { id: photoId, organizationId: link.organizationId, orderId: link.orderId } });
    if (!photo) throw new NotFoundException();
    return new StreamableFile(createReadStream(photoFile(photo)), { type: photo.mime, length: photo.size, disposition: 'inline' });
  }
  @Get('track/:token') @Public() @UseGuards(LoginRateGuard) @Header('Cache-Control','no-store') @Header('Referrer-Policy','no-referrer')
  async track(@Param('token') token: string) {
    const link = await this.link(token);
    const order = await this.db.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId }, include: { device: true, payments: true, warranty: true, customer: { select: { telegramChatId: true } }, photos: { select: { id: true }, orderBy: { createdAt: 'asc' } } } });
    if (!order) throw new NotFoundException();
    const balance = order.payments.reduce((s,p) => p.kind === 'REFUND' ? s.plus(p.amount) : s.minus(p.amount), order.total);
    // The service's own name and logo on the customer's page.
    const brand = await this.db.organizationSetting.findMany({ where: { organizationId: link.organizationId, key: { in: ['general', 'logo'] } } });
    const general = (brand.find(b => b.key === 'general')?.value ?? {}) as Record<string, unknown>;
    const logo = (brand.find(b => b.key === 'logo')?.value ?? {}) as Record<string, unknown>;
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: link.organizationId }, select: { name: true } });
    // Not in Telegram yet: offer the bot (free messages instead of SMS). The same order link the receipt carries.
    let telegram: string | null = null;
    if (!order.customer.telegramChatId) {
      const username = (await this.own.client(link.organizationId))?.username ?? process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
      if (username) telegram = 'https://t.me/' + username + '?start=' + await createLink(this.db, link.organizationId, order.id, 'TELEGRAM');
    }
    return { service: { name: typeof general.name === 'string' && general.name.trim() ? general.name.trim() : org.name, logo: typeof logo.image === 'string' ? logo.image : null },
      number: order.number, status: order.status, device: order.device.brand + ' ' + order.device.model, complaint: order.complaint, total: order.total, paid: order.total.minus(balance), balance, receivedAt: order.createdAt, warrantyEnd: order.warranty?.endDate ?? null,
      photos: order.photos.map(p => p.id), telegram };
  }
}
@Module({ imports: [BotModule], controllers: [LinkController, TrackingController], providers: [LoginRateGuard] })
export class LinksModule {}
