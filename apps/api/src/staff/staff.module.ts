import { Module, Controller, Get, Post, Patch, Param, Body, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiProperty, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsIn, Length, Matches, IsOptional, IsEmail } from 'class-validator';
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
}
class UpdateStaffDto {
  @ApiProperty() @IsOptional() @IsString() @Length(1, 100) firstName?: string;
  @ApiProperty() @IsOptional() @IsString() @Length(0, 100) lastName?: string;
  @ApiProperty() @IsOptional() @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone?: string;
  @ApiProperty() @IsOptional() @IsEmail() email?: string;
}
class ResetPasswordDto {
  @ApiProperty() @IsString() @Length(12, 128) temporaryPassword!: string;
}
class StatusDto {
  @ApiProperty() @IsIn(['ACTIVE', 'SUSPENDED', 'ARCHIVED']) status!: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}
const safe = { id: true, login: true, firstName: true, lastName: true, phone: true, email: true, status: true, mustChangePassword: true, createdAt: true, roles: { select: { role: { select: { name: true, systemKey: true } } } } } as const;
const isOwnerUser = (user: { roles: { role: { systemKey: string | null } }[] }) => user.roles.some(r => r.role.systemKey === 'OWNER');

@ApiTags('staff') @ApiBearerAuth()
@Controller('staff')
class StaffController {
  constructor(private readonly db: Database) {}
  @Get() @Permissions('staff.view')
  list(@CurrentActor() actor: Actor) {
    return this.db.user.findMany({ where: { organizationId: actor.organizationId }, select: safe, take: 200, orderBy: { createdAt: 'asc' } });
  }
  @Get(':id/activity') @Permissions('staff.view')
  async activity(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId } })) throw new NotFoundException();
    return this.db.auditLog.findMany({ where: { organizationId: actor.organizationId, actorId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  @Get(':id') @Permissions('staff.view')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const user = await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId }, select: safe });
    if (!user) throw new NotFoundException();
    return user;
  }
  // Staff have the owner's rights, including adding colleagues; only the owner account itself is protected.
  @Post() @Permissions('staff.manage')
  async create(@CurrentActor() actor: Actor, @Body() dto: CreateStaffDto) {
    const passwordHash = await argon2.hash(dto.temporaryPassword, { type: argon2.argon2id });
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
        const sub = await tx.subscription.findUnique({ where: { organizationId: actor.organizationId }, include: { plan: true } });
        if (!sub || !['TRIAL', 'ACTIVE'].includes(sub.status) || (sub.graceUntil ?? sub.expiresAt) <= new Date()) throw new ForbiddenException('SUBSCRIPTION_READ_ONLY');
        const count = await tx.user.count({ where: { organizationId: actor.organizationId, status: { in: ['ACTIVE', 'INVITED'] } } });
        if (sub.plan.maxStaff !== null && count >= sub.plan.maxStaff) throw new ForbiddenException('STAFF_LIMIT');
        const role = await tx.role.findFirst({ where: { organizationId: actor.organizationId, systemKey: 'STAFF' } });
        if (!role) throw new NotFoundException('Role not configured');
        const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId }, select: { id: true } });
        const user = await tx.user.create({ data: {
          organizationId: actor.organizationId, login: dto.login.toLowerCase(), firstName: dto.firstName,
          ...(dto.lastName ? { lastName: dto.lastName } : {}), ...(dto.email ? { email: dto.email } : {}),
          phone: dto.phone, passwordHash, mustChangePassword: true,
        }, select: safe });
        await tx.userRole.create({ data: { organizationId: actor.organizationId, userId: user.id, roleId: role.id } });
        if (branches.length) await tx.userBranch.createMany({ data: branches.map(b => ({ organizationId: actor.organizationId, userId: user.id, branchId: b.id })) });
        await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'STAFF_CREATED', entityId: user.id } });
        // Read back so the response includes the role assigned above.
        return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: safe });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Login unavailable');
      throw error;
    }
  }
  @Patch(':id') @Permissions('staff.manage')
  async update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.db.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId }, include: { roles: { include: { role: true } } } });
      if (!user) throw new NotFoundException();
      if (isOwnerUser(user) && !actor.owner) throw new ForbiddenException('Only the owner can edit the owner account');
      const result = await tx.user.update({ where: { id }, data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      }, select: safe });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'STAFF_UPDATED', entityId: id, oldValue: { firstName: user.firstName, lastName: user.lastName, phone: user.phone, email: user.email }, newValue: JSON.parse(JSON.stringify(dto)) } });
      return result;
    });
  }
  // A colleague forgot their password: set a temporary one; they must change it at next login.
  @Post(':id/reset-password') @Permissions('staff.manage')
  async resetPassword(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    if (id === actor.userId) throw new ForbiddenException('Use change password for your own account');
    const user = await this.db.user.findFirst({ where: { id, organizationId: actor.organizationId }, include: { roles: { include: { role: true } } } });
    if (!user) throw new NotFoundException();
    if (isOwnerUser(user) && !actor.owner) throw new ForbiddenException('Only the owner can edit the owner account');
    const passwordHash = await argon2.hash(dto.temporaryPassword, { type: argon2.argon2id });
    await this.db.$transaction([
      this.db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      this.db.session.updateMany({ where: { userId: id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } }),
      this.db.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'STAFF_PASSWORD_RESET', entityId: id } }),
    ]);
    return { ok: true };
  }
  @Patch(':id/status') @Permissions('staff.manage')
  async status(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: StatusDto) {
    if (id === actor.userId) throw new ForbiddenException('You cannot change your own status');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;
      const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId }, include: { roles: { include: { role: true } } } });
      if (!user) throw new NotFoundException();
      // Nobody inside the organization can lock the owner out.
      if (isOwnerUser(user)) throw new ForbiddenException('Owner cannot be suspended');
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
@Module({ controllers: [StaffController] })
export class StaffModule {}
