import { Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Module, Param, Patch, Post, Put, Query, Req, UseGuards, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IsString, Length, Matches, IsInt, Min, Max, IsOptional, IsObject, IsIn, IsISO8601, IsBoolean, MaxLength } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Database } from '../database';
import { Public, allowedOrigins } from '../auth/security';
import { LoginRateGuard } from '../auth/rate-limit';
import { LoginDto } from '../auth/auth.dto';
import { SubscriptionCache } from '../auth/subscription-cache';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { BotModule } from '../bot/bot.module';
import { BotService } from '../bot/bot.service';
import { esc } from '../bot/telegram.client';
import { billingSettings, saveBillingSettings, yearlyPriceOf } from './billing';
import { createOrganization } from './organizations';
import { newTotpSecret, otpauthUrl, verifyTotp } from './totp';
import { setupProgress } from '../management/settings.module';
import { Monitor, MonitorModule } from './monitor';
import QRCode from 'qrcode';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type AdminRequest = Request & { adminId: string; platformSessionId: string };
@Injectable()
class PlatformGuard implements CanActivate {
  constructor(private readonly db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || token.length > 200) throw new UnauthorizedException();
    const session = await this.db.platformSession.findUnique({ where: { tokenHash: hash(token) }, include: { admin: true } });
    if (!session || !session.admin.active || session.expiresAt <= new Date()) throw new UnauthorizedException();
    req.adminId = session.adminId; req.platformSessionId = session.id; return true;
  }
}
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const PLAN_FEATURES = ['inventory','telegram','sms','advanced_reports','multi_branch','staff_commission','exports','own_bot'];
class PlanDto {
  @IsString() @Length(1,100) name!: string;
  @IsOptional() @IsInt() @Min(1) maxBranches?: number;
  @IsOptional() @IsInt() @Min(1) maxStaff?: number;
  @IsOptional() @IsInt() @Min(1) monthlyOrders?: number;
  @IsOptional() @IsString() @Matches(MONEY) monthlyPrice?: string;
  @IsOptional() @IsString() @Matches(MONEY) yearlyPrice?: string;
  @IsOptional() @IsInt() @Min(0) smsPerMonth?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsObject() features!: Record<string, boolean>;
}
/** Every field optional; null clears a limit (unlimited) or the yearly price (computed). */
class PlanUpdateDto {
  @IsOptional() @IsString() @Length(1,100) name?: string;
  @IsOptional() @IsInt() @Min(1) maxBranches?: number | null;
  @IsOptional() @IsInt() @Min(1) maxStaff?: number | null;
  @IsOptional() @IsInt() @Min(1) monthlyOrders?: number | null;
  @IsOptional() @IsString() @Matches(MONEY) monthlyPrice?: string;
  @IsOptional() @IsString() @Matches(MONEY) yearlyPrice?: string | null;
  @IsOptional() @IsInt() @Min(0) smsPerMonth?: number | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsObject() features?: Record<string, boolean>;
}
class BillingDto {
  @IsInt() @Min(0) @Max(365) trialDays!: number;
  @IsInt() @Min(0) @Max(60) graceDays!: number;
  @IsString() @Matches(MONEY) extraSmsPrice!: string;
  @IsInt() @Min(0) @Max(11) yearlyFreeMonths!: number;
  @IsBoolean() signupOpen!: boolean;
  @IsOptional() @IsString() @Length(1,100) signupPlanId?: string | null;
}
const checkFeatures = (f: Record<string, unknown>) => {
  if (Object.entries(f).some(([k,v])=>!PLAN_FEATURES.includes(k)||typeof v!=='boolean')) throw new BadRequestException('Unknown feature or non-boolean value');
};
class OrganizationDto {
  @IsString() @Length(1,200) name!: string;
  @IsString() @Matches(/^[a-z0-9-]{3,64}$/) slug!: string;
  @IsString() @Length(1,100) planId!: string;
  @IsString() @Matches(/^[a-zA-Z0-9_.-]{3,64}$/) login!: string;
  @IsString() @Length(12,128) temporaryPassword!: string;
  @IsString() @Length(1,100) ownerName!: string;
  @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
}
class PlatformLoginDto extends LoginDto {
  /** Authenticator code, once two-factor sign-in is on. */
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
}
class ExtendDto {
  @IsInt() @Min(1) @Max(365) days!: number;
  @IsOptional() @IsIn(['TRIAL','ACTIVE']) status?: 'TRIAL' | 'ACTIVE';
}
class BlockDto { @IsString() @Length(1,300) reason!: string; }
class NoteDto { @IsString() @MaxLength(2000) note!: string; }
class ReplyDto { @IsString() @Length(1,4000) body!: string; }
class AnnouncementDto {
  @IsString() @Length(1,120) title!: string;
  @IsString() @Length(1,2000) body!: string;
  @IsIn(['INFO','WARNING']) level!: 'INFO' | 'WARNING';
}
class AnnouncementUpdateDto { @IsBoolean() active!: boolean; }
/** Company details printed in the public offer and the privacy policy. */
class LegalDto {
  @IsString() @MaxLength(200) company!: string;
  @IsString() @MaxLength(20) inn!: string;
  @IsString() @MaxLength(300) address!: string;
  @IsString() @MaxLength(40) phone!: string;
  @IsString() @MaxLength(120) email!: string;
  /** Where the servers (the data) are, e.g. "Toshkent, O'zbekiston (Uztelecom DC)". */
  @IsString() @MaxLength(200) dataLocation!: string;
}
export const LEGAL_FIELDS = ['company', 'inn', 'address', 'phone', 'email', 'dataLocation'] as const;
/** Where a service stands, for filters: blocked beats everything, then trial / active / expired. */
type OrgState = 'blocked' | 'trial' | 'active' | 'expired';
function orgState(o: { blockedAt: Date | null; subscription: { status: string; expiresAt: Date; graceUntil: Date | null } | null }): OrgState {
  if (o.blockedAt) return 'blocked';
  const s = o.subscription;
  if (!s || (s.graceUntil ?? s.expiresAt) <= new Date() || !['TRIAL','ACTIVE'].includes(s.status)) return 'expired';
  return s.status === 'TRIAL' ? 'trial' : 'active';
}
class TotpDto { @IsString() @Matches(/^\d{6}$/) code!: string; }
class ResetPasswordDto {
  @IsString() @Length(12,128) temporaryPassword!: string;
}
class SubscriptionDto {
  @IsString() @Length(1,100) planId!: string;
  @IsIn(['TRIAL','ACTIVE','SUSPENDED','EXPIRED']) status!: string;
  @IsISO8601() expiresAt!: string;
}
/** The company details the public offer and privacy policy pages show. */
@Controller('public/legal') @Public()
class LegalController {
  constructor(private readonly db: Database) {}
  @Get()
  async legal() {
    const v = ((await this.db.platformSetting.findUnique({ where: { key: 'legal' } }))?.value ?? {}) as Record<string, unknown>;
    return Object.fromEntries(LEGAL_FIELDS.map(k => [k, typeof v[k] === 'string' ? v[k] : '']));
  }
}
@Controller('platform/auth') @Public()
class PlatformAuthController {
  constructor(private readonly db: Database) {}
  @Post('login') @UseGuards(LoginRateGuard)
  async login(@Req() req: Request, @Body() d: PlatformLoginDto) {
    if (!req.headers.origin || !allowedOrigins().includes(req.headers.origin)) throw new ForbiddenException();
    const admin = await this.db.platformAdmin.findUnique({ where: { login: d.login.toLowerCase() } });
    // Always do Argon2 work for unknown users.
    const dummy = '$argon2id$v=19$m=65536,t=3,p=4$cmFuZG9tLXNlZWQtc2FsdA$R5sjIzDcudFDASNkKMjGNgpdsmaOoE1ZeInDz5Cyb1U';
    let valid = false;
    try { valid = await argon2.verify(admin?.passwordHash ?? dummy, d.password); } catch {}
    if (!admin || !admin.active || !valid) throw new UnauthorizedException('Invalid credentials');
    if (admin.totpEnabled && admin.totpSecret) {
      if (!d.code) throw new UnauthorizedException('TOTP_REQUIRED');
      if (!verifyTotp(admin.totpSecret, d.code)) throw new UnauthorizedException('TOTP_INVALID');
    }
    const token = randomBytes(32).toString('base64url');
    await this.db.platformSession.create({ data: { adminId: admin.id, tokenHash: hash(token), expiresAt: new Date(Date.now()+8*3600000) } });
    return { accessToken: token, expiresIn: 28800 };
  }
  @Post('logout') @UseGuards(PlatformGuard)
  async logout(@Req() req: AdminRequest) { await this.db.platformSession.delete({ where: { id: req.platformSessionId } }); return { ok: true }; }

