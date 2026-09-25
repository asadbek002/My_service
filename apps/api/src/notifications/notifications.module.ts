import { Controller, Get, Post, Body, Injectable, Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { EskizClient } from './eskiz.client';
import { Queue, Worker } from 'bullmq';
import { Database } from '../database';
import { createLink } from './links.module';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope } from '../orders/orders.module';

class TestSmsDto {
  @IsString() @Matches(/^\+?[1-9][0-9]{7,14}$/) phone!: string;
  @IsOptional() @IsString() @Length(1, 500) message?: string;
}

function render(template:string,values:Record<string,string>){return template.replace(/{{([a-z_]+)}}/g,(_,key:string)=>values[key]??'');}
const labels: Record<string,string> = {
  ORDER_RECEIVED: 'Qurilmangiz qabul qilindi.',
  ORDER_WAITING_CUSTOMER_APPROVAL: 'Diagnostika yakunlandi. Narxni tasdiqlashingiz kerak.',
  ORDER_WAITING_PART: 'Buyurtmangiz uchun detal kutilmoqda.',
  REPAIR_STARTED: 'Qurilmangizni ta’mirlash boshlandi.',
  ORDER_READY: 'Qurilmangiz tayyor.',
  ORDER_DELIVERED: 'Qurilmangiz topshirildi.',
  WARRANTY_CREATED: 'Kafolat rasmiylashtirildi.',
};
// Status the order must still be in for the event to be worth sending (skip stale events after an outage).
const expectedStatusFor = (type: string) => type === 'REPAIR_STARTED' ? 'IN_REPAIR' : type === 'WARRANTY_CREATED' ? 'DELIVERED' : type.slice('ORDER_'.length);
@Injectable()
export class Notifications implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private dispatching = false;
  private readonly logger = new Logger('Notifications');
  constructor(private readonly db: Database, private readonly eskiz: EskizClient) {}
  async onModuleInit() {
    if (process.env.NOTIFICATIONS_ENABLED !== 'true') return;
    const url = new URL(process.env.REDIS_URL!);
    const connection = { host: url.hostname, port: Number(url.port || 6379), ...(url.password ? { password: decodeURIComponent(url.password) } : {}), ...(url.protocol === 'rediss:' ? { tls: {} } : {}) };
    this.queue = new Queue('notifications', { connection });
    this.worker = new Worker('notifications', async job => { await this.deliver(String(job.data.eventId)); }, { connection, concurrency: 2 });
    this.worker.on('error', () => this.logger.error('Notification worker connection failed'));
    this.timer = setInterval(() => { void this.dispatch().catch(() => this.logger.error('Outbox dispatch failed')); }, 3000);
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
  private async dispatch() {
    if (this.dispatching || !this.queue) return;
    this.dispatching = true;
    try {
      const events = await this.db.outboxEvent.findMany({ where: { publishedAt: null }, take: 50, orderBy: { createdAt: 'asc' } });
      for (const event of events) {
        if (labels[event.type]) await this.queue.add('send', { eventId: event.id }, { jobId: event.id, attempts: 5, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: { age: 604800 }, removeOnFail: { age: 2592000 } });
        await this.db.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
      }
    } finally { this.dispatching = false; }
  }
  private async deliver(eventId: string) {
    const event = await this.db.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    const notification = await this.db.notification.upsert({ where: { eventId }, create: { eventId, organizationId: event.organizationId, orderId: event.entityId, type: event.type }, update: {} });
    if (notification.status === 'SENT' || notification.status === 'SKIPPED') return;
    const order = await this.db.order.findFirst({ where: { id: event.entityId, organizationId: event.organizationId }, include: { customer: true, device: true, warranty: true, organization: { include: { subscription: { include: { plan: true } } } } } });
    if (!order) return;
    // Do not send a stale status after a worker outage.
    if (order.status !== expectedStatusFor(event.type)) {
      await this.db.notification.update({ where: { id: notification.id }, data: { status: 'SKIPPED', errorCode: 'STALE_EVENT' } }); return;
    }
    const flags = order.organization.subscription?.plan.features as Record<string, unknown> | undefined;
    const tracking = await createLink(this.db, order.organizationId, order.id, 'TRACK');
    const approval = order.status === 'WAITING_CUSTOMER_APPROVAL' ? await createLink(this.db, order.organizationId, order.id, 'APPROVAL', order.quoteVersion) : null;
    const link = process.env.WEB_URL + (approval ? '/approve/' + approval : '/track/' + tracking);
    const warrantyEnd = order.warranty ? order.warranty.endDate.toISOString().slice(0, 10) : '';
    const defaultText = 'MyService · ' + order.number + '\n' + labels[event.type] + '\n' + order.device.brand + ' ' + order.device.model + '\nJami: ' + order.total.toString() + ' so‘m' + (warrantyEnd ? '\nKafolat: ' + warrantyEnd + ' gacha' : '') + '\n' + link;
    const payments = await this.db.payment.findMany({ where: { organizationId: order.organizationId, orderId: order.id }, select: { kind: true, amount: true } });
    const paid = payments.reduce((sum, p) => p.kind === 'REFUND' ? sum.minus(p.amount) : sum.plus(p.amount), order.total.minus(order.total));
    const variables = { customer_name: order.customer.firstName, order_number: order.number, device: order.device.brand+' '+order.device.model, repair: order.requiredWork??'', price: order.total.toString(), paid: paid.toString(), balance: order.total.minus(paid).toString(), status: order.status, warranty_end: warrantyEnd, link };
    const templates = await this.db.notificationTemplate.findMany({ where: { organizationId: order.organizationId, type: event.type, active: true } });
    const message = (channel:string) => { const template=templates.find(t=>t.channel===channel); return template?render(template.body,variables):defaultText; };
    let channel = 'SMS';
    try {
      if (order.customer.telegramChatId && process.env.TELEGRAM_BOT_TOKEN && flags?.telegram) {
        const telegramBase = process.env.NODE_ENV === 'test' && process.env.TELEGRAM_API_URL ? new URL(process.env.TELEGRAM_API_URL) : new URL('https://api.telegram.org/');
        const telegramUrl = new URL('bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage', telegramBase);
        const response = await fetch(telegramUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ chat_id: order.customer.telegramChatId, text: message('TELEGRAM'), ...(approval ? { reply_markup: { inline_keyboard: [[{ text: 'Narxni ko‘rish va tasdiqlash', url: link }]] } } : {}) }),
        });
        const result = await response.json() as { ok?: boolean; error_code?: number; result?: { message_id?: number } };
        if (response.ok && result.ok) {
          channel = 'TELEGRAM';
          await this.db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', channel, providerId: String(result.result?.message_id ?? ''), sentAt: new Date(), errorCode: null } }); return;
        }
        // Retry transient Telegram failures. Permanent rejection falls through to SMS.
        if (response.status >= 500 || response.status === 429) throw new Error('TELEGRAM_RETRY');
      }
      if (!flags?.sms || !process.env.SMS_PROVIDER || !process.env.SMS_API_KEY) throw new Error('SMS_NOT_CONFIGURED');
      let smsProviderId = '';
      if (process.env.SMS_PROVIDER === 'eskiz') {
        // EskizClient: token cache + refresh + send
        const result = await this.eskiz.send(order.customer.phone, message('SMS'));
        smsProviderId = result.id;
      } else {
        // Generic webhook provider
        const apiUrl = process.env.SMS_API_URL;
        if (!apiUrl) throw new Error('SMS_NOT_CONFIGURED');
        const endpoint = new URL(apiUrl);
        if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && ['127.0.0.1','localhost'].includes(endpoint.hostname))) throw new Error('SMS_HTTPS_REQUIRED');
        const sms = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.SMS_API_KEY, 'Idempotency-Key': event.id }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ to: order.customer.phone, message: message('SMS'), reference: event.id }) });
        if (!sms.ok) throw new Error('SMS_PROVIDER_REJECTED');
        const smsResult = await sms.json() as { id?: string };
        smsProviderId = String(smsResult.id ?? '');
      }
      await this.db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', channel, providerId: smsProviderId, sentAt: new Date(), errorCode: null } });
    } catch (error) {
      const code = error instanceof Error && ['TELEGRAM_RETRY','SMS_NOT_CONFIGURED','SMS_HTTPS_REQUIRED','SMS_PROVIDER_REJECTED'].includes(error.message) ? error.message : 'PROVIDER_UNAVAILABLE';
      await this.db.notification.update({ where: { id: notification.id }, data: { status: 'FAILED', channel, errorCode: code } });
      throw new Error(code); // Never log provider URLs containing credentials.
    }
  }
}
@ApiTags('notifications') @ApiBearerAuth()
@Controller('notifications')
class NotificationsController {
  constructor(private readonly db: Database, private readonly eskiz: EskizClient) {}
  @Get() @Permissions('orders.view')
  async list(@CurrentActor() actor: Actor) {
    const orders = await this.db.order.findMany({ where: orderScope(actor), select: { id: true } });
    return this.db.notification.findMany({ where: { organizationId: actor.organizationId, orderId: { in: orders.map(order => order.id) } }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Get('eskiz-status') @Permissions('settings.manage')
  async eskizStatus() {
    const configured = !!process.env.SMS_API_KEY && !!process.env.SMS_API_SECRET;
    // Missing credentials or an unreachable provider is a status to show, not a server error.
    let limits = { balance: 0, smsCount: 0 }, error: string | null = null;
    if (configured) {
      try { limits = await this.eskiz.getUserLimit(); } catch (e) { error = e instanceof Error ? e.message : 'ESKIZ_UNAVAILABLE'; }
    }
    return {
      provider: process.env.SMS_PROVIDER || 'eskiz',
      sender: process.env.SMS_FROM || '4546',
      testMode: process.env.ESKIZ_TEST_MODE === 'true',
      balance: limits.balance,
      smsCount: limits.smsCount,
      configured,
      error,
    };
  }

  @Post('test-sms') @Permissions('settings.manage')
  async testSms(@Body() dto: TestSmsDto) {
    const message = dto.message?.trim() || (process.env.ESKIZ_TEST_MODE === 'true' ? 'Bu Eskiz dan test' : 'MyService: SMS xizmati muvaffaqiyatli ulandi!');
    const result = await this.eskiz.send(dto.phone, message);
    return { ok: true, result, message };
  }
}
@Module({ controllers: [NotificationsController], providers: [Notifications, EskizClient], exports: [EskizClient] })
export class NotificationsModule {}
