import { Body, Controller, HttpCode, Injectable, OnModuleDestroy, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { Public } from '../auth/security';
import os from 'node:os';
import Redis from 'ioredis';
import type { Database } from '../database';
import { countryOf } from './country';

const HOUR_KEEP = 8 * 86400, DAY_KEEP = 100 * 86400;
// Hours and days in Tashkent time, as the rest of the product counts them.
const tashkent = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).toISOString();
const hourOf = (d?: Date) => tashkent(d).slice(0, 13);   // 2026-11-13T14
const dayOf = (d?: Date) => tashkent(d).slice(0, 10);
const BUCKETS = [['b50', 50], ['b200', 200], ['b1000', 1000], ['bmax', Infinity]] as const;
// What users feel (measured in their browser, network included): page loads and API round trips.
const PAGE_BUCKETS = [['b1000', 1000], ['b3000', 3000], ['bmax', Infinity]] as const;
const RUM_DAYS = 7;

class PageTiming {
  /** Time to the first byte of the page (network + server). */
  @IsInt() @Min(0) @Max(60_000) ttfb!: number;
  /** Until the page finished loading. */
  @IsInt() @Min(0) @Max(120_000) load!: number;
}
class ApiTimings {
  @IsInt() @Min(1) @Max(500) n!: number;
  /** Sum of the round trips, in ms. */
  @IsInt() @Min(0) @Max(30_000_000) ms!: number;
  @IsInt() @Min(0) @Max(500) b300!: number;
  @IsInt() @Min(0) @Max(500) b1000!: number;
}
export class ClientPerfDto {
  @IsOptional() @ValidateNested() @Type(() => PageTiming) page?: PageTiming;
  @IsOptional() @ValidateNested() @Type(() => ApiTimings) api?: ApiTimings;
}

/**
 * How the API is doing, for the platform owner: requests per hour, how fast they were answered, errors,
 * the slowest routes; and how many people and services used the app each day. Kept in Redis as hourly
 * counters (8 days) and daily HyperLogLogs of user and service ids (100 days); no request content.
 */
@Injectable()
export class Metrics implements OnModuleDestroy {
  private readonly redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  async onModuleDestroy() { await this.redis?.quit().catch(() => undefined); }

  /** One answered request: its route pattern (not the URL), status and time; who, when signed in. */
  record(route: string, status: number, ms: number, actor?: { userId?: string; organizationId?: string }, ip?: string) {
    if (!this.redis) return;
    const h = hourOf(), d = dayOf();
    const bucket = BUCKETS.find(([, max]) => ms < max)![0];
    const m = this.redis.multi()
      .hincrby('perf:h:' + h, 'n', 1).hincrby('perf:h:' + h, 'ms', Math.round(ms)).hincrby('perf:h:' + h, bucket, 1)
      .hincrby('perf:rn:' + h, route, 1).hincrby('perf:rt:' + h, route, Math.round(ms))
      .expire('perf:h:' + h, HOUR_KEEP).expire('perf:rn:' + h, HOUR_KEEP).expire('perf:rt:' + h, HOUR_KEEP);
    if (status >= 500) m.hincrby('perf:h:' + h, 'err', 1);
    if (actor?.userId && actor.organizationId) {
      m.pfadd('act:u:' + d, actor.userId).pfadd('act:o:' + d, actor.organizationId).expire('act:u:' + d, DAY_KEEP).expire('act:o:' + d, DAY_KEEP);
      // Where the app is used from: users per country per day (the countries seen that day are listed in a set).
      const cc = countryOf(ip) ?? 'XX';
      m.sadd('act:cs:' + d, cc).expire('act:cs:' + d, DAY_KEEP).pfadd(`act:uc:${d}:${cc}`, actor.userId).expire(`act:uc:${d}:${cc}`, DAY_KEEP);
    }
    void m.exec().catch(() => undefined);
  }

