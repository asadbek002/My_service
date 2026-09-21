import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Database } from '../database';

export interface SubState { status: string; graceUntil: Date | null; expiresAt: Date }
const TTL = 600; // 10 daqiqa

@Injectable()
export class SubscriptionCache implements OnModuleInit, OnModuleDestroy {
  private redis?: Redis;

  constructor(private readonly db: Database) {}

  async onModuleInit() {
    if (!process.env.REDIS_URL) return;
    try {
      this.redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
      await this.redis.connect();
    } catch {
      this.redis = undefined; // Redis yo'q bo'lsa DB fallback ishlaydi
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  private key(orgId: string) { return `sub:${orgId}`; }

  async get(organizationId: string): Promise<SubState | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(this.key(organizationId));
        if (raw) {
          const parsed = JSON.parse(raw) as { status: string; graceUntil: string | null; expiresAt: string };
          return { status: parsed.status, graceUntil: parsed.graceUntil ? new Date(parsed.graceUntil) : null, expiresAt: new Date(parsed.expiresAt) };
        }
      } catch { /* Redis xatosi — DB dan olamiz */ }
    }
    return this.fromDb(organizationId);
  }

  async invalidate(organizationId: string) {
    if (!this.redis) return;
    try { await this.redis.del(this.key(organizationId)); } catch { /* ignore */ }
  }

  private async fromDb(organizationId: string): Promise<SubState | null> {
    const sub = await this.db.subscription.findUnique({ where: { organizationId }, select: { status: true, graceUntil: true, expiresAt: true } });
    if (!sub) return null;
    const state: SubState = { status: sub.status, graceUntil: sub.graceUntil, expiresAt: sub.expiresAt };
    if (this.redis) {
      try { await this.redis.set(this.key(organizationId), JSON.stringify(state), 'EX', TTL); } catch { /* ignore */ }
    }
    return state;
  }
}
