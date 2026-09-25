import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Database } from '../database';
import type { Actor } from './security';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';
  constructor(private readonly db: Database, private readonly jwt: JwtService) {}
  async onModuleInit() { this.dummyHash = await argon2.hash(randomBytes(32), { type: argon2.argon2id }); }

  private mint() {
    const id = randomUUID();
    const refresh = id + '.' + randomBytes(32).toString('base64url');
    return { id, refresh, hash: tokenHash(refresh) };
  }

  private async response(userId: string, sessionId: string, refreshToken: string, expiresAt: Date) {
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: sessionId }, {
      algorithm: 'HS256', issuer: 'myservice', audience: 'myservice-api', expiresIn: '15m',
    });
    return { accessToken, refreshToken, expiresAt, expiresIn: 900 };
  }

  async login(login: string, password: string) {
    const user = await this.db.user.findUnique({ where: { login: login.toLowerCase() } });
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyHash, password);
    if (!user || !valid || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');
    const token = this.mint();
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await this.db.$transaction(async tx => {
      // Serialize login with password changes and suspension.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.passwordHash !== user.passwordHash || current.status !== 'ACTIVE') throw new UnauthorizedException();
      await tx.session.create({ data: { id: token.id, userId: user.id, tokenFamilyId: token.id, refreshTokenHash: token.hash, expiresAt } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: 'AUTH_LOGIN', entityId: token.id } });
    });
    return this.response(user.id, token.id, token.refresh, expiresAt);
  }

  async refresh(raw: unknown) {
    if (typeof raw !== 'string' || raw.length > 200) throw new UnauthorizedException();
    const id = raw.split('.')[0];
    if (!id) throw new UnauthorizedException();
    const initial = await this.db.session.findUnique({ where: { id } });
    if (!initial || initial.refreshTokenHash !== tokenHash(raw)) throw new UnauthorizedException();
    const token = this.mint();
    const result = await this.db.$transaction(async tx => {
      // User row is the common lock for refresh, password changes and suspension.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${initial.userId} FOR UPDATE`;
      const session = await tx.session.findUniqueOrThrow({ where: { id }, include: { user: true } });
      if (session.status !== 'ACTIVE') {
        await tx.session.updateMany({ where: { tokenFamilyId: session.tokenFamilyId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
        await tx.auditLog.create({ data: { organizationId: session.user.organizationId, actorId: session.userId, action: 'AUTH_REFRESH_REUSE', entityId: session.id } });
        return null; // Commit family revocation before throwing.
      }
      if (session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') return null;
      await tx.session.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), replacedById: token.id } });
      await tx.session.create({ data: {
        id: token.id, userId: session.userId, tokenFamilyId: session.tokenFamilyId,
        refreshTokenHash: token.hash, expiresAt: session.expiresAt,
      } });
      return { userId: session.userId, expiresAt: session.expiresAt };
    });
    if (!result) throw new UnauthorizedException();
    return this.response(result.userId, token.id, token.refresh, result.expiresAt);
  }

  async logout(actor: Actor) {
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId} FOR UPDATE`;
      const session = await tx.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
      await tx.session.updateMany({ where: { tokenFamilyId: session.tokenFamilyId }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'AUTH_LOGOUT', entityId: actor.sessionId } });
    });
  }

  async changePassword(actor: Actor, currentPassword: string, newPassword: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!await argon2.verify(user.passwordHash, currentPassword)) throw new UnauthorizedException();
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const token = this.mint();
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
      if (current.passwordHash !== user.passwordHash || current.status !== 'ACTIVE') throw new UnauthorizedException();
      await tx.user.update({ where: { id: actor.userId }, data: { passwordHash, mustChangePassword: false } });
      await tx.session.updateMany({ where: { userId: actor.userId }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.session.create({ data: { id: token.id, userId: actor.userId, tokenFamilyId: token.id, refreshTokenHash: token.hash, expiresAt } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.userId, action: 'AUTH_PASSWORD_CHANGED', entityId: actor.userId } });
    });
    return this.response(actor.userId, token.id, token.refresh, expiresAt);
  }

  me(actor: Actor) {
    return this.db.user.findFirstOrThrow({
      where: { id: actor.userId, organizationId: actor.organizationId },
      select: { id: true, login: true, firstName: true, lastName: true, organizationId: true, mustChangePassword: true, status: true, roles: { select: { role: { select: { systemKey: true } } } } },
    }).then(({ roles, ...user }) => {
      const keys = roles.map(r => r.role.systemKey).filter((k): k is string => !!k);
      // Highest role decides which dashboard the UI shows.
      const role = ['OWNER', 'ADMIN', 'MANAGER', 'TECHNICIAN'].find(k => keys.includes(k)) ?? null;
      return { ...user, role, roles: keys, permissions: actor.permissions, branchIds: actor.branchIds };
    });
  }
}
