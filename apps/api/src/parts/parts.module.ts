import { Body, ConflictException, Controller, Get, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { defaultBranch, orderScope, record } from '../orders/orders.module';

class SourcedPartDto {
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiProperty() @IsString() @Length(1, 200) shop!: string;
  @ApiProperty({ example: '350000' }) @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) cost!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) orderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) note?: string;
}

const include = { order: { select: { id: true, number: true, status: true, device: { select: { brand: true, model: true } }, customer: { select: { firstName: true } } } } } as const;

/**
 * Parts brought from nearby shops on credit (spec change 2026-09): the shop is paid later,
 * or the part goes back if it was not used. Paying records a PURCHASE expense.
 */
@ApiTags('parts') @ApiBearerAuth()
@Controller('parts')
class PartsController {
  constructor(private readonly db: Database) {}

  @Get() @Permissions('orders.view')
  async list(@CurrentActor() a: Actor, @Query('status') status?: string, @Query('orderId') orderId?: string) {
    const items = await this.db.sourcedPart.findMany({
      where: { organizationId: a.organizationId, ...(status && ['TAKEN', 'PAID', 'RETURNED'].includes(status) ? { status } : {}), ...(orderId ? { orderId } : {}) },
      include, orderBy: { createdAt: 'desc' }, take: 300,
    });
    const owed = await this.db.sourcedPart.groupBy({ by: ['shop'], where: { organizationId: a.organizationId, status: 'TAKEN' }, _sum: { cost: true }, _count: true });
    const shops = await this.db.sourcedPart.findMany({ where: { organizationId: a.organizationId }, distinct: ['shop'], select: { shop: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    return {
      items,
      debt: owed.reduce((s, x) => s.plus(x._sum.cost ?? 0), new Prisma.Decimal(0)),
      byShop: owed.map(x => ({ shop: x.shop, count: x._count, amount: x._sum.cost ?? new Prisma.Decimal(0) })).sort((x, y) => Number(y.amount) - Number(x.amount)),
      shops: shops.map(x => x.shop),
    };
  }

  @Post() @Permissions('orders.edit')
  async create(@CurrentActor() a: Actor, @Body() d: SourcedPartDto) {
    const cost = new Prisma.Decimal(d.cost);
    if (!cost.greaterThan(0)) throw new ConflictException('Positive amount required');
    if (d.orderId && !await this.db.order.findFirst({ where: { id: d.orderId, ...orderScope(a) } })) throw new NotFoundException('Order not found');
    return this.db.$transaction(async tx => {
      const part = await tx.sourcedPart.create({ data: {
        organizationId: a.organizationId, name: d.name.trim(), shop: d.shop.trim(), cost, actorId: a.userId,
        ...(d.orderId ? { orderId: d.orderId } : {}), ...(d.note?.trim() ? { note: d.note.trim() } : {}),
      }, include });
      await record(tx, a, part.id, 'PART_TAKEN'); return part;
    });
  }

  /** The shop has been paid: settle the part and book the money as a parts purchase. */
  @Post(':id/pay') @Permissions('orders.edit')
  pay(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.db.$transaction(async tx => {
      const part = await this.taken(tx, a, id);
      const branch = await defaultBranch(tx, a);
      const expense = await tx.expense.create({ data: {
        organizationId: a.organizationId, branchId: branch.id, category: 'PURCHASE', amount: part.cost, actorId: a.userId,
        note: `Zapchast: ${part.name} (${part.shop})`.slice(0, 1000),
      } });
      const result = await tx.sourcedPart.update({ where: { id }, data: { status: 'PAID', settledAt: new Date(), expenseId: expense.id }, include });
      await record(tx, a, id, 'PART_PAID'); return result;
    });
  }

  /** The part was not used and went back to the shop: nothing is owed. */
  @Post(':id/return') @Permissions('orders.edit')
  giveBack(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.db.$transaction(async tx => {
      await this.taken(tx, a, id);
      const result = await tx.sourcedPart.update({ where: { id }, data: { status: 'RETURNED', settledAt: new Date() }, include });
      await record(tx, a, id, 'PART_RETURNED'); return result;
    });
  }

  private async taken(tx: Prisma.TransactionClient, a: Actor, id: string) {
    await tx.$queryRaw`SELECT id FROM "SourcedPart" WHERE id = ${id} AND "organizationId" = ${a.organizationId} FOR UPDATE`;
    const part = await tx.sourcedPart.findFirst({ where: { id, organizationId: a.organizationId } });
    if (!part) throw new NotFoundException();
    if (part.status !== 'TAKEN') throw new ConflictException('Part already settled');
    return part;
  }
}

@Module({ controllers: [PartsController] })
export class PartsModule {}
