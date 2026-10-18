import { Body, Controller, Get, HttpCode, HttpException, Module, NotFoundException, BadRequestException, Param, Post, Put } from '@nestjs/common';
import { IsIn, IsString, Length } from 'class-validator';
import { Database } from '../database';
import { AllowBlocked, CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { BotModule } from '../bot/bot.module';
import { BotService } from '../bot/bot.service';
import { esc, som, tashkentDay } from '../bot/telegram.client';
import { billingSettings, yearlyPriceOf } from '../platform/billing';

class PlanChoiceDto {
  @IsString() @Length(1, 100) planId!: string;
  @IsIn(['MONTH', 'YEAR']) period!: 'MONTH' | 'YEAR';
}
class TicketDto {
  @IsString() @Length(3, 120) subject!: string;
  @IsString() @Length(1, 4000) body!: string;
}
class MessageDto { @IsString() @Length(1, 4000) body!: string; }

/** First instant of this month in Tashkent. */
const monthStart = () => new Date(tashkentDay().slice(0, 7) + '-01T00:00:00+05:00');
const DAY = 86400000;

/** "Hisobim": the service's plan, how long it runs, what it used this month, plans to choose, invoices. */
@Controller('account')
class AccountController {
  constructor(private readonly db: Database, private readonly bot: BotService) {}

  @Get() @Permissions('settings.manage') @AllowBlocked()
  async account(@CurrentActor() a: Actor) {
    const since = monthStart();
    const [org, sub, settings, plans, orders, sms, staff, branches, invoices] = await Promise.all([
      this.db.organization.findUniqueOrThrow({ where: { id: a.organizationId }, select: { name: true, createdAt: true, blockedAt: true, blockReason: true } }),
      this.db.subscription.findUnique({ where: { organizationId: a.organizationId }, include: { plan: true } }),
      billingSettings(this.db),
      this.db.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }] }),
      this.db.order.count({ where: { organizationId: a.organizationId, createdAt: { gte: since } } }),
      this.db.usageRecord.findMany({ where: { organizationId: a.organizationId, period: tashkentDay().slice(0, 7), metric: { in: ['sms', 'sms_extra'] } } }),
      this.db.user.count({ where: { organizationId: a.organizationId, status: { not: 'ARCHIVED' } } }),
      this.db.branch.count({ where: { organizationId: a.organizationId } }),
      this.db.subscriptionInvoice.findMany({ where: { organizationId: a.organizationId }, orderBy: { issuedAt: 'desc' }, take: 24 }),
    ]);
    const smsOwn = (await this.db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: a.organizationId, key: 'sms' } } }))?.value as { mode?: string } | undefined;
    const smsSent = sms.find(r => r.metric === 'sms')?.quantity ?? 0, smsExtra = sms.find(r => r.metric === 'sms_extra')?.quantity ?? 0;
    const now = Date.now();
    const end = sub ? (sub.graceUntil ?? sub.expiresAt) : null;
    const shown = sub && !plans.some(p => p.id === sub.planId) ? [...plans, sub.plan] : plans;
    const plan = (p: (typeof plans)[number]) => ({
      id: p.id, name: p.name, description: p.description, monthlyPrice: p.monthlyPrice, yearlyTotal: yearlyPriceOf(p, settings),
      maxStaff: p.maxStaff, maxBranches: p.maxBranches, monthlyOrders: p.monthlyOrders, smsPerMonth: p.smsPerMonth, features: p.features,
      // The current plan is listed even when hidden, but cannot be chosen again.
      available: p.active,
    });
    return {
      organization: { name: org.name, createdAt: org.createdAt, blocked: org.blockedAt ? { at: org.blockedAt, reason: org.blockReason } : null },
      subscription: sub ? {
        status: sub.status, expiresAt: sub.expiresAt, graceUntil: sub.graceUntil,
        daysLeft: Math.max(0, Math.ceil((sub.expiresAt.getTime() - now) / DAY)),
        inGrace: sub.expiresAt.getTime() <= now && !!end && end.getTime() > now,
        readOnly: !['ACTIVE', 'TRIAL'].includes(sub.status) || !end || end.getTime() <= now,
        plan: plan(sub.plan), nextPlanId: sub.nextPlanId, billingPeriod: sub.billingPeriod,
      } : null,
      usage: {
        month: tashkentDay().slice(0, 7),
        orders, ordersLimit: sub?.plan.monthlyOrders ?? null,
        // Platform SMS only: an own Eskiz account is paid by the service and not limited here.
        sms: smsSent, smsLimit: sub?.plan.smsPerMonth ?? null, smsExtra, smsExtraCost: (smsExtra * Number(settings.extraSmsPrice)).toFixed(2), smsOwnAccount: smsOwn?.mode === 'own',
        staff, staffLimit: sub?.plan.maxStaff ?? null,
        branches, branchesLimit: sub?.plan.maxBranches ?? null,
      },
      plans: shown.map(plan),
      billing: { extraSmsPrice: settings.extraSmsPrice, yearlyFreeMonths: settings.yearlyFreeMonths },
      invoices: invoices.map(i => ({ id: i.id, amount: i.amount, status: i.status, issuedAt: i.issuedAt, dueAt: i.dueAt })),
    };
  }

  /**
   * The owner picks the plan and period for the next payment. It takes effect when paid
   * (Click/Payme, or the platform marks it paid); the platform is told at once.
   */
  @Put('plan') @Permissions('settings.manage') @AllowBlocked()
  async choosePlan(@CurrentActor() a: Actor, @Body() d: PlanChoiceDto) {
    const plan = await this.db.plan.findFirst({ where: { id: d.planId, active: true } });
    if (!plan) throw new BadRequestException('Plan not available');
    const [org, settings] = await Promise.all([this.db.organization.findUniqueOrThrow({ where: { id: a.organizationId } }), billingSettings(this.db)]);
    await this.db.subscription.update({ where: { organizationId: a.organizationId }, data: { nextPlanId: plan.id, billingPeriod: d.period } });
    await this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'PLAN_CHOSEN', entityId: plan.id, newValue: { period: d.period } } });
    const price = d.period === 'YEAR' ? yearlyPriceOf(plan, settings) : plan.monthlyPrice.toFixed(2);
    void this.bot.notifyAdmins(`💳 <b>${esc(org.name)}</b> tarif tanladi: <b>${esc(plan.name)}</b>, ${d.period === 'YEAR' ? 'yillik' : 'oylik'} — ${som(price)}`).catch(() => undefined);
    return { ok: true, nextPlanId: plan.id, billingPeriod: d.period, amount: price };
  }
}

