import { Module, Controller, Get, Post, Patch, Param, Body, Query, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiProperty, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsIn, Length, Matches, IsArray, ArrayNotEmpty, ArrayUnique, IsOptional, IsEmail } from 'class-validator';
import * as argon2 from 'argon2';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';

class CreateStaffDto {
  @ApiProperty() @IsString() @Length(3, 64) @Matches(/^[a-zA-Z0-9_.-]+$/) login!: string;
  @ApiProperty() @IsString() @Length(12, 128) temporaryPassword!: string;
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiProperty() @IsOptional() @IsString() @Length(0, 100) lastName?: string;
  @ApiProperty() @IsOptional() @IsEmail() email?: string;
  @ApiProperty() @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
  @ApiProperty() @IsIn(['ADMIN', 'MANAGER', 'TECHNICIAN']) role!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsString({ each: true }) branchIds!: string[];
}
class UpdateStaffDto {
  @ApiProperty() @IsOptional() @IsString() @Length(1, 100) firstName?: string;
  @ApiProperty() @IsOptional() @IsString() @Length(0, 100) lastName?: string;
  @ApiProperty() @IsOptional() @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone?: string;
  @ApiProperty() @IsOptional() @IsEmail() email?: string;
  @ApiProperty() @IsOptional() @IsIn(['ADMIN', 'MANAGER', 'TECHNICIAN']) role?: string;
  @ApiProperty({ type: [String] }) @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsString({ each: true }) branchIds?: string[];
}
class CompensationDto {
  @ApiProperty() @IsIn(['SALARY','PERCENTAGE','FIXED_PER_JOB','SALARY_PLUS_PERCENTAGE']) type!: string;
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) salary!: string;
  @ApiProperty() @IsString() @Matches(/^\d{1,3}(\.\d{1,2})?$/) percentage!: string;
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) fixedPerJob!: string;
}
class BranchDto {
  @IsString() @Length(1,100) name!: string;
}
class StatusDto {
  @ApiProperty() @IsIn(['ACTIVE', 'SUSPENDED', 'ARCHIVED']) status!: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}
const safe = { id: true, login: true, firstName: true, lastName: true, phone: true, email: true, status: true, mustChangePassword: true, roles: { select: { role: { select: { name: true, systemKey: true } } } }, branches: { select: { branch: { select: { id: true, name: true } } } } } as const;

