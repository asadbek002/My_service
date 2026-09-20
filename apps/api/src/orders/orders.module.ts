import { Module, Controller, Get, Post, Patch, Body, Param, Query, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { CustomerDto, DeviceDto, OrderDto, AssignDto, StatusDto, DiagnosisDto, ApprovalDto } from './orders.dto';

export function orderScope(actor: Actor): Prisma.OrderWhereInput {
  return {
    organizationId: actor.organizationId,
    ...(!actor.owner ? { branchId: { in: actor.branchIds } } : {}),
    ...(!actor.owner && !actor.permissions.includes('orders.assign') ? { assignments: { some: { userId: actor.userId } } } : {}),
  };
}
export async function lockedOrder(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
  const order = await tx.order.findFirst({ where: { id, ...orderScope(actor) } });
  if (!order) throw new NotFoundException('Order not found');
  return order;
}
export async function record(tx: Prisma.TransactionClient, actor: Actor, id: string, action: string) {
  await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action, entityId: id } });
  await tx.outboxEvent.create({ data: { organizationId: actor.organizationId, type: action, entityId: id, payload: { actorId: actor.userId } } });
}
export async function transition(tx: Prisma.TransactionClient, actor: Actor, order: { id: string; status: string }, toStatus: string, comment: string) {
  await tx.order.update({ where: { id: order.id }, data: { status: toStatus } });
  await tx.orderHistory.create({ data: { organizationId: actor.organizationId, orderId: order.id, fromStatus: order.status, toStatus, actorId: actor.userId, comment } });
  await record(tx, actor, order.id, 'ORDER_' + toStatus);
}

