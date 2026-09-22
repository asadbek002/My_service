const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID, createHash, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
const argon2 = require('argon2');

const db = new PrismaClient();
const base = 'http://localhost:3001/api';
let server, tenantA, tenantB, testPassword = 'MasterPassword123!', serverOutput = '';

async function request(path, { token, cookie, body, method = 'GET', origin = 'http://localhost:3000' } = {}) {
  return fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function login(user) {
  const response = await request('/auth/login', {
    method: 'POST',
    body: { login: user.login, password: testPassword },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  return {
    token: data.accessToken,
    cookie: response.headers.get('set-cookie').split(';')[0],
  };
}

async function setupTenant(name = 'Service') {
  const id = randomUUID();
  const org = await db.organization.create({
    data: { name: `${name}-${id.slice(0, 8)}`, slug: id },
  });
  const branch = await db.branch.create({
    data: { name: 'Asosiy filial', organizationId: org.id },
  });
  const plan = await db.plan.create({
    data: {
      name: `PRO-${id.slice(0, 8)}`,
      maxStaff: 20,
      features: {
        inventory: true,
        telegram: true,
        sms: true,
        advanced_reports: true,
        multi_branch: true,
        staff_commission: true,
        exports: true,
      },
    },
  });
  await db.subscription.create({
    data: {
      organizationId: org.id,
      planId: plan.id,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000 * 30),
    },
  });

  const ownerRole = await db.role.create({
    data: { organizationId: org.id, name: 'OWNER', systemKey: 'OWNER' },
  });
  const allPermissions = [
    'staff.view',
    'staff.manage',
    'customers.view',
    'customers.edit',
    'orders.view',
    'orders.create',
    'orders.assign',
    'orders.change_status',
    'orders.edit',
    'diagnostics.create',
    'inventory.view',
    'inventory.manage',
    'inventory.use',
    'inventory.view_cost',
    'payments.view',
    'payments.create',
    'payments.refund',
    'payments.deliver_with_debt',
    'reports.view',
    'reports.finance',
    'settings.manage',
  ];

  for (const key of allPermissions) {
    const p = await db.permission.upsert({ where: { key }, create: { key }, update: {} });
    await db.rolePermission.create({ data: { roleId: ownerRole.id, permissionId: p.id } });
  }

  const techRole = await db.role.create({
    data: { organizationId: org.id, name: 'TECHNICIAN', systemKey: 'TECHNICIAN' },
  });
  for (const key of ['orders.view', 'orders.change_status', 'diagnostics.create', 'inventory.view', 'inventory.use']) {
    const p = await db.permission.findUnique({ where: { key } });
    if (p) await db.rolePermission.create({ data: { roleId: techRole.id, permissionId: p.id } });
  }

  const ownerUser = await db.user.create({
    data: {
      organizationId: org.id,
      login: `owner-${id.slice(0, 8)}`,
      firstName: 'Asadbek',
      phone: '+998901234567',
      passwordHash: await argon2.hash(testPassword),
      mustChangePassword: false,
    },
  });
  await db.userRole.create({ data: { organizationId: org.id, userId: ownerUser.id, roleId: ownerRole.id } });
  await db.userBranch.create({ data: { organizationId: org.id, userId: ownerUser.id, branchId: branch.id } });

  return { org, branch, ownerUser, plan };
}

before(async () => {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });

  try {
    await s3.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }));
  } catch (e) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(e.name)) {
      // Bucket ready
    }
  }

  tenantA = await setupTenant('TenantA');
  tenantB = await setupTenant('TenantB');

  server = spawn(process.execPath, ['dist/main.js'], { env: process.env });
  server.stdout.on('data', d => { serverOutput += d; });
  server.stderr.on('data', d => { serverOutput += d; });

  for (let i = 0; i < 60; i++) {
    try {
      if ((await request('/health')).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('API server did not start: ' + serverOutput);
});

after(async () => {
  if (server) {
    server.kill();
    await new Promise(r => server.once('exit', r));
  }
  await db.$disconnect();
});

test('MYSERVICE MASTER SPECIFICATION §76: Full End-to-End Repair & Multi-Tenant Lifecycle', async () => {
  // 1. OWNER LOGIN
  const authA = await login(tenantA.ownerUser);
  const meRes = await request('/auth/me', authA);
  assert.equal(meRes.status, 200);
  const me = await meRes.json();
  assert.equal(me.organizationId, tenantA.org.id);

  // 2. CREATE EMPLOYEE (TECHNICIAN) & COMPENSATION RULE
  const techLogin = `tech-${randomUUID().slice(0, 8)}`;
  const techRes = await request('/staff', {
    ...authA,
    method: 'POST',
    body: {
      login: techLogin,
      firstName: 'Aziz Usta',
      phone: '+998909998877',
      temporaryPassword: testPassword,
      role: 'TECHNICIAN',
      branchIds: [tenantA.branch.id],
    },
  });
  assert.equal(techRes.status, 201);
  const techUser = await techRes.json();

  // Set 30% commission
  const compRes = await request(`/staff/${techUser.id}/compensation`, {
    ...authA,
    method: 'POST',
    body: { type: 'PERCENTAGE', salary: '0', percentage: '30', fixedPerJob: '0' },
  });
  assert.equal(compRes.status, 201);

  // 3. CREATE CUSTOMER & DEVICE
  const custRes = await request('/customers', {
    ...authA,
    method: 'POST',
    body: {
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: '+998901112233',
      telegramUsername: 'ali_valiyev',
      notificationPreference: 'AUTO',
    },
  });
  assert.equal(custRes.status, 201);
  const customer = await custRes.json();

  const devRes = await request('/devices', {
    ...authA,
    method: 'POST',
    body: {
      customerId: customer.id,
      category: 'Telefon',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      imei: '358492019482710',
      color: 'Natural Titanium',
    },
  });
  assert.equal(devRes.status, 201);
  const device = await devRes.json();

  // 4. CREATE PART & RECEIVE STOCK
  const partRes = await request('/inventory/parts', {
    ...authA,
    method: 'POST',
    body: {
      name: 'iPhone 15 Pro Max OLED Display',
      sku: `OLED-IP15PM-${randomUUID().slice(0, 4)}`,
      brand: 'Apple OEM',
      purchasePrice: '500000',
      salePrice: '700000',
      minimumQuantity: 1,
      compatibleModels: ['iPhone 15 Pro Max'],
    },
  });
  assert.equal(partRes.status, 201);
  const part = await partRes.json();

  const recvRes = await request('/inventory/receive', {
    ...authA,
    method: 'POST',
    body: {
      partId: part.id,
      branchId: tenantA.branch.id,
      quantity: 5,
      reason: 'Supplier Invoice 101',
    },
  });
  assert.equal(recvRes.status, 201);

  // 5. INTAKE NEW ORDER (Generates sequential MS-YYMMDD-XXX)
  const orderRes = await request('/orders', {
    ...authA,
    method: 'POST',
    body: {
      customerId: customer.id,
      deviceId: device.id,
      branchId: tenantA.branch.id,
      complaint: 'Displey qorayib qolgan, sensor ishlamayapti',
      accessories: ['Telefon', 'Chexol'],
      condition: ['Ekran singan', 'Korpus tirnalgan'],
    },
  });
  assert.equal(orderRes.status, 201);
  const order = await orderRes.json();
  assert.match(order.number, /^MS-\d{6}-\d{3}$/);
  assert.equal(order.status, 'RECEIVED');

  // 6. ASSIGN TECHNICIAN
  const assignRes = await request(`/orders/${order.id}/assign`, {
    ...authA,
    method: 'POST',
    body: { userId: techUser.id, task: 'Displeyni almashtirish va test qilish' },
  });
  assert.equal(assignRes.status, 201);

  // 7. TRANSITION TO DIAGNOSING & SUBMIT DIAGNOSIS (Labor: 150 000, Part: 700 000 = Total: 850 000)
  const diagStatusRes = await request(`/orders/${order.id}/status`, {
    ...authA,
    method: 'PATCH',
    body: { status: 'DIAGNOSING', comment: 'Diagnostika boshlandi' },
  });
  assert.equal(diagStatusRes.status, 200);

  const diagRes = await request(`/orders/${order.id}/diagnosis`, {
    ...authA,
    method: 'POST',
    body: {
      diagnosis: 'OLED panel shikastlangan',
      requiredWork: 'Displey modulini almashtirish',
      labor: '150000',
      partsTotal: '700000',
    },
  });
  assert.equal(diagRes.status, 201);

  // 8. CUSTOMER APPROVAL (Version-bound)
  const approveRes = await request(`/orders/${order.id}/approve`, {
    ...authA,
    method: 'POST',
    body: {
      quoteVersion: 1,
      approved: true,
      evidence: 'Mijoz telefon orqali rozilik bildirdi',
    },
  });
  assert.equal(approveRes.status, 201);

  // 9. RESERVE INVENTORY PART (Pessimistic lock)
  const reserveRes = await request(`/orders/${order.id}/parts`, {
    ...authA,
    method: 'POST',
    body: { partId: part.id, quantity: 1 },
  });
  assert.equal(reserveRes.status, 201);

  // 10. START REPAIR SESSION & INSTALL PART
  const startRepairRes = await request(`/orders/${order.id}/repair/start`, {
    ...authA,
    method: 'POST',
  });
  assert.equal(startRepairRes.status, 201);

  const usePartRes = await request(`/orders/${order.id}/parts/${part.id}/use`, {
    ...authA,
    method: 'POST',
  });
  assert.equal(usePartRes.status, 201);

  // 11. PASS FINAL TEST CHECKLIST & COMPLETE REPAIR -> READY
  const finishRepairRes = await request(`/orders/${order.id}/repair/finish`, {
    ...authA,
    method: 'POST',
    body: {
      passedChecks: [
        'Display',
        'Touch',
        'Camera',
        'Microphone',
        'Speaker',
        'Charging',
        'Wi-Fi',
        'Bluetooth',
      ],
    },
  });
  assert.equal(finishRepairRes.status, 201);

  const readyOrder = await (await request(`/orders/${order.id}`, authA)).json();
  assert.equal(readyOrder.status, 'READY');

  // 12. SPLIT PAYMENTS WITH IDEMPOTENCY KEYS (300k Cash + 550k Card = 850k Total)
  const pay1Res = await request(`/orders/${order.id}/payments`, {
    ...authA,
    method: 'POST',
    body: { amount: '300000', method: 'CASH', idempotencyKey: randomUUID() },
  });
  assert.equal(pay1Res.status, 201);

  const pay2Res = await request(`/orders/${order.id}/payments`, {
    ...authA,
    method: 'POST',
    body: { amount: '550000', method: 'CARD', idempotencyKey: randomUUID() },
  });
  assert.equal(pay2Res.status, 201);

  // 13. DELIVER ORDER & CREATE WARRANTY CERTIFICATE
  const deliverRes = await request(`/orders/${order.id}/deliver`, {
    ...authA,
    method: 'POST',
    body: {
      warrantyDays: 90,
      warrantyTerms: 'Displey va oʻrnatish xizmatiga 90 kun kafolat',
      coveredOrderPartIds: [],
      coveredRepairActionIds: [],
    },
  });
  assert.equal(deliverRes.status, 201);

  const deliveredOrder = await (await request(`/orders/${order.id}`, authA)).json();
  assert.equal(deliveredOrder.status, 'DELIVERED');

  // Verify Commission Snapshot created for technician (30% of 150k labor = 45k)
  const commissions = await db.commissionEntry.findMany({
    where: { organizationId: tenantA.org.id, orderId: order.id },
  });
  assert.ok(commissions.length >= 1);
  assert.equal(Number(commissions[0].amount), 45000);

  // Verify Warranty Record
  const warranty = await db.warranty.findUnique({ where: { orderId: order.id } });
  assert.ok(warranty);
  assert.equal(warranty.days, 90);

  // 14. MULTI-TENANT ISOLATION CHECK: Tenant B cannot access Tenant A order
  const authB = await login(tenantB.ownerUser);
  const crossAccessRes = await request(`/orders/${order.id}`, authB);
  assert.equal(crossAccessRes.status, 404);
});