@ApiTags('staff') @ApiBearerAuth()
@Controller('staff')
class StaffController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('staff.view')
  list(@CurrentActor() actor: Actor) {
    return this.db.user.findMany({ where: { organizationId: actor.organizationId }, select: safe, take: 100, orderBy: { createdAt: 'desc' } });
  }
  @Get(':id/activity') @Permissions('staff.view')
  async activity(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId } })) throw new NotFoundException();
    return this.db.auditLog.findMany({ where: { organizationId: actor.organizationId, actorId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  @Get(':id/active') @Permissions('staff.view')
  async isActive(@CurrentActor() actor: Actor, @Param('id') id: string, @Query('days') daysParam?: string) {
    if (!await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId } })) throw new NotFoundException();
    const days = Math.min(Math.max(parseInt(daysParam ?? '5', 10) || 5, 1), 30);
    const since = new Date(Date.now() - days * 86400000);
    // Variant B: auditLog (login, status changes) + document changes (order status, assignments, repairs)
    const [auditCount, orderActivityCount] = await Promise.all([
      this.db.auditLog.count({ where: { organizationId: actor.organizationId, actorId: id, createdAt: { gte: since } } }),
      this.db.orderHistory.count({ where: { organizationId: actor.organizationId, actorId: id, createdAt: { gte: since } } }),
    ]);
    return { userId: id, days, since, active: auditCount + orderActivityCount > 0, auditEvents: auditCount, orderEvents: orderActivityCount };
  }
  @Get(':id/statistics') @Permissions('staff.view')
  async statistics(@CurrentActor() actor: Actor, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId } })) throw new NotFoundException();
    const start=from?new Date(from):new Date(Date.now()-30*86400000),end=to?new Date(to):new Date();
    if(isNaN(start.getTime())||isNaN(end.getTime())||start>end||end.getTime()-start.getTime()>366*86400000)throw new BadRequestException('Invalid range');
    const [assignments,sessions,actions,commission,warrantyReturns]=await Promise.all([
      this.db.orderAssignment.findMany({where:{organizationId:actor.organizationId,userId:id},include:{order:{select:{status:true,history:{where:{toStatus:'DELIVERED',createdAt:{gte:start,lte:end}},select:{id:true}}}}}}),
      this.db.repairSession.findMany({where:{organizationId:actor.organizationId,userId:id,startedAt:{gte:start,lte:end},endedAt:{not:null}}}),
      this.db.repairAction.aggregate({where:{organizationId:actor.organizationId,userId:id,completedAt:{gte:start,lte:end}},_sum:{laborAmount:true},_count:true}),
      this.db.commissionEntry.aggregate({where:{organizationId:actor.organizationId,userId:id,createdAt:{gte:start,lte:end}},_sum:{amount:true}}),
      this.db.warrantyClaim.count({where:{organizationId:actor.organizationId,createdAt:{gte:start,lte:end},parentOrder:{assignments:{some:{userId:id}}}}}),
    ]);
    const completed=assignments.filter(item=>item.order.history.length>0).length,active=assignments.filter(item=>!['DELIVERED','CANCELLED','UNREPAIRABLE'].includes(item.order.status)).length;
    const repairSeconds=sessions.reduce((sum,item)=>sum+Math.max(0,(item.endedAt!.getTime()-item.startedAt.getTime())/1000),0);
    return{assigned:assignments.length,completed,active,averageRepairSeconds:sessions.length?Math.round(repairSeconds/sessions.length):0,warrantyReturns,workRevenue:actions._sum.laborAmount??0,repairActions:actions._count,commission:commission._sum.amount??0,from:start,to:end};
  }
  @Get(':id') @Permissions('staff.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const user = await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId }, select: safe });
    if (!user) throw new NotFoundException();
    return user;
  }
  @Post() @Permissions('staff.manage')
  async create(@CurrentActor() actor: Actor, @Body() dto: CreateStaffDto) {
    if (!actor.owner) throw new ForbiddenException('Only owner can create staff');
    const passwordHash = await argon2.hash(dto.temporaryPassword, { type: argon2.argon2id });
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
        const sub = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
        if (!sub || !['TRIAL', 'ACTIVE'].includes(sub.status) || (sub.graceUntil ?? sub.expiresAt) <= new Date()) throw new ForbiddenException('SUBSCRIPTION_READ_ONLY');
        const count = await tx.user.count({ where: { organizationId: actor.organizationId, status: { in: ['ACTIVE', 'INVITED'] } } });
        if (sub.plan.maxStaff !== null && count >= sub.plan.maxStaff) throw new ForbiddenException('STAFF_LIMIT');
        const branches = await tx.branch.count({ where: { id: { in: dto.branchIds }, organizationId: actor.organizationId } });
        if (branches !== dto.branchIds.length) throw new NotFoundException('Branch not found');
        const role = await tx.role.findFirst({ where: { organizationId: actor.organizationId, systemKey: dto.role } });
        if (!role) throw new NotFoundException('Role not configured');
        const user = await tx.user.create({ data: {
          organizationId: actor.organizationId, login: dto.login.toLowerCase(), firstName: dto.firstName,
          ...(dto.lastName ? { lastName: dto.lastName } : {}), ...(dto.email ? { email: dto.email } : {}),
          phone: dto.phone, passwordHash, mustChangePassword: true,
        }, select: safe });
        await tx.userRole.create({ data: { organizationId: actor.organizationId, userId: user.id, roleId: role.id } });
        await tx.userBranch.createMany({ data: dto.branchIds.map(branchId => ({ organizationId: actor.organizationId, userId: user.id, branchId })) });
        await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'STAFF_CREATED', entityId: user.id } });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Login unavailable');
      throw error;
    }
  }
  @Patch(':id') @Permissions('staff.manage')
  async update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    if (!actor.owner) throw new ForbiddenException('Only owner can edit staff');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId }, include: { roles: { include: { role: true } } } });
      if (!user) throw new NotFoundException();
      const isOwner = user.roles.some(r => r.role.systemKey === 'OWNER');
      if (isOwner && (dto.role || dto.branchIds)) throw new ForbiddenException('Owner role and branches are managed separately');
      if (dto.branchIds) {
        const count = await tx.branch.count({ where: { id: { in: dto.branchIds }, organizationId: actor.organizationId } });
        if (count !== dto.branchIds.length) throw new NotFoundException('Branch not found');
        await tx.userBranch.deleteMany({ where: { organizationId: actor.organizationId, userId: id } });
        await tx.userBranch.createMany({ data: dto.branchIds.map(branchId => ({ organizationId: actor.organizationId, userId: id, branchId })) });
      }
      if (dto.role) {
        const role = await tx.role.findFirst({ where: { organizationId: actor.organizationId, systemKey: dto.role } });
        if (!role) throw new NotFoundException('Role not configured');
        await tx.userRole.deleteMany({ where: { organizationId: actor.organizationId, userId: id } });
        await tx.userRole.create({ data: { organizationId: actor.organizationId, userId: id, roleId: role.id } });
      }
      const result = await tx.user.update({ where: { id }, data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      }, select: safe });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'STAFF_UPDATED', entityId: id, oldValue: { firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.roles.map(r => r.role.systemKey) }, newValue: JSON.parse(JSON.stringify(dto)) } });
      return result;
    });
  }
  @Get(':id/compensation') @Permissions('staff.view')
  async currentCompensation(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId } })) throw new NotFoundException();
    return this.db.technicianCompensation.findFirst({ where: { organizationId: actor.organizationId, userId: id, effectiveTo: null }, orderBy: { effectiveFrom: 'desc' } });
  }
  @Post(':id/compensation') @Permissions('staff.manage')
  async compensation(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: CompensationDto) {
    if (!actor.owner) throw new ForbiddenException();
    const percentage = new Prisma.Decimal(dto.percentage);
    if (percentage.lessThan(0) || percentage.greaterThan(100)) throw new ConflictException('Percentage must be 0..100');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      const subscription = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
      const flags = subscription?.plan.features as Record<string, unknown> | undefined;
      if (!flags?.staff_commission) throw new ForbiddenException('STAFF_COMMISSION_NOT_IN_PLAN');
      const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId, roles: { some: { role: { systemKey: 'TECHNICIAN' } } } } });
      if (!user) throw new NotFoundException('Technician not found');
      const now = new Date();
      await tx.technicianCompensation.updateMany({ where: { organizationId: actor.organizationId, userId: id, effectiveTo: null }, data: { effectiveTo: now } });
      const rule = await tx.technicianCompensation.create({ data: { organizationId: actor.organizationId, userId: id, type: dto.type, salary: dto.salary, percentage, fixedPerJob: dto.fixedPerJob, effectiveFrom: now } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'COMPENSATION_CHANGED', entityId: id } });
      return rule;
    });
  }
  @Patch(':id/status') @Permissions('staff.manage')
  async status(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: StatusDto) {
    if (!actor.owner || id === actor.userId) throw new ForbiddenException();
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId }, include: { roles: { include: { role: true } } } });
      if (!user) throw new NotFoundException();
      if (user.roles.some(r => r.role.systemKey === 'OWNER')) throw new ForbiddenException('Owner cannot be suspended here');
      if (dto.status === 'ACTIVE' && user.status !== 'ACTIVE' && user.status !== 'INVITED') {
        const sub = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
        const count = await tx.user.count({ where: { organizationId: actor.organizationId, status: { in: ['ACTIVE', 'INVITED'] } } });
        if (!sub || (sub.plan.maxStaff !== null && count >= sub.plan.maxStaff)) throw new ForbiddenException('STAFF_LIMIT');
      }
      const result = await tx.user.update({ where: { id }, data: { status: dto.status }, select: safe });
      if (dto.status !== 'ACTIVE') await tx.session.updateMany({ where: { userId: id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'STAFF_' + dto.status, entityId: id } });
      return result;
    });
  }
}
@Controller('branches')
class BranchController {
  constructor(private readonly db: Database) {}
  @Post() @Permissions('settings.manage')
  async create(@CurrentActor() actor: Actor, @Body() dto: BranchDto) {
    if (!actor.owner) throw new ForbiddenException();
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
      const sub = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
      const flags = sub?.plan.features as Record<string, unknown> | undefined;
      const count = await tx.branch.count({ where: { organizationId: actor.organizationId } });
      if (!sub || (count > 0 && !flags?.multi_branch) || (sub.plan.maxBranches !== null && count >= sub.plan.maxBranches)) throw new ForbiddenException('BRANCH_LIMIT');
      const branch = await tx.branch.create({ data: { organizationId: actor.organizationId, name: dto.name } });
      await tx.userBranch.create({ data: { organizationId: actor.organizationId, userId: actor.userId, branchId: branch.id } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'BRANCH_CREATED', entityId: branch.id } });
      return branch;
    });
  }
  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.db.branch.findMany({ where: { organizationId: actor.organizationId, ...(actor.owner ? {} : { id: { in: actor.branchIds } }) }, select: { id: true, name: true } });
  }
}
@Module({ controllers: [StaffController, BranchController] })
export class StaffModule {}