/** Questions from a service to the platform, as threads. Open even when the service is blocked. */
@Controller('support')
class SupportController {
  constructor(private readonly db: Database, private readonly bot: BotService) {}

  @Get('tickets') @AllowBlocked()
  async tickets(@CurrentActor() a: Actor) {
    const rows = await this.db.supportTicket.findMany({
      where: { organizationId: a.organizationId }, orderBy: { updatedAt: 'desc' }, take: 50,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { messages: true } } },
    });
    return rows.map(({ messages, _count, ...t }) => ({ ...t, last: messages[0] ?? null, messages: _count.messages }));
  }
  @Get('tickets/:id') @AllowBlocked()
  async ticket(@CurrentActor() a: Actor, @Param('id') id: string) {
    const t = await this.db.supportTicket.findFirst({ where: { id, organizationId: a.organizationId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException();
    return t;
  }
  @Post('tickets') @AllowBlocked()
  async open(@CurrentActor() a: Actor, @Body() d: TicketDto) {
    const today = await this.db.supportTicket.count({ where: { organizationId: a.organizationId, createdAt: { gte: new Date(Date.now() - DAY) } } });
    if (today >= 20) throw new HttpException('TOO_MANY_TICKETS', 429);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: a.userId }, include: { organization: true } });
    const ticket = await this.db.supportTicket.create({ data: {
      organizationId: a.organizationId, userId: a.userId, subject: d.subject.trim(),
      messages: { create: { author: 'SERVICE', authorName: user.firstName, body: d.body.trim() } },
    } });
    void this.bot.notifyAdmins(`🆘 Yangi murojaat — <b>${esc(user.organization.name)}</b> (${esc(user.firstName)}, ${esc(user.phone)})\n<b>${esc(ticket.subject)}</b>\n${esc(d.body.trim().slice(0, 500))}`).catch(() => undefined);
    return ticket;
  }
  @Post('tickets/:id/messages') @AllowBlocked() @HttpCode(201)
  async reply(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: MessageDto) {
    const t = await this.db.supportTicket.findFirst({ where: { id, organizationId: a.organizationId }, include: { organization: true } });
    if (!t) throw new NotFoundException();
    const user = await this.db.user.findUniqueOrThrow({ where: { id: a.userId } });
    // Writing again reopens a closed or answered thread: the platform has to look at it.
    const [message] = await this.db.$transaction([
      this.db.supportMessage.create({ data: { ticketId: id, author: 'SERVICE', authorName: user.firstName, body: d.body.trim() } }),
      this.db.supportTicket.update({ where: { id }, data: { status: 'OPEN' } }),
    ]);
    void this.bot.notifyAdmins(`💬 <b>${esc(t.organization.name)}</b> — «${esc(t.subject)}»\n${esc(d.body.trim().slice(0, 500))}`).catch(() => undefined);
    return message;
  }
  @Post('tickets/:id/close') @AllowBlocked() @HttpCode(200)
  async close(@CurrentActor() a: Actor, @Param('id') id: string) {
    const done = await this.db.supportTicket.updateMany({ where: { id, organizationId: a.organizationId }, data: { status: 'CLOSED' } });
    if (!done.count) throw new NotFoundException();
    return { ok: true };
  }
}

@Controller('announcements')
class AnnouncementsController {
  constructor(private readonly db: Database) {}
  @Get() @AllowBlocked()
  list() { return this.db.announcement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, body: true, level: true, createdAt: true } }); }
}

@Module({ imports: [BotModule], controllers: [AccountController, SupportController, AnnouncementsController] })
export class AccountModule {}
