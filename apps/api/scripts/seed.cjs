require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const db = new PrismaClient();
const permissionKeys = [
  'orders.view','orders.create','orders.edit','orders.assign','orders.change_status',
  'customers.view','customers.edit','diagnostics.create','inventory.view','inventory.use',
  'inventory.manage','inventory.view_cost','payments.view','payments.create','payments.refund','payments.deliver_with_debt',
  'reports.view','reports.finance','expenses.manage','staff.view','staff.manage','settings.manage',
];
async function main() {
  const password = process.env.INITIAL_OWNER_PASSWORD;
  const login = (process.env.INITIAL_OWNER_LOGIN || 'asadbek1035').toLowerCase();
  const phone = process.env.INITIAL_OWNER_PHONE;
  if (!password || password.length < 12 || !phone) throw new Error('INITIAL_OWNER_PASSWORD (12+ characters) and INITIAL_OWNER_PHONE required');
  if (await db.user.findUnique({ where: { login } })) { console.log('Owner exists; seed did not reset credentials'); return; }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await db.$transaction(async tx => {
    const plan = await tx.plan.upsert({ where: { name: 'Development' }, update: {}, create: { name: 'Development', features: { inventory: true, telegram: true, sms: true, multi_branch: true, advanced_reports: true, staff_commission: true, exports: true } } });
    const org = await tx.organization.create({ data: { name: 'MyService', slug: 'myservice' } });
    const branch = await tx.branch.create({ data: { organizationId: org.id, name: 'Asosiy filial' } });
    await tx.subscription.create({ data: { organizationId: org.id, planId: plan.id, expiresAt: new Date(Date.now() + 30 * 86400000) } });
    const permissions = [];
    for (const key of permissionKeys) permissions.push(await tx.permission.upsert({ where: { key }, update: {}, create: { key } }));
    const roleIds = {};
    for (const systemKey of ['OWNER','ADMIN','MANAGER','TECHNICIAN']) {
      const role = await tx.role.create({ data: { organizationId: org.id, name: systemKey, systemKey } });
      roleIds[systemKey] = role.id;
      const allowed = systemKey === 'OWNER' ? permissionKeys :
        systemKey === 'ADMIN' ? permissionKeys.filter(k => !['staff.manage','settings.manage'].includes(k)) :
        systemKey === 'MANAGER' ? ['orders.view','orders.create','orders.edit','orders.assign','orders.change_status','customers.view','customers.edit','payments.view','payments.create'] :
        ['orders.view','orders.change_status','diagnostics.create','inventory.view','inventory.use'];
      await tx.rolePermission.createMany({ data: permissions.filter(p => allowed.includes(p.key)).map(p => ({ roleId: role.id, permissionId: p.id })) });
    }
    const user = await tx.user.create({ data: { organizationId: org.id, login, passwordHash, phone, firstName: 'Asadbek', mustChangePassword: true } });
    await tx.userRole.create({ data: { organizationId: org.id, userId: user.id, roleId: roleIds.OWNER } });
    await tx.userBranch.create({ data: { organizationId: org.id, userId: user.id, branchId: branch.id } });
    await tx.auditLog.create({ data: { organizationId: org.id, actorId: user.id, action: 'ORGANIZATION_SEEDED', entityId: org.id } });
  });
  console.log('Development owner created; first login requires password change.');
}
main().catch(() => { console.error('Seed failed. Check configuration and existing organization/login.'); process.exitCode = 1; }).finally(() => db.$disconnect());
