import { Module, Controller, Get, Post, Patch, Body, Param, Query, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { CustomerDto, DeviceDto, OrderDto, PriceDto, ComplaintDto, StatusDto, PaymentDto, RefundDto, DeliverDto } from './orders.dto';

// Simplified flow: RECEIVED → IN_REPAIR → READY → DELIVERED, CANCELLED from any open state.
export const OPEN_STATUSES = ['RECEIVED', 'IN_REPAIR', 'READY'];
const TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['IN_REPAIR', 'READY', 'CANCELLED'],
  IN_REPAIR: ['READY', 'RECEIVED', 'CANCELLED'],
  READY: ['IN_REPAIR', 'CANCELLED'],
};
const DEFAULT_WARRANTY_TERMS = "Ta'mirlangan qism va bajarilgan ish uchun kafolat. Namlik, zarba va boshqa ustaxonada ochilgan holatlarga tatbiq etilmaydi.";

export function customerScope(actor: Actor): Prisma.CustomerWhereInput {
  return actor.owner ? {} : { OR: [{ orders: { none: {} } }, { orders: { some: { branchId: { in: actor.branchIds } } } }] };
}
export function orderScope(actor: Actor): Prisma.OrderWhereInput {
  return { organizationId: actor.organizationId, ...(!actor.owner ? { branchId: { in: actor.branchIds } } : {}) };
}
export async function lockedOrder(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
  const order = await tx.order.findFirst({ where: { id, ...orderScope(actor) } });
  if (!order) throw new NotFoundException('Order not found');
  return order;
}
export async function record(tx: Prisma.TransactionClient, actor: Actor, id: string, action: string, oldValue?: Prisma.InputJsonValue, newValue?: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action, entityId: id, ...(actor.ip ? { ip: actor.ip } : {}), ...(oldValue !== undefined ? { oldValue } : {}), ...(newValue !== undefined ? { newValue } : {}) } });
  await tx.outboxEvent.create({ data: { organizationId: actor.organizationId, type: action, entityId: id, payload: { actorId: actor.userId } } });
}
export async function transition(tx: Prisma.TransactionClient, actor: Actor, order: { id: string; status: string }, toStatus: string, comment?: string) {
  await tx.order.update({ where: { id: order.id }, data: { status: toStatus } });
  await tx.orderHistory.create({ data: { organizationId: actor.organizationId, orderId: order.id, fromStatus: order.status, toStatus, actorId: actor.userId, ...(comment ? { comment } : {}) } });
  await record(tx, actor, order.id, 'ORDER_' + toStatus);
}
/** Paid amount (payments minus refunds) and what is still owed. */
export async function paidOf(tx: Prisma.TransactionClient, organizationId: string, orderId: string, total: Prisma.Decimal) {
  const payments = await tx.payment.findMany({ where: { organizationId, orderId }, select: { kind: true, amount: true } });
  const paid = payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
  return { paid, balance: total.minus(paid) };
}
function orderNumberDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export async function nextOrderNumber(tx: Prisma.TransactionClient, organizationId: string) {
  const day = orderNumberDay();
  const counter = await tx.orderCounter.upsert({ where: { organizationId_day: { organizationId, day } }, create: { organizationId, day, value: 1 }, update: { value: { increment: 1 } } });
  return { day, number: 'MS-' + day.replaceAll('-', '').slice(2) + '-' + String(counter.value).padStart(3, '0') };
}
/** The organization's branch for new work: branches are not chosen in the simplified product. */
export async function defaultBranch(tx: Prisma.TransactionClient, actor: Actor) {
  const branch = await tx.branch.findFirst({ where: { organizationId: actor.organizationId, ...(!actor.owner ? { id: { in: actor.branchIds } } : {}) }, orderBy: { createdAt: 'asc' } });
  if (branch) return branch;
  // Onboarding always creates one; recreate it if it was ever lost.
  return tx.branch.create({ data: { organizationId: actor.organizationId, name: 'Asosiy filial' } });
}

