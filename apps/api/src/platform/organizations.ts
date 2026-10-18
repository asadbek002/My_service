import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ALL_PERMISSIONS } from '../auth/permissions';
import type { BillingSettings } from './billing';

// Simplified product: the owner and staff share every business permission.
const rolePermissions: Record<string, readonly string[]> = { OWNER: ALL_PERMISSIONS, STAFF: ALL_PERMISSIONS };

export interface NewOrganization {
  name: string; slug: string; planId: string;
  login: string; passwordHash: string; ownerName: string; phone: string;
  /** Platform-made accounts start with a temporary password; self sign-up chose its own. */
  mustChangePassword: boolean;
  /** Who did it, for the audit log: a platform admin, or null for self sign-up. */
  actorId: string | null;
  action: 'PLATFORM_ORGANIZATION_CREATED' | 'SELF_SIGNUP';
}

/** A service with its main branch, owner, the two roles and a trial subscription. Run inside a transaction. */
export async function createOrganization(tx: Prisma.TransactionClient, d: NewOrganization, billing: BillingSettings) {
  const org = await tx.organization.create({ data: { name: d.name, slug: d.slug } });
  const branch = await tx.branch.create({ data: { organizationId: org.id, name: 'Asosiy filial' } });
  const user = await tx.user.create({ data: { organizationId: org.id, login: d.login.toLowerCase(), firstName: d.ownerName, phone: d.phone, passwordHash: d.passwordHash, mustChangePassword: d.mustChangePassword } });
  await tx.userBranch.create({ data: { organizationId: org.id, userId: user.id, branchId: branch.id } });
  for (const [systemKey, keys] of Object.entries(rolePermissions)) {
    const role = await tx.role.create({ data: { organizationId: org.id, name: systemKey, systemKey } });
    for (const key of keys) {
      const permission = await tx.permission.upsert({ where: { key }, create: { key }, update: {} });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    if (systemKey === 'OWNER') await tx.userRole.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
  }
  const trialEnds = new Date(Date.now() + billing.trialDays * 86400000);
  await tx.subscription.create({ data: { organizationId: org.id, planId: d.planId, expiresAt: trialEnds, graceUntil: new Date(trialEnds.getTime() + billing.graceDays * 86400000) } });
  await tx.auditLog.create({ data: { organizationId: org.id, actorId: d.actorId, action: d.action, entityId: org.id } });
  return { org, user };
}

/** "Mobile Fix Chilonzor" → "mobile-fix-chilonzor-k3x9": readable, and unique enough to not collide. */
export function slugFor(name: string) {
  const base = name.toLowerCase().replace(/[ʻʼ‘’'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'servis';
  return `${base}-${randomBytes(3).toString('hex')}`;
}
