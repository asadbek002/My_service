import { Body, Controller, Get, Post, Param, Query, Res, Module, ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope, record } from '../orders/orders.module';
class ExpenseDto {
  @IsString() @Length(1,100) branchId!: string;
  @IsString() @Length(1,100) category!: string;
  @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount!: string;
  @IsString() @Length(3,1000) note!: string;
}
class SupplierDto {
  @IsString() @Length(1,200) name!: string;
  @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
  @IsOptional() @IsString() @Length(1,200) company?: string;
  @IsOptional() @IsString() @Length(1,100) telegram?: string;
  @IsOptional() @IsString() @Length(1,500) address?: string;
  @IsOptional() @IsString() @Length(1,2000) notes?: string;
}
class ClaimDto { @IsString() @Length(3,4000) reason!: string; }
function range(from?: string, to?: string) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const end = to ? new Date(to) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end || end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestException('Invalid range; maximum 366 days');
  return { gte: start, lte: end };
}
@Controller('expenses')
class ExpenseController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('reports.finance')
  list(@CurrentActor() a: Actor) { return this.db.expense.findMany({ where: { organizationId: a.organizationId, ...(!a.owner ? { branchId: { in: a.branchIds } } : {}) }, take: 100, orderBy: { createdAt: 'desc' } }); }
  @Post() @Permissions('expenses.manage')
  async create(@CurrentActor() a: Actor, @Body() d: ExpenseDto) {
    if (!a.owner && !a.branchIds.includes(d.branchId)) throw new NotFoundException();
    const branch = await this.db.branch.findFirst({ where: { id: d.branchId, organizationId: a.organizationId } });
    if (!branch) throw new NotFoundException();
    if (!new Prisma.Decimal(d.amount).greaterThan(0)) throw new BadRequestException('Positive amount required');
    return this.db.$transaction(async tx => {
      const expense = await tx.expense.create({ data: { ...d, organizationId: a.organizationId, actorId: a.userId } });
      await record(tx, a, expense.id, 'EXPENSE_CREATED'); return expense;
    });
  }
}
@Controller('suppliers')
class SuppliersController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('inventory.manage')
  list(@CurrentActor() a: Actor) { return this.db.supplier.findMany({ where: { organizationId: a.organizationId }, take: 100 }); }
  @Post() @Permissions('inventory.manage')
  create(@CurrentActor() a: Actor, @Body() d: SupplierDto) {
    return this.db.$transaction(async tx => {
      const supplier = await tx.supplier.create({ data: { ...d, organizationId: a.organizationId } });
      await record(tx, a, supplier.id, 'SUPPLIER_CREATED'); return supplier;
    });
  }
}
@Controller('reports')
class ReportsController {
  constructor(private readonly db: Database) {}
  @Get('dashboard') @Permissions('reports.view')
  async dashboard(@CurrentActor() a: Actor) {
    const scope = orderScope(a);
    const tashkentDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const today = new Date(tashkentDay + 'T00:00:00+05:00'); const week = new Date(today.getTime() - 6 * 86400000);
    const [groups,recent,orders,stocks,assignments] = await Promise.all([
      this.db.order.groupBy({ by: ['status'], where: scope, _count: true }),
      this.db.order.findMany({ where: scope, include: { customer: { select: { firstName: true } }, device: { select: { brand: true, model: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.db.order.findMany({ where: scope, select: { id: true, total: true, createdAt: true, status: true, payments: { select: { kind: true, amount: true, createdAt: true } }, history: { where: { toStatus: 'DELIVERED', createdAt: { gte: week } }, select: { createdAt: true } } } }),
      this.db.stock.findMany({ where: { organizationId: a.organizationId, ...(!a.owner ? { branchId: { in: a.branchIds } } : {}) }, include: { part: { select: { name: true, sku: true, minimumQuantity: true } }, branch: { select: { name: true } } } }),
      this.db.orderAssignment.findMany({ where: { organizationId: a.organizationId, order: { ...scope, status: { in: ['RECEIVED','DIAGNOSING','WAITING_CUSTOMER_APPROVAL','WAITING_PART','IN_REPAIR','READY'] } } }, include: { user: { select: { id: true, firstName: true } }, order: { select: { status: true } } } }),
    ]);
    const workload = [...assignments.reduce((map,row) => { const item=map.get(row.userId)??{id:row.user.id,name:row.user.firstName,active:0};item.active++;map.set(row.userId,item);return map; }, new Map<string,{id:string;name:string;active:number}>()).values()].sort((x,y)=>y.active-x.active);
    const lowStock = stocks.filter(stock => stock.onHand - stock.reserved <= stock.part.minimumQuantity).map(stock => ({ partId: stock.partId, name: stock.part.name, sku: stock.part.sku, branch: stock.branch.name, free: stock.onHand-stock.reserved, minimum: stock.part.minimumQuantity }));
    const base = { statuses: groups.map(g => ({ status: g.status, count: g._count })), todayReceived: orders.filter(o=>o.createdAt>=today).length, recent, workload, lowStock };
    if (!a.permissions.includes('reports.finance')) return base;
    const paid = (order: typeof orders[number]) => order.payments.reduce((sum,p)=>p.kind==='REFUND'?sum.minus(p.amount):sum.plus(p.amount),new Prisma.Decimal(0));
    const debt = orders.reduce((sum,o)=>sum.plus((o.total.minus(paid(o)).greaterThan(0)?o.total.minus(paid(o)):new Prisma.Decimal(0))),new Prisma.Decimal(0));
    const todayCash = orders.flatMap(o=>o.payments).filter(p=>p.createdAt>=today).reduce((sum,p)=>p.kind==='REFUND'?sum.minus(p.amount):sum.plus(p.amount),new Prisma.Decimal(0));
    const revenueByDay = Array.from({length:7},(_,offset)=>{const day=new Date(week.getTime()+offset*86400000);const next=new Date(day.getTime()+86400000);const revenue=orders.filter(o=>o.history.some(h=>h.createdAt>=day&&h.createdAt<next)).reduce((sum,o)=>sum.plus(o.total),new Prisma.Decimal(0));return{day:new Date(day.getTime()+5*3600000).toISOString().slice(0,10),revenue};});
    return { ...base, todayCash, debt, revenueByDay };
  }
  @Get('finance') @Permissions('reports.finance')
  async finance(@CurrentActor() a: Actor, @Query('from') from?: string, @Query('to') to?: string) {
    const createdAt = range(from,to);
    return this.db.$transaction(async tx => {
      const scope = orderScope(a);
      const payments = await tx.payment.groupBy({ by: ['kind'], where: { organizationId: a.organizationId, createdAt, order: scope }, _sum: { amount: true } });
      const expenses = await tx.expense.aggregate({ where: { organizationId: a.organizationId, createdAt, category: { not: 'PURCHASE' }, ...(!a.owner ? { branchId: { in: a.branchIds } } : {}) }, _sum: { amount: true } });
      const orders = await tx.order.findMany({ where: { ...scope, status: 'DELIVERED', history: { some: { toStatus: 'DELIVERED', createdAt } } }, include: { parts: { where: { status: 'USED' } } } });
      const revenue = orders.reduce((s,o) => s.plus(o.total), new Prisma.Decimal(0));
      const cost = orders.flatMap(o => o.parts).reduce((s,p) => s.plus(p.unitCost.mul(p.quantity)), new Prisma.Decimal(0));
      const received = payments.find(p => p.kind === 'PAYMENT')?._sum.amount ?? new Prisma.Decimal(0);
      const refunds = payments.find(p => p.kind === 'REFUND')?._sum.amount ?? new Prisma.Decimal(0);
      return { revenue, received, refunds, netCash: received.minus(refunds), partCost: cost, operatingExpenses: expenses._sum.amount ?? 0, contributionAfterExpenses: revenue.minus(cost).minus(expenses._sum.amount ?? 0), basis: 'Delivered order revenue minus installed part snapshots and non-PURCHASE expenses; cash flows shown separately. Not statutory accounting.' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  @Get('export') @Permissions('reports.view')
  async export(@CurrentActor() a: Actor,@Res() res: Response,@Query('from') from?: string,@Query('to') to?: string){
    const subscription=await this.db.subscription.findUnique({where:{organizationId:a.organizationId},include:{plan:true}});const flags=subscription?.plan.features as Record<string,unknown>|undefined;if(!flags?.exports)throw new ForbiddenException('EXPORTS_NOT_IN_PLAN');
    const createdAt=range(from,to);const orders=await this.db.order.findMany({where:{...orderScope(a),createdAt},include:{customer:{select:{firstName:true,phone:true}},device:{select:{brand:true,model:true,imei:true}},payments:{select:{kind:true,amount:true}}},orderBy:{createdAt:'asc'}});
    const cell=(value:unknown)=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
    const rows=[['order','created_at','status','customer','phone','device','imei','total','paid','balance'],...orders.map(order=>{const paid=order.payments.reduce((sum,p)=>p.kind==='REFUND'?sum.minus(p.amount):sum.plus(p.amount),new Prisma.Decimal(0));return[order.number,order.createdAt.toISOString(),order.status,order.customer.firstName,order.customer.phone,order.device.brand+' '+order.device.model,order.device.imei??'',order.total.toString(),paid.toString(),order.total.minus(paid).toString()]})];
    const csv='\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="myservice-orders.csv"');res.setHeader('Cache-Control','private, no-store');res.send(csv);
  }
  @Get('technicians') @Permissions('reports.view')
  async technicians(@CurrentActor() a: Actor) {
    const users = await this.db.user.findMany({ where: { organizationId: a.organizationId, ...(!a.owner ? { branches: { some: { branchId: { in: a.branchIds } } } } : {}), roles: { some: { role: { systemKey: 'TECHNICIAN' } } } }, select: { id: true, firstName: true } });
    return Promise.all(users.map(async user => {
      const assignments = await this.db.orderAssignment.findMany({ where: { organizationId: a.organizationId, userId: user.id, order: orderScope(a) }, include: { order: { select: { status: true } } } });
      const commission = await this.db.commissionEntry.aggregate({ where: { organizationId: a.organizationId, userId: user.id, order: orderScope(a) }, _sum: { amount: true } });
      const sessions = await this.db.repairSession.findMany({ where: { organizationId: a.organizationId, userId: user.id, endedAt: { not: null }, order: orderScope(a) } });
      return { ...user, assigned: assignments.length, completed: assignments.filter(x => x.order.status === 'DELIVERED').length, repairSeconds: sessions.reduce((n,s) => n + Math.max(0, (s.endedAt!.getTime() - s.startedAt.getTime()) / 1000),0), commission: commission._sum.amount ?? 0 };
    }));
  }
}
@Controller('search')
class SearchController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  async search(@CurrentActor() a: Actor, @Query('q') q = '') {
    if (q.trim().length < 2) return [];
    const query = q.trim().slice(0,100);
    return this.db.order.findMany({ where: { ...orderScope(a), OR: [
      { number: { contains: query, mode: 'insensitive' } }, { customer: { phone: { contains: query } } },
      { customer: { firstName: { contains: query, mode: 'insensitive' } } }, { device: { imei: { contains: query } } },
      { device: { serialNumber: { contains: query } } }, { device: { model: { contains: query, mode: 'insensitive' } } },
    ] }, select: { id: true, number: true, status: true, device: { select: { model: true } } }, take: 30 });
  }
}
@Controller('warranties')
class WarrantyController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  list(@CurrentActor() a: Actor) { return this.db.warranty.findMany({ where: { organizationId: a.organizationId, order: orderScope(a) }, include: { order: { select: { id: true, number: true, status: true, customer: { select: { firstName: true, phone: true } }, device: { select: { brand: true, model: true } } } } }, take: 100, orderBy: { endDate: 'desc' } }); }
  @Post(':id/claim') @Permissions('orders.create')
  claim(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: ClaimDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${a.organizationId} FOR UPDATE`;
      const warranty = await tx.warranty.findFirst({ where: { id, organizationId: a.organizationId, order: orderScope(a) }, include: { order: true } });
      if (!warranty) throw new NotFoundException();
      if (warranty.endDate <= new Date()) throw new ConflictException('Warranty expired');
      const parent = warranty.order;
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const counter = await tx.orderCounter.upsert({ where: { organizationId_day: { organizationId: a.organizationId, day } }, create: { organizationId: a.organizationId, day, value: 1 }, update: { value: { increment: 1 } } });
      const order = await tx.order.create({ data: { organizationId: a.organizationId, branchId: parent.branchId, customerId: parent.customerId, deviceId: parent.deviceId, parentOrderId: parent.id, number: 'MS-' + day.replaceAll('-','').slice(2) + '-' + String(counter.value).padStart(3,'0'), complaint: d.reason, accessories: [], condition: [] } });
      await tx.warrantyClaim.create({ data: { organizationId: a.organizationId, parentOrderId: parent.id, newOrderId: order.id, reason: d.reason } });
      await tx.orderHistory.create({ data: { organizationId: a.organizationId, orderId: order.id, toStatus: 'RECEIVED', actorId: a.userId, comment: 'Warranty claim' } });
      await record(tx,a,order.id,'ORDER_RECEIVED'); return order;
    });
  }
}
@Module({ controllers: [ExpenseController,SuppliersController,ReportsController,SearchController,WarrantyController] })
export class ManagementModule {}