  /**
   * Timings from a user's browser, per country and day (no ids, no addresses kept). At most 30
   * reports a minute from one address, so a script cannot skew the numbers much.
   */
  async recordClient(d: ClientPerfDto, ip: string | undefined) {
    if (!this.redis || (!d.page && !d.api)) return;
    const minute = 'rum:rl:' + createHash('sha256').update(String(ip)).digest('hex').slice(0, 16) + ':' + Math.floor(Date.now() / 60_000);
    const count = await this.redis.multi().incr(minute).expire(minute, 120).exec().then(r => Number(r?.[0]?.[1] ?? 0), () => 99);
    if (count > 30) return;
    const day = dayOf(), cc = countryOf(ip) ?? 'XX';
    const m = this.redis.multi().sadd('rum:cs:' + day, cc).expire('rum:cs:' + day, DAY_KEEP);
    if (d.page) {
      const k = `rum:p:${day}:${cc}`, bucket = PAGE_BUCKETS.find(([, max]) => d.page!.load < max)![0];
      m.hincrby(k, 'n', 1).hincrby(k, 'ms', d.page.load).hincrby(k, 'ttfb', d.page.ttfb).hincrby(k, bucket, 1).expire(k, DAY_KEEP);
    }
    if (d.api) {
      const k = `rum:a:${day}:${cc}`, b300 = Math.min(d.api.b300, d.api.n), b1000 = Math.min(Math.max(d.api.b1000, b300), d.api.n);
      m.hincrby(k, 'n', d.api.n).hincrby(k, 'ms', d.api.ms).hincrby(k, 'b300', b300).hincrby(k, 'b1000', b1000).expire(k, DAY_KEEP);
    }
    await m.exec().catch(() => undefined);
  }