@ApiTags('customers') @ApiBearerAuth()
@Controller('customers')
class CustomersController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('customers.view')
  list(@CurrentActor() actor: Actor, @Query('q') q?: string) {
    const text = q?.trim().slice(0, 100);
    return this.db.customer.findMany({ where: {
      organizationId: actor.organizationId,
      AND: [
        ...(text ? [{ OR: [{ phone: { contains: text.replace(/\s/g, '') } }, { firstName: { contains: text, mode: 'insensitive' as const } }, { lastName: { contains: text, mode: 'insensitive' as const } }] }] : []),
        customerScope(actor),
      ],
    }, include: { devices: { select: { id: true, category: true, brand: true, model: true } } }, take: 50, orderBy: { createdAt: 'desc' } });
  }
  @Post() @Permissions('customers.edit')
  async create(@CurrentActor() actor: Actor, @Body() dto: CustomerDto) {
    try {
      return await this.db.$transaction(async tx => {
        const c = await tx.customer.create({ data: { organizationId: actor.organizationId, firstName: dto.firstName, phone: dto.phone, ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}), ...(dto.telegramUsername !== undefined ? { telegramUsername: dto.telegramUsername.replace(/^@/, '') } : {}), ...(dto.notificationPreference !== undefined ? { notificationPreference: dto.notificationPreference } : {}), ...(dto.notes !== undefined ? { notes: dto.notes } : {}) }, include: { devices: true } });
        await record(tx, actor, c.id, 'CUSTOMER_CREATED'); return c;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Customer phone already exists');
      throw e;
    }
  }
  @Get(':id') @Permissions('customers.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const c = await this.db.customer.findFirst({ where: { id, organizationId: actor.organizationId, ...customerScope(actor) }, include: { devices: true, orders: { where: orderScope(actor), include: { device: true, payments: true }, orderBy: { createdAt: 'desc' } } } });
    if (!c) throw new NotFoundException();
    const paid = (o: typeof c.orders[number]) => o.payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
    const totalSpent = c.orders.reduce((s, o) => s.plus(paid(o)), new Prisma.Decimal(0));
    const debt = c.orders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => { const left = o.total.minus(paid(o)); return left.greaterThan(0) ? s.plus(left) : s; }, new Prisma.Decimal(0));
    const notifications = await this.db.notification.findMany({ where: { organizationId: actor.organizationId, orderId: { in: c.orders.map(o => o.id) } }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { ...c, stats: { orders: c.orders.length, devices: c.devices.length, totalSpent: totalSpent.toString(), debt: debt.toString() }, notifications };
  }
}

@ApiTags('devices') @ApiBearerAuth()
@Controller('devices')
class DevicesController {
  constructor(private readonly db: Database) {}
  @Get(':id') @Permissions('customers.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const device = await this.db.device.findFirst({ where: { id, organizationId: actor.organizationId, customer: customerScope(actor) }, include: { customer: true, orders: { where: orderScope(actor), orderBy: { createdAt: 'desc' } } } });
    if (!device) throw new NotFoundException(); return device;
  }
  @Post() @Permissions('customers.edit')
  async create(@CurrentActor() actor: Actor, @Body() dto: DeviceDto) {
    const customer = await this.db.customer.findFirst({ where: { id: dto.customerId, organizationId: actor.organizationId, ...customerScope(actor) } });
    if (!customer) throw new NotFoundException();
    return this.db.$transaction(async tx => {
      const device = await tx.device.create({ data: { organizationId: actor.organizationId, customerId: dto.customerId, category: dto.category, brand: dto.brand, model: dto.model } });
      await record(tx, actor, device.id, 'DEVICE_CREATED'); return device;
    });
  }
}

