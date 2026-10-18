import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Database } from '../database';
import type { Actor } from './security';
import { PhoneVerification } from './verification';
import { billingSettings, signupPlan } from '../platform/billing';
import { createOrganization, slugFor } from '../platform/organizations';
import { BotService } from '../bot/bot.service';
import { esc } from '../bot/telegram.client';

/** Bump when the offer or the privacy policy text changes in a way users must accept again. */
export const TERMS_VERSION = '2026-10-19';
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';
  constructor(private readonly db: Database, private readonly jwt: JwtService, private readonly verification: PhoneVerification, private readonly bot: BotService) {}
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
    // 400, not 401: a wrong current password must not look like an expired session to the client.
    if (!await argon2.verify(user.passwordHash, currentPassword)) throw new BadRequestException('Current password is incorrect');
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

  /** A fresh 30-day session for a user who just proved who they are (sign-up, reset). */
  private async openSession(tx: Prisma.TransactionClient, userId: string, organizationId: string, action: string) {
    const token = this.mint();
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await tx.session.create({ data: { id: token.id, userId, tokenFamilyId: token.id, refreshTokenHash: token.hash, expiresAt } });
    await tx.auditLog.create({ data: { organizationId, actorId: userId, action, entityId: token.id } });
    return { token, expiresAt };
  }

  /**
   * Self sign-up: a verified phone creates a service, its owner and a trial on the sign-up plan,
   * then signs the owner in. One phone owns at most one service.
   */
  async signup(d: { proof: string; serviceName: string; ownerName: string; login: string; password: string }) {
    const billing = await billingSettings(this.db);
    if (!billing.signupOpen) throw new ForbiddenException('SIGNUP_CLOSED');
    const plan = await signupPlan(this.db, billing);
    if (!plan) throw new ServiceUnavailableException('SIGNUP_CLOSED');
    const phone = await this.verification.peek(d.proof, 'signup');
    const login = d.login.toLowerCase();
    // Check before using the proof up, so a taken login can be corrected without a new code.
    if (await this.db.user.findUnique({ where: { login } })) throw new ConflictException('LOGIN_TAKEN');
    if (await this.ownsService(phone)) throw new ConflictException('PHONE_TAKEN');
    const passwordHash = await argon2.hash(d.password, { type: argon2.argon2id });
    await this.verification.consume(d.proof, 'signup');
    try {
      const created = await this.db.$transaction(async tx => {
        const { org, user } = await createOrganization(tx, {
          name: d.serviceName.trim(), slug: slugFor(d.serviceName), planId: plan.id, login, passwordHash,
          ownerName: d.ownerName.trim(), phone, mustChangePassword: false, actorId: null, action: 'SELF_SIGNUP',
        }, billing);
        // The sign-up name is the one on receipts and the tracking page until changed in Settings.
        await tx.organizationSetting.create({ data: { organizationId: org.id, key: 'general', value: { name: org.name, phone } } });
        await tx.auditLog.create({ data: { organizationId: org.id, actorId: user.id, action: 'TERMS_ACCEPTED', entityId: user.id, newValue: { version: TERMS_VERSION } } });
        const session = await this.openSession(tx, user.id, org.id, 'AUTH_LOGIN');
        return { org, user, session };
      }, { timeout: 15000 });
      void this.bot.notifyAdmins(`🆕 Yangi servis o‘zi ro‘yxatdan o‘tdi: <b>${esc(created.org.name)}</b> (egasi: ${esc(created.user.firstName)}, ${esc(phone)}, tarif: ${esc(plan.name)}, sinov ${billing.trialDays} kun)`).catch(() => undefined);
      return this.response(created.user.id, created.session.token.id, created.session.token.refresh, created.session.expiresAt);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('LOGIN_TAKEN');
      throw e;
    }
  }
  private async ownsService(phone: string) {
    return !!await this.db.user.findFirst({ where: { phone, roles: { some: { role: { systemKey: 'OWNER' } } } }, select: { id: true } });
  }

  /**
   * Forgot password: a verified phone sets a new password for its account and signs in.
   * When several accounts share the phone, the caller picks one by login (409 lists them).
   */
  async resetPassword(d: { proof: string; newPassword: string; login?: string | undefined }) {
    const phone = await this.verification.peek(d.proof, 'reset');
    const accounts = await this.db.user.findMany({ where: { phone, status: 'ACTIVE' }, select: { id: true, login: true, organizationId: true, organization: { select: { name: true } } } });
    if (!accounts.length) throw new NotFoundException('NO_ACCOUNT');
    const pick = d.login ? accounts.find(a => a.login === d.login!.toLowerCase()) : accounts.length === 1 ? accounts[0] : undefined;
    if (!pick) {
      // The phone is proven, so its own logins may be shown to choose from.
      throw new ConflictException({ message: 'MANY_ACCOUNTS', accounts: accounts.map(a => ({ login: a.login, service: a.organization.name })) });
    }
    const passwordHash = await argon2.hash(d.newPassword, { type: argon2.argon2id });
    await this.verification.consume(d.proof, 'reset');
    const session = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${pick.id} FOR UPDATE`;
      await tx.user.update({ where: { id: pick.id }, data: { passwordHash, mustChangePassword: false } });
      await tx.session.updateMany({ where: { userId: pick.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: pick.organizationId, actorId: pick.id, action: 'AUTH_PASSWORD_RESET', entityId: pick.id } });
      return this.openSession(tx, pick.id, pick.organizationId, 'AUTH_LOGIN');
    });
    return this.response(pick.id, session.token.id, session.token.refresh, session.expiresAt);
  }

  me(actor: Actor) {
    return this.db.user.findFirstOrThrow({
      where: { id: actor.userId, organizationId: actor.organizationId },
      select: { id: true, login: true, firstName: true, lastName: true, organizationId: true, mustChangePassword: true, status: true, organization: { select: { blockedAt: true, blockReason: true } }, roles: { select: { role: { select: { systemKey: true } } } } },
    }).then(({ roles, organization, ...user }) => {
      const keys = roles.map(r => r.role.systemKey).filter((k): k is string => !!k);
      // Highest role decides which dashboard the UI shows.
      const role = ['OWNER', 'STAFF'].find(k => keys.includes(k)) ?? null;
      return { ...user, blocked: organization.blockedAt ? { at: organization.blockedAt, reason: organization.blockReason } : null, role, roles: keys, permissions: actor.permissions, branchIds: actor.branchIds, support: !!actor.support, ...(actor.support ? { mustChangePassword: false } : {}) };
    });
  }
}
