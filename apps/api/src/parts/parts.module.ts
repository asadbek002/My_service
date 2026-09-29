import { BadRequestException, Body, ConflictException, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { defaultBranch, orderScope, record } from '../orders/orders.module';

class SourcedPartDto {
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  // Pick a saved shop (shopId). A plain name is still accepted and saved as a shop.
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) shopId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) shop?: string;
  @ApiProperty({ example: '350000' }) @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) cost!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) orderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) note?: string;
}

class ShopDto {
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
}

/** createdAt filter from ?from=&to= (ISO dates or timestamps). */
function period(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const gte = from ? new Date(from) : undefined, lte = to ? new Date(to) : undefined;
  if ((gte && isNaN(gte.getTime())) || (lte && isNaN(lte.getTime()))) throw new BadRequestException('Invalid date');
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}
const sumOf = (rows: { cost: Prisma.Decimal }[]) => rows.reduce((s, x) => s.plus(x.cost), new Prisma.Decimal(0));

const include = { order: { select: { id: true, number: true, status: true, device: { select: { brand: true, model: true } }, customer: { select: { firstName: true } } } } } as const;

/**
 * Parts brought from nearby shops on credit (spec change 2026-09): the shop is paid later,
 * or the part goes back if it was not used. Paying records a PURCHASE expense.
 */
@ApiTags('parts') @ApiBearerAuth()
@Controller('parts')
class PartsController {
  constructor(private readonly db: Database) {}

  /** Parts with filters (status, shop, order, period) and the totals of exactly what is shown. */
  @Get() @Permissions('orders.view')
  async list(@CurrentActor() a: Actor, @Query('status') status?: string, @Query('orderId') orderId?: string,
    @Query('shopId') shopId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const createdAt = period(from, to);
    const where: Prisma.SourcedPartWhereInput = {
      organizationId: a.organizationId,
      ...(status && ['TAKEN', 'PAID', 'RETURNED'].includes(status) ? { status } : {}),
      ...(orderId ? { orderId } : {}), ...(shopId ? { shopId } : {}), ...(createdAt ? { createdAt } : {}),
    };
    const [items, owed, shops] = await Promise.all([
      this.db.sourcedPart.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 1000 }),
      // What is owed right now, per shop (independent of the filters).
      this.db.sourcedPart.groupBy({ by: ['shopId', 'shop'], where: { organizationId: a.organizationId, status: 'TAKEN' }, _sum: { cost: true }, _count: true }),
      this.db.shop.findMany({ where: { organizationId: a.organizationId, archived: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const by = (s: string) => items.filter(p => p.status === s);
    return {
      items,
      totals: { count: items.length, taken: sumOf(by('TAKEN')), paid: sumOf(by('PAID')), returned: sumOf(by('RETURNED')), all: sumOf(items.filter(p => p.status !== 'RETURNED')) },
      debt: owed.reduce((s, x) => s.plus(x._sum.cost ?? 0), new Prisma.Decimal(0)),
      byShop: owed.map(x => ({ shopId: x.shopId, shop: x.shop, count: x._count, amount: x._sum.cost ?? new Prisma.Decimal(0) })).sort((x, y) => Number(y.amount) - Number(x.amount)),
      shops,
    };
  }

  @Post() @Permissions('orders.edit')
  async create(@CurrentActor() a: Actor, @Body() d: SourcedPartDto) {
    const cost = new Prisma.Decimal(d.cost);
    if (!cost.greaterThan(0)) throw new ConflictException('Positive amount required');
    if (d.orderId && !await this.db.order.findFirst({ where: { id: d.orderId, ...orderScope(a) } })) throw new NotFoundException('Order not found');
    if (!d.shopId && !d.shop?.trim()) throw new BadRequestException('Shop required');
    return this.db.$transaction(async tx => {
      const shop = d.shopId
        ? await tx.shop.findFirst({ where: { id: d.shopId, organizationId: a.organizationId } })
        : await tx.shop.upsert({ where: { organizationId_name: { organizationId: a.organizationId, name: d.shop!.trim() } }, create: { organizationId: a.organizationId, name: d.shop!.trim() }, update: {} });
      if (!shop) throw new NotFoundException('Shop not found');
      const part = await tx.sourcedPart.create({ data: {
        organizationId: a.organizationId, name: d.name.trim(), shop: shop.name, shopId: shop.id, cost, actorId: a.userId,
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

/** The shops parts are taken from: pick one when recording a part, see what each is owed. */
@ApiTags('parts') @ApiBearerAuth()
@Controller('shops')
class ShopsController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('orders.view')
  async list(@CurrentActor() a: Actor) {
    const [shops, owed, totals] = await Promise.all([
      this.db.shop.findMany({ where: { organizationId: a.organizationId }, orderBy: [{ archived: 'asc' }, { name: 'asc' }] }),
      this.db.sourcedPart.groupBy({ by: ['shopId'], where: { organizationId: a.organizationId, status: 'TAKEN' }, _sum: { cost: true }, _count: true }),
      this.db.sourcedPart.groupBy({ by: ['shopId'], where: { organizationId: a.organizationId, status: 'PAID' }, _sum: { cost: true }, _count: true }),
    ]);
    return shops.map(s => {
      const debt = owed.find(o => o.shopId === s.id), paid = totals.find(o => o.shopId === s.id);
      return { ...s, debt: debt?._sum.cost ?? new Prisma.Decimal(0), debtCount: debt?._count ?? 0, paid: paid?._sum.cost ?? new Prisma.Decimal(0) };
    });
  }
  @Post() @Permissions('orders.edit')
  async create(@CurrentActor() a: Actor, @Body() d: ShopDto) {
    try {
      return await this.db.shop.create({ data: { organizationId: a.organizationId, name: d.name.trim(), ...(d.phone?.trim() ? { phone: d.phone.trim() } : {}), ...(d.address?.trim() ? { address: d.address.trim() } : {}), ...(d.note?.trim() ? { note: d.note.trim() } : {}) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Shop exists');
      throw e;
    }
  }
  @Patch(':id') @Permissions('orders.edit')
  async update(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: ShopDto) {
    if (!await this.db.shop.findFirst({ where: { id, organizationId: a.organizationId } })) throw new NotFoundException();
    try {
      return await this.db.shop.update({ where: { id }, data: { name: d.name.trim(), phone: d.phone?.trim() || null, address: d.address?.trim() || null, note: d.note?.trim() || null, ...(d.archived !== undefined ? { archived: d.archived } : {}) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Shop exists');
      throw e;
    }
  }
}

@Module({ controllers: [PartsController, ShopsController] })
export class PartsModule {}
