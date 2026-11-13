import { Injectable, OnModuleDestroy } from '@nestjs/common';
import os from 'node:os';
import Redis from 'ioredis';
import type { Database } from '../database';

const HOUR_KEEP = 8 * 86400, DAY_KEEP = 100 * 86400;
// Hours and days in Tashkent time, as the rest of the product counts them.
const tashkent = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).toISOString();
const hourOf = (d?: Date) => tashkent(d).slice(0, 13);   // 2026-11-13T14
const dayOf = (d?: Date) => tashkent(d).slice(0, 10);
const BUCKETS = [['b50', 50], ['b200', 200], ['b1000', 1000], ['bmax', Infinity]] as const;

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
  record(route: string, status: number, ms: number, actor?: { userId?: string; organizationId?: string }) {
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
    }
    void m.exec().catch(() => undefined);
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

    const size = (await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`)[0]?.size ?? 0n;
    const mem = process.memoryUsage();
    return {
      hours: perHour,
      total: { requests: total.n, errors: total.err, errorRate: total.n ? Math.round(total.err / total.n * 1000) / 10 : 0, avgMs: total.n ? Math.round(total.ms / total.n) : 0,
        perMinute: Math.round(total.n / (hours * 60) * 10) / 10, under50: share('b50'), under200: share('b50') + share('b200'), under1000: share('b50') + share('b200') + share('b1000'), over1000: share('bmax') },
      slowest: routeList.filter(r => r.n >= 3).sort((a, b) => b.avg - a.avg).slice(0, 8),
      busiest: [...routeList].sort((a, b) => b.n - a.n).slice(0, 8),
      active: { today: activePerDay.at(-1), week: { users: num(base), services: num(base + 1) }, month: { users: num(base + 2), services: num(base + 3) }, perDay: activePerDay },
      server: {
        cpus: os.cpus().length, load: os.loadavg().map(l => Math.round(l * 100) / 100),
        memory: { totalMb: Math.round(os.totalmem() / 1048576), freeMb: Math.round(os.freemem() / 1048576), apiMb: Math.round(mem.rss / 1048576) },
        uptimeHours: Math.round(process.uptime() / 360) / 10, databaseMb: Math.round(Number(size) / 1048576 * 10) / 10,
      },
    };
  }
}
