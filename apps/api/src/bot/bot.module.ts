import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Patch, Post, Put, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, Length, MaxLength } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import Redis from 'ioredis';
import { Database } from '../database';
import { CurrentActor, Permissions, Public } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope } from '../orders/orders.module';
import { BotService, type Update } from './bot.service';
import { esc, som, tashkentDay, TelegramClient } from './telegram.client';

class ReceiptPhotoDto {
  // data:image/png;base64,... — about 1.4 MB of base64 at most.
  @ApiProperty() @IsString() @MaxLength(2_000_000) image!: string;
}

class AlertEventsDto {
  @ApiProperty() @IsBoolean() newOrder!: boolean;
  @ApiProperty() @IsBoolean() ready!: boolean;
  @ApiProperty() @IsBoolean() daily!: boolean;
}
class AlertUserDto { @ApiProperty() @IsBoolean() enabled!: boolean; }
class AlertChatDto { @ApiProperty() @IsString() @Length(1, 60) label!: string; }

@Controller('telegram')
class TelegramWebhookController {
  constructor(private readonly bot: BotService) {}
  @Post('webhook') @Public() @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') provided: string | undefined, @Body() body: unknown) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException();
    if (!provided || Buffer.byteLength(provided) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) throw new ForbiddenException();
    await this.bot.handle(body as Update);
    return { ok: true };
  }
}

@ApiTags('bot') @ApiBearerAuth()
@Controller('bot')
class BotController {
  constructor(private readonly db: Database, private readonly bot: BotService) {}
  /** Whether the bot is set up and whether the signed-in user's Telegram is connected. */
  @Get('me')
  async me(@CurrentActor() a: Actor) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: a.userId }, select: { telegramChatId: true } });
    return { configured: this.bot.telegram.enabled && !!this.bot.telegram.username, botUsername: this.bot.telegram.username, linked: !!user.telegramChatId };
  }
  @Post('link')
  async link(@CurrentActor() a: Actor) {
    const url = await this.bot.connectLink('USER', a.userId);
    if (!url) throw new ServiceUnavailableException('BOT_NOT_CONFIGURED');
    return { url };
  }
  @Delete('link') @HttpCode(200)
  async unlink(@CurrentActor() a: Actor) {
    await this.db.user.update({ where: { id: a.userId }, data: { telegramChatId: null } });
    return { ok: true };
  }

  // ---- Order alerts (Settings → "Buyurtma xabarlari") ----

  /** Which events go out and to whom: staff with Telegram (on/off each) and extra chats. */
  @Get('alerts') @Permissions('settings.manage')
  async alerts(@CurrentActor() a: Actor) {
    const [setting, users, chats] = await Promise.all([
      this.db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: a.organizationId, key: 'bot_alerts' } } }),
      this.db.user.findMany({ where: { organizationId: a.organizationId, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, telegramChatId: true, telegramAlerts: true }, orderBy: { createdAt: 'asc' } }),
      this.db.alertChat.findMany({ where: { organizationId: a.organizationId }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true, createdAt: true } }),
    ]);
    const v = (setting?.value ?? {}) as Record<string, unknown>;
    return {
      configured: this.bot.telegram.enabled && !!this.bot.telegram.username,
      events: { newOrder: v.newOrder !== false, ready: v.ready !== false, daily: v.daily !== false },
      users: users.map(u => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' '), linked: !!u.telegramChatId, enabled: u.telegramAlerts })),
      chats,
    };
  }
  @Put('alerts') @Permissions('settings.manage')
  async setAlerts(@CurrentActor() a: Actor, @Body() d: AlertEventsDto) {
    const value = { newOrder: d.newOrder, ready: d.ready, daily: d.daily };
    await this.db.organizationSetting.upsert({ where: { organizationId_key: { organizationId: a.organizationId, key: 'bot_alerts' } }, create: { organizationId: a.organizationId, key: 'bot_alerts', value }, update: { value } });
    await this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'SETTING_CHANGED', entityId: 'bot_alerts' } });
    return value;
  }
  @Patch('alerts/users/:id') @Permissions('settings.manage')
  async setUserAlerts(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: AlertUserDto) {
    const user = await this.db.user.findFirst({ where: { id, organizationId: a.organizationId } });
    if (!user) throw new NotFoundException();
    await this.db.user.update({ where: { id }, data: { telegramAlerts: d.enabled } });
    return { ok: true };
  }
  /** One-time link: whoever opens it starts receiving this service's order alerts. */
  @Post('alerts/chats') @Permissions('settings.manage')
  async addAlertChat(@CurrentActor() a: Actor, @Body() d: AlertChatDto) {
    const url = await this.bot.connectLink('ALERT', a.organizationId, d.label.trim());
    if (!url) throw new ServiceUnavailableException('BOT_NOT_CONFIGURED');
    return { url };
  }
  @Delete('alerts/chats/:id') @Permissions('settings.manage') @HttpCode(200)
  async removeAlertChat(@CurrentActor() a: Actor, @Param('id') id: string) {
    const removed = await this.db.alertChat.deleteMany({ where: { id, organizationId: a.organizationId } });
    if (!removed.count) throw new NotFoundException();
    return { ok: true };
  }
}