@ApiTags('orders') @ApiBearerAuth()
@Controller('orders')
class OrdersController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  list(@CurrentActor() actor: Actor, @Query('status') status?: string) {
    const filter = status === 'open' ? { status: { in: OPEN_STATUSES } } : status && /^[A-Z_]{3,30}$/.test(status) ? { status } : {};
    return this.db.order.findMany({ where: { ...orderScope(actor), ...filter }, include: { customer: true, device: true, payments: { select: { kind: true, amount: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  @Get(':id') @Permissions('orders.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const order = await this.db.order.findFirst({
      where: { id, ...orderScope(actor) },
      include: { customer: true, device: true, history: { orderBy: { createdAt: 'asc' } }, payments: { orderBy: { createdAt: 'asc' } }, warranty: true },
    });
    if (!order) throw new NotFoundException();
    const totalPaid = order.payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
    const actorIds = [...new Set([...order.history.map(h => h.actorId), ...order.payments.map(p => p.actorId)].filter((x): x is string => !!x))];
    const users = await this.db.user.findMany({ where: { organizationId: actor.organizationId, id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } });
    const actorNames = Object.fromEntries(users.map(u => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ')]));
    return { ...order, totalPaid: totalPaid.toString(), balance: order.total.minus(totalPaid).toString(), actorNames };
  }
  @Post() @Permissions('orders.create')
  async create(@CurrentActor() actor: Actor, @Body() dto: OrderDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
      const device = await tx.device.findFirst({ where: { id: dto.deviceId, customerId: dto.customerId, organizationId: actor.organizationId } });
      if (!device) throw new NotFoundException('Device not found');
      const sub = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
      if (!sub || !['ACTIVE', 'TRIAL'].includes(sub.status) || (sub.graceUntil ?? sub.expiresAt) <= new Date()) throw new ForbiddenException('SUBSCRIPTION_READ_ONLY');
      const { day, number } = await nextOrderNumber(tx, actor.organizationId);
      if (sub.plan.monthlyOrders !== null) {
        const monthStart = new Date(day.slice(0, 7) + '-01T00:00:00+05:00');
        // The counter row for today already includes this order, so count existing ones only.
        const count = await tx.order.count({ where: { organizationId: actor.organizationId, createdAt: { gte: monthStart } } });
        if (count >= sub.plan.monthlyOrders) throw new ForbiddenException('MONTHLY_ORDER_LIMIT');
      }
      const branch = await defaultBranch(tx, actor);
      const labor = new Prisma.Decimal(dto.labor), partsTotal = new Prisma.Decimal(dto.partsTotal);
      const order = await tx.order.create({ data: {
        organizationId: actor.organizationId, branchId: branch.id, customerId: dto.customerId, deviceId: dto.deviceId, number,
        complaint: dto.complaint, accessories: dto.accessories, condition: [], labor, partsTotal, total: labor.plus(partsTotal),
      } });
      await tx.orderHistory.create({ data: { organizationId: actor.organizationId, orderId: order.id, toStatus: 'RECEIVED', actorId: actor.userId } });
      await record(tx, actor, order.id, 'ORDER_RECEIVED'); return order;
    });
  }
  @Patch(':id/price') @Permissions('orders.edit')
  async price(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: PriceDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      // Only the owner may correct a price after the device was handed over.
      if (!OPEN_STATUSES.includes(order.status) && !(order.status === 'DELIVERED' && actor.owner)) throw new ConflictException('Order closed');
      const labor = new Prisma.Decimal(dto.labor), partsTotal = new Prisma.Decimal(dto.partsTotal), total = labor.plus(partsTotal);
      const { paid } = await paidOf(tx, actor.organizationId, id, order.total);
      if (total.lessThan(paid)) throw new ConflictException('PRICE_BELOW_PAID');
      await tx.order.update({ where: { id }, data: { labor, partsTotal, total } });
      // Spec §54: price changes are audited with old and new values.
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'PRICE_CHANGE', entityId: id, ...(actor.ip ? { ip: actor.ip } : {}),
        oldValue: { labor: order.labor.toString(), partsTotal: order.partsTotal.toString(), total: order.total.toString() },
        newValue: { labor: labor.toString(), partsTotal: partsTotal.toString(), total: total.toString() } } });
      return { ok: true };
    });
  }
  @Patch(':id/complaint') @Permissions('orders.view')
  async complaint(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: ComplaintDto) {
    const complaint = dto.complaint.trim();
    if (!complaint) throw new ConflictException('Complaint required');
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status === 'CANCELLED') throw new ConflictException('Order closed');
      await tx.order.update({ where: { id }, data: { complaint } });
      await record(tx, actor, id, 'ORDER_COMPLAINT_CHANGED', { complaint: order.complaint }, { complaint });
      return { ok: true };
    });
  }
  @Patch(':id/status') @Permissions('orders.change_status')
  async status(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (!TRANSITIONS[order.status]?.includes(dto.status)) throw new ConflictException('Invalid status transition');
      await transition(tx, actor, order, dto.status, dto.comment?.trim() || undefined); return { ok: true };
    });
  }
  @Post(':id/payments') @Permissions('payments.create')
  payment(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: PaymentDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      const amount = new Prisma.Decimal(dto.amount);
      const builtIn = ['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER'];
      if (!builtIn.includes(dto.method) && !await tx.paymentMethod.findFirst({ where: { organizationId: actor.organizationId, key: dto.method, active: true } })) throw new ConflictException('Payment method unavailable');
      if (!amount.greaterThan(0)) throw new ConflictException('Positive amount required');
      const existing = await tx.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: dto.idempotencyKey } } });
      if (existing) {
        if (existing.orderId !== id || existing.kind !== 'PAYMENT' || !existing.amount.equals(amount) || existing.method !== dto.method) throw new ConflictException('Idempotency key reused with different request');
        return existing;
      }
      // A delivered order can still be paid off (debt); a cancelled one cannot.
      if (order.status === 'CANCELLED') throw new ConflictException('Order closed');
      const { balance } = await paidOf(tx, actor.organizationId, id, order.total);
      if (amount.greaterThan(balance)) throw new ConflictException('Payment exceeds balance');
      const payment = await tx.payment.create({ data: { organizationId: actor.organizationId, orderId: id, kind: 'PAYMENT', amount, method: dto.method, idempotencyKey: dto.idempotencyKey, actorId: actor.userId } });
      await record(tx, actor, id, 'PAYMENT_RECEIVED'); return payment;
    });
  }
  @Post(':id/deliver') @Permissions('orders.edit')
  deliver(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status !== 'READY') throw new ConflictException('Order must be READY');
      const { balance } = await paidOf(tx, actor.organizationId, id, order.total);
      if (balance.greaterThan(0) && (!dto.allowDebt || !actor.permissions.includes('payments.deliver_with_debt'))) throw new ConflictException('Outstanding balance');
      let warranty = null;
      if (dto.warrantyDays > 0) {
        const setting = await tx.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: actor.organizationId, key: 'warranty_terms' } } });
        const configured = (setting?.value as Record<string, unknown> | undefined)?.text;
        const terms = dto.warrantyTerms?.trim() || (typeof configured === 'string' && configured.trim()) || DEFAULT_WARRANTY_TERMS;
        const startDate = new Date();
        warranty = await tx.warranty.create({ data: { organizationId: actor.organizationId, orderId: id, startDate, endDate: new Date(startDate.getTime() + dto.warrantyDays * 86400000), terms } });
      }
      await transition(tx, actor, order, 'DELIVERED', balance.greaterThan(0) ? 'Qarz bilan topshirildi' : undefined);
      return { ok: true, warranty };
    });
  }
}

