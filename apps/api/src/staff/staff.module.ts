import { Module, Controller, Get, Post, Patch, Param, Body, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ApiProperty, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsIn, Length, Matches, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';

class CreateStaffDto {
  @ApiProperty() @IsString() @Length(3, 64) @Matches(/^[a-zA-Z0-9_.-]+$/) login!: string;
  @ApiProperty() @IsString() @Length(12, 128) temporaryPassword!: string;
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiProperty() @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
  @ApiProperty() @IsIn(['ADMIN', 'MANAGER', 'TECHNICIAN']) role!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsString({ each: true }) branchIds!: string[];
}
class StatusDto {
  @ApiProperty() @IsIn(['ACTIVE', 'SUSPENDED', 'ARCHIVED']) status!: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}
const safe = { id: true, login: true, firstName: true, lastName: true, phone: true, status: true, mustChangePassword: true } as const;

@ApiTags('staff') @ApiBearerAuth()
@Controller('staff')
class StaffController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('staff.view')
  list(@CurrentActor() actor: Actor) {
    return this.db.user.findMany({ where: { organizationId: actor.organizationId }, select: safe, take: 100, orderBy: { createdAt: 'desc' } });
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
  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.db.branch.findMany({ where: { organizationId: actor.organizationId, ...(actor.owner ? {} : { id: { in: actor.branchIds } }) }, select: { id: true, name: true } });
  }
}
@Module({ controllers: [StaffController, BranchController] })
export class StaffModule {}
