import { Body, Controller, Get, Header, Headers, HttpCode, Module, Param, Post, ForbiddenException, NotFoundException, ConflictException, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IsBoolean, IsInt, Min } from 'class-validator';
import { Database } from '../database';
import { CurrentActor, Permissions, Public } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope, record, transition } from '../orders/orders.module';
import { LoginRateGuard } from '../auth/rate-limit';
export const hashLink = (raw: string) => createHash('sha256').update(raw).digest('hex');
export async function createLink(db: Database, organizationId: string, orderId: string, purpose: string, quoteVersion?: number) {
  const raw = randomBytes(32).toString('base64url');
  await db.customerLink.create({ data: { organizationId, orderId, purpose, tokenHash: hashLink(raw), ...(quoteVersion !== undefined ? { quoteVersion } : {}), expiresAt: new Date(Date.now() + (purpose === 'TRACK' ? 90 : 2) * 86400000) } });
  return raw;
}
class ApprovalDto {
  @IsBoolean() approved!: boolean;
  @IsInt() @Min(1) quoteVersion!: number;
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
    return { number: order.number, status: order.status, device: order.device.brand + ' ' + order.device.model, total: order.total, balance, receivedAt: order.createdAt, warrantyEnd: order.warranty?.endDate ?? null };
  }
  @Get('approval/:token') @Public() @UseGuards(LoginRateGuard) @Header('Cache-Control','no-store') @Header('Referrer-Policy','no-referrer')
  async quote(@Param('token') token: string) {
    const link = await this.db.customerLink.findUnique({ where: { tokenHash: hashLink(token) } });
    if (!link || link.purpose !== 'APPROVAL' || link.consumedAt || link.expiresAt <= new Date()) throw new NotFoundException();
    const order = await this.db.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId } });
    if (!order || order.quoteVersion !== link.quoteVersion || order.status !== 'WAITING_CUSTOMER_APPROVAL') throw new ConflictException('Quote no longer available');
    return { number: order.number, requiredWork: order.requiredWork, total: order.total, quoteVersion: order.quoteVersion };
  }
  @Post('approval/:token') @Public() @UseGuards(LoginRateGuard) @HttpCode(200)
  async approve(@Param('token') token: string, @Body() dto: ApprovalDto) {
    return this.db.$transaction(async tx => {
      const link = await tx.customerLink.findUnique({ where: { tokenHash: hashLink(token) } });
      if (!link || link.purpose !== 'APPROVAL' || link.expiresAt <= new Date()) throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${link.orderId} AND "organizationId" = ${link.organizationId} FOR UPDATE`;
      const used = await tx.customerLink.updateMany({ where: { id: link.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (!used.count) throw new ConflictException('Already used');
      const order = await tx.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId } });
      if (!order || order.status !== 'WAITING_CUSTOMER_APPROVAL' || order.quoteVersion !== dto.quoteVersion || order.quoteVersion !== link.quoteVersion) throw new ConflictException('Quote changed');
      await tx.order.update({ where: { id: order.id }, data: { approvedVersion: order.quoteVersion, approvalStatus: dto.approved ? 'APPROVED' : 'REJECTED', approvalChannel: 'CUSTOMER_LINK', approvedAt: new Date() } });
      const actor: Actor = { organizationId: link.organizationId, userId: 'customer-link:' + link.id, sessionId: '', branchIds: [], permissions: [], owner: false };
      await transition(tx, actor, order, dto.approved ? 'WAITING_PART' : 'CANCELLED', 'Mijoz havola orqali qaror qildi');
      return { ok: true };
    });
  }
}
@Controller('telegram')
class TelegramController {
  constructor(private readonly db: Database) {}
  @Post('webhook') @Public() @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') provided: string | undefined, @Body() body: unknown) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException();
    if (!provided || Buffer.byteLength(provided) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) throw new ForbiddenException();
    const message = (body as { message?: { text?: unknown; chat?: { id?: unknown; type?: unknown }; from?: { id?: unknown } } })?.message;
    if (!message || typeof message.text !== 'string' || message.chat?.type !== 'private' ||
        typeof message.chat.id !== 'number' || message.chat.id !== message.from?.id) return { ok: true };
    const raw = /^\/start ([A-Za-z0-9_-]{43})$/.exec(message.text)?.[1];
    if (!raw) return { ok: true };
    await this.db.$transaction(async tx => {
      const link = await tx.customerLink.findUnique({ where: { tokenHash: hashLink(raw) } });
      if (!link || link.purpose !== 'TELEGRAM' || link.expiresAt <= new Date()) return;
      const used = await tx.customerLink.updateMany({ where: { id: link.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (!used.count) return;
      const order = await tx.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId } });
      if (!order) throw new NotFoundException();
      await tx.customer.update({ where: { organizationId_id: { organizationId: link.organizationId, id: order.customerId } }, data: { telegramChatId: String(message.chat!.id) } });
      await tx.auditLog.create({ data: { organizationId: link.organizationId, action: 'TELEGRAM_LINKED', entityId: order.customerId } });
    });
    return { ok: true };
  }
}
@Module({ controllers: [LinkController, TrackingController, TelegramController], providers: [LoginRateGuard] })
export class LinksModule {}
