const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const db = new PrismaClient();
const base = 'http://localhost:3001/api';
let server, a, b, password = 'test-password-ABC123', output = '';
const PERMISSIONS = ['orders.view', 'orders.create', 'orders.edit', 'orders.change_status', 'customers.view', 'customers.edit',
  'payments.view', 'payments.create', 'payments.refund', 'payments.deliver_with_debt', 'reports.view', 'reports.finance',
  'expenses.manage', 'staff.view', 'staff.manage', 'settings.manage'];

async function request(path, { token, cookie, body, method = 'GET', origin = 'http://localhost:3000' } = {}) {
  return fetch(base + path, { method, headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function login(user, pass = password) {
  const response = await request('/auth/login', { method: 'POST', body: { login: user.login, password: pass } });
  assert.equal(response.status, 200);
  return { token: (await response.json()).accessToken, cookie: response.headers.get('set-cookie').split(';')[0] };
}
// One long-lived session per tenant owner: the per-login rate limit is 15 attempts / 15 min.
const sessions = new Map();
async function owner(t) { if (!sessions.has(t.user.id)) sessions.set(t.user.id, await login(t.user)); return sessions.get(t.user.id); }
const json = async r => { const body = await r.json(); return body; };

async function tenant() {
  const id = randomUUID();
  const org = await db.organization.create({ data: { name: 'Servis ' + id.slice(0, 6), slug: id } });
  const branch = await db.branch.create({ data: { name: 'Main', organizationId: org.id } });
  const plan = await db.plan.create({ data: { name: id, maxStaff: 5, features: { telegram: true, sms: true } } });
  await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) } });
  const roles = {};
  for (const key of ['OWNER', 'STAFF']) {
    roles[key] = await db.role.create({ data: { organizationId: org.id, name: key, systemKey: key } });
    for (const permission of PERMISSIONS) {
      const p = await db.permission.upsert({ where: { key: permission }, create: { key: permission }, update: {} });
      await db.rolePermission.create({ data: { roleId: roles[key].id, permissionId: p.id } });
    }
  }
  const user = await db.user.create({ data: { organizationId: org.id, login: id, firstName: 'Egasi', phone: '+998901234567', passwordHash: await argon2.hash(password), mustChangePassword: false } });
  await db.userRole.create({ data: { organizationId: org.id, userId: user.id, roleId: roles.OWNER.id } });
  await db.userBranch.create({ data: { organizationId: org.id, userId: user.id, branchId: branch.id } });
  return { org, branch, role: roles.OWNER, roles, user, plan };
}
async function newOrder(t, { labor = '150000', parts = '350000', phone } = {}) {
  const auth = await owner(t);
  const customer = await json(await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Mijoz', phone: phone ?? '+99890' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0') } }));
  const device = await json(await request('/devices', { ...auth, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Samsung', model: 'A54' } }));
  const response = await request('/orders', { ...auth, method: 'POST', body: { customerId: customer.id, deviceId: device.id, complaint: 'Ekran singan', accessories: ['Telefon'], labor, partsTotal: parts } });
  assert.equal(response.status, 201);
  return { order: await response.json(), customer, device };
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
test('tenant A cannot read tenant B staff, customers or orders', async () => {
  const auth = await owner(a);
  const { order, customer } = await newOrder(b);
  assert.equal((await request('/staff/' + b.user.id, auth)).status, 404);
  assert.equal((await request('/orders/' + order.id, auth)).status, 404);
  assert.equal((await request('/customers/' + customer.id, auth)).status, 404);
  assert.equal((await request('/orders/' + order.id + '/price', { ...auth, method: 'PATCH', body: { labor: '1', partsTotal: '1' } })).status, 404);
  const list = await json(await request('/staff', auth));
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
test('staff have the owner\'s rights but cannot touch the owner account', async () => {
  const boss = await owner(a);
  const created = await request('/staff', { ...boss, method: 'POST', body: { login: 'staff-' + randomUUID().slice(0, 8), firstName: 'Aziz', temporaryPassword: password, phone: '+998901112233' } });
  assert.equal(created.status, 201);
  const staff = await created.json();
  assert.deepEqual(staff.roles.map(r => r.role.systemKey), ['STAFF']);
  assert.ok(await db.userBranch.findFirst({ where: { userId: staff.id, branchId: a.branch.id } }));
  // A temporary password blocks business data until it is changed.
  const temp = await login(staff);
  assert.equal((await request('/orders', temp)).status, 403);
  const changed = await request('/auth/change-password', { ...temp, method: 'POST', body: { currentPassword: password, newPassword: 'changed-password-123' } });
  assert.equal(changed.status, 200);
  assert.equal((await request('/auth/me', temp)).status, 401);
  const auth = { token: (await changed.json()).accessToken };
  const me = await json(await request('/auth/me', auth));
  assert.equal(me.role, 'STAFF');
  assert.equal((await request('/orders', auth)).status, 200);
  assert.equal((await request('/reports/finance', auth)).status, 200);
  // Staff can add colleagues...
  const colleague = await request('/staff', { ...auth, method: 'POST', body: { login: 'staff-' + randomUUID().slice(0, 8), firstName: 'Bekzod', temporaryPassword: password, phone: '+998901112244' } });
  assert.equal(colleague.status, 201);
  // ...but cannot lock out or edit the owner.
  assert.equal((await request('/staff/' + a.user.id + '/status', { ...auth, method: 'PATCH', body: { status: 'SUSPENDED' } })).status, 403);
  assert.equal((await request('/staff/' + a.user.id, { ...auth, method: 'PATCH', body: { firstName: 'Hacked' } })).status, 403);
  assert.equal((await db.user.findUnique({ where: { id: a.user.id } })).firstName, 'Egasi');
  assert.equal((await request('/staff/' + a.user.id + '/reset-password', { ...auth, method: 'POST', body: { temporaryPassword: 'owner-reset-attempt-1' } })).status, 403);
  // A wrong current password is a form error (400), not an expired session (401).
  assert.equal((await request('/auth/change-password', { ...auth, method: 'POST', body: { currentPassword: 'wrong-password-000', newPassword: 'another-password-123' } })).status, 400);
  // A colleague who forgot the password gets a temporary one; their sessions end.
  const colleagueUser = await colleague.json();
  const colleagueSession = await login(colleagueUser);
  assert.equal((await request('/staff/' + colleagueUser.id + '/reset-password', { ...auth, method: 'POST', body: { temporaryPassword: 'fresh-temporary-123' } })).status, 201);
  assert.equal((await request('/auth/me', colleagueSession)).status, 401);
  const relogged = await login(colleagueUser, 'fresh-temporary-123');
  assert.equal((await json(await request('/auth/me', relogged))).mustChangePassword, true);
  // The owner can suspend staff; their sessions end immediately.
  assert.equal((await request('/staff/' + staff.id + '/status', { ...boss, method: 'PATCH', body: { status: 'SUSPENDED' } })).status, 200);
  assert.equal((await request('/auth/me', auth)).status, 401);
});
test('expired subscription allows reads but denies writes', async () => {
  const auth = await owner(b);
  await db.subscription.update({ where: { organizationId: b.org.id }, data: { expiresAt: new Date(0) } });
  try {
    assert.equal((await request('/staff', auth)).status, 200);
    assert.equal((await request('/staff', { ...auth, method: 'POST', body: { login: 'expired-test', firstName: 'No', temporaryPassword: password, phone: '+998901234567' } })).status, 403);
  } finally {
    await db.subscription.update({ where: { organizationId: b.org.id }, data: { expiresAt: new Date(Date.now() + 86400000) } });
  }
});
test('logout revokes server session', async () => {
  const auth = await login(a.user);
  assert.equal((await request('/auth/logout', { ...auth, method: 'POST' })).status, 204);
  assert.equal((await request('/auth/me', auth)).status, 401);
});

test('intake with price, unique numbers, simple status flow, audited price change', async () => {
  const auth = await owner(a);
  const customer = await json(await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998900000001' } }));
  assert.equal(customer.lastName, 'Valiyev');
  assert.equal((await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Ali', phone: '+998900000001' } })).status, 409);
  const found = await json(await request('/customers?q=' + encodeURIComponent('900000001'), auth));
  assert.equal(found[0].id, customer.id);
  const device = await json(await request('/devices', { ...auth, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Apple', model: 'iPhone 15' } }));
  // Removed intake fields are rejected rather than silently stored.
  assert.equal((await request('/devices', { ...auth, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Apple', model: 'X', imei: '123' } })).status, 400);
  const intake = { customerId: customer.id, deviceId: device.id, complaint: 'Ekran singan', accessories: ['Telefon', 'Kabel'], labor: '150000', partsTotal: '350000' };
  const responses = await Promise.all(Array.from({ length: 5 }, () => request('/orders', { ...auth, method: 'POST', body: intake })));
  assert.ok(responses.every(r => r.status === 201));
  const orders = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(orders.map(o => o.number)).size, 5);
  const order = orders[0];
  assert.equal(order.branchId, a.branch.id);
  assert.equal(order.total, '500000');
  // Old intermediate states no longer exist.
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'DIAGNOSING' } })).status, 400);
  assert.equal((await request('/orders/' + order.id + '/deliver', { ...auth, method: 'POST', body: { warrantyDays: 30 } })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'IN_REPAIR' } })).status, 200);
  // Price is editable until delivery; both parts and labor are audited.
  assert.equal((await request('/orders/' + order.id + '/price', { ...auth, method: 'PATCH', body: { labor: '200000', partsTotal: '300000' } })).status, 200);
  const audit = await db.auditLog.findFirst({ where: { organizationId: a.org.id, entityId: order.id, action: 'PRICE_CHANGE' } });
  assert.equal(audit.oldValue.labor, '150000'); assert.equal(audit.newValue.labor, '200000'); assert.equal(audit.newValue.total, '500000'); assert.ok(audit.ip);
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'READY', comment: 'Tayyor' } })).status, 200);
  assert.ok(await db.outboxEvent.findFirst({ where: { entityId: order.id, type: 'ORDER_READY' } }));
  const detail = await json(await request('/orders/' + order.id, auth));
  assert.equal(detail.status, 'READY'); assert.equal(detail.labor, '200000'); assert.equal(detail.partsTotal, '300000'); assert.equal(detail.balance, '500000');
  assert.deepEqual(detail.history.map(h => h.toStatus), ['RECEIVED', 'IN_REPAIR', 'READY']);
  assert.equal(detail.actorNames[a.user.id], 'Egasi');
  // Staff-facing old endpoints are gone.
  for (const path of ['/inventory', '/suppliers', '/branches', '/orders/technicians', '/settings/roles']) assert.equal((await request(path, auth)).status, 404, path);
});
test('split payment, idempotency, refund, price floor and delivery with warranty', async () => {
  const auth = await owner(a);
  const { order } = await newOrder(a, { labor: '300000', parts: '550000' });
  await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'READY' } });
  const pay = { amount: '300000', method: 'CASH', idempotencyKey: randomUUID() };
  const twice = await Promise.all([1, 2].map(() => request('/orders/' + order.id + '/payments', { ...auth, method: 'POST', body: pay })));
  const entries = await Promise.all(twice.map(r => r.json()));
  assert.equal(entries[0].id, entries[1].id);
  assert.equal((await request('/orders/' + order.id + '/payments', { ...auth, method: 'POST', body: { amount: '900000', method: 'CLICK', idempotencyKey: randomUUID() } })).status, 409);
  assert.equal((await request('/payments/' + entries[0].id + '/refund', { ...auth, method: 'POST', body: { amount: '100000', reason: 'Chegirma', idempotencyKey: randomUUID() } })).status, 201);
  assert.equal((await request('/payments/' + entries[0].id + '/refund', { ...auth, method: 'POST', body: { amount: '300000', reason: 'Too much', idempotencyKey: randomUUID() } })).status, 409);
  // 200 000 is paid now; the price cannot drop below it.
  assert.equal((await request('/orders/' + order.id + '/price', { ...auth, method: 'PATCH', body: { labor: '100000', partsTotal: '50000' } })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/payments', { ...auth, method: 'POST', body: { amount: '650000', method: 'CARD', idempotencyKey: randomUUID() } })).status, 201);
  const delivered = await request('/orders/' + order.id + '/deliver', { ...auth, method: 'POST', body: { warrantyDays: 30 } });
  assert.equal(delivered.status, 201);
  const warranty = await db.warranty.findUnique({ where: { orderId: order.id } });
  assert.ok(warranty); assert.ok(warranty.terms.length > 10);
  assert.equal(Math.round((warranty.endDate - warranty.startDate) / 86400000), 30);
  assert.equal((await request('/orders/' + order.id + '/price', { ...auth, method: 'PATCH', body: { labor: '1', partsTotal: '1' } })).status, 409);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).status, 'DELIVERED');
});
test('delivery with debt needs explicit consent; the debt can be paid later', async () => {
  const auth = await owner(a);
  const { order } = await newOrder(a, { labor: '100000', parts: '0' });
  await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'READY' } });
  assert.equal((await request('/orders/' + order.id + '/deliver', { ...auth, method: 'POST', body: { warrantyDays: 0 } })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/deliver', { ...auth, method: 'POST', body: { warrantyDays: 0, allowDebt: true } })).status, 201);
  assert.equal(await db.warranty.count({ where: { orderId: order.id } }), 0);
  assert.equal((await request('/orders/' + order.id + '/payments', { ...auth, method: 'POST', body: { amount: '100000', method: 'CASH', idempotencyKey: randomUUID() } })).status, 201);
  const report = await json(await request('/reports/finance', auth));
  assert.ok(!report.debtors.some(d => d.id === order.id));
});
test('public tracking hides personal data', async () => {
  const auth = await owner(a);
  const { order } = await newOrder(a);
  const links = await request('/orders/' + order.id + '/links', { ...auth, method: 'POST' });
  assert.equal(links.status, 201);
  const tracking = (await links.json()).tracking.split('/').pop();
  const tracked = await request('/public/track/' + tracking);
  assert.equal(tracked.status, 200);
  const body = await tracked.json();
  const text = JSON.stringify(body);
  assert.ok(!text.includes('phone') && !text.includes('customer') && !text.includes('Mijoz'));
  assert.equal(body.total, '500000'); assert.equal(body.paid, '0');
  assert.equal((await request('/public/track/' + 'x'.repeat(43))).status, 404);
  assert.equal((await request('/public/approval/' + 'x'.repeat(43))).status, 404);
});
test('thermal receipt data follows the configured paper width', async () => {
  const auth = await owner(a);
  const { order } = await newOrder(a, { labor: '120000', parts: '80000' });
  const first = await json(await request('/orders/' + order.id + '/receipt', auth));
  assert.equal(first.width, 80); assert.equal(first.order.total, '200000'); assert.equal(first.order.labor, '120000');
  assert.equal(first.service.name, a.org.name); assert.ok(first.qrSvg.startsWith('<svg')); assert.ok(first.trackingUrl.includes('/track/'));
  assert.equal(first.service.telegram, '@myserviceuzz'); assert.equal(first.service.instagram, 'myserviceuz');
  assert.equal((await request('/settings/general/receipt', { ...auth, method: 'PUT', body: { value: { width: 58, footer: 'Rahmat!', telegram: '@shop', instagram: '' } } })).status, 200);
  const second = await json(await request('/orders/' + order.id + '/receipt?type=delivery', auth));
  assert.equal(second.width, 58); assert.equal(second.type, 'delivery'); assert.equal(second.service.footer, 'Rahmat!');
  assert.equal(second.service.telegram, '@shop'); assert.equal(second.service.instagram, '');
  assert.equal((await json(await request('/settings/defaults', auth))).receiptWidth, 58);
});
test('parts taken from a shop are paid (as a purchase expense) or returned, once', async () => {
  const auth = await owner(a);
  const { order } = await newOrder(a, { labor: '100000', parts: '400000' });
  const take = body => request('/parts', { ...auth, method: 'POST', body });
  const screen = await json(await take({ name: 'iPhone 13 ekran', shop: 'Malika 12', cost: '350000', orderId: order.id }));
  const glass = await json(await take({ name: 'Oyna', shop: 'Malika 12', cost: '50000' }));
  const other = await json(await take({ name: 'Batareya', shop: 'Chilonzor', cost: '120000' }));
  assert.equal(screen.status, 'TAKEN'); assert.equal(screen.order.number, order.number);
  let list = await json(await request('/parts?status=TAKEN', auth));
  assert.equal(list.debt, '520000');
  assert.deepEqual(list.byShop.map(x => [x.shop, x.amount]), [['Malika 12', '400000'], ['Chilonzor', '120000']]);
  // Paid: settled and booked as a parts purchase; returned: nothing owed, no expense.
  assert.equal((await request('/parts/' + screen.id + '/pay', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await request('/parts/' + glass.id + '/return', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await request('/parts/' + screen.id + '/return', { ...auth, method: 'POST' })).status, 409);
  const expenses = await json(await request('/expenses', auth));
  assert.ok(expenses.some(e => e.category === 'PURCHASE' && e.amount === '350000' && e.note.includes('iPhone 13 ekran')));
  assert.ok(!expenses.some(e => e.note.includes('Oyna')));
  list = await json(await request('/parts', auth));
  assert.equal(list.debt, '120000');
  assert.equal((await json(await request('/parts?orderId=' + order.id, auth))).items[0].status, 'PAID');
  assert.equal((await json(await request('/reports/finance', auth))).shopDebt, '120000');
  // Another tenant can neither see nor settle it, nor attach to this order.
  const other_ = await owner(b);
  assert.equal((await json(await request('/parts', other_))).items.length, 0);
  assert.equal((await request('/parts/' + other.id + '/pay', { ...other_, method: 'POST' })).status, 404);
  assert.equal((await request('/parts', { ...other_, method: 'POST', body: { name: 'x', shop: 'y', cost: '1', orderId: order.id } })).status, 404);

  // Shops: typed names became saved shops; parts can be picked by shopId and filtered by shop/period.
  const shops = await json(await request('/shops', auth));
  const malika = shops.find(x => x.name === 'Malika 12');
  assert.ok(malika); assert.equal(malika.debt, '0'); assert.equal(malika.paid, '350000');
  assert.equal((await request('/shops', { ...auth, method: 'POST', body: { name: 'Malika 12' } })).status, 409);
  const newShop = await json(await request('/shops', { ...auth, method: 'POST', body: { name: 'Texnomart', phone: '+998901234567' } }));
  const lens = await json(await take({ name: 'Kamera oynasi', shopId: newShop.id, cost: '45000' }));
  assert.equal(lens.shop, 'Texnomart');
  const filtered = await json(await request('/parts?shopId=' + newShop.id, auth));
  assert.equal(filtered.items.length, 1); assert.equal(filtered.totals.taken, '45000'); assert.equal(filtered.totals.count, 1);
  const future = await json(await request('/parts?from=' + encodeURIComponent(new Date(Date.now() + 86400000).toISOString()), auth));
  assert.equal(future.items.length, 0);
  assert.equal((await request('/parts?from=nonsense', auth)).status, 400);
  assert.equal((await request('/parts', { ...auth, method: 'POST', body: { name: 'x', cost: '1' } })).status, 400);
  // Another service can neither use nor rename this shop.
  assert.equal((await request('/parts', { ...other_, method: 'POST', body: { name: 'x', shopId: newShop.id, cost: '1' } })).status, 404);
  assert.equal((await request('/shops/' + newShop.id, { ...other_, method: 'PATCH', body: { name: 'Hacked' } })).status, 404);
  assert.equal((await request('/shops/' + newShop.id, { ...auth, method: 'PATCH', body: { name: 'Texnomart', archived: true } })).status, 200);
  assert.ok(!(await json(await request('/parts', auth))).shops.some(x => x.id === newShop.id));
});
test('finance report splits labor and parts and computes profit', async () => {
  const auth = await owner(b);
  const { order } = await newOrder(b, { labor: '200000', parts: '300000' });
  await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'READY' } });
  await request('/orders/' + order.id + '/payments', { ...auth, method: 'POST', body: { amount: '500000', method: 'CASH', idempotencyKey: randomUUID() } });
  await request('/orders/' + order.id + '/deliver', { ...auth, method: 'POST', body: { warrantyDays: 7 } });
  assert.equal((await request('/expenses', { ...auth, method: 'POST', body: { category: 'RENT', amount: '50000', note: 'Ijara' } })).status, 201);
  assert.equal((await request('/expenses', { ...auth, method: 'POST', body: { category: 'PURCHASE', amount: '280000', note: 'Zapchast xaridi' } })).status, 201);
  const r = await json(await request('/reports/finance', auth));
  assert.equal(r.revenue, '500000'); assert.equal(r.labor, '200000'); assert.equal(r.parts, '300000');
  assert.equal(r.operatingExpenses, '50000'); assert.equal(r.profit, '150000'); assert.equal(r.netCash, '500000');
  // Each expense of the period is listed for filtering in the report.
  assert.ok(r.expenseItems.some(e => e.category === 'PURCHASE' && e.amount === '280000' && e.note === 'Zapchast xaridi'));
  const dash = await json(await request('/reports/dashboard', auth));
  assert.equal(dash.todayCash, '500000');
});
test('platform analytics calculates MRR without accepting tenant credentials', async () => {
  const tenantAuth = await owner(a);
  assert.equal((await request('/platform/analytics', tenantAuth)).status, 401);
  const token = await platformToken();
  const created = await request('/platform/plans', { token, method: 'POST', body: { name: 'PRO-' + randomUUID(), monthlyPrice: '123000', features: { telegram: true, sms: true } } });
  assert.equal(created.status, 201); const plan = await created.json();
  await db.subscription.update({ where: { organizationId: a.org.id }, data: { planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) } });
  const analytics = await json(await request('/platform/analytics', { token }));
  assert.ok(Number(analytics.mrr) >= 123000); assert.ok(analytics.activeOrganizations >= 1);
});
let platformTokenValue;
async function platformToken() {
  if (platformTokenValue) return platformTokenValue;
  const adminLogin = 'platform-' + randomUUID();
  await db.platformAdmin.create({ data: { login: adminLogin, passwordHash: await argon2.hash(password) } });
  const signedIn = await request('/platform/auth/login', { method: 'POST', body: { login: adminLogin, password } });
  assert.equal(signedIn.status, 201);
  return platformTokenValue = (await signedIn.json()).accessToken;
}
test('platform onboards a service with two roles, resets a password and enters in audited support mode', async () => {
  const token = await platformToken();
  const plan = await json(await request('/platform/plans', { token, method: 'POST', body: { name: 'START-' + randomUUID(), monthlyPrice: '0', features: {} } }));
  const loginName = 'boss-' + randomUUID().slice(0, 8);
  const created = await request('/platform/organizations', { token, method: 'POST', body: { name: 'Usta Aka', slug: 'usta-' + randomUUID().slice(0, 8), planId: plan.id, login: loginName, temporaryPassword: 'Temporary-Pass-123', ownerName: 'Bahodir', phone: '+998907777777' } });
  assert.equal(created.status, 201);
  const org = await created.json();
  const roles = await db.role.findMany({ where: { organizationId: org.id }, orderBy: { systemKey: 'asc' } });
  assert.deepEqual(roles.map(r => r.systemKey), ['OWNER', 'STAFF']);
  const users = await json(await request('/platform/organizations/' + org.id + '/users', { token }));
  assert.equal(users.length, 1); assert.equal(users[0].login, loginName);
  // Tenant credentials cannot use platform support tools.
  assert.equal((await request('/platform/organizations/' + org.id + '/support', { ...(await owner(a)), method: 'POST' })).status, 401);
  assert.equal((await request('/platform/users/' + users[0].id + '/reset-password', { token, method: 'POST', body: { temporaryPassword: 'Reset-By-Platform-1' } })).status, 201);
  const relogin = await request('/auth/login', { method: 'POST', body: { login: loginName, password: 'Reset-By-Platform-1' } });
  assert.equal(relogin.status, 200);
  assert.equal((await json(await request('/auth/me', { token: (await relogin.json()).accessToken }))).mustChangePassword, true);
  const support = await request('/platform/organizations/' + org.id + '/support', { token, method: 'POST' });
  assert.equal(support.status, 201);
  const supportToken = (await support.json()).accessToken;
  const me = await json(await request('/auth/me', { token: supportToken }));
  assert.equal(me.login, loginName); assert.equal(me.role, 'OWNER');
  assert.ok(await db.auditLog.findFirst({ where: { organizationId: org.id, action: 'PLATFORM_SUPPORT_LOGIN' } }));
  assert.ok(await db.auditLog.findFirst({ where: { organizationId: org.id, action: 'PLATFORM_PASSWORD_RESET' } }));
  assert.equal(me.support, true);
  // Support works even while the owner still has to replace the reset password.
  assert.equal((await request('/orders', { token: supportToken })).status, 200);
  assert.equal((await request('/auth/refresh', { method: 'POST' })).status, 401); // no refresh cookie: support ends with the token
});
test('ready event: permanent Telegram failure falls back to idempotent SMS', async () => {
  const http = require('node:http');
  const calls = [];
  const mock = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { calls.push({ url: req.url, headers: req.headers, body }); res.setHeader('Content-Type', 'application/json'); if (req.url.includes('/sendMessage')) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error_code: 400 })); } else { res.statusCode = 200; res.end(JSON.stringify({ id: 'sms-1' })); } });
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const port = mock.address().port; const old = { telegram: process.env.TELEGRAM_API_URL, sms: process.env.SMS_API_URL, key: process.env.SMS_API_KEY, provider: process.env.SMS_PROVIDER, token: process.env.TELEGRAM_BOT_TOKEN };
  process.env.TELEGRAM_API_URL = 'http://127.0.0.1:' + port + '/'; process.env.SMS_API_URL = 'http://127.0.0.1:' + port + '/sms'; process.env.SMS_API_KEY = 'test-key'; process.env.SMS_PROVIDER = 'webhook'; process.env.TELEGRAM_BOT_TOKEN = '123456789:AAHtestTokenWithTheSameShapeAsReal_1';
  try {
    const subscription = await db.subscription.findUnique({ where: { organizationId: a.org.id } });
    await db.plan.update({ where: { id: subscription.planId }, data: { features: { telegram: true, sms: true } } });
    const { order, customer } = await newOrder(a);
    await db.customer.update({ where: { id: customer.id }, data: { telegramChatId: '12345' } });
    await db.order.update({ where: { id: order.id }, data: { status: 'READY' } });
    const event = await db.outboxEvent.create({ data: { organizationId: a.org.id, type: 'ORDER_READY', entityId: order.id, payload: {} } });
    const { Notifications } = require('../dist/notifications/notifications.module.js');
    await new Notifications(db).deliver(event.id);
    const notification = await db.notification.findUnique({ where: { eventId: event.id } });
    assert.equal(notification.status, 'SENT'); assert.equal(notification.channel, 'SMS'); assert.equal(notification.providerId, 'sms-1');
    assert.equal(calls.length, 2); assert.ok(calls[0].url.includes('/sendMessage')); assert.equal(calls[1].headers['idempotency-key'], event.id);
    // The message carries the service's own name, not the platform's.
    assert.ok(JSON.parse(calls[1].body).message.startsWith(a.org.name));
  } finally {
    await new Promise(resolve => mock.close(resolve));
    for (const [key, value] of Object.entries({ TELEGRAM_API_URL: old.telegram, SMS_API_URL: old.sms, SMS_API_KEY: old.key, SMS_PROVIDER: old.provider, TELEGRAM_BOT_TOKEN: old.token })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
test('CSV export has BOM, price split and protects spreadsheet cells', async () => {
  const auth = await owner(a);
  const response = await request('/reports/export', auth);
  assert.equal(response.status, 200); assert.ok(response.headers.get('content-type').startsWith('text/csv'));
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(bytes);
  assert.ok(csv.includes('usta_haqi') && csv.includes('zapchast'));
});
