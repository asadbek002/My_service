import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Post, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
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
      const orgs = await this.db.user.findMany({ where: { status: 'ACTIVE', telegramChatId: { not: null } }, distinct: ['organizationId'], select: { organizationId: true } });
      for (const { organizationId } of orgs) {
        if (await this.once('daily:' + organizationId)) await this.bot.notifyStaff(organizationId, await this.bot.dailyReport(organizationId, 'Kunlik hisobot'));
      }
    }
    if (hour === 9 && await this.once('platform')) await this.bot.notifyAdmins(await this.bot.platformSummary());
  }
}

@Module({
  controllers: [TelegramWebhookController, BotController, ReceiptPhotoController],
  providers: [TelegramClient, BotService, BotScheduler],
  exports: [TelegramClient, BotService],
})
export class BotModule {}