  /** The last 7 days of browser timings: all together and per country (most measured first). */
  private async clientSummary() {
    if (!this.redis) return null;
    const days = Array.from({ length: RUM_DAYS }, (_, i) => dayOf(new Date(Date.now() - (RUM_DAYS - 1 - i) * 86400_000)));
    const cp = this.redis.pipeline();
    for (const d of days) cp.smembers('rum:cs:' + d);
    const codes = [...new Set(((await cp.exec().catch(() => null)) ?? []).flatMap(r => (r?.[1] ?? []) as string[]))];
    const hp = this.redis.pipeline();
    for (const c of codes) for (const d of days) hp.hgetall(`rum:p:${d}:${c}`).hgetall(`rum:a:${d}:${c}`);
    const res = (await hp.exec().catch(() => null)) ?? [];
    type Sum = { pn: number; pms: number; ttfb: number; p1: number; p3: number; an: number; ams: number; a300: number; a1000: number };
    const zero = (): Sum => ({ pn: 0, pms: 0, ttfb: 0, p1: 0, p3: 0, an: 0, ams: 0, a300: 0, a1000: 0 });
    const total = zero();
    const per = codes.map((key, ci) => {
      const s = zero();
      days.forEach((_, di) => {
        const p = (res[(ci * days.length + di) * 2]?.[1] ?? {}) as Record<string, string>, a = (res[(ci * days.length + di) * 2 + 1]?.[1] ?? {}) as Record<string, string>;
        s.pn += Number(p.n ?? 0); s.pms += Number(p.ms ?? 0); s.ttfb += Number(p.ttfb ?? 0); s.p1 += Number(p.b1000 ?? 0); s.p3 += Number(p.b1000 ?? 0) + Number(p.b3000 ?? 0);
        s.an += Number(a.n ?? 0); s.ams += Number(a.ms ?? 0); s.a300 += Number(a.b300 ?? 0); s.a1000 += Number(a.b1000 ?? 0);
      });
      for (const k of Object.keys(total) as (keyof Sum)[]) total[k] += s[k];
      return { key, s };
    });
    const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0);
    const shape = (s: Sum) => ({
      pages: { n: s.pn, avgMs: s.pn ? Math.round(s.pms / s.pn) : 0, ttfbMs: s.pn ? Math.round(s.ttfb / s.pn) : 0, under1s: pct(s.p1, s.pn), under3s: pct(s.p3, s.pn) },
      api: { n: s.an, avgMs: s.an ? Math.round(s.ams / s.an) : 0, under300: pct(s.a300, s.an), under1000: pct(s.a1000, s.an) },
    });
    return {
      days: RUM_DAYS, ...shape(total),
      countries: per.filter(c => c.s.pn + c.s.an > 0).sort((a, b) => (b.s.pn + b.s.an) - (a.s.pn + a.s.an)).slice(0, 10).map(c => ({ key: c.key, ...shape(c.s) })),
    };
  }

  async summary(db: Database, hours = 24) {
    if (!this.redis) return null;
    const now = Date.now();
    const hourList = Array.from({ length: hours }, (_, i) => hourOf(new Date(now - (hours - 1 - i) * 3600_000)));
    const pipe = this.redis.pipeline();
    for (const h of hourList) pipe.hgetall('perf:h:' + h).hgetall('perf:rn:' + h).hgetall('perf:rt:' + h);
    const res = (await pipe.exec().catch(() => null)) ?? [];
    const routes: Record<string, { n: number; ms: number }> = {};
    const total = { n: 0, ms: 0, err: 0, b50: 0, b200: 0, b1000: 0, bmax: 0 };
    const perHour = hourList.map((hour, i) => {
      const h = (res[i * 3]?.[1] ?? {}) as Record<string, string>;
      const rn = (res[i * 3 + 1]?.[1] ?? {}) as Record<string, string>, rt = (res[i * 3 + 2]?.[1] ?? {}) as Record<string, string>;
      for (const [k, v] of Object.entries(rn)) { const r = routes[k] ??= { n: 0, ms: 0 }; r.n += Number(v); r.ms += Number(rt[k] ?? 0); }
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += Number(h[k] ?? 0);
      const n = Number(h.n ?? 0);
      return { hour: hour.slice(11) + ':00', n, err: Number(h.err ?? 0), avg: n ? Math.round(Number(h.ms ?? 0) / n) : 0 };
    });
    const share = (k: 'b50' | 'b200' | 'b1000' | 'bmax') => total.n ? Math.round(total[k] / total.n * 1000) / 10 : 0;
    const routeList = Object.entries(routes).map(([route, r]) => ({ route, n: r.n, avg: Math.round(r.ms / r.n) }));

    // Active users and services: today, the last 7 and 30 days (PFCOUNT of several days is their union), per day for 30 days.
    const days = Array.from({ length: 30 }, (_, i) => dayOf(new Date(now - (29 - i) * 86400_000)));
    const ap = this.redis.pipeline();
    for (const d of days) ap.pfcount('act:u:' + d).pfcount('act:o:' + d);
    ap.pfcount(...days.slice(-7).map(d => 'act:u:' + d)).pfcount(...days.slice(-7).map(d => 'act:o:' + d));
    ap.pfcount(...days.map(d => 'act:u:' + d)).pfcount(...days.map(d => 'act:o:' + d));
    const ar = (await ap.exec().catch(() => null)) ?? [];
    const num = (i: number) => Number(ar[i]?.[1] ?? 0);
    const activePerDay = days.map((day, i) => ({ day, users: num(i * 2), services: num(i * 2 + 1) }));
    const base = days.length * 2;

    // Users per country over the 30 days (a union per country across the days).
    const seen = new Set<string>();
    const cp = this.redis.pipeline();
    for (const d of days) cp.smembers('act:cs:' + d);
    for (const r of (await cp.exec().catch(() => null)) ?? []) for (const c of (r?.[1] ?? []) as string[]) seen.add(c);
    const cq = this.redis.pipeline();
    const codes = [...seen];
    for (const c of codes) cq.pfcount(...days.map(d => `act:uc:${d}:${c}`));
    const cr = (await cq.exec().catch(() => null)) ?? [];
    const countries = codes.map((key, i) => ({ key, n: Number(cr[i]?.[1] ?? 0) })).filter(c => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 15);

    const size = (await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`)[0]?.size ?? 0n;
    const mem = process.memoryUsage();
    return {
      hours: perHour,
      total: { requests: total.n, errors: total.err, errorRate: total.n ? Math.round(total.err / total.n * 1000) / 10 : 0, avgMs: total.n ? Math.round(total.ms / total.n) : 0,
        perMinute: Math.round(total.n / (hours * 60) * 10) / 10, under50: share('b50'), under200: share('b50') + share('b200'), under1000: share('b50') + share('b200') + share('b1000'), over1000: share('bmax') },
      // Telegram's calls to our webhooks wait for the bot's replies to reach Telegram: nobody waits on them.
      slowest: routeList.filter(r => r.n >= 3 && !r.route.includes('/telegram/')).sort((a, b) => b.avg - a.avg).slice(0, 8),
      busiest: [...routeList].sort((a, b) => b.n - a.n).slice(0, 8),
      client: await this.clientSummary(),
      active: { countries, today: activePerDay.at(-1), week: { users: num(base), services: num(base + 1) }, month: { users: num(base + 2), services: num(base + 3) }, perDay: activePerDay },
      server: {
        cpus: os.cpus().length, load: os.loadavg().map(l => Math.round(l * 100) / 100),
        memory: { totalMb: Math.round(os.totalmem() / 1048576), freeMb: Math.round(os.freemem() / 1048576), apiMb: Math.round(mem.rss / 1048576) },
        uptimeHours: Math.round(process.uptime() / 360) / 10, databaseMb: Math.round(Number(size) / 1048576 * 10) / 10,
      },
    };
  }
}

@Controller('public')
export class ClientPerfController {
  constructor(private readonly metrics: Metrics) {}
  /** The web app reports how fast pages and requests were for the user (sent in the background). */
  @Post('perf') @Public() @HttpCode(204)
  async perf(@Body() d: ClientPerfDto, @Req() req: Request) {
    await this.metrics.recordClient(d, req.ip);
  }
}
