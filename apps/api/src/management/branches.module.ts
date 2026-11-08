import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Database } from '../database';
import { CurrentActor } from '../auth/security';
import type { Actor } from '../auth/security';

const OPEN = ['RECEIVED', 'IN_REPAIR', 'READY'];
const PHONE = /^(\+[1-9][0-9]{7,14})?$/;

class BranchDto {
  @IsString() @Length(2, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @Matches(PHONE) phone?: string;
  /** Staff who work here from the start (the owner sees every branch anyway). */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) staffIds?: string[];
}
class BranchUpdateDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @Matches(PHONE) phone?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}
class StaffBranchesDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) branchIds!: string[]; }

function ownerOnly(a: Actor) { if (!a.owner) throw new ForbiddenException('OWNER_ONLY'); }

/**
 * Branches of a service: the owner opens, renames and closes them (within the plan's limit) and decides
 * who works where. Everyone else sees the branches they work in, to pick where new work goes.
 */
@Controller('branches')
class BranchesController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(@CurrentActor() a: Actor) {
    const [branches, sub, staff, open] = await Promise.all([
      this.db.branch.findMany({ where: { organizationId: a.organizationId, ...(!a.owner ? { id: { in: a.branchIds } } : {}) }, orderBy: { createdAt: 'asc' } }),
      this.db.subscription.findUnique({ where: { organizationId: a.organizationId }, select: { plan: { select: { maxBranches: true } } } }),
      this.db.userBranch.groupBy({ by: ['branchId'], where: { organizationId: a.organizationId, user: { status: 'ACTIVE', roles: { none: { role: { systemKey: 'OWNER' } } } } }, _count: true }),
      this.db.order.groupBy({ by: ['branchId'], where: { organizationId: a.organizationId, status: { in: OPEN } }, _count: true }),
    ]);
    return {
      limit: sub?.plan.maxBranches ?? null, manage: a.owner,
      branches: branches.map(b => ({
        id: b.id, name: b.name, address: b.address, phone: b.phone, archived: !!b.archivedAt, createdAt: b.createdAt,
        staff: staff.find(s => s.branchId === b.id)?._count ?? 0, open: open.find(o => o.branchId === b.id)?._count ?? 0,
      })),
    };
  }

  @Post()
  async create(@CurrentActor() a: Actor, @Body() d: BranchDto) {
    ownerOnly(a);
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${a.organizationId} FOR UPDATE`;
        await this.withinLimit(tx, a.organizationId);
        const branch = await tx.branch.create({ data: { organizationId: a.organizationId, name: d.name.trim(), address: d.address?.trim() || null, phone: d.phone || null } });
        if (d.staffIds?.length) {
          const staff = await tx.user.findMany({ where: { organizationId: a.organizationId, id: { in: d.staffIds } }, select: { id: true } });
          await tx.userBranch.createMany({ data: staff.map(u => ({ organizationId: a.organizationId, userId: u.id, branchId: branch.id })), skipDuplicates: true });
        }
        await tx.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'BRANCH_CREATED', entityId: branch.id, newValue: { name: branch.name } } });
        return branch;
      });
    } catch (e) { throw this.nameTaken(e); }
  }

  @Patch(':id')
  async update(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: BranchUpdateDto) {
    ownerOnly(a);
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${a.organizationId} FOR UPDATE`;
        const branch = await tx.branch.findFirst({ where: { id, organizationId: a.organizationId } });
        if (!branch) throw new NotFoundException();
        if (d.archived === true && !branch.archivedAt) {
          // A branch closes empty: its devices are handed over or moved first, and one branch always stays open.
          if (await tx.branch.count({ where: { organizationId: a.organizationId, archivedAt: null } }) <= 1) throw new ConflictException('LAST_BRANCH');
          if (await tx.order.count({ where: { organizationId: a.organizationId, branchId: id, status: { in: OPEN } } })) throw new ConflictException('BRANCH_HAS_OPEN_ORDERS');
        }
        if (d.archived === false && branch.archivedAt) await this.withinLimit(tx, a.organizationId);
        const updated = await tx.branch.update({ where: { id }, data: {
          ...(d.name !== undefined ? { name: d.name.trim() } : {}),
          ...(d.address !== undefined ? { address: d.address.trim() || null } : {}),
          ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
          ...(d.archived !== undefined ? { archivedAt: d.archived ? branch.archivedAt ?? new Date() : null } : {}),
        } });
        await tx.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: d.archived === true ? 'BRANCH_CLOSED' : d.archived === false ? 'BRANCH_REOPENED' : 'BRANCH_UPDATED', entityId: id,
          oldValue: { name: branch.name, address: branch.address, phone: branch.phone }, newValue: { name: updated.name, address: updated.address, phone: updated.phone } } });
        return updated;
      });
    } catch (e) { throw this.nameTaken(e); }
  }

  private async withinLimit(tx: Prisma.TransactionClient, organizationId: string) {
    const sub = await tx.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
    if (!sub || !['TRIAL', 'ACTIVE'].includes(sub.status) || (sub.graceUntil ?? sub.expiresAt) <= new Date()) throw new ForbiddenException('SUBSCRIPTION_READ_ONLY');
    const active = await tx.branch.count({ where: { organizationId, archivedAt: null } });
    if (sub.plan.maxBranches !== null && active >= sub.plan.maxBranches) throw new ForbiddenException('BRANCH_LIMIT');
  }
  private nameTaken(e: unknown) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? new ConflictException('BRANCH_NAME_TAKEN') : e;
  }
}

/** Which branches a colleague works in: they see and take in work only there. */
@Controller('staff')
class StaffBranchesController {
  constructor(private readonly db: Database) {}
  @Put(':id/branches')
  async set(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: StaffBranchesDto) {
    ownerOnly(a);
    const user = await this.db.user.findFirst({ where: { id, organizationId: a.organizationId }, include: { roles: { include: { role: true } } } });
    if (!user) throw new NotFoundException();
    if (user.roles.some(r => r.role.systemKey === 'OWNER')) throw new BadRequestException('OWNER_SEES_ALL');
    const ids = [...new Set(d.branchIds)];
    const branches = await this.db.branch.findMany({ where: { organizationId: a.organizationId, id: { in: ids } }, select: { id: true } });
    if (branches.length !== ids.length) throw new BadRequestException('BRANCH_UNAVAILABLE');
    await this.db.$transaction([
      this.db.userBranch.deleteMany({ where: { organizationId: a.organizationId, userId: id } }),
      this.db.userBranch.createMany({ data: ids.map(branchId => ({ organizationId: a.organizationId, userId: id, branchId })) }),
      this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'STAFF_BRANCHES_CHANGED', entityId: id, newValue: { branchIds: ids } } }),
    ]);
    return { branchIds: ids };
  }
}

@Module({ controllers: [BranchesController, StaffBranchesController] })
export class BranchesModule {}
