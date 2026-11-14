import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, OnModuleDestroy, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Database } from '../database';
import { AllowBlocked, CurrentActor } from '../auth/security';
import type { Actor } from '../auth/security';
import type { AlertKind } from '../bot/bot.service';
import { Apns, apnsConfig, deadToken, type PushMessage } from './apns';

class DeviceDto {
  /** The APNs device token: 64 hex characters (longer ones are allowed, Apple may change the length). */
  @IsString() @Matches(/^[0-9a-fA-F]{64,200}$/) token!: string;
  @IsOptional() @IsIn(['ios']) platform?: 'ios';
}

/**
 * Push notifications to the App Store app: the same order alerts staff get in Telegram (a new intake,
 * a device ready), shown on the phone's lock screen. A phone gets them only while it is signed in:
 * each device belongs to one sign-in (session family), and signing out or expiring ends it.
 */
@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private readonly apns: Apns | null;
  constructor(private readonly db: Database) {
    let config = null;
    try { config = apnsConfig(); } catch (e) { this.logger.error('APNs settings are wrong: ' + (e as Error).message); }
    this.apns = config ? new Apns(config) : null;
  }
  get enabled() { return !!this.apns; }
  onModuleDestroy() { this.apns?.close(); }

  /** Staff of a service whose phones should hear about it (the same switches as Telegram alerts). */
  async notifyStaff(organizationId: string, message: PushMessage, exceptUserId?: string, kind: AlertKind = 'newOrder') {
    if (!this.apns) return 0;
    const setting = await this.db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId, key: 'bot_alerts' } } });
    if ((setting?.value as Record<string, unknown> | undefined)?.[kind] === false) return 0;
    const devices = await this.db.pushDevice.findMany({
      where: { organizationId, user: { status: 'ACTIVE' }, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) },
      select: { id: true, token: true, tokenFamilyId: true },
    });
    if (!devices.length) return 0;
    // Only phones whose sign-in is still valid.
    const live = new Set((await this.db.session.findMany({
      where: { tokenFamilyId: { in: [...new Set(devices.map(d => d.tokenFamilyId))] }, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: { tokenFamilyId: true },
    })).map(s => s.tokenFamilyId));
    let sent = 0;
    for (const d of devices.filter(d => live.has(d.tokenFamilyId))) {
      const r = await this.apns.send(d.token, { threadId: organizationId, ...message });
      if (r.status === 200) sent++;
      else if (deadToken(r)) await this.db.pushDevice.deleteMany({ where: { id: d.id } });
      else this.logger.warn(`APNs ${r.status} ${r.reason ?? ''}`);
    }
    return sent;
  }
}

@Controller('push')
class PushController {
  constructor(private readonly db: Database, private readonly push: PushService) {}

  /** Whether the server can send pushes (the app asks for permission only then). */
  @Get('status') @AllowBlocked()
  status() { return { enabled: this.push.enabled }; }

  /** The app's device token for the signed-in user. A token moves to whoever signs in on that phone. */
  @Post('devices') @AllowBlocked() @HttpCode(204)
  async register(@CurrentActor() a: Actor, @Body() d: DeviceDto) {
    if (a.support) throw new ForbiddenException('SUPPORT_SESSION');
    const session = await this.db.session.findUniqueOrThrow({ where: { id: a.sessionId }, select: { tokenFamilyId: true } });
    const token = d.token.toLowerCase();
    const data = { organizationId: a.organizationId, userId: a.userId, tokenFamilyId: session.tokenFamilyId, platform: d.platform ?? 'ios' };
    await this.db.pushDevice.upsert({ where: { token }, create: { token, ...data }, update: data });
  }

  /** Signing out on the phone: it stops getting this user's alerts. */
  @Delete('devices/:token') @AllowBlocked() @HttpCode(204)
  async unregister(@CurrentActor() a: Actor, @Param('token') token: string) {
    await this.db.pushDevice.deleteMany({ where: { token: token.toLowerCase(), userId: a.userId } });
  }
}

@Module({ controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
