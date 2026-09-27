// Definition of Done for the simplified product, end to end through the API:
// platform opens a service → owner → staff → intake with price → repair → ready → payment
// → delivery with warranty → warranty claim → reports, with tenant isolation throughout.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const db = new PrismaClient();
const base = 'http://localhost:3001/api';
let server, serverOutput = '';

async function request(path, { token, body, method = 'GET' } = {}) {
  return fetch(base + path, { method, headers: { Origin: 'http://localhost:3000', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function ok(response, status = 200) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return text ? JSON.parse(text) : undefined;
}
async function signIn(login, password, newPassword) {
  const { accessToken } = await ok(await request('/auth/login', { method: 'POST', body: { login, password } }));
  if (!newPassword) return accessToken;
  return (await ok(await request('/auth/change-password', { token: accessToken, method: 'POST', body: { currentPassword: password, newPassword } }))).accessToken;
}

before(async () => {
  server = spawn(process.execPath, [path.resolve(__dirname, '..', 'dist', 'main.js')], { cwd: path.resolve(__dirname, '..'), env: process.env });
  server.stdout.on('data', d => { serverOutput += d; });
  server.stderr.on('data', d => { serverOutput += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await request('/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('API server did not start: ' + serverOutput);
});
after(async () => {
  if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
  await db.$disconnect();
});

test('simplified repair shop: from onboarding to warranty claim', async () => {
  const id = randomUUID().slice(0, 8);
  // 1. Platform opens two services.
  const adminLogin = 'admin-' + id, adminPassword = 'Platform-Pass-123';
  await db.platformAdmin.create({ data: { login: adminLogin, passwordHash: await argon2.hash(adminPassword) } });
  const platform = (await ok(await request('/platform/auth/login', { method: 'POST', body: { login: adminLogin, password: adminPassword } }), 201)).accessToken;
  const plan = await ok(await request('/platform/plans', { token: platform, method: 'POST', body: { name: 'START-' + id, maxStaff: 5, monthlyPrice: '99000', features: { telegram: true, sms: true } } }), 201);
  const services = [];
  for (const n of ['a', 'b']) {
    services.push(await ok(await request('/platform/organizations', { token: platform, method: 'POST', body: { name: 'Servis ' + n + id, slug: 'servis-' + n + id, planId: plan.id, login: 'boss' + n + id, temporaryPassword: 'Temporary-Pass-123', ownerName: 'Boss ' + n, phone: '+99890111000' + (n === 'a' ? '1' : '2') } }), 201));
  }

  // 2. Owner replaces the temporary password and adds a colleague.
  const boss = await signIn('bossa' + id, 'Temporary-Pass-123', 'Boss-Password-123');
  const staffUser = await ok(await request('/staff', { token: boss, method: 'POST', body: { login: 'aziz' + id, firstName: 'Aziz', temporaryPassword: 'Staff-Temp-12345', phone: '+998901234000' } }), 201);
  assert.equal(staffUser.roles[0].role.systemKey, 'STAFF');
  const staff = await signIn('aziz' + id, 'Staff-Temp-12345', 'Staff-Password-123');

  // 3. Staff takes the device in: customer, device, complaint, price.
  const customer = await ok(await request('/customers', { token: staff, method: 'POST', body: { firstName: 'Alisher', phone: '+998935550011' } }), 201);
  const device = await ok(await request('/devices', { token: staff, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Apple', model: 'iPhone 13' } }), 201);
  const order = await ok(await request('/orders', { token: staff, method: 'POST', body: { customerId: customer.id, deviceId: device.id, complaint: 'Ekran singan', accessories: ['Telefon', 'Chexol'], labor: '150000', partsTotal: '350000' } }), 201);
  assert.match(order.number, /^MS-\d{6}-\d{3}$/);
  const receipt = await ok(await request('/orders/' + order.id + '/receipt', { token: staff }));
  assert.equal(receipt.order.total, '500000'); assert.equal(receipt.customer.phone, '+998935550011');

  // 4. Repair, then ready (this is the one customer notification).
  await ok(await request('/orders/' + order.id + '/status', { token: staff, method: 'PATCH', body: { status: 'IN_REPAIR' } }));
  await ok(await request('/orders/' + order.id + '/status', { token: staff, method: 'PATCH', body: { status: 'READY' } }));
  assert.equal(await db.outboxEvent.count({ where: { entityId: order.id, type: 'ORDER_READY' } }), 1);

  // 5. Payment in two parts, delivery with a 30-day warranty.
  await ok(await request('/orders/' + order.id + '/payments', { token: staff, method: 'POST', body: { amount: '200000', method: 'CASH', idempotencyKey: randomUUID() } }), 201);
  await ok(await request('/orders/' + order.id + '/payments', { token: boss, method: 'POST', body: { amount: '300000', method: 'CLICK', idempotencyKey: randomUUID() } }), 201);
  const delivered = await ok(await request('/orders/' + order.id + '/deliver', { token: staff, method: 'POST', body: { warrantyDays: 30 } }), 201);
  assert.ok(delivered.warranty);
  const detail = await ok(await request('/orders/' + order.id, { token: boss }));
  assert.equal(detail.status, 'DELIVERED'); assert.equal(detail.balance, '0'); assert.equal(detail.labor, '150000'); assert.equal(detail.partsTotal, '350000');

  // 6. The customer comes back under warranty: a free follow-up order linked to the first.
  const warranties = await ok(await request('/warranties', { token: staff }));
  const claim = await ok(await request('/warranties/' + warranties[0].id + '/claim', { token: staff, method: 'POST', body: { reason: 'Ekran yana miltillayapti' } }), 201);
  assert.equal(claim.parentOrderId, order.id); assert.equal(claim.total, '0');

  // 7. Reports show revenue split into labor and parts.
  const finance = await ok(await request('/reports/finance', { token: boss }));
  assert.equal(finance.revenue, '500000'); assert.equal(finance.labor, '150000'); assert.equal(finance.parts, '350000'); assert.equal(finance.profit, '150000');
  assert.equal(finance.received, 2); assert.equal(finance.delivered, 1);

  // 8. The other service sees none of it.
  const other = await signIn('bossb' + id, 'Temporary-Pass-123', 'Boss-Password-B23');
  assert.equal((await request('/orders/' + order.id, { token: other })).status, 404);
  assert.equal((await ok(await request('/orders', { token: other }))).length, 0);
  assert.equal((await ok(await request('/reports/finance', { token: other }))).revenue, '0');

  // 9. The audit trail records who did what.
  const actions = (await db.auditLog.findMany({ where: { organizationId: services[0].id }, select: { action: true } })).map(a => a.action);
  for (const action of ['STAFF_CREATED', 'ORDER_RECEIVED', 'ORDER_IN_REPAIR', 'ORDER_READY', 'PAYMENT_RECEIVED', 'ORDER_DELIVERED']) assert.ok(actions.includes(action), action);
});
