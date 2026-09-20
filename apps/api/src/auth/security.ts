import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Database } from '../database';

export const Public = () => SetMetadata('public', true);
export const Permissions = (...permissions: string[]) => SetMetadata('permissions', permissions);
export const AllowPasswordChange = () => SetMetadata('allowPasswordChange', true);
export interface Actor {
  userId: string;
  organizationId: string;
  sessionId: string;
  branchIds: string[];
  permissions: string[];
  owner: boolean;
}
export type AuthRequest = Request & { actor: Actor };
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest<AuthRequest>().actor);

@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(private readonly db: Database, private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ')) throw new UnauthorizedException();
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(bearer.slice(7), {
        algorithms: ['HS256'], issuer: 'myservice', audience: 'myservice-api',
      });
    } catch { throw new UnauthorizedException(); }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { branches: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } },
    });
    if (!session || session.userId !== payload.sub || session.status !== 'ACTIVE' ||
        session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') throw new UnauthorizedException();
    const user = session.user;
    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>('allowPasswordChange', targets)) {
      throw new ForbiddenException('PASSWORD_CHANGE_REQUIRED');
    }
    const permissions = [...new Set(user.roles.flatMap(r => r.role.permissions.map(p => p.permission.key)))];
    req.actor = {
      userId: user.id, organizationId: user.organizationId, sessionId: session.id,
      branchIds: user.branches.map(b => b.branchId), permissions,
      owner: user.roles.some(r => r.role.systemKey === 'OWNER'),
    };
    const required = this.reflector.getAllAndOverride<string[]>('permissions', targets) ?? [];
    if (!required.every(p => permissions.includes(p))) throw new ForbiddenException();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/api/auth/')) {
      const sub = await this.db.subscription.findUnique({ where: { organizationId: user.organizationId } });
      if (!sub || !['ACTIVE', 'TRIAL'].includes(sub.status) ||
          (sub.graceUntil ?? sub.expiresAt) <= new Date()) throw new ForbiddenException('SUBSCRIPTION_READ_ONLY');
    }
    return true;
  }
}
