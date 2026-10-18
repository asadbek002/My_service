import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Database } from '../database';
import { BotModule } from '../bot/bot.module';
import { BotService } from '../bot/bot.service';
import { EskizClient } from '../notifications/eskiz.client';

type Check = { key: string; ok: boolean; detail: string };
const LABEL: Record<string, string> = {
  database: "Ma'lumotlar bazasi", redis: 'Redis', outbox: 'Xabarlar navbati', failed: 'Yuborilmagan xabarlar', sms: 'Platforma SMS balansi',
};

/**
 * Watches the platform every 5 minutes and tells the platform admins in Telegram when something
 * breaks and when it recovers: database, Redis, the notification queue, failed notifications,
 * the platform's Eskiz balance. Admin chats are remembered so a database outage is still reported.
 */
@Injectable()
export class Monitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Monitor');
  private timer?: ReturnType<typeof setInterval>;
  private state = new Map<string, boolean>();
  private chats: string[] = [];
  last: { at: string | null; checks: Check[] } = { at: null, checks: [] };
  constructor(private readonly db: Database, private readonly bot: BotService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.MONITOR_ENABLED === 'false') return;
    this.timer = setInterval(() => { void this.run().catch(e => this.logger.error('Monitor failed: ' + (e instanceof Error ? e.message : e))); }, 5 * 60_000);
    setTimeout(() => { void this.run().catch(() => undefined); }, 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async run() {
    const checks: Check[] = [];
    try {
      await this.db.$queryRaw`SELECT 1`;
      checks.push({ key: 'database', ok: true, detail: 'ishlayapti' });
      this.chats = (await this.db.platformAdmin.findMany({ where: { active: true, telegramChatId: { not: null } }, select: { telegramChatId: true } })).map(a => a.telegramChatId!);
    } catch { checks.push({ key: 'database', ok: false, detail: 'javob bermayapti' }); }
    const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 3000 });
    try { await redis.connect(); await redis.ping(); checks.push({ key: 'redis', ok: true, detail: 'ishlayapti' }); }
    catch { checks.push({ key: 'redis', ok: false, detail: 'javob bermayapti' }); } finally { redis.disconnect(); }
    if (checks[0]!.ok) {
      if (process.env.NOTIFICATIONS_ENABLED === 'true') {
        const stuck = await this.db.outboxEvent.count({ where: { publishedAt: null, createdAt: { lt: new Date(Date.now() - 10 * 60_000) } } });
        checks.push({ key: 'outbox', ok: stuck === 0, detail: stuck ? `${stuck} ta xabar 10 daqiqadan beri navbatda` : 'bo‘sh' });
      }
      const failed = await this.db.notification.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      checks.push({ key: 'failed', ok: failed < 10, detail: `oxirgi soatda ${failed} ta` });
    }
    // The platform's own Eskiz balance, at most once an hour.
    if (process.env.SMS_PROVIDER === 'eskiz' && process.env.SMS_API_KEY && new Date().getMinutes() < 5) {
      const min = Number(process.env.MONITOR_SMS_BALANCE_MIN ?? 20000);
      try { const { balance } = await new EskizClient().getUserLimit(); checks.push({ key: 'sms', ok: balance >= min, detail: `${Math.round(balance).toLocaleString('ru-RU')} so‘m` }); }
      catch { checks.push({ key: 'sms', ok: false, detail: 'Eskiz bilan aloqa yo‘q' }); }
    }
    for (const c of checks) {
      const before = this.state.get(c.key);
      this.state.set(c.key, c.ok);
      if (before === undefined ? !c.ok : before !== c.ok) {
        await this.alert(c.ok ? `✅ Tiklandi: <b>${LABEL[c.key]}</b> — ${c.detail}` : `🚨 <b>${LABEL[c.key]}</b>: ${c.detail}`);
      }
    }
    this.last = { at: new Date().toISOString(), checks };
    return this.last;
  }
  private async alert(text: string) {
    for (const chat of this.chats) await this.bot.telegram.send(chat, text).catch(() => undefined);
  }
}

@Module({ imports: [BotModule], providers: [Monitor], exports: [Monitor] })
export class MonitorModule {}
