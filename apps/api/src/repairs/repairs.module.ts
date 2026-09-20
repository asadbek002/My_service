import { Body, Controller, Get, Module, Param, Post, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { lockedOrder, orderScope, record, transition } from '../orders/orders.module';
import { PartDto, ReceiveDto, ReserveDto, PaymentDto, RefundDto, FinishDto, DeliverDto, RepairActionDto } from './repairs.dto';

async function feature(tx: Prisma.TransactionClient, actor: Actor) {
  const subscription = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
  const flags = subscription?.plan.features as Record<string, unknown> | undefined;
  if (!flags?.inventory) throw new ForbiddenException('INVENTORY_NOT_IN_PLAN');
}
async function stockLock(tx: Prisma.TransactionClient, organizationId: string, branchId: string, partId: string) {
  await tx.$queryRaw`SELECT "partId" FROM "Stock" WHERE "organizationId" = ${organizationId} AND "branchId" = ${branchId} AND "partId" = ${partId} FOR UPDATE`;
  return tx.stock.findUnique({ where: { organizationId_branchId_partId: { organizationId, branchId, partId } } });
}
async function balance(tx: Prisma.TransactionClient, organizationId: string, orderId: string, total: Prisma.Decimal) {
  const payments = await tx.payment.findMany({ where: { organizationId, orderId } });
  return payments.reduce((remaining, p) => p.kind === 'REFUND' ? remaining.plus(p.amount) : remaining.minus(p.amount), total);
}

@ApiTags('inventory') @ApiBearerAuth()
@Controller('inventory')
class InventoryController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('inventory.view')
  async list(@CurrentActor() actor: Actor) {
    await feature(this.db, actor);
    const parts = await this.db.part.findMany({ where: { organizationId: actor.organizationId }, include: { stocks: { where: actor.owner ? {} : { branchId: { in: actor.branchIds } } } }, take: 100 });
    return parts.map(({ purchasePrice, ...part }) => ({ ...part, ...(actor.permissions.includes('inventory.view_cost') ? { purchasePrice } : {}) }));
  }
  @Post('parts') @Permissions('inventory.manage')
  async part(@CurrentActor() actor: Actor, @Body() dto: PartDto) {
    await feature(this.db, actor);
    try {
      return await this.db.$transaction(async tx => {
        const part = await tx.part.create({ data: { organizationId: actor.organizationId, ...dto } });
        await record(tx, actor, part.id, 'PART_CREATED');
        const { purchasePrice, ...safe } = part;
        return { ...safe, ...(actor.permissions.includes('inventory.view_cost') ? { purchasePrice } : {}) };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('SKU exists');
      throw e;
    }
  }
  @Post('receive') @Permissions('inventory.manage')
  async receive(@CurrentActor() actor: Actor, @Body() dto: ReceiveDto) {
    if (!actor.owner && !actor.branchIds.includes(dto.branchId)) throw new NotFoundException();
    return this.db.$transaction(async tx => {
      await feature(tx, actor);
      const branch = await tx.branch.findFirst({ where: { id: dto.branchId, organizationId: actor.organizationId } });
      const part = await tx.part.findFirst({ where: { id: dto.partId, organizationId: actor.organizationId } });
      if (!branch || !part) throw new NotFoundException();
      const stock = await tx.stock.upsert({ where: { organizationId_branchId_partId: { organizationId: actor.organizationId, branchId: dto.branchId, partId: dto.partId } }, create: { organizationId: actor.organizationId, branchId: dto.branchId, partId: dto.partId, onHand: dto.quantity }, update: { onHand: { increment: dto.quantity } } });
      await tx.inventoryMovement.create({ data: { organizationId: actor.organizationId, branchId: dto.branchId, partId: dto.partId, quantity: dto.quantity, type: 'IN', reason: dto.reason, actorId: actor.userId } });
      await record(tx, actor, dto.partId, 'STOCK_RECEIVED'); return stock;
    });
  }
}
@ApiTags('repairs') @ApiBearerAuth()
@Controller('orders')
class RepairsController {
  constructor(private readonly db: Database) {}
  @Post(':id/parts') @Permissions('inventory.use')
  reserve(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: ReserveDto) {
    return this.db.$transaction(async tx => {
      await feature(tx, actor);
      const order = await lockedOrder(tx, actor, id);
      if (!['WAITING_PART','IN_REPAIR'].includes(order.status) || order.approvalStatus !== 'APPROVED' || order.approvedVersion !== order.quoteVersion) throw new ConflictException('Approved active repair required');
      const part = await tx.part.findFirst({ where: { id: dto.partId, organizationId: actor.organizationId } });
      if (!part) throw new NotFoundException();
      const stock = await stockLock(tx, actor.organizationId, order.branchId, dto.partId);
      if (!stock || stock.onHand - stock.reserved < dto.quantity) throw new ConflictException('INSUFFICIENT_STOCK');
      const existing = await tx.orderPart.findFirst({ where: { organizationId: actor.organizationId, orderId: id, partId: dto.partId } });
      if (existing) throw new ConflictException('Part already attached');
      const parts = await tx.orderPart.findMany({ where: { organizationId: actor.organizationId, orderId: id, status: { in: ['RESERVED','USED'] } } });
      const sum = parts.reduce((s, p) => s.plus(p.unitPrice.mul(p.quantity)), part.salePrice.mul(dto.quantity));
      if (sum.greaterThan(order.partsTotal)) throw new ConflictException('Parts exceed approved quote');
      await tx.stock.update({ where: { organizationId_branchId_partId: { organizationId: actor.organizationId, branchId: order.branchId, partId: dto.partId } }, data: { reserved: { increment: dto.quantity } } });
      const orderPart = await tx.orderPart.create({ data: { organizationId: actor.organizationId, orderId: id, partId: dto.partId, quantity: dto.quantity, unitCost: part.purchasePrice, unitPrice: part.salePrice } });
      await tx.inventoryMovement.create({ data: { organizationId: actor.organizationId, branchId: order.branchId, partId: dto.partId, orderId: id, type: 'RESERVE', quantity: dto.quantity, reason: 'Order reservation', actorId: actor.userId } });
      await record(tx, actor, id, 'PART_RESERVED'); return { id: orderPart.id, status: orderPart.status };
    });
  }
  @Post(':id/parts/:partId/use') @Permissions('inventory.use')
  use(@CurrentActor() actor: Actor, @Param('id') id: string, @Param('partId') partId: string) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status !== 'IN_REPAIR') throw new ConflictException('Repair must be in progress');
      const part = await tx.orderPart.findFirst({ where: { organizationId: actor.organizationId, orderId: id, partId } });
      if (!part) throw new NotFoundException();
      if (part.status === 'USED') return { ok: true };
      if (part.status !== 'RESERVED') throw new ConflictException('Part is not reserved');
      const stock = await stockLock(tx, actor.organizationId, order.branchId, partId);
      if (!stock || stock.reserved < part.quantity || stock.onHand < part.quantity) throw new ConflictException('Stock inconsistency');
      await tx.stock.update({ where: { organizationId_branchId_partId: { organizationId: actor.organizationId, branchId: order.branchId, partId } }, data: { onHand: { decrement: part.quantity }, reserved: { decrement: part.quantity } } });
      await tx.orderPart.update({ where: { id: part.id }, data: { status: 'USED' } });
      await tx.inventoryMovement.create({ data: { organizationId: actor.organizationId, branchId: order.branchId, partId, orderId: id, type: 'USED', quantity: part.quantity, reason: 'Part installed', actorId: actor.userId } });
      await record(tx, actor, id, 'PART_USED'); return { ok: true };
    });
  }
  @Post(':id/repair/start') @Permissions('orders.change_status')
  start(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (!['WAITING_PART','IN_REPAIR'].includes(order.status) || order.approvedVersion !== order.quoteVersion || order.approvalStatus !== 'APPROVED') throw new ConflictException('Current quote approval required');
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId} FOR UPDATE`;
      const active = await tx.repairSession.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId, endedAt: null } });
      if (active) throw new ConflictException('Another repair session is active');
      const session = await tx.repairSession.create({ data: { organizationId: actor.organizationId, orderId: id, userId: actor.userId } });
      if (order.status !== 'IN_REPAIR') await transition(tx, actor, order, 'IN_REPAIR', 'Repair started');
      await record(tx, actor, id, 'REPAIR_STARTED'); return session;
    });
  }
  @Post(':id/repair/pause') @Permissions('orders.change_status')
  pause(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.db.$transaction(async tx => {
      await lockedOrder(tx, actor, id);
      const result = await tx.repairSession.updateMany({ where: { organizationId: actor.organizationId, orderId: id, userId: actor.userId, endedAt: null }, data: { endedAt: new Date() } });
      if (!result.count) throw new ConflictException('No active session');
      await record(tx, actor, id, 'REPAIR_PAUSED'); return { ok: true };
    });
  }
  @Post(':id/repair/actions') @Permissions('orders.change_status')
  action(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: RepairActionDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status !== 'IN_REPAIR') throw new ConflictException('Repair not in progress');
      const assigned = await tx.orderAssignment.findFirst({ where: { organizationId: actor.organizationId, orderId: id, userId: actor.userId } });
      if (!actor.owner && !actor.permissions.includes('orders.assign') && !assigned) throw new ForbiddenException('Not assigned');
      const action = await tx.repairAction.create({ data: { organizationId: actor.organizationId, orderId: id, userId: actor.userId, description: dto.description, laborAmount: dto.laborAmount } });
      await record(tx, actor, id, 'REPAIR_ACTION_COMPLETED'); return action;
    });
  }
  @Post(':id/repair/finish') @Permissions('orders.change_status')
  finish(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: FinishDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status !== 'IN_REPAIR') throw new ConflictException('Repair not in progress');
      const required = ['Display','Touch','Camera','Microphone','Speaker','Charging','Wi-Fi','Bluetooth'];
      if (!required.every(check => dto.passedChecks.includes(check))) throw new ConflictException('Final checklist incomplete');
      const parts = await tx.orderPart.findMany({ where: { organizationId: actor.organizationId, orderId: id } });
      if (parts.some(p => p.status === 'RESERVED')) throw new ConflictException('Reserved parts must be used or released');
      const usedTotal = parts.filter(p => p.status === 'USED').reduce((s, p) => s.plus(p.unitPrice.mul(p.quantity)), new Prisma.Decimal(0));
      if (!usedTotal.equals(order.partsTotal)) throw new ConflictException('Used parts must match approved quote');
      const actions = await tx.repairAction.findMany({ where: { organizationId: actor.organizationId, orderId: id } });
      if (actions.length) {
        const actionLabor = actions.reduce((sum, action) => sum.plus(action.laborAmount), new Prisma.Decimal(0));
        if (!actionLabor.equals(order.labor)) throw new ConflictException('Repair action labor must match approved labor');
      }
      const sessions = await tx.repairSession.count({ where: { organizationId: actor.organizationId, orderId: id } });
      if (!sessions) throw new ConflictException('Start a repair session first');
      await tx.repairSession.updateMany({ where: { organizationId: actor.organizationId, orderId: id, endedAt: null }, data: { endedAt: new Date() } });
      await tx.order.update({ where: { id }, data: { finalTest: dto.passedChecks } });
      await transition(tx, actor, order, 'READY', 'Final test passed'); return { ok: true };
    });
  }
  @Post(':id/payments') @Permissions('payments.create')
  payment(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: PaymentDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      const amount = new Prisma.Decimal(dto.amount);
      if (!amount.greaterThan(0)) throw new ConflictException('Positive amount required');
      const existing = await tx.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: dto.idempotencyKey } } });
      if (existing) {
        if (existing.orderId !== id || existing.kind !== 'PAYMENT' || !existing.amount.equals(amount) || existing.method !== dto.method) throw new ConflictException('Idempotency key reused with different request');
        return existing;
      }
      if (['CANCELLED','UNREPAIRABLE','DELIVERED'].includes(order.status)) throw new ConflictException('Order closed');
      const remaining = await balance(tx, actor.organizationId, id, order.total);
      if (amount.greaterThan(remaining)) throw new ConflictException('Payment exceeds balance');
      const payment = await tx.payment.create({ data: { organizationId: actor.organizationId, orderId: id, kind: 'PAYMENT', amount, method: dto.method, idempotencyKey: dto.idempotencyKey, actorId: actor.userId } });
      await record(tx, actor, id, 'PAYMENT_RECEIVED'); return payment;
    });
  }
  @Get(':id/payments') @Permissions('payments.view')
  async payments(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      return { balance: await balance(tx, actor.organizationId, id, order.total), entries: await tx.payment.findMany({ where: { organizationId: actor.organizationId, orderId: id }, orderBy: { createdAt: 'asc' } }) };
    });
  }
  @Post(':id/deliver') @Permissions('orders.edit')
  deliver(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.db.$transaction(async tx => {
      const order = await lockedOrder(tx, actor, id);
      if (order.status !== 'READY' || !order.finalTest) throw new ConflictException('Final test and READY required');
      if (!(await balance(tx, actor.organizationId, id, order.total)).isZero()) throw new ConflictException('Outstanding balance');
      const startDate = new Date();
      const actions = await tx.repairAction.findMany({ where: { organizationId: actor.organizationId, orderId: id } });
      const perUser = new Map<string, Prisma.Decimal>();
      for (const action of actions) perUser.set(action.userId, (perUser.get(action.userId) ?? new Prisma.Decimal(0)).plus(action.laborAmount));
      for (const [userId, labor] of perUser) {
        const rule = await tx.technicianCompensation.findFirst({ where: { organizationId: actor.organizationId, userId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: 'desc' } });
        if (!rule || rule.type === 'SALARY') continue;
        let amount = new Prisma.Decimal(0);
        if (['PERCENTAGE','SALARY_PLUS_PERCENTAGE'].includes(rule.type) && rule.percentage) amount = amount.plus(labor.mul(rule.percentage).div(100));
        if (rule.type === 'FIXED_PER_JOB' && rule.fixedPerJob) amount = amount.plus(rule.fixedPerJob);
        await tx.commissionEntry.create({ data: { organizationId: actor.organizationId, orderId: id, userId, amount, ruleSnapshot: { type: rule.type, percentage: rule.percentage?.toString() ?? null, fixedPerJob: rule.fixedPerJob?.toString() ?? null, labor: labor.toString() } } });
      }
      const warranty = await tx.warranty.create({ data: { organizationId: actor.organizationId, orderId: id, startDate, endDate: new Date(startDate.getTime() + dto.warrantyDays * 86400000), terms: dto.warrantyTerms } });
      await transition(tx, actor, order, 'DELIVERED', 'Device delivered');
      await record(tx, actor, warranty.id, 'WARRANTY_CREATED'); return warranty;
    });
  }
}
@ApiTags('payments') @ApiBearerAuth()
@Controller('payments')
class RefundController {
  constructor(private readonly db: Database) {}
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
@Module({ controllers: [InventoryController, RepairsController, RefundController] })
export class RepairsModule {}
