import { Body, Controller, HttpCode, Injectable, Module, OnModuleDestroy, Post, Req } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { Public } from '../auth/security';
import { tashkentDay } from '../bot/telegram.client';

/**
 * Visits to the public site (home, sign-up, install…), for the platform owner: page views, unique
 * visitors and where they came from, per day. No cookies and nothing personal is kept: a visitor is a
 * hash of IP + browser + day in a HyperLogLog (only a count comes out), a source is just a domain.
 */
const PAGES = new Set(['/', '/ru', '/signup', '/login', '/install', '/contact', '/terms', '/privacy']);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|axios|node-fetch/i;
const KEEP = 100 * 86400;

class VisitDto {
  @IsString() @MaxLength(200) path!: string;
  @IsOptional() @IsString() @MaxLength(500) ref?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
}

@Injectable()
export class Visits implements OnModuleDestroy {
  readonly redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  async onModuleDestroy() { await this.redis?.quit().catch(() => undefined); }

  async add(path: string, ref: string | undefined, source: string | undefined, ip: string, ua: string, ownHost: string) {
    if (!this.redis || !PAGES.has(path) || BOT.test(ua) || !ua) return;
    const day = tashkentDay();
    let from = (source ?? '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
    if (!from) { try { const h = new URL(ref ?? '').hostname.replace(/^www\./, ''); from = h && h !== ownHost ? h : 'direct'; } catch { from = 'direct'; } }
    const visitor = createHash('sha256').update(ip + '|' + ua + '|' + day).digest('hex').slice(0, 24);
    await this.redis.multi()
      .hincrby('vis:d:' + day, path, 1).expire('vis:d:' + day, KEEP)
      .pfadd('vis:u:' + day, visitor).expire('vis:u:' + day, KEEP)
      .hincrby('vis:r:' + day, from, 1).expire('vis:r:' + day, KEEP)
      .exec().catch(() => undefined);
  }

  /** The last `days` days: views and unique visitors per day, top pages and sources. */
  async stats(days = 30) {
    if (!this.redis) return null;
    const list = Array.from({ length: days }, (_, i) => tashkentDay(new Date(Date.now() - (days - 1 - i) * 86400000)));
    const pipe = this.redis.pipeline();
    for (const d of list) pipe.hgetall('vis:d:' + d).pfcount('vis:u:' + d).hgetall('vis:r:' + d);
    const res = (await pipe.exec().catch(() => null)) ?? [];
    const pages: Record<string, number> = {}, sources: Record<string, number> = {};
    const perDay = list.map((day, i) => {
      const views = (res[i * 3]?.[1] ?? {}) as Record<string, string>, refs = (res[i * 3 + 2]?.[1] ?? {}) as Record<string, string>;
      for (const [k, v] of Object.entries(views)) pages[k] = (pages[k] ?? 0) + Number(v);
      for (const [k, v] of Object.entries(refs)) sources[k] = (sources[k] ?? 0) + Number(v);
      return { day, views: Object.values(views).reduce((s, v) => s + Number(v), 0), visitors: Number(res[i * 3 + 1]?.[1] ?? 0) };
    });
    const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => ({ key, n }));
    const sum = (n: number, k: 'views' | 'visitors') => perDay.slice(-n).reduce((s, d) => s + d[k], 0);
    return { perDay, today: perDay.at(-1), week: { views: sum(7, 'views'), visitors: sum(7, 'visitors') }, month: { views: sum(days, 'views'), visitors: sum(days, 'visitors') }, pages: top(pages), sources: top(sources) };
  }
}

@Controller('public')
class VisitController {
  constructor(private readonly visits: Visits) {}
  @Post('visit') @Public() @HttpCode(204)
  async visit(@Body() d: VisitDto, @Req() req: Request) {
    const own = (() => { try { return new URL(process.env.WEB_URL ?? '').hostname.replace(/^www\./, ''); } catch { return ''; } })();
    await this.visits.add(d.path, d.ref, d.source, req.ip ?? '', String(req.headers['user-agent'] ?? ''), own);
  }
}

@Module({ controllers: [VisitController], providers: [Visits], exports: [Visits] })
export class VisitsModule {}
