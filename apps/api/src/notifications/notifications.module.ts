import { BadRequestException, Controller, Get, Post, Put, Body, HttpCode, HttpException, Injectable, Module, OnModuleInit, OnModuleDestroy, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { BotService } from '../bot/bot.service';
import { OwnBots } from '../bot/own-bot';
import { esc, fmtDate, som as fmtSom, TelegramClient } from '../bot/telegram.client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { EskizClient } from './eskiz.client';
import { platformSmsConfigured, SmsAccounts } from './sms-accounts';
import { Queue, Worker } from 'bullmq';
import { Database } from '../database';
import { createLink } from './links.module';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope } from '../orders/orders.module';

class SmsSettingsDto {
  @IsIn(['platform', 'own']) mode!: 'platform' | 'own';
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(1, 200) password?: string;
  /** Eskiz sender name (nickname) approved for the account; 4546 is Eskiz's default. */
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9 ._-]{1,11}$/) from?: string;
}

function render(template:string,values:Record<string,string>){return template.replace(/{{([a-z_]+)}}/g,(_,key:string)=>values[key]??'');}
// Customer messages. "Ready" goes by Telegram, else SMS; the others are Telegram-only (SMS costs money).
const labels: Record<string,string> = {
  ORDER_RECEIVED: 'Qurilmangiz qabul qilindi.',
  ORDER_READY: 'Qurilmangiz tayyor, olib ketishingiz mumkin.',
  ORDER_DELIVERED: 'Qurilma sizga topshirildi. Rahmat!',
};
const TELEGRAM_ONLY = ['ORDER_RECEIVED', 'ORDER_DELIVERED'];
// Events the service's own staff hear about in the bot.
const STAFF_ALERTS = ['ORDER_RECEIVED', 'ORDER_READY'];
// Statuses in which the event is still worth sending (skip stale events after an outage).
const stillValid = (type: string, status: string) => type === 'ORDER_RECEIVED' ? ['RECEIVED', 'IN_REPAIR', 'READY'].includes(status) : status === type.slice('ORDER_'.length);
@Injectable()
export class Notifications implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private dispatching = false;
  private readonly logger = new Logger('Notifications');
  constructor(private readonly db: Database, private readonly eskiz: EskizClient, private readonly sms: SmsAccounts, @Optional() private readonly bot?: BotService, @Optional() private readonly own?: OwnBots) {}
  async onModuleInit() {
    if (process.env.NOTIFICATIONS_ENABLED !== 'true') return;
    const url = new URL(process.env.REDIS_URL!);
    const connection = { host: url.hostname, port: Number(url.port || 6379), ...(url.password ? { password: decodeURIComponent(url.password) } : {}), ...(url.protocol === 'rediss:' ? { tls: {} } : {}) };
    this.queue = new Queue('notifications', { connection });
    this.worker = new Worker('notifications', async job => { if (job.data.kind === 'staff') await this.deliverStaff(String(job.data.eventId)); else await this.deliver(String(job.data.eventId)); }, { connection, concurrency: 2 });
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
        const retention = { removeOnComplete: { age: 604800 }, removeOnFail: { age: 2592000 } };
        if (labels[event.type]) await this.queue.add('send', { eventId: event.id }, { jobId: event.id, attempts: 5, backoff: { type: 'exponential', delay: 10000 }, ...retention });
        if (STAFF_ALERTS.includes(event.type) && this.bot?.telegram.enabled) await this.queue.add('staff', { eventId: event.id, kind: 'staff' }, { jobId: event.id + '-staff', attempts: 2, backoff: { type: 'fixed', delay: 30000 }, ...retention });
        await this.db.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
      }
    } finally { this.dispatching = false; }
  }
  /** Alert the service's connected staff about a new or ready order. Best effort, at most once per event. */
  async deliverStaff(eventId: string) {
    if (!this.bot) return;
    const event = await this.db.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    const order = await this.db.order.findFirst({ where: { id: event.entityId, organizationId: event.organizationId }, include: { customer: true, device: true } });
    if (!order) return;
    const actorId = typeof (event.payload as Record<string, unknown> | null)?.actorId === 'string' ? String((event.payload as Record<string, unknown>).actorId) : undefined;
    const actor = actorId ? await this.db.user.findFirst({ where: { id: actorId, organizationId: event.organizationId }, select: { firstName: true } }) : null;
    const web = process.env.WEB_URL ? '\n' + process.env.WEB_URL + '/orders/' + order.id : '';
    const text = event.type === 'ORDER_RECEIVED'
      ? `📥 <b>Yangi qabul</b> ${esc(order.number)}\n${esc(order.device.brand + ' ' + order.device.model)} · ${esc(order.customer.firstName)}\n${esc(order.complaint)}\nNarx: ${fmtSom(order.total)}${actor ? '\nQabul qildi: ' + esc(actor.firstName) : ''}${web}`
      : `✅ <b>Tayyor</b> ${esc(order.number)}\n${esc(order.device.brand + ' ' + order.device.model)}\n${esc(order.customer.firstName)} ${esc(order.customer.phone)}${actor ? '\nUsta: ' + esc(actor.firstName) : ''}${web}`;
    await this.bot.notifyStaff(event.organizationId, text, actorId, event.type === 'ORDER_RECEIVED' ? 'newOrder' : 'ready');
  }
  /** Send through the platform's provider (Eskiz, or a generic HTTPS webhook). Returns the provider id. */
  async platformSms(phone: string, text: string, reference: string) {
    if (process.env.SMS_PROVIDER === 'eskiz') return (await this.eskiz.send(phone, text)).id;
    const apiUrl = process.env.SMS_API_URL;
    if (!apiUrl) throw new Error('SMS_NOT_CONFIGURED');
    const endpoint = new URL(apiUrl);
    if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && ['127.0.0.1','localhost'].includes(endpoint.hostname))) throw new Error('SMS_HTTPS_REQUIRED');
    const sms = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.SMS_API_KEY, 'Idempotency-Key': reference }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ to: phone, message: text, reference }) });
    if (!sms.ok) throw new Error('SMS_PROVIDER_REJECTED');
    return String(((await sms.json()) as { id?: string }).id ?? '');
  }
  async deliver(eventId: string) {
    const event = await this.db.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    const notification = await this.db.notification.upsert({ where: { eventId }, create: { eventId, organizationId: event.organizationId, orderId: event.entityId, type: event.type }, update: {} });
    if (notification.status === 'SENT' || notification.status === 'SKIPPED') return;
    const order = await this.db.order.findFirst({ where: { id: event.entityId, organizationId: event.organizationId }, include: { customer: true, device: true, warranty: true, organization: { include: { subscription: { include: { plan: true } } } } } });
    if (!order) return;
    // Do not send a stale status after a worker outage.
    if (!stillValid(event.type, order.status)) {
      await this.db.notification.update({ where: { id: notification.id }, data: { status: 'SKIPPED', errorCode: 'STALE_EVENT' } }); return;
    }
    const flags = order.organization.subscription?.plan.features as Record<string, unknown> | undefined;
    const link = process.env.WEB_URL + '/track/' + await createLink(this.db, order.organizationId, order.id, 'TRACK');
    const warrantyEnd = order.warranty ? order.warranty.endDate.toISOString().slice(0, 10) : '';
    const payments = await this.db.payment.findMany({ where: { organizationId: order.organizationId, orderId: order.id }, select: { kind: true, amount: true } });
    const paid = payments.reduce((sum, p) => p.kind === 'REFUND' ? sum.minus(p.amount) : sum.plus(p.amount), order.total.minus(order.total));
    const due = order.total.minus(paid);
    const sum = (v: { toString(): string }) => Number(v.toString()).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + ' so‘m';
    // The service's own name: each organization sends messages under its brand.
    const defaultText = order.organization.name + ' · ' + order.number + '\n' + labels[event.type] + '\n' + order.device.brand + ' ' + order.device.model
      + (event.type === 'ORDER_RECEIVED' ? '\nNosozlik: ' + order.complaint + '\nNarx: ' + sum(order.total) : '')
      + (event.type === 'ORDER_DELIVERED' && order.warranty ? '\nKafolat: ' + fmtDate(order.warranty.endDate) + ' gacha' : '')
      + (event.type !== 'ORDER_RECEIVED' && due.greaterThan(0) ? '\nTo‘lov: ' + sum(due) : '') + '\n' + link;
    const variables = { customer_name: order.customer.firstName, order_number: order.number, device: order.device.brand+' '+order.device.model, repair: order.complaint, price: order.total.toString(), paid: paid.toString(), balance: order.total.minus(paid).toString(), status: order.status, warranty_end: warrantyEnd, link };
    const templates = await this.db.notificationTemplate.findMany({ where: { organizationId: order.organizationId, type: event.type, active: true } });
    const message = (channel:string) => { const template=templates.find(t=>t.channel===channel); return template?render(template.body,variables):defaultText; };
    let channel = 'SMS';
    try {
      // Same client as the bot: token clean-up, TELEGRAM_API_BASE and error reasons apply here too.
      // A customer connected through the service's own bot hears from that bot.
      const telegram = order.customer.telegramBot === 'own' ? await this.own?.client(order.organizationId) ?? null : this.bot?.telegram ?? new TelegramClient();
      if (order.customer.telegramChatId && telegram?.enabled && flags?.telegram) {
        const result = await telegram.call<{ message_id?: number }>('sendMessage', { chat_id: order.customer.telegramChatId, text: message('TELEGRAM') }, 10000);
        if (result.ok) {
          channel = 'TELEGRAM';
          await this.db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', channel, providerId: String(result.result?.message_id ?? ''), sentAt: new Date(), errorCode: null } }); return;
        }
        // Retry transient Telegram failures (unreachable, 5xx, rate limit). Permanent rejection falls through to SMS.
        if (result.status === 0 || result.status >= 500 || result.status === 429) throw new Error('TELEGRAM_RETRY');
      }
      if (TELEGRAM_ONLY.includes(event.type)) {
        // Courtesy messages are never worth an SMS.
        await this.db.notification.update({ where: { id: notification.id }, data: { status: 'SKIPPED', errorCode: order.customer.telegramChatId ? 'TELEGRAM_REJECTED' : 'NO_TELEGRAM' } }); return;
      }
      // The service's own Eskiz account (its balance, no limit), else the platform's (plan allowance, then extra).
      const ownSms = await this.sms.own(order.organizationId);
      let smsProviderId = '';
      if (ownSms) {
        smsProviderId = (await ownSms.send(order.customer.phone, message('SMS'))).id;
      } else {
        if (!flags?.sms || !platformSmsConfigured()) throw new Error('SMS_NOT_CONFIGURED');
        smsProviderId = await this.platformSms(order.customer.phone, message('SMS'), event.id);
        await this.sms.count(order.organizationId, order.organization.subscription?.plan.smsPerMonth ?? null);
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
  constructor(private readonly db: Database, private readonly sms: SmsAccounts, private readonly notifications: Notifications) {}
  @Get() @Permissions('orders.view')
  async list(@CurrentActor() actor: Actor) {
    const orders = await this.db.order.findMany({ where: orderScope(actor), select: { id: true } });
    return this.db.notification.findMany({ where: { organizationId: actor.organizationId, orderId: { in: orders.map(order => order.id) } }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  /** How this service sends SMS, this month's platform SMS against the plan, and the own account's balance. */
  @Get('sms') @Permissions('settings.manage')
  async smsSettings(@CurrentActor() a: Actor) {
    const [setting, usage, sub] = await Promise.all([
      this.sms.setting(a.organizationId), this.sms.usage(a.organizationId),
      this.db.subscription.findUnique({ where: { organizationId: a.organizationId }, include: { plan: true } }),
    ]);
    let balance: number | null = null, error: string | null = null;
    if (setting.mode === 'own') {
      try { balance = (await (await this.sms.own(a.organizationId))!.getUserLimit()).balance; }
      catch (e) { error = e instanceof Error ? e.message : 'ESKIZ_UNAVAILABLE'; }
    }
    const features = sub?.plan.features as Record<string, unknown> | undefined;
    return {
      mode: setting.mode, email: setting.email ?? null, from: setting.from ?? null, balance, error,
      platform: { available: platformSmsConfigured() && !!features?.sms, limit: sub?.plan.smsPerMonth ?? null, sent: usage.sent, extra: usage.extra, testMode: process.env.ESKIZ_TEST_MODE === 'true' },
    };
  }
  @Put('sms') @Permissions('settings.manage')
  async saveSms(@CurrentActor() a: Actor, @Body() d: SmsSettingsDto) {
    const saved = await this.sms.save(a.organizationId, d);
    await this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'SETTING_CHANGED', entityId: 'sms', newValue: { mode: saved.mode } } });
    return saved;
  }
  /** A test SMS to the signed-in person's own phone (never to an arbitrary number), through the chosen route. */
  @Post('sms/test') @Permissions('settings.manage') @HttpCode(200)
  async testSms(@CurrentActor() a: Actor) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: a.userId }, select: { phone: true } });
    const today = await this.db.auditLog.count({ where: { organizationId: a.organizationId, action: 'SMS_TEST', createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (today >= 5) throw new HttpException('TOO_MANY_TESTS', 429);
    const own = await this.sms.own(a.organizationId);
    const text = 'MyService: SMS sozlamasi ishlayapti.';
    try {
      if (own) await own.send(user.phone, text);
      else {
        const sub = await this.db.subscription.findUnique({ where: { organizationId: a.organizationId }, include: { plan: true } });
        if (!platformSmsConfigured() || !(sub?.plan.features as Record<string, unknown> | undefined)?.sms) throw new BadRequestException('SMS_NOT_CONFIGURED');
        await this.notifications.platformSms(user.phone, process.env.ESKIZ_TEST_MODE === 'true' ? 'Bu Eskiz dan test' : text, 'test-' + a.userId + '-' + Date.now());
        await this.sms.count(a.organizationId, sub?.plan.smsPerMonth ?? null);
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException(e instanceof Error && e.message.startsWith('ESKIZ') ? e.message : 'SMS_FAILED');
    }
    await this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'SMS_TEST', entityId: user.phone } });
    return { ok: true, phone: user.phone };
  }
}
@Module({ imports: [BotModule], controllers: [NotificationsController], providers: [Notifications, EskizClient, SmsAccounts], exports: [EskizClient, SmsAccounts] })
export class NotificationsModule {}
