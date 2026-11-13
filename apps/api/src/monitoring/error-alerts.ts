import { ArgumentsHost, Body, Catch, Controller, HttpCode, HttpException, Injectable, Logger, Module, OnModuleDestroy, Post, Req } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { HttpServer } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { Public } from '../auth/security';
import { BotModule } from '../bot/bot.module';
import { BotService } from '../bot/bot.service';
import { esc } from '../bot/telegram.client';
import { Metrics } from './metrics';

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/**
 * Errors reach the platform owner in Telegram: a crash in the API (5xx) or in a user's browser.
 * The same error is sent at most once an hour, so a broken page does not flood the chat.
 */
@Injectable()
export class ErrorAlerts implements OnModuleDestroy {
  private readonly logger = new Logger('ErrorAlerts');
  private readonly redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  constructor(private readonly bot: BotService) {}
  async onModuleDestroy() { await this.redis?.quit().catch(() => undefined); }

  async report(where: 'API' | 'Brauzer', key: string, text: string) {
    try {
      if (this.redis && await this.redis.set('err:once:' + sha(where + key), '1', 'EX', 3600, 'NX') !== 'OK') return;
      await this.bot.notifyAdmins(`⚠️ <b>Xato (${where})</b>\n${esc(text).slice(0, 1500)}`);
    } catch (e) { this.logger.warn('error alert not sent: ' + String(e)); }
  }
  /** At most 20 browser reports per IP in 10 minutes. */
  async allow(ip: string) {
    if (!this.redis) return true;
    const key = 'err:ip:' + sha(ip);
    const n = await this.redis.incr(key).catch(() => 0);
    if (n === 1) await this.redis.expire(key, 600).catch(() => undefined);
    return n <= 20;
  }
}

/** Every unhandled API error (5xx) is reported; the response stays Nest's default. */
@Catch()
export class ReportingFilter extends BaseExceptionFilter {
  constructor(adapter: HttpServer, private readonly alerts: ErrorAlerts) { super(adapter); }
  override catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request>();
      const message = exception instanceof Error ? exception.message : String(exception);
      // Ids in paths differ per call; the route shape is what identifies the bug.
      const route = `${req.method} ${req.path.replace(/\/[a-z0-9]{20,}/gi, '/:id')}`;
      const stack = exception instanceof Error ? (exception.stack ?? '').split('\n').slice(1, 4).map(l => l.trim()).join('\n') : '';
      void this.alerts.report('API', route + message, `${route} → ${status}\n${message}\n${stack}`);
    }
    super.catch(exception, host);
  }
}

class ClientErrorDto {
  @IsString() @MaxLength(500) message!: string;
  @IsOptional() @IsString() @MaxLength(2000) stack?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}

@Controller('public')
class ClientErrorController {
  constructor(private readonly alerts: ErrorAlerts) {}
  /** The web app reports an error a user hit (window.onerror, a crashed page). No personal data is sent. */
  @Post('client-error') @Public() @HttpCode(204)
  async clientError(@Body() d: ClientErrorDto, @Req() req: Request) {
    if (!await this.alerts.allow(req.ip ?? '')) return;
    const path = (() => { try { return new URL(d.url ?? '', 'https://x').pathname.replace(/\/[a-z0-9]{20,}/gi, '/:id'); } catch { return ''; } })();
    const ua = String(req.headers['user-agent'] ?? '').slice(0, 120);
    void this.alerts.report('Brauzer', path + d.message, `${path}\n${d.message}\n${(d.stack ?? '').split('\n').slice(0, 4).join('\n')}\n${ua}`);
  }
}

@Module({ imports: [BotModule], controllers: [ClientErrorController], providers: [ErrorAlerts, Metrics], exports: [ErrorAlerts, Metrics] })
export class MonitoringModule {}
