const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const db = new PrismaClient();
const base = 'http://localhost:3001/api';
let server, a, b, password = 'test-password-ABC123', output = '';
async function request(path, { token, cookie, body, method = 'GET', origin = 'http://localhost:3000' } = {}) {
  return fetch(base + path, { method, headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function login(user) {
  const response = await request('/auth/login', { method: 'POST', body: { login: user.login, password } });
  assert.equal(response.status, 200);
  return { token: (await response.json()).accessToken, cookie: response.headers.get('set-cookie').split(';')[0] };
}
async function tenant() {
  const id = randomUUID();
  const org = await db.organization.create({ data: { name: id, slug: id } });
  const branch = await db.branch.create({ data: { name: 'Main', organizationId: org.id } });
  const plan = await db.plan.create({ data: { name: id, maxStaff: 5, features: {} } });
  await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) } });
  const role = await db.role.create({ data: { organizationId: org.id, name: 'OWNER', systemKey: 'OWNER' } });
  for (const key of ['staff.view', 'staff.manage', 'customers.view', 'customers.edit', 'orders.view', 'orders.create', 'orders.assign', 'orders.change_status', 'orders.edit', 'diagnostics.create']) {
    const p = await db.permission.upsert({ where: { key }, create: { key }, update: {} });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
  }
  await db.role.create({ data: { organizationId: org.id, name: 'TECHNICIAN', systemKey: 'TECHNICIAN' } });
  const user = await db.user.create({ data: { organizationId: org.id, login: id, firstName: 'Test', phone: '+998901234567', passwordHash: await argon2.hash(password), mustChangePassword: false } });
  await db.userRole.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
  await db.userBranch.create({ data: { organizationId: org.id, userId: user.id, branchId: branch.id } });
  return { org, branch, role, user, plan };
}
before(async () => {
  a = await tenant(); b = await tenant();
  server = spawn(process.execPath, ['dist/main.js'], { env: process.env });
  server.stdout.on('data', d => { output += d; });
  server.stderr.on('data', d => { output += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('API did not start: ' + output);
});
after(async () => {
  if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
  await db.$disconnect();
});
test('protected endpoint rejects anonymous request', async () => {
  assert.equal((await request('/staff')).status, 401);
});
test('login rejects untrusted browser origin', async () => {
  assert.equal((await request('/auth/login', { method: 'POST', origin: 'https://evil.example', body: { login: a.user.login, password } })).status, 403);
});
test('tenant A cannot access tenant B staff or attach B branch', async () => {
  const auth = await login(a.user);
  assert.equal((await request('/staff/' + b.user.id, auth)).status, 404);
  const response = await request('/staff', { ...auth, method: 'POST', body: { login: 'cross-tenant', firstName: 'Test', temporaryPassword: password, phone: '+998901234567', role: 'TECHNICIAN', branchIds: [b.branch.id] } });
  assert.equal(response.status, 404);
  const list = await (await request('/staff', auth)).json();
  assert.ok(list.every(u => u.id !== b.user.id && !('passwordHash' in u)));
});
test('database rejects cross-tenant memberships and roles', async () => {
  await assert.rejects(db.userBranch.create({ data: { organizationId: a.org.id, userId: a.user.id, branchId: b.branch.id } }));
  await assert.rejects(db.userRole.create({ data: { organizationId: a.org.id, userId: a.user.id, roleId: b.role.id } }));
});
test('refresh rotation revokes old access and token reuse revokes successor', async () => {
  const auth = await login(a.user);
  const rotated = await request('/auth/refresh', { method: 'POST', cookie: auth.cookie });
  assert.equal(rotated.status, 200);
  const token = (await rotated.json()).accessToken;
  assert.equal((await request('/auth/me', { token })).status, 200);
  assert.equal((await request('/auth/me', auth)).status, 401);
  assert.equal((await request('/auth/refresh', { method: 'POST', cookie: auth.cookie })).status, 401);
  assert.equal((await request('/auth/me', { token })).status, 401);
});
test('temporary password blocks business actions, change revokes sessions, RBAC denies staff access', async () => {
  const owner = await login(a.user);
  const response = await request('/staff', { ...owner, method: 'POST', body: { login: 'tech-' + randomUUID(), firstName: 'Tech', temporaryPassword: password, phone: '+998901234567', role: 'TECHNICIAN', branchIds: [a.branch.id] } });
  assert.equal(response.status, 201);
  const user = await response.json();
  const auth = await login(user);
  assert.equal((await request('/branches', auth)).status, 403);
  assert.equal((await request('/auth/change-password', { ...auth, method: 'POST', body: { currentPassword: password, newPassword: 'changed-password-123' } })).status, 204);
  assert.equal((await request('/auth/me', auth)).status, 401);
  const r = await request('/auth/login', { method: 'POST', body: { login: user.login, password: 'changed-password-123' } });
  const token = (await r.json()).accessToken;
  assert.equal((await request('/staff', { token })).status, 403);
  assert.equal((await request('/branches', { token })).status, 200);
  assert.equal((await request('/staff/' + user.id + '/status', { ...owner, method: 'PATCH', body: { status: 'SUSPENDED' } })).status, 200);
  assert.equal((await request('/auth/me', { token })).status, 401);
});
test('expired subscription allows reads but denies writes', async () => {
  const auth = await login(b.user);
  await db.subscription.update({ where: { organizationId: b.org.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await request('/staff', auth)).status, 200);
  assert.equal((await request('/staff', { ...auth, method: 'POST', body: { login: 'expired-test', firstName: 'No', temporaryPassword: password, phone: '+998901234567', role: 'TECHNICIAN', branchIds: [b.branch.id] } })).status, 403);
});
test('logout revokes server session', async () => {
  const auth = await login(a.user);
  assert.equal((await request('/auth/logout', { ...auth, method: 'POST' })).status, 204);
  assert.equal((await request('/auth/me', auth)).status, 401);
});

test('intake, concurrent numbering, tenant isolation and versioned approval', async () => {
  const auth = await login(a.user);
  const customerResponse = await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Ali', phone: '+998900000001' } });
  assert.equal(customerResponse.status, 201);
  const customer = await customerResponse.json();
  const deviceResponse = await request('/devices', { ...auth, method: 'POST', body: { customerId: customer.id, category: 'Phone', brand: 'Apple', model: 'iPhone 15' } });
  assert.equal(deviceResponse.status, 201);
  const device = await deviceResponse.json();
  const intake = { customerId: customer.id, deviceId: device.id, branchId: a.branch.id, complaint: 'Display broken', accessories: ['Phone'], condition: ['Cracked display'] };
  const responses = await Promise.all(Array.from({ length: 5 }, () => request('/orders', { ...auth, method: 'POST', body: intake })));
  assert.ok(responses.every(r => r.status === 201));
  const orders = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(orders.map(o => o.number)).size, 5);
  const order = orders[0];
  const other = await login(b.user);
  assert.equal((await request('/orders/' + order.id, other)).status, 404);
  assert.equal((await request('/orders', { ...auth, method: 'POST', body: { ...intake, branchId: b.branch.id } })).status, 404);
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'IN_REPAIR', comment: 'skip diagnosis' } })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'DIAGNOSING', comment: 'Start' } })).status, 200);
  for (const labor of ['150000', '160000']) {
    assert.equal((await request('/orders/' + order.id + '/diagnosis', { ...auth, method: 'POST', body: { diagnosis: 'OLED damaged', requiredWork: 'Replace display', labor, partsTotal: '700000' } })).status, 201);
  }
  assert.equal((await request('/orders/' + order.id + '/approve', { ...auth, method: 'POST', body: { quoteVersion: 1, approved: true, evidence: 'Customer phone confirmation' } })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/approve', { ...auth, method: 'POST', body: { quoteVersion: 2, approved: true, evidence: 'Customer phone confirmation' } })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'IN_REPAIR', comment: 'Part available' } })).status, 200);
  const result = await (await request('/orders/' + order.id, auth)).json();
  assert.equal(result.total, '860000');
  assert.equal(result.status, 'IN_REPAIR');
  assert.equal(result.history.length, 6);
  assert.ok(await db.outboxEvent.count({ where: { entityId: order.id } }) >= 6);
});