  // ---- Two-factor sign-in (authenticator app) ----
  @Get('two-factor') @UseGuards(PlatformGuard)
  async twoFactor(@Req() req: AdminRequest) {
    const admin = await this.db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId } });
    return { enabled: admin.totpEnabled };
  }
  /** A new secret to scan; it is not required at login until confirmed with a code. */
  @Post('two-factor/setup') @UseGuards(PlatformGuard)
  async setupTwoFactor(@Req() req: AdminRequest) {
    const admin = await this.db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId } });
    if (admin.totpEnabled) throw new ConflictException('Two-factor already enabled');
    const secret = newTotpSecret();
    await this.db.platformAdmin.update({ where: { id: admin.id }, data: { totpSecret: secret } });
    const url = otpauthUrl(admin.login, secret);
    return { secret, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
  }
  @Post('two-factor/enable') @UseGuards(PlatformGuard)
  async enableTwoFactor(@Req() req: AdminRequest, @Body() d: TotpDto) {
    const admin = await this.db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId } });
    if (!admin.totpSecret || !verifyTotp(admin.totpSecret, d.code)) throw new BadRequestException('TOTP_INVALID');
    await this.db.platformAdmin.update({ where: { id: admin.id }, data: { totpEnabled: true } });
    await this.db.auditLog.create({ data: { organizationId: 'PLATFORM', actorId: admin.id, action: 'PLATFORM_2FA_ENABLED', entityId: admin.id } });
    return { enabled: true };
  }
  @Post('two-factor/disable') @UseGuards(PlatformGuard)
  async disableTwoFactor(@Req() req: AdminRequest, @Body() d: TotpDto) {
    const admin = await this.db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId } });
    if (!admin.totpEnabled || !admin.totpSecret || !verifyTotp(admin.totpSecret, d.code)) throw new BadRequestException('TOTP_INVALID');
    await this.db.platformAdmin.update({ where: { id: admin.id }, data: { totpEnabled: false, totpSecret: null } });
    await this.db.auditLog.create({ data: { organizationId: 'PLATFORM', actorId: admin.id, action: 'PLATFORM_2FA_DISABLED', entityId: admin.id } });
    return { enabled: false };
  }
}
@Controller('platform') @Public() @UseGuards(PlatformGuard)
class PlatformController {
  constructor(private readonly db: Database, private readonly subCache: SubscriptionCache, private readonly jwt: JwtService, private readonly bot: BotService, private readonly monitor: Monitor) {}
  /** Services, newest first; `q` matches name, slug, owner login or phone; `state` filters. */
  @Get('organizations')
  async organizations(@Query('q') q?: string, @Query('state') state?: string) {
    const text = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    const digits = text.replace(/\D/g, '');
    const rows = await this.db.organization.findMany({
      where: text ? { OR: [
        { name: { contains: text, mode: 'insensitive' } }, { slug: { contains: text.toLowerCase() } },
        { users: { some: { login: { contains: text.toLowerCase() } } } },
        ...(digits.length >= 4 ? [{ users: { some: { phone: { contains: digits } } } }] : []),
      ] } : {},
      select: { id:true,name:true,slug:true,createdAt:true,blockedAt:true,blockReason:true,subscription:{include:{plan:true}},_count:{select:{users:true,branches:true,orders:true}},
        users:{where:{roles:{some:{role:{systemKey:'OWNER'}}}},select:{firstName:true,phone:true,login:true},take:1} },
      take: 300, orderBy: { createdAt: 'desc' },
    });
    const withState = rows.map(({ users, ...o }) => ({ ...o, owner: users[0] ?? null, state: orgState(o) }));
    return state && ['blocked','trial','active','expired'].includes(state) ? withState.filter(o => o.state === state) : withState;
  }
  /** Everything about one service the platform needs to help it. */
  @Get('organizations/:id')
  async organization(@Param('id') id: string) {
    const org = await this.db.organization.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } });
    if (!org) throw new NotFoundException();
    const monthStart = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).slice(0, 7) + '-01T00:00:00+05:00');
    const [users, orders, ordersMonth, customers, failed, lastLogin, audit, tickets, nextPlan] = await Promise.all([
      this.db.user.findMany({ where: { organizationId: id }, select: { id: true, login: true, firstName: true, lastName: true, phone: true, status: true, mustChangePassword: true, telegramChatId: true, roles: { select: { role: { select: { systemKey: true } } } } }, orderBy: { createdAt: 'asc' } }),
      this.db.order.count({ where: { organizationId: id } }),
      this.db.order.count({ where: { organizationId: id, createdAt: { gte: monthStart } } }),
      this.db.customer.count({ where: { organizationId: id } }),
      this.db.notification.count({ where: { organizationId: id, status: 'FAILED', createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      this.db.auditLog.findFirst({ where: { organizationId: id, action: 'AUTH_LOGIN' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.db.auditLog.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { action: true, actorId: true, createdAt: true } }),
      this.db.supportTicket.findMany({ where: { organizationId: id }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, subject: true, status: true, updatedAt: true } }),
      org.subscription?.nextPlanId ? this.db.plan.findUnique({ where: { id: org.subscription.nextPlanId }, select: { id: true, name: true } }) : null,
    ]);
    const owner = users.find(u => u.roles.some(r => r.role.systemKey === 'OWNER'));
    return {
      ...org, state: orgState(org), nextPlan, users: users.map(({ telegramChatId, ...u }) => ({ ...u, telegram: !!telegramChatId })),
      stats: { orders, ordersMonth, customers, failedNotifications30d: failed, lastLoginAt: lastLogin?.createdAt ?? null },
      setup: owner ? await setupProgress(this.db, id, owner.id) : null, audit, tickets,
    };
  }
  /** Give more days (a longer trial, a goodwill extension): from today or from the current end, whichever is later. */
  @Post('organizations/:id/extend')
  async extend(@Param('id') id: string, @Body() d: ExtendDto, @Req() req: AdminRequest) {
    const sub = await this.db.subscription.findUnique({ where: { organizationId: id } });
    if (!sub) throw new NotFoundException();
    const billing = await billingSettings(this.db);
    const from = Math.max(Date.now(), sub.expiresAt.getTime());
    const expiresAt = new Date(from + d.days * 86400000);
    const status = d.status ?? (['TRIAL','ACTIVE'].includes(sub.status) ? sub.status : 'TRIAL');
    const updated = await this.db.subscription.update({ where: { organizationId: id }, data: { expiresAt, graceUntil: new Date(expiresAt.getTime() + billing.graceDays * 86400000), status } });
    await this.db.auditLog.create({ data: { organizationId: id, actorId: 'platform:' + req.adminId, action: 'SUBSCRIPTION_EXTENDED', entityId: sub.id, newValue: { days: d.days, status } } });
    await this.subCache.invalidate(id);
    return updated;
  }
  @Post('organizations/:id/block')
  async block(@Param('id') id: string, @Body() d: BlockDto, @Req() req: AdminRequest) {
    const org = await this.db.organization.updateMany({ where: { id }, data: { blockedAt: new Date(), blockReason: d.reason.trim() } });
    if (!org.count) throw new NotFoundException();
    await this.db.auditLog.create({ data: { organizationId: id, actorId: 'platform:' + req.adminId, action: 'ORGANIZATION_BLOCKED', entityId: id, newValue: { reason: d.reason.trim() } } });
    return { ok: true };
  }
  @Post('organizations/:id/unblock')
  async unblock(@Param('id') id: string, @Req() req: AdminRequest) {
    const org = await this.db.organization.updateMany({ where: { id }, data: { blockedAt: null, blockReason: null } });
    if (!org.count) throw new NotFoundException();
    await this.db.auditLog.create({ data: { organizationId: id, actorId: 'platform:' + req.adminId, action: 'ORGANIZATION_UNBLOCKED', entityId: id } });
    return { ok: true };
  }
  @Put('organizations/:id/note')
  async note(@Param('id') id: string, @Body() d: NoteDto) {
    const org = await this.db.organization.updateMany({ where: { id }, data: { platformNote: d.note.trim() || null } });
    if (!org.count) throw new NotFoundException();
    return { ok: true };
  }

  // ---- Support inbox ----
  @Get('tickets')
  async tickets(@Query('status') status?: string) {
    const where = status && ['OPEN','ANSWERED','CLOSED'].includes(status) ? { status } : {};
    const rows = await this.db.supportTicket.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100,
      include: { organization: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { messages: true } } } });
    return rows.map(({ messages, _count, ...t }) => ({ ...t, last: messages[0] ?? null, messages: _count.messages }));
  }
  @Get('tickets/:id')
  async ticket(@Param('id') id: string) {
    const t = await this.db.supportTicket.findUnique({ where: { id }, include: { organization: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException();
    const author = await this.db.user.findUnique({ where: { id: t.userId }, select: { firstName: true, phone: true, login: true } });
    return { ...t, author };
  }
  /** Answer a ticket; the person who opened it gets the answer in Telegram too when linked. */
  @Post('tickets/:id/messages')
  async replyTicket(@Param('id') id: string, @Body() d: ReplyDto, @Req() req: AdminRequest) {
    const t = await this.db.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException();
    const [message] = await this.db.$transaction([
      this.db.supportMessage.create({ data: { ticketId: id, author: 'PLATFORM', authorName: 'MyService yordam', body: d.body.trim() } }),
      this.db.supportTicket.update({ where: { id }, data: { status: 'ANSWERED' } }),
    ]);
    await this.db.auditLog.create({ data: { organizationId: t.organizationId, actorId: 'platform:' + req.adminId, action: 'SUPPORT_ANSWERED', entityId: id } });
    const user = await this.db.user.findUnique({ where: { id: t.userId }, select: { telegramChatId: true } });
    if (user?.telegramChatId) void this.bot.telegram.send(user.telegramChatId, `💬 <b>Yordam bo‘limi javob berdi</b> — «${esc(t.subject)}»\n\n${esc(d.body.trim().slice(0, 1500))}\n\nIlovada: Menyu → Yordam`).catch(() => undefined);
    return message;
  }
  @Post('tickets/:id/close')
  async closeTicket(@Param('id') id: string) {
    const done = await this.db.supportTicket.updateMany({ where: { id }, data: { status: 'CLOSED' } });
    if (!done.count) throw new NotFoundException();
    return { ok: true };
  }

  // ---- Company details for the legal pages ----
  @Get('legal')
  async legal() { return (await this.db.platformSetting.findUnique({ where: { key: 'legal' } }))?.value ?? {}; }
  @Put('legal')
  async saveLegal(@Body() d: LegalDto, @Req() req: AdminRequest) {
    const value = Object.fromEntries(LEGAL_FIELDS.map(k => [k, d[k].trim()])) as Prisma.InputJsonObject;
    await this.db.platformSetting.upsert({ where: { key: 'legal' }, create: { key: 'legal', value }, update: { value } });
    await this.db.auditLog.create({ data: { organizationId: 'PLATFORM', actorId: req.adminId, action: 'LEGAL_CHANGED', entityId: 'legal' } });
    return value;
  }

  // ---- Announcements ----
  @Get('announcements')
  announcements() { return this.db.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  @Post('announcements')
  async announce(@Body() d: AnnouncementDto, @Req() req: AdminRequest) {
    const a = await this.db.announcement.create({ data: { title: d.title.trim(), body: d.body.trim(), level: d.level } });
    await this.db.auditLog.create({ data: { organizationId: 'PLATFORM', actorId: req.adminId, action: 'ANNOUNCEMENT_CREATED', entityId: a.id } });
    return a;
  }
  @Patch('announcements/:id')
  async updateAnnouncement(@Param('id') id: string, @Body() d: AnnouncementUpdateDto) {
    const done = await this.db.announcement.updateMany({ where: { id }, data: { active: d.active } });
    if (!done.count) throw new NotFoundException();
    return { ok: true };
  }
  @Get('plans')
  async plans() {
    const [plans, settings] = await Promise.all([
      this.db.plan.findMany({ orderBy:[{sortOrder:'asc'},{name:'asc'}], include:{_count:{select:{subscriptions:true}}} }),
      billingSettings(this.db),
    ]);
    return plans.map(p => ({ ...p, yearlyTotal: yearlyPriceOf(p, settings) }));
  }
  @Post('plans')
  async plan(@Body() d: PlanDto, @Req() req: AdminRequest) {
    checkFeatures(d.features);
    try {
      return await this.db.$transaction(async tx => {
        const plan=await tx.plan.create({data:{name:d.name,features:d.features as Prisma.InputJsonObject,maxBranches:d.maxBranches??null,maxStaff:d.maxStaff??null,monthlyOrders:d.monthlyOrders??null,monthlyPrice:d.monthlyPrice??'0',
          yearlyPrice:d.yearlyPrice??null,smsPerMonth:d.smsPerMonth??null,description:d.description?.trim()||null,active:d.active??true,sortOrder:d.sortOrder??0}});
        await tx.auditLog.create({data:{organizationId:'PLATFORM',actorId:req.adminId,action:'PLAN_CREATED',entityId:plan.id}});return plan;
      });
    } catch(e) { if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002') throw new ConflictException('Plan name exists');throw e; }
  }
  /** Change a plan's price, limits or features. Services on it get the new terms at once. */
  @Patch('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() d: PlanUpdateDto, @Req() req: AdminRequest) {
    if (d.features) checkFeatures(d.features);
    if (!await this.db.plan.findUnique({ where: { id } })) throw new NotFoundException('Plan not found');
    const data: Prisma.PlanUpdateInput = {};
    if (d.name !== undefined && d.name !== null) data.name = d.name.trim();
    if (d.monthlyPrice !== undefined && d.monthlyPrice !== null) data.monthlyPrice = d.monthlyPrice;
    if (d.active !== undefined && d.active !== null) data.active = d.active;
    if (d.sortOrder !== undefined && d.sortOrder !== null) data.sortOrder = d.sortOrder;
    if (d.features) data.features = d.features as Prisma.InputJsonObject;
    // null is meaningful here: no limit / computed yearly price / no description.
    if (d.maxBranches !== undefined) data.maxBranches = d.maxBranches;
    if (d.maxStaff !== undefined) data.maxStaff = d.maxStaff;
    if (d.monthlyOrders !== undefined) data.monthlyOrders = d.monthlyOrders;
    if (d.yearlyPrice !== undefined) data.yearlyPrice = d.yearlyPrice;
    if (d.smsPerMonth !== undefined) data.smsPerMonth = d.smsPerMonth;
    if (d.description !== undefined) data.description = d.description?.trim() || null;
    try {
      return await this.db.$transaction(async tx => {
        const plan = await tx.plan.update({ where: { id }, data });
        await tx.auditLog.create({data:{organizationId:'PLATFORM',actorId:req.adminId,action:'PLAN_UPDATED',entityId:plan.id}});
        return plan;
      });
    } catch(e) { if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002') throw new ConflictException('Plan name exists');throw e; }
  }
  @Get('billing-settings')
  billing() { return billingSettings(this.db); }
  @Put('billing-settings')
  async saveBilling(@Body() d: BillingDto, @Req() req: AdminRequest) {
    if (d.signupPlanId && !await this.db.plan.findFirst({ where: { id: d.signupPlanId, active: true } })) throw new BadRequestException('Sign-up plan must be an active plan');
    const value = { trialDays: d.trialDays, graceDays: d.graceDays, extraSmsPrice: d.extraSmsPrice, yearlyFreeMonths: d.yearlyFreeMonths, signupOpen: d.signupOpen, signupPlanId: d.signupPlanId || null };
    await saveBillingSettings(this.db, value);
    await this.db.auditLog.create({data:{organizationId:'PLATFORM',actorId:req.adminId,action:'BILLING_SETTINGS_CHANGED',entityId:'billing'}});
    return value;
  }
  @Post('organizations')
  async onboard(@Body() d: OrganizationDto, @Req() req: AdminRequest) {
    const passwordHash=await argon2.hash(d.temporaryPassword,{type:argon2.argon2id});
    const billing=await billingSettings(this.db);
    try {
      const created = await this.db.$transaction(async tx => {
        if(!await tx.plan.findUnique({where:{id:d.planId}})) throw new NotFoundException('Plan not found');
        const {org,user}=await createOrganization(tx,{name:d.name,slug:d.slug,planId:d.planId,login:d.login,passwordHash,ownerName:d.ownerName,phone:d.phone,mustChangePassword:true,actorId:req.adminId,action:'PLATFORM_ORGANIZATION_CREATED'},billing);
        return {id:org.id,name:org.name,ownerLogin:user.login};
      },{timeout:15000});
      void this.bot.notifyAdmins(`🆕 Yangi servis: <b>${esc(created.name)}</b> (egasi: ${esc(created.ownerLogin)}, ${esc(d.phone)})`).catch(() => undefined);
      return created;
    } catch(e) { if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002') throw new ConflictException('Organization slug or login exists');throw e; }
  }
  @Patch('organizations/:id/subscription')
  async subscription(@Param('id')id:string,@Body()d:SubscriptionDto,@Req()req:AdminRequest) {
    if(!await this.db.plan.findUnique({where:{id:d.planId}})) throw new NotFoundException('Plan not found');
    if(!await this.db.organization.findUnique({where:{id}})) throw new NotFoundException();
    // The platform's grace days follow every new end date.
    const expiresAt=new Date(d.expiresAt);
    const graceUntil=new Date(expiresAt.getTime()+(await billingSettings(this.db)).graceDays*86400000);
    return this.db.$transaction(async tx=>{
      const sub=await tx.subscription.upsert({where:{organizationId:id},create:{organizationId:id,planId:d.planId,status:d.status,expiresAt,graceUntil},update:{planId:d.planId,status:d.status,expiresAt,graceUntil}});
      await tx.auditLog.create({data:{organizationId:id,actorId:req.adminId,action:'SUBSCRIPTION_CHANGED',entityId:sub.id}});
      await this.subCache.invalidate(id);
      return sub;
    });
  }
  @Get('organizations/:id/users')
  async users(@Param('id') id: string) {
    if (!await this.db.organization.findUnique({ where: { id } })) throw new NotFoundException();
    return this.db.user.findMany({ where: { organizationId: id }, select: { id: true, login: true, firstName: true, lastName: true, phone: true, status: true, mustChangePassword: true, roles: { select: { role: { select: { systemKey: true } } } } }, orderBy: { createdAt: 'asc' } });
  }
  // Platform support: reset any member's password (it becomes temporary) and end their sessions.
  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() d: ResetPasswordDto, @Req() req: AdminRequest) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    const passwordHash = await argon2.hash(d.temporaryPassword, { type: argon2.argon2id });
    await this.db.$transaction([
      this.db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      this.db.session.updateMany({ where: { userId: id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } }),
      this.db.auditLog.create({ data: { organizationId: user.organizationId, actorId: 'platform:' + req.adminId, action: 'PLATFORM_PASSWORD_RESET', entityId: id } }),
    ]);
    return { ok: true, login: user.login };
  }
  // Platform support: enter an organization as its owner to investigate and fix problems.
  // Short-lived (2 h), no refresh token, and audited in the organization's own log.
  @Post('organizations/:id/support')
  async support(@Param('id') id: string, @Req() req: AdminRequest) {
    const owner = await this.db.user.findFirst({ where: { organizationId: id, status: 'ACTIVE', roles: { some: { role: { systemKey: 'OWNER' } } } }, orderBy: { createdAt: 'asc' } });
    if (!owner) throw new NotFoundException('Active owner not found');
    const sessionId = randomBytes(16).toString('hex');
    await this.db.$transaction([
      this.db.session.create({ data: { id: sessionId, userId: owner.id, tokenFamilyId: 'support:' + sessionId, refreshTokenHash: hash(randomBytes(32).toString('hex')), expiresAt: new Date(Date.now() + 2 * 3600000) } }),
      this.db.auditLog.create({ data: { organizationId: id, actorId: 'platform:' + req.adminId, action: 'PLATFORM_SUPPORT_LOGIN', entityId: owner.id } }),
    ]);
    const accessToken = await this.jwt.signAsync({ sub: owner.id, sid: sessionId }, { algorithm: 'HS256', issuer: 'myservice', audience: 'myservice-api', expiresIn: '2h' });
    return { accessToken, expiresIn: 7200, owner: { login: owner.login, firstName: owner.firstName } };
  }
  // ---- Telegram bot ----
  /** Bot health as Telegram sees it: token, username, webhook URL and pending errors. */
  @Get('bot')
  async botStatus(@Req() req: AdminRequest) {
    const admin = await this.db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId }, select: { telegramChatId: true } });
    const info = await this.bot.telegram.call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo', {});
    return {
      configured: this.bot.telegram.enabled, username: this.bot.telegram.username, secretSet: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      expectedUrl: process.env.WEB_URL ? process.env.WEB_URL.replace(/\/$/, '') + '/api/telegram/webhook' : null,
      // Whether this server can talk to Telegram at all (outbound HTTPS to api.telegram.org).
      reachable: info.ok, error: info.ok ? null : info.description ?? 'HTTP ' + info.status,
      webhook: info.ok ? info.result : null, adminLinked: !!admin.telegramChatId,
      customersLinked: await this.db.customer.count({ where: { telegramChatId: { not: null } } }),
      staffLinked: await this.db.user.count({ where: { telegramChatId: { not: null } } }),
    };
  }
  /** Register the webhook and the command menu with Telegram (run once after setting the token). */
  @Post('bot/setup')
  async botSetup() {
    if (!this.bot.telegram.enabled) throw new BadRequestException('TELEGRAM_BOT_TOKEN is not set');
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.WEB_URL) throw new BadRequestException('TELEGRAM_WEBHOOK_SECRET and WEB_URL are required');
    const url = process.env.WEB_URL.replace(/\/$/, '') + '/api/telegram/webhook';
    const hook = await this.bot.telegram.call('setWebhook', { url, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: false });
    if (!hook.ok) throw new BadRequestException('setWebhook: ' + (hook.description ?? hook.status));
    await this.bot.telegram.call('setMyCommands', { commands: [
      { command: 'start', description: 'Boshlash' }, { command: 'orders', description: 'Buyurtmalarim' },
      { command: 'warranty', description: 'Kafolatlarim' }, { command: 'help', description: 'Yordam' }, { command: 'stop', description: "Xabarlarni o'chirish" },
    ] });
    await this.bot.telegram.call('setMyDescription', { description: "Qurilmangiz ta'mirini kuzating: holat, narx, kafolat. Telefon raqamingizni yuboring — buyurtmalaringizni topamiz." });
    return { ok: true, url };
  }
  /** Remove the webhook: the API then fetches updates itself (polling). For servers without working HTTPS. */
  @Post('bot/polling')
  async botPolling() {
    const res = await this.bot.telegram.call('deleteWebhook', { drop_pending_updates: false });
    if (!res.ok) throw new BadRequestException('deleteWebhook: ' + (res.description ?? res.status));
    return { ok: true };
  }
  /** One-time link that connects this admin's Telegram. */
  @Post('bot/link')
  async botLink(@Req() req: AdminRequest) {
    const url = await this.bot.connectLink('ADMIN', req.adminId);
    if (!url) throw new BadRequestException('TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are required');
    return { url };
  }
  @Get('analytics')
  async analytics() {
    const now=new Date(),since=new Date(Date.now()-30*86400000);
    const [totalOrganizations,newOrganizations,activeSubscriptions,trials,churned,active] = await Promise.all([
      this.db.organization.count(),this.db.organization.count({where:{createdAt:{gte:since}}}),
      this.db.subscription.count({where:{status:'ACTIVE',expiresAt:{gt:now}}}),this.db.subscription.count({where:{status:'TRIAL',expiresAt:{gt:now}}}),
      this.db.subscription.count({where:{status:{in:['SUSPENDED','EXPIRED']}}}),
      this.db.subscription.findMany({where:{status:'ACTIVE',expiresAt:{gt:now}},include:{plan:true}}),
    ]);
    const mrr=active.reduce((sum,item)=>sum.plus(item.plan.monthlyPrice),new Prisma.Decimal(0));
    return {totalOrganizations,activeOrganizations:activeSubscriptions+trials,activeSubscriptions,trials,newOrganizations,churned,churnRate:totalOrganizations?Number((churned/totalOrganizations*100).toFixed(2)):0,mrr};
  }
  @Get('invoices')
  invoices(){return this.db.subscriptionInvoice.findMany({orderBy:{issuedAt:'desc'},take:100})}
  @Get('usage')
  usage(){return this.db.usageRecord.findMany({orderBy:{period:'desc'},take:200})}
  /** The monitor's last checks; `run=1` checks now. */
  @Get('monitor')
  async monitorStatus(@Query('run') run?: string) { return run === '1' ? this.monitor.run() : this.monitor.last; }
  @Get('system')
  async system() { await this.db.$queryRaw`SELECT 1`; return {database:'ok',organizations:await this.db.organization.count(),activeSubscriptions:await this.db.subscription.count({where:{status:'ACTIVE',expiresAt:{gt:new Date()}}}),pendingOutbox:await this.db.outboxEvent.count({where:{publishedAt:null}}),failedNotifications:await this.db.notification.count({where:{status:'FAILED'}})}; }
}
@Module({imports:[BotModule,MonitorModule,JwtModule.registerAsync({useFactory:()=>({secret:process.env.JWT_ACCESS_SECRET!})})],controllers:[PlatformAuthController,PlatformController,LegalController],providers:[PlatformGuard,LoginRateGuard,SubscriptionCache]})
export class PlatformModule {}