@ApiTags('customers') @ApiBearerAuth()
@Controller('customers')
class CustomersController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('customers.view')
  list(@CurrentActor() actor: Actor, @Query('q') q?: string) {
    return this.db.customer.findMany({ where: {
      organizationId: actor.organizationId,
      ...(q ? { OR: [{ phone: { contains: q.slice(0, 100) } }, { firstName: { contains: q.slice(0, 100), mode: 'insensitive' as const } }] } : {}),
      ...(!actor.owner ? { orders: { some: { branchId: { in: actor.branchIds } } } } : {}),
    }, take: 50, orderBy: { createdAt: 'desc' } });
  }
  @Post() @Permissions('customers.edit')
  async create(@CurrentActor() actor: Actor, @Body() dto: CustomerDto) {
    try {
      return await this.db.$transaction(async tx => {
        const c = await tx.customer.create({ data: { organizationId: actor.organizationId, firstName: dto.firstName, phone: dto.phone, ...(dto.notes !== undefined ? { notes: dto.notes } : {}) } });
        await record(tx, actor, c.id, 'CUSTOMER_CREATED'); return c;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Customer phone already exists');
      throw e;
    }
  }
  @Get(':id') @Permissions('customers.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const c = await this.db.customer.findFirst({ where: { id, organizationId: actor.organizationId, ...(!actor.owner ? { orders: { some: { branchId: { in: actor.branchIds } } } } : {}) }, include: { devices: true } });
    if (!c) throw new NotFoundException(); return c;
  }
}
@ApiTags('devices') @ApiBearerAuth()
@Controller('devices')
class DevicesController {
  constructor(private readonly db: Database) {}
  @Post() @Permissions('customers.edit')
  async create(@CurrentActor() actor: Actor, @Body() dto: DeviceDto) {
    const customer = await this.db.customer.findFirst({ where: { id: dto.customerId, organizationId: actor.organizationId } });
    if (!customer) throw new NotFoundException();
    return this.db.$transaction(async tx => {
      const device = await tx.device.create({ data: {
        organizationId: actor.organizationId, customerId: dto.customerId, category: dto.category, brand: dto.brand, model: dto.model,
        ...(dto.imei ? { imei: dto.imei } : {}), ...(dto.serialNumber ? { serialNumber: dto.serialNumber } : {}), ...(dto.color ? { color: dto.color } : {}),
      } });
      await record(tx, actor, device.id, 'DEVICE_CREATED'); return device;
    });
  }
}
@ApiTags('orders') @ApiBearerAuth()
@Controller('orders')
class OrdersController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  list(@CurrentActor() actor: Actor) {
    return this.db.order.findMany({ where: orderScope(actor), include: { customer: true, device: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  @Get(':id') @Permissions('orders.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(actor) }, include: { customer: true, device: true, assignments: { select: { userId: true, task: true } }, history: { orderBy: { createdAt: 'asc' } } } });
    if (!order) throw new NotFoundException(); return order;
  }
  @Post() @Permissions('orders.create')
  async create(@CurrentActor() actor: Actor, @Body() dto: OrderDto) {
    if (!actor.owner && !actor.branchIds.includes(dto.branchId)) throw new NotFoundException('Branch not found');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
      const branch = await tx.branch.findFirst({ where: { id: dto.branchId, organizationId: actor.organizationId } });
      const device = await tx.device.findFirst({ where: { id: dto.deviceId, customerId: dto.customerId, organizationId: actor.organizationId } });
      if (!branch || !device) throw new NotFoundException('Branch or device not found');
      const sub = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
      if (!sub || !['ACTIVE','TRIAL'].includes(sub.status) || (sub.graceUntil ?? sub.expiresAt) <= new Date()) throw new ForbiddenException('SUBSCRIPTION_READ_ONLY');
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (sub.plan.monthlyOrders !== null) {
        const monthStart = new Date(day.slice(0, 7) + '-01T00:00:00+05:00');
        const count = await tx.order.count({ where: { organizationId: actor.organizationId, createdAt: { gte: monthStart } } });
        if (count >= sub.plan.monthlyOrders) throw new ForbiddenException('MONTHLY_ORDER_LIMIT');
      }
      const counter = await tx.orderCounter.upsert({ where: { organizationId_day: { organizationId: actor.organizationId, day } }, create: { organizationId: actor.organizationId, day, value: 1 }, update: { value: { increment: 1 } } });
      const number = 'MS-' + day.replaceAll('-', '').slice(2) + '-' + String(counter.value).padStart(3, '0');
      const order = await tx.order.create({ data: { ...dto, organizationId: actor.organizationId, number } });
      await tx.orderHistory.create({ data: { organizationId: actor.organizationId, orderId: order.id, toStatus: 'RECEIVED', actorId: actor.userId } });
      await record(tx, actor, order.id, 'ORDER_RECEIVED'); return order;
    });
  }
  @Post(':id/assign') @Permissions('orders.assign')
  async assign(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (['DELIVERED','CANCELLED','UNREPAIRABLE'].includes(order.status)) throw new ConflictException('Order closed');
      const user = await tx.user.findFirst({ where: { id: dto.userId, organizationId: actor.organizationId, status: 'ACTIVE', branches: { some: { branchId: order.branchId } }, roles: { some: { role: { systemKey: 'TECHNICIAN' } } } } });
      if (!user) throw new NotFoundException('Technician not found in branch');
      await tx.orderAssignment.upsert({ where: { organizationId_orderId_userId: { organizationId: actor.organizationId, orderId: id, userId: dto.userId } }, create: { organizationId: actor.organizationId, orderId: id, ...dto }, update: { task: dto.task } });
      await record(tx, actor, id, 'ORDER_ASSIGNED'); return { ok: true };
    });
  }
  @Patch(':id/status') @Permissions('orders.change_status')
  async status(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: StatusDto) {
    const allowed: Record<string, string[]> = {
      RECEIVED: ['DIAGNOSING','CANCELLED'],
      DIAGNOSING: ['CANCELLED','UNREPAIRABLE'],
      WAITING_CUSTOMER_APPROVAL: ['CANCELLED','UNREPAIRABLE'],
      WAITING_PART: ['IN_REPAIR','CANCELLED'],
      IN_REPAIR: ['WAITING_PART','CANCELLED','UNREPAIRABLE'],
    };
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (!allowed[order.status]?.includes(dto.status)) throw new ConflictException('Invalid status transition');
      if (['IN_REPAIR','WAITING_PART'].includes(dto.status) && (order.approvalStatus !== 'APPROVED' || order.approvedVersion !== order.quoteVersion)) throw new ConflictException('Current quote requires approval');
      await transition(tx, actor, order, dto.status, dto.comment); return { ok: true };
    });
  }
  @Post(':id/diagnosis') @Permissions('diagnostics.create')
  async diagnosis(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: DiagnosisDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (!['DIAGNOSING','WAITING_CUSTOMER_APPROVAL'].includes(order.status)) throw new ConflictException('Diagnosis not allowed in this state');
      await tx.order.update({ where: { id }, data: {
        diagnosis: dto.diagnosis, requiredWork: dto.requiredWork, labor: dto.labor, partsTotal: dto.partsTotal,
        total: new Prisma.Decimal(dto.labor).plus(dto.partsTotal), quoteVersion: { increment: 1 }, approvedVersion: null,
        approvalStatus: 'PENDING', approvalChannel: null, approvedAt: null,
      } });
      await transition(tx, actor, order, 'WAITING_CUSTOMER_APPROVAL', 'Diagnosis/quote updated'); return { ok: true };
    });
  }
  @Post(':id/approve') @Permissions('orders.edit')
  async approve(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: ApprovalDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status !== 'WAITING_CUSTOMER_APPROVAL' || order.quoteVersion !== dto.quoteVersion) throw new ConflictException('Quote changed or approval already recorded');
      await tx.order.update({ where: { id }, data: { approvalStatus: dto.approved ? 'APPROVED' : 'REJECTED', approvalChannel: 'STAFF_RECORDED', approvedVersion: dto.quoteVersion, approvedAt: new Date() } });
      await transition(tx, actor, order, dto.approved ? 'WAITING_PART' : 'CANCELLED', dto.evidence); return { ok: true };
    });
  }
}
@Module({ controllers: [CustomersController, DevicesController, OrdersController] })
export class OrdersModule {}