@ApiTags('payments') @ApiBearerAuth()
@Controller('payments')
class PaymentsController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('payments.view')
  list(@CurrentActor() actor: Actor) {
    return this.db.payment.findMany({ where: { organizationId: actor.organizationId, order: orderScope(actor) }, include: { order: { select: { id: true, number: true, status: true, customer: { select: { firstName: true, phone: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  @Post(':id/refund') @Permissions('payments.refund')
  async refund(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: RefundDto) {
    const payment = await this.db.payment.findFirst({ where: { id, organizationId: actor.organizationId, kind: 'PAYMENT' } });
    if (!payment) throw new NotFoundException();
    return this.db.$transaction(async tx => {
      await lockedOrder(tx, actor, payment.orderId);
      const amount = new Prisma.Decimal(dto.amount);
      const existing = await tx.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: dto.idempotencyKey } } });
      if (existing) {
        if (existing.originalPaymentId !== id || existing.kind !== 'REFUND' || !existing.amount.equals(amount) || existing.reason !== dto.reason) throw new ConflictException('Idempotency key conflict');
        return existing;
      }
      const refunded = await tx.payment.aggregate({ where: { organizationId: actor.organizationId, originalPaymentId: id, kind: 'REFUND' }, _sum: { amount: true } });
      if (!amount.greaterThan(0) || amount.plus(refunded._sum.amount ?? 0).greaterThan(payment.amount)) throw new ConflictException('Invalid refund amount');
      const refund = await tx.payment.create({ data: { organizationId: actor.organizationId, orderId: payment.orderId, originalPaymentId: id, kind: 'REFUND', amount, method: payment.method, reason: dto.reason, idempotencyKey: dto.idempotencyKey, actorId: actor.userId } });
      await record(tx, actor, payment.orderId, 'PAYMENT_REFUNDED'); return refund;
    });
  }
}

@Module({ controllers: [CustomersController, DevicesController, OrdersController, PaymentsController] })
export class OrdersModule {}
