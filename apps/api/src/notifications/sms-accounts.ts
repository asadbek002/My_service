import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { seal, unseal } from '../common/secret-box';
import { EskizClient } from './eskiz.client';
import { tashkentDay } from '../bot/telegram.client';

type SmsSetting = { mode: 'platform' | 'own'; email?: string; password?: string; from?: string };
const KEY = 'sms';
export const smsPeriod = () => tashkentDay().slice(0, 7);
export const platformSmsConfigured = () => !!process.env.SMS_PROVIDER && !!process.env.SMS_API_KEY;

/**
 * How a service sends SMS: through the platform's Eskiz account (counted against the plan's monthly
 * SMS, the rest billed as extra), or through its own Eskiz account (its balance, no limit).
 */
@Injectable()
export class SmsAccounts {
  private readonly clients = new Map<string, { key: string; client: EskizClient }>();
  constructor(private readonly db: Database) {}

  async setting(orgId: string): Promise<SmsSetting> {
    const row = await this.db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: KEY } } });
    const v = (row?.value ?? {}) as SmsSetting;
    return v.mode === 'own' ? v : { mode: 'platform' };
  }
  /** The service's own Eskiz client, reused so its token stays cached; null in platform mode. */
  async own(orgId: string): Promise<EskizClient | null> {
    const s = await this.setting(orgId);
    const password = s.mode === 'own' ? unseal(s.password) : null;
    if (!password || !s.email) return null;
    const key = s.email + '|' + s.from + '|' + s.password;
    const hit = this.clients.get(orgId);
    if (hit?.key === key) return hit.client;
    const client = EskizClient.forAccount(s.email, password, s.from);
    this.clients.set(orgId, { key, client });
    return client;
  }

  /** Save the choice. An own account is checked against Eskiz first (a wrong password is refused). */
  async save(orgId: string, d: { mode: 'platform' | 'own'; email?: string | undefined; password?: string | undefined; from?: string | undefined }) {
    let value: SmsSetting = { mode: 'platform' };
    if (d.mode === 'own') {
      const current = await this.setting(orgId);
      const email = d.email?.trim() || current.email;
      const password = d.password || (current.email === email ? unseal(current.password) : null);
      if (!email || !password) throw new BadRequestException('ESKIZ_CREDENTIALS_MISSING');
      const from = d.from?.trim() || '4546';
      try { await EskizClient.forAccount(email, password, from).getToken(); }
      catch (e) {
        if (e instanceof Error && e.message === 'ESKIZ_AUTH_FAILED') throw new BadRequestException('ESKIZ_AUTH_FAILED');
        throw new ServiceUnavailableException('ESKIZ_UNAVAILABLE');
      }
      value = { mode: 'own', email, password: seal(password), from };
    }
    const json = value as unknown as Prisma.InputJsonObject;
    await this.db.organizationSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key: KEY } }, create: { organizationId: orgId, key: KEY, value: json }, update: { value: json } });
    this.clients.delete(orgId);
    return { mode: value.mode, email: value.email ?? null, from: value.from ?? null };
  }

  /** SMS sent through the platform account this month, and how many of them were over the plan. */
  async usage(orgId: string) {
    const rows = await this.db.usageRecord.findMany({ where: { organizationId: orgId, period: smsPeriod(), metric: { in: ['sms', 'sms_extra'] } } });
    return { sent: rows.find(r => r.metric === 'sms')?.quantity ?? 0, extra: rows.find(r => r.metric === 'sms_extra')?.quantity ?? 0 };
  }
  /** Count one platform SMS; over the plan's allowance it is also counted as extra (billed later). */
  async count(orgId: string, limit: number | null) {
    const period = smsPeriod();
    const sent = await this.db.usageRecord.upsert({
      where: { organizationId_metric_period: { organizationId: orgId, metric: 'sms', period } },
      create: { organizationId: orgId, metric: 'sms', period, quantity: 1 }, update: { quantity: { increment: 1 } },
    });
    if (limit !== null && sent.quantity > limit) {
      await this.db.usageRecord.upsert({
        where: { organizationId_metric_period: { organizationId: orgId, metric: 'sms_extra', period } },
        create: { organizationId: orgId, metric: 'sms_extra', period, quantity: 1 }, update: { quantity: { increment: 1 } },
      });
    }
  }
}
