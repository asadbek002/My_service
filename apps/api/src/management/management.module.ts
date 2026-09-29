import { Body, Controller, Get, Post, Param, Query, Res, Module, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { OPEN_STATUSES, defaultBranch, nextOrderNumber, orderScope, record } from '../orders/orders.module';

class ExpenseDto {
  @IsString() @Length(1,100) category!: string;
  @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount!: string;
  @IsString() @Length(3,1000) note!: string;
}
class ClaimDto { @IsString() @Length(3,4000) reason!: string; }

const tashkentDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const startOfDay = (day: string) => new Date(day + 'T00:00:00+05:00');
function range(from?: string, to?: string) {
  const start = from ? new Date(from) : startOfDay(tashkentDay().slice(0, 8) + '01');
  const end = to ? new Date(to) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end || end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestException('Invalid range; maximum 366 days');
  return { gte: start, lte: end };
}
const paidOf = (payments: { kind: string; amount: Prisma.Decimal }[]) => payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));

@Controller('expenses')
class ExpenseController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('reports.finance')
  list(@CurrentActor() a: Actor) { return this.db.expense.findMany({ where: { organizationId: a.organizationId }, take: 200, orderBy: { createdAt: 'desc' } }); }
  @Post() @Permissions('expenses.manage')
  async create(@CurrentActor() a: Actor, @Body() d: ExpenseDto) {
    if (!new Prisma.Decimal(d.amount).greaterThan(0)) throw new BadRequestException('Positive amount required');
    return this.db.$transaction(async tx => {
      const branch = await defaultBranch(tx, a);
      const expense = await tx.expense.create({ data: { ...d, branchId: branch.id, organizationId: a.organizationId, actorId: a.userId } });
      await record(tx, a, expense.id, 'EXPENSE_CREATED'); return expense;
    });
  }
}