@ApiTags('bot') @ApiBearerAuth()
@Controller('orders')
class ReceiptPhotoController {
  constructor(private readonly db: Database, private readonly bot: BotService) {}
  /** Send the receipt, rendered by the browser as PNG, to the customer's Telegram (when the printer is down). */
  @Post(':id/receipt/telegram') @Permissions('orders.view')
  async send(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: ReceiptPhotoDto) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(a) }, include: { customer: true, organization: true } });
    if (!order) throw new NotFoundException();
    if (!this.bot.telegram.enabled) throw new ServiceUnavailableException('BOT_NOT_CONFIGURED');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(d.image);
    const png = match ? Buffer.from(match[1]!, 'base64') : null;
    if (!png || png.length < 60 || png.length > 1_500_000 || png.readUInt32BE(0) !== 0x89504e47) throw new BadRequestException('PNG image required');
    // The web app then offers the order's bot link (POST /orders/:id/links) so the customer can connect.
    if (!order.customer.telegramChatId) throw new ConflictException('CUSTOMER_NOT_ON_TELEGRAM');
    const result = await this.bot.telegram.sendPhoto(order.customer.telegramChatId, png, `🧾 <b>${esc(order.organization.name)}</b> · ${esc(order.number)}\nJami: ${som(order.total)}`);
    if (!result.ok) throw new ServiceUnavailableException(result.status === 403 ? 'CUSTOMER_BLOCKED_BOT' : 'TELEGRAM_FAILED');
    await this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'RECEIPT_SENT_TELEGRAM', entityId: id } });
    return { ok: true };
  }
}

/**
 * 20:00 Tashkent: daily report to each service's connected staff. 09:00: platform digest to admins.
 * A Redis key per day makes each report go out once, even with several API instances.
 */
@Injectable()
export class BotScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private redis?: Redis;
  private readonly logger = new Logger('BotScheduler');
  constructor(private readonly db: Database, private readonly bot: BotService) {}
  onModuleInit() {
    if (process.env.NOTIFICATIONS_ENABLED !== 'true' || !this.bot.telegram.enabled) return;
    this.redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    this.timer = setInterval(() => { void this.tick().catch(() => this.logger.error('Scheduled report failed')); }, 60_000);
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.redis?.quit().catch(() => undefined);
  }
  private hour() {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  }
  private async once(key: string) {
    return (await this.redis!.set('bot:' + key + ':' + tashkentDay(), '1', 'EX', 2 * 86400, 'NX')) === 'OK';
  }
  async tick() {
    const hour = this.hour();
    if (hour === 20) {
      const [withStaff, withChats] = await Promise.all([
        this.db.user.findMany({ where: { status: 'ACTIVE', telegramAlerts: true, telegramChatId: { not: null } }, distinct: ['organizationId'], select: { organizationId: true } }),
        this.db.alertChat.findMany({ distinct: ['organizationId'], select: { organizationId: true } }),
      ]);
      for (const organizationId of new Set([...withStaff, ...withChats].map(x => x.organizationId))) {
        if (await this.once('daily:' + organizationId)) await this.bot.notifyStaff(organizationId, await this.bot.dailyReport(organizationId, 'Kunlik hisobot'), undefined, 'daily');
      }
    }
    if (hour === 9 && await this.once('platform')) await this.bot.notifyAdmins(await this.bot.platformSummary());
  }
}

/**
 * Long polling when no webhook is registered: the bot answers as soon as the token is set,
 * without HTTPS or nginx routing. Registering a webhook (platform console) switches it off,
 * because Telegram refuses getUpdates while a webhook exists.
 */
@Injectable()
export class BotPoller implements OnModuleInit, OnModuleDestroy {
  private running = false;
  private offset = 0;
  private readonly logger = new Logger('BotPoller');
  constructor(private readonly bot: BotService) {}
  onModuleInit() {
    // Tests drive the webhook directly against a fake API; polling would race them.
    if (!this.bot.telegram.enabled || process.env.NODE_ENV === 'test' || process.env.TELEGRAM_POLLING === 'false') return;
    this.running = true;
    void this.loop();
  }
  onModuleDestroy() { this.running = false; }
  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
  private async loop() {
    let announced = '';
    while (this.running) {
      try {
        const info = await this.bot.telegram.call<{ url: string }>('getWebhookInfo', {});
        if (!info.ok) { await this.sleep(30_000); continue; }
        if (info.result?.url) {
          if (announced !== 'webhook') { this.logger.log('Webhook is set; polling paused'); announced = 'webhook'; }
          await this.sleep(60_000); continue;
        }
        if (announced !== 'polling') { this.logger.log('No webhook: polling Telegram for updates'); announced = 'polling'; }
        // Long poll: Telegram holds the request up to 25 s until a message arrives.
        for (let i = 0; i < 20 && this.running; i++) {
          const res = await this.bot.telegram.call<Update[]>('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message'] }, 35_000);
          if (!res.ok || !Array.isArray(res.result)) { await this.sleep(res.status === 409 ? 60_000 : 5_000); break; }
          for (const update of res.result) {
            this.offset = Math.max(this.offset, (update.update_id ?? 0) + 1);
            await this.bot.handle(update);
          }
        }
      } catch {
        this.logger.warn('Polling failed; retrying');
        await this.sleep(10_000);
      }
    }
  }
}

@Module({
  controllers: [TelegramWebhookController, BotController, ReceiptPhotoController],
  providers: [TelegramClient, BotService, BotScheduler, BotPoller],
  exports: [TelegramClient, BotService],
})
export class BotModule {}