@Controller('reports')
class ReportsController {
  constructor(private readonly db: Database) {}
  @Get('dashboard') @Permissions('reports.view')
  async dashboard(@CurrentActor() a: Actor) {
    const scope = orderScope(a);
    const today = startOfDay(tashkentDay()), monthStart = startOfDay(tashkentDay().slice(0, 8) + '01'), week = new Date(today.getTime() - 6 * 86400000);
    const [groups, recent, open, payments] = await Promise.all([
      this.db.order.groupBy({ by: ['status'], where: { ...scope, status: { in: OPEN_STATUSES } }, _count: true }),
      this.db.order.findMany({ where: scope, include: { customer: { select: { firstName: true, phone: true } }, device: { select: { brand: true, model: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.db.order.findMany({ where: { ...scope, status: { not: 'CANCELLED' } }, select: { total: true, payments: { select: { kind: true, amount: true } } } }),
      this.db.payment.findMany({ where: { organizationId: a.organizationId, order: scope, createdAt: { gte: monthStart < week ? monthStart : week } }, select: { kind: true, amount: true, createdAt: true } }),
    ]);
    const debt = open.reduce((s, o) => { const left = o.total.minus(paidOf(o.payments)); return left.greaterThan(0) ? s.plus(left) : s; }, new Prisma.Decimal(0));
    const cashByDay = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(week.getTime() + i * 86400000), next = new Date(day.getTime() + 86400000);
      return { day: tashkentDay(day), revenue: paidOf(payments.filter(p => p.createdAt >= day && p.createdAt < next)) };
    });
    return {
      statuses: groups.map(g => ({ status: g.status, count: g._count })),
      todayReceived: await this.db.order.count({ where: { ...scope, createdAt: { gte: today } } }),
      recent,
      todayCash: paidOf(payments.filter(p => p.createdAt >= today)),
      monthCash: paidOf(payments.filter(p => p.createdAt >= monthStart)),
      debt,
      revenueByDay: cashByDay,
    };
  }
  @Get('finance') @Permissions('reports.finance')
  async finance(@CurrentActor() a: Actor, @Query('from') from?: string, @Query('to') to?: string) {
    const period = range(from, to);
    return this.db.$transaction(async tx => {
      const scope = orderScope(a);
      const [delivered, payments, expenses, received, debtors, shopDebt] = await Promise.all([
        tx.order.findMany({ where: { ...scope, status: 'DELIVERED', history: { some: { toStatus: 'DELIVERED', createdAt: period } } }, select: { labor: true, partsTotal: true, total: true } }),
        tx.payment.groupBy({ by: ['kind'], where: { organizationId: a.organizationId, createdAt: period, order: scope }, _sum: { amount: true } }),
        tx.expense.groupBy({ by: ['category'], where: { organizationId: a.organizationId, createdAt: period }, _sum: { amount: true } }),
        tx.order.count({ where: { ...scope, createdAt: period } }),
        tx.order.findMany({ where: { ...scope, status: { not: 'CANCELLED' } }, include: { customer: { select: { firstName: true, lastName: true, phone: true } }, device: { select: { brand: true, model: true } }, payments: { select: { kind: true, amount: true } } }, orderBy: { createdAt: 'desc' } }),
        tx.sourcedPart.aggregate({ where: { organizationId: a.organizationId, status: 'TAKEN' }, _sum: { cost: true } }),
      ]);
      const sum = (xs: Prisma.Decimal[]) => xs.reduce((s, x) => s.plus(x), new Prisma.Decimal(0));
      const revenue = sum(delivered.map(o => o.total)), labor = sum(delivered.map(o => o.labor)), parts = sum(delivered.map(o => o.partsTotal));
      const cashIn = payments.find(p => p.kind === 'PAYMENT')?._sum.amount ?? new Prisma.Decimal(0);
      const refunds = payments.find(p => p.kind === 'REFUND')?._sum.amount ?? new Prisma.Decimal(0);
      // Parts bought for repairs (PURCHASE) are already covered by the parts amount charged to the customer.
      const operating = sum(expenses.filter(e => e.category !== 'PURCHASE').map(e => e._sum.amount ?? new Prisma.Decimal(0)));
      const debtorRows = debtors.map(o => ({ id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, customer: o.customer, device: o.device, balance: o.total.minus(paidOf(o.payments)) }))
        .filter(o => o.balance.greaterThan(0)).slice(0, 100);
      return {
        from: period.gte, to: period.lte,
        received, delivered: delivered.length,
        revenue, labor, parts, averageCheck: delivered.length ? revenue.div(delivered.length).toDecimalPlaces(0) : new Prisma.Decimal(0),
        cashIn, refunds, netCash: cashIn.minus(refunds),
        expenses: expenses.map(e => ({ category: e.category, amount: e._sum.amount ?? 0 })), operatingExpenses: operating,
        profit: labor.minus(operating),
        debt: sum(debtorRows.map(o => o.balance)), debtors: debtorRows,
        // What the shop still owes nearby stores for parts taken on credit (not yet paid or returned).
        shopDebt: shopDebt._sum.cost ?? new Prisma.Decimal(0),
        basis: "Tushum — shu davrda topshirilgan buyurtmalar. Foyda = usta haqi − xarajatlar (zapchast xaridi hisobga olinmaydi).",
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  @Get('export') @Permissions('reports.view')
  async export(@CurrentActor() a: Actor, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    const createdAt = range(from, to);
    const orders = await this.db.order.findMany({ where: { ...orderScope(a), createdAt }, include: { customer: { select: { firstName: true, phone: true } }, device: { select: { brand: true, model: true } }, payments: { select: { kind: true, amount: true } } }, orderBy: { createdAt: 'asc' } });
    const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[=+\-@]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
    const rows = [['buyurtma', 'sana', 'holat', 'mijoz', 'telefon', 'qurilma', 'usta_haqi', 'zapchast', 'jami', 'tolangan', 'qoldiq'], ...orders.map(o => {
      const paid = paidOf(o.payments);
      return [o.number, o.createdAt.toISOString(), o.status, o.customer.firstName, o.customer.phone, o.device.brand + ' ' + o.device.model, o.labor.toString(), o.partsTotal.toString(), o.total.toString(), paid.toString(), o.total.minus(paid).toString()];
    })];
    const csv = '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="buyurtmalar.csv"'); res.setHeader('Cache-Control', 'private, no-store'); res.send(csv);
  }
}

@Controller('search')
class SearchController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  async search(@CurrentActor() a: Actor, @Query('q') q = '') {
    if (q.trim().length < 2) return [];
    const query = q.trim().slice(0, 100);
    return this.db.order.findMany({ where: { ...orderScope(a), OR: [
      { number: { contains: query, mode: 'insensitive' } }, { customer: { phone: { contains: query.replace(/\s/g, '') } } },
      { customer: { firstName: { contains: query, mode: 'insensitive' } } }, { device: { model: { contains: query, mode: 'insensitive' } } },
      { device: { brand: { contains: query, mode: 'insensitive' } } },
    ] }, select: { id: true, number: true, status: true, customer: { select: { firstName: true, phone: true } }, device: { select: { brand: true, model: true } } }, orderBy: { createdAt: 'desc' }, take: 30 });
  }
}

@Controller('warranties')
class WarrantyController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  list(@CurrentActor() a: Actor) { return this.db.warranty.findMany({ where: { organizationId: a.organizationId, order: orderScope(a) }, include: { order: { select: { id: true, number: true, status: true, customer: { select: { firstName: true, phone: true } }, device: { select: { brand: true, model: true } } } } }, take: 200, orderBy: { endDate: 'desc' } }); }
  @Post(':id/claim') @Permissions('orders.create')
  claim(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: ClaimDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${a.organizationId} FOR UPDATE`;
      const warranty = await tx.warranty.findFirst({ where: { id, organizationId: a.organizationId, order: orderScope(a) }, include: { order: true } });
      if (!warranty) throw new NotFoundException();
      if (warranty.endDate <= new Date()) throw new ConflictException('Warranty expired');
      const parent = warranty.order;
      const { number } = await nextOrderNumber(tx, a.organizationId);
      // Warranty repair: free unless the price is changed on the new order.
      const order = await tx.order.create({ data: { organizationId: a.organizationId, branchId: parent.branchId, customerId: parent.customerId, deviceId: parent.deviceId, parentOrderId: parent.id, number, complaint: d.reason, accessories: [], condition: [] } });
      await tx.warrantyClaim.create({ data: { organizationId: a.organizationId, parentOrderId: parent.id, newOrderId: order.id, reason: d.reason } });
      await tx.orderHistory.create({ data: { organizationId: a.organizationId, orderId: order.id, toStatus: 'RECEIVED', actorId: a.userId, comment: 'Kafolat bo‘yicha qabul (' + parent.number + ')' } });
      await record(tx, a, order.id, 'ORDER_RECEIVED'); return order;
    });
  }
}

@Module({ controllers: [ExpenseController, ReportsController, SearchController, WarrantyController] })
export class ManagementModule {}
