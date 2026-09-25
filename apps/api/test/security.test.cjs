const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
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
  const plan = await db.plan.create({ data: { name: id, maxStaff: 5, features: { inventory: true, staff_commission: true } } });
  await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) } });
  const role = await db.role.create({ data: { organizationId: org.id, name: 'OWNER', systemKey: 'OWNER' } });
  for (const key of ['staff.view', 'staff.manage', 'customers.view', 'customers.edit', 'orders.view', 'orders.create', 'orders.assign', 'orders.change_status', 'orders.edit', 'diagnostics.create', 'inventory.view', 'inventory.manage', 'inventory.use', 'inventory.view_cost', 'payments.view', 'payments.create', 'payments.refund', 'payments.deliver_with_debt', 'reports.view', 'reports.finance']) {
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
  const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
  let storageReady = false, storageError;
  for (let i = 0; i < 60; i++) {
    try { await s3.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET })); storageReady = true; break; }
    catch (e) { storageError = e; if (['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name)) { storageReady = true; break; } await new Promise(r => setTimeout(r, 500)); }
  }
  if (!storageReady) throw new Error('MinIO bucket setup failed: ' + String(storageError?.name) + ': ' + String(storageError?.message));
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
  const changed = await request('/auth/change-password', { ...auth, method: 'POST', body: { currentPassword: password, newPassword: 'changed-password-123' } });
  assert.equal(changed.status, 200);
  assert.equal((await request('/auth/me', auth)).status, 401);
  assert.equal((await request('/auth/me', { token: (await changed.json()).accessToken })).status, 200);
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
  const customerResponse = await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998900000001', telegramUsername: '@ali_test', notificationPreference: 'AUTO' } });
  assert.equal(customerResponse.status, 201);
  const customer = await customerResponse.json();
  assert.equal(customer.lastName, 'Valiyev'); assert.equal(customer.telegramUsername, 'ali_test');
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
  const quoteAudit = await db.auditLog.findFirst({ where: { organizationId: a.org.id, entityId: order.id, action: 'QUOTE_UPDATED' }, orderBy: { createdAt: 'desc' } });
  assert.equal(quoteAudit.oldValue.quoteVersion, 1); assert.equal(quoteAudit.newValue.quoteVersion, 2); assert.ok(quoteAudit.ip);
  assert.equal((await request('/orders/' + order.id + '/approve', { ...auth, method: 'POST', body: { quoteVersion: 1, approved: true, evidence: 'Customer phone confirmation' } })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/approve', { ...auth, method: 'POST', body: { quoteVersion: 2, approved: true, evidence: 'Customer phone confirmation' } })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'IN_REPAIR', comment: 'Part available' } })).status, 200);
  const result = await (await request('/orders/' + order.id, auth)).json();
  assert.equal(result.total, '860000');
  assert.equal(result.status, 'IN_REPAIR');
  assert.equal(result.history.length, 6);
  assert.ok(await db.outboxEvent.count({ where: { entityId: order.id } }) >= 6);
});

test('reservation race, cancellation release, repair, split payment/refund and delivery warranty', async () => {
  const auth = await login(a.user);
  const customer = await (await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Vali', phone: '+998900000002' } })).json();
  const device = await (await request('/devices', { ...auth, method: 'POST', body: { customerId: customer.id, category: 'Phone', brand: 'Apple', model: 'iPhone' } })).json();
  const partR = await request('/inventory/parts', { ...auth, method: 'POST', body: { name: 'OLED', sku: 'oled-test', barcode: '4780000000012', brand: 'Apple', compatibleModels: ['iPhone 13', 'iPhone 14'], storageLocation: 'A-12', minimumQuantity: 2, purchasePrice: '550000', salePrice: '700000' } });
  assert.equal(partR.status, 201); const part = await partR.json();
  assert.equal(part.barcode, '4780000000012'); assert.deepEqual(part.compatibleModels, ['iPhone 13', 'iPhone 14']); assert.equal(part.storageLocation, 'A-12');
  assert.equal((await request('/inventory/receive', { ...auth, method: 'POST', body: { partId: part.id, branchId: a.branch.id, quantity: 1, reason: 'Supplier delivery' } })).status, 201);
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const order = await (await request('/orders', { ...auth, method: 'POST', body: { customerId: customer.id, deviceId: device.id, branchId: a.branch.id, complaint: 'OLED', accessories: [], condition: [] } })).json();
    ids.push(order.id);
    assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'DIAGNOSING', comment: 'Start diagnosis' } })).status, 200);
    assert.equal((await request('/orders/' + order.id + '/diagnosis', { ...auth, method: 'POST', body: { diagnosis: 'OLED damaged', requiredWork: 'Replace', labor: '150000', partsTotal: '700000' } })).status, 201);
    assert.equal((await request('/orders/' + order.id + '/approve', { ...auth, method: 'POST', body: { quoteVersion: 1, approved: true, evidence: 'Phone confirmation' } })).status, 201);
  }
  const reservations = await Promise.all(ids.map(id => request('/orders/' + id + '/parts', { ...auth, method: 'POST', body: { partId: part.id, quantity: 1 } })));
  assert.deepEqual(reservations.map(r => r.status).sort(), [201, 409]);
  const winner = ids[reservations.findIndex(r => r.status === 201)];
  const loser = ids.find(id => id !== winner);
  assert.equal((await request('/orders/' + winner + '/status', { ...auth, method: 'PATCH', body: { status: 'CANCELLED', comment: 'Customer cancelled' } })).status, 200);
  assert.equal((await request('/orders/' + loser + '/parts', { ...auth, method: 'POST', body: { partId: part.id, quantity: 1 } })).status, 201);
  assert.equal((await request('/orders/' + loser + '/repair/start', { ...auth, method: 'POST' })).status, 201);
  for (let i = 0; i < 2; i++) assert.equal((await request('/orders/' + loser + '/parts/' + part.id + '/use', { ...auth, method: 'POST' })).status, 201);
  const stock = await db.stock.findUnique({ where: { organizationId_branchId_partId: { organizationId: a.org.id, branchId: a.branch.id, partId: part.id } } });
  assert.equal(stock.onHand, 0); assert.equal(stock.reserved, 0);
  assert.equal(await db.inventoryMovement.count({ where: { orderId: loser, type: 'USED' } }), 1);
  assert.equal((await request('/orders/' + loser + '/repair/finish', { ...auth, method: 'POST', body: { passedChecks: ['Display'] } })).status, 409);
  await db.organizationSetting.upsert({ where: { organizationId_key: { organizationId: a.org.id, key: 'final_test_checklist' } }, create: { organizationId: a.org.id, key: 'final_test_checklist', value: { items: ['Face ID'] } }, update: { value: { items: ['Face ID'] } } });
  assert.equal((await request('/orders/' + loser + '/repair/finish', { ...auth, method: 'POST', body: { passedChecks: ['Display','Touch','Camera','Microphone','Speaker','Charging','Wi-Fi','Bluetooth'] } })).status, 409);
  assert.equal((await request('/orders/' + loser + '/repair/finish', { ...auth, method: 'POST', body: { passedChecks: ['Display','Touch','Camera','Microphone','Speaker','Charging','Wi-Fi','Bluetooth','Face ID'] } })).status, 201);
  const coverage=await db.orderPart.findFirst({where:{organizationId:a.org.id,orderId:loser}});
  const delivery = { warrantyDays: 90, warrantyTerms: 'Display replacement warranty', coveredOrderPartIds:[coverage.id], coveredRepairActionIds:[] };
  assert.equal((await request('/orders/' + loser + '/deliver', { ...auth, method: 'POST', body: delivery })).status, 409);
  const paymentBody = { amount: '300000', method: 'CASH', idempotencyKey: randomUUID() };
  const paid = await Promise.all([1,2].map(() => request('/orders/' + loser + '/payments', { ...auth, method: 'POST', body: paymentBody })));
  const entries = await Promise.all(paid.map(r => r.json()));
  assert.equal(entries[0].id, entries[1].id);
  const refund = await request('/payments/' + entries[0].id + '/refund', { ...auth, method: 'POST', body: { amount: '100000', reason: 'Customer requested', idempotencyKey: randomUUID() } });
  assert.equal(refund.status, 201);
  assert.equal((await request('/payments/' + entries[0].id + '/refund', { ...auth, method: 'POST', body: { amount: '300000', reason: 'Excess refund', idempotencyKey: randomUUID() } })).status, 409);
  assert.equal((await request('/orders/' + loser + '/payments', { ...auth, method: 'POST', body: { amount: '650000', method: 'CARD', idempotencyKey: randomUUID() } })).status, 201);
  const warranty = await request('/orders/' + loser + '/deliver', { ...auth, method: 'POST', body: delivery });
  assert.equal(warranty.status, 201);
  assert.equal((await db.order.findUnique({ where: { id: loser } })).status, 'DELIVERED');
  const storedWarranty=await db.warranty.findUnique({ where: { orderId: loser } });assert.ok(storedWarranty);assert.deepEqual(storedWarranty.coveredOrderPartIds,[coverage.id]);
});

test('only explicit permission can deliver an order with outstanding debt', async () => {
  const auth=await login(a.user);const source=await db.order.findFirst({where:{organizationId:a.org.id}});
  const order=await db.order.create({data:{organizationId:a.org.id,branchId:source.branchId,customerId:source.customerId,deviceId:source.deviceId,number:'DEBT-'+randomUUID(),complaint:'Debt delivery',accessories:[],condition:[],status:'READY',total:'100000',finalTest:{passedChecks:['Display']}}});
  const body={warrantyDays:30,warrantyTerms:'Limited service warranty'};
  assert.equal((await request('/orders/'+order.id+'/deliver',{...auth,method:'POST',body})).status,409);
  assert.equal((await request('/orders/'+order.id+'/deliver',{...auth,method:'POST',body:{...body,allowDebt:true}})).status,201);
});

test('stock adjustment and branch transfer preserve reserved availability', async () => {
  const auth = await login(a.user);
  const part = await db.part.findFirst({ where: { organizationId: a.org.id } });
  const destination = await db.branch.create({ data: { organizationId: a.org.id, name: 'Transfer ' + randomUUID() } });
  assert.equal((await request('/inventory/adjust', { ...auth, method: 'POST', body: { branchId: a.branch.id, partId: part.id, quantity: 2, reason: 'Physical count correction' } })).status, 201);
  assert.equal((await request('/inventory/transfer', { ...auth, method: 'POST', body: { fromBranchId: a.branch.id, toBranchId: destination.id, partId: part.id, quantity: 1, reason: 'Move to new branch' } })).status, 201);
  const source = await db.stock.findUnique({ where: { organizationId_branchId_partId: { organizationId: a.org.id, branchId: a.branch.id, partId: part.id } } });
  const target = await db.stock.findUnique({ where: { organizationId_branchId_partId: { organizationId: a.org.id, branchId: destination.id, partId: part.id } } });
  assert.equal(source.onHand, 1); assert.equal(target.onHand, 1);
  assert.equal(await db.inventoryMovement.count({ where: { organizationId: a.org.id, partId: part.id, type: 'TRANSFER', quantity: 1 } }), 2);
  assert.equal((await request('/inventory/transfer', { ...auth, method: 'POST', body: { fromBranchId: a.branch.id, toBranchId: destination.id, partId: part.id, quantity: 2, reason: 'Too much stock' } })).status, 409);
  const supplierResponse=await request('/suppliers',{...auth,method:'POST',body:{name:'Parts Hub',phone:'+998901119999',company:'Parts LLC',telegram:'@partshub',address:'Tashkent',notes:'Primary supplier'}});assert.equal(supplierResponse.status,201);const supplier=await supplierResponse.json();
  assert.equal((await request('/inventory/receive',{...auth,method:'POST',body:{branchId:destination.id,partId:part.id,quantity:1,supplierId:supplier.id,reason:'Invoice 001'}})).status,201);
  assert.equal(await db.inventoryMovement.count({where:{organizationId:a.org.id,partId:part.id,supplierId:supplier.id,type:'IN'}}),1);
  assert.equal((await request('/inventory/out',{...auth,method:'POST',body:{branchId:destination.id,partId:part.id,quantity:1,reason:'Workshop consumable'}})).status,201);
  assert.equal((await request('/inventory/return',{...auth,method:'POST',body:{branchId:destination.id,partId:part.id,quantity:1,supplierId:supplier.id,reason:'Defective item return'}})).status,201);
  assert.equal((await request('/inventory/return',{...auth,method:'POST',body:{branchId:destination.id,partId:part.id,quantity:1,supplierId:supplier.id,reason:'No stock remains'}})).status,409);
  const detailResponse=await request('/inventory/'+part.id,auth);assert.equal(detailResponse.status,200);const detail=await detailResponse.json();assert.ok(detail.movements.some(item=>item.supplier?.id===supplier.id));assert.ok(detail.movements.some(item=>item.type==='OUT'));assert.ok(detail.movements.some(item=>item.type==='RETURN'));
});

test('public links mask personal data and approval tokens are version-bound and single-use', async () => {
  const auth = await login(a.user);
  const { createHash, randomBytes } = require('node:crypto');
  const source = await db.order.findFirst({ where: { organizationId: a.org.id, status: 'IN_REPAIR' } });
  const linksResponse = await request('/orders/' + source.id + '/links', { ...auth, method: 'POST' });
  assert.equal(linksResponse.status, 201);
  const tracking = (await linksResponse.json()).tracking.split('/').pop();
  const tracked = await request('/public/track/' + tracking);
  assert.equal(tracked.status, 200);
  const text = JSON.stringify(await tracked.json());
  assert.ok(!text.includes('phone') && !text.includes('customer') && !text.includes('imei'));
  assert.equal((await request('/public/track/' + 'x'.repeat(43))).status, 404);
  const order = await db.order.create({ data: { organizationId: a.org.id, branchId: source.branchId, customerId: source.customerId, deviceId: source.deviceId, number: 'APPROVAL-TEST', complaint: 'Test', accessories: [], condition: [], status: 'WAITING_CUSTOMER_APPROVAL', quoteVersion: 3 } });
  const raw = randomBytes(32).toString('base64url');
  await db.customerLink.create({ data: { organizationId: a.org.id, orderId: order.id, purpose: 'APPROVAL', quoteVersion: 3, tokenHash: createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await request('/public/approval/' + raw, { method: 'POST', body: { quoteVersion: 2, approved: true } })).status, 409);
  assert.equal((await request('/public/approval/' + raw, { method: 'POST', body: { quoteVersion: 3, approved: true } })).status, 200);
  assert.equal((await request('/public/approval/' + raw, { method: 'POST', body: { quoteVersion: 3, approved: false } })).status, 409);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).status, 'WAITING_PART');
});

test('signed upload verifies metadata and receipt is a PDF', async () => {
  const auth = await login(a.user);
  const order = await db.order.findFirst({ where: { organizationId: a.org.id } });
  const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082','hex');
  const sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const signedResponse = await request('/orders/' + order.id + '/attachments/presign', { ...auth, method: 'POST', body: { kind: 'DAMAGE', contentType: 'image/png', size: bytes.length, sha256 } });
  assert.equal(signedResponse.status, 201);
  const signed = await signedResponse.json();
  const uploaded = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: bytes });
  if (uploaded.status !== 200) assert.fail('Object upload failed (' + uploaded.status + '): ' + await uploaded.text());
  assert.equal((await request('/orders/' + order.id + '/attachments/confirm', { ...auth, method: 'POST', body: { uploadId: signed.uploadId } })).status, 201);
  const attachments = await (await request('/orders/' + order.id + '/attachments', auth)).json();
  assert.ok(attachments.some(x => x.sha256 === undefined && x.kind === 'DAMAGE'));
  // Cyrillic and Uzbek letters must not break PDF text encoding.
  await db.customer.update({ where: { id: order.customerId }, data: { firstName: 'Алишер Oʻzbek' } });
  const pdf = await request('/orders/' + order.id + '/documents/receipt', { ...auth, method: 'POST' });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBytes.subarray(0,4).toString(), '%PDF');
});

test('technician compensation is snapshotted into commission on delivery', async () => {
  const auth = await login(a.user);
  const technician = await db.user.findFirst({ where: { organizationId: a.org.id, roles: { some: { role: { systemKey: 'TECHNICIAN' } } } } });
  assert.ok(technician);
  assert.equal((await request('/staff/' + technician.id + '/compensation', { ...auth, method: 'POST', body: { type: 'PERCENTAGE', salary: '0', percentage: '30', fixedPerJob: '0' } })).status, 201);
  const order = await db.order.findFirst({ where: { organizationId: a.org.id, status: 'DELIVERED' } });
  // Delivery already happened before the rule; entries are immutable and are not backfilled.
  assert.equal(await db.commissionEntry.count({ where: { orderId: order.id } }), 0);
  const rules = await db.technicianCompensation.findMany({ where: { organizationId: a.org.id, userId: technician.id, effectiveTo: null } });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].percentage.toString(), '30');
  const statsResponse = await request('/staff/' + technician.id + '/statistics', auth); assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json(); assert.equal(typeof stats.assigned, 'number'); assert.ok('averageRepairSeconds' in stats);
  assert.equal((await request('/staff/' + technician.id + '/activity', auth)).status, 200);
});

test('platform analytics calculates MRR without accepting tenant credentials', async () => {
  const tenantAuth = await login(a.user);
  assert.equal((await request('/platform/analytics', tenantAuth)).status, 401);
  const adminLogin = 'platform-' + randomUUID();
  await db.platformAdmin.create({ data: { login: adminLogin, passwordHash: await argon2.hash(password) } });
  const signedIn = await request('/platform/auth/login', { method: 'POST', body: { login: adminLogin, password } });
  assert.equal(signedIn.status, 201); const token = (await signedIn.json()).accessToken;
  const created = await request('/platform/plans', { token, method: 'POST', body: { name: 'PRO-' + randomUUID(), monthlyPrice: '123000', features: { inventory: true, telegram: true, sms: true, advanced_reports: true, multi_branch: true, staff_commission: true, exports: true } } });
  assert.equal(created.status, 201); const plan = await created.json();
  await db.subscription.update({ where: { organizationId: a.org.id }, data: { planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) } });
  const analyticsResponse = await request('/platform/analytics', { token });
  assert.equal(analyticsResponse.status, 200); const analytics = await analyticsResponse.json();
  assert.ok(Number(analytics.mrr) >= 123000); assert.ok(analytics.activeOrganizations >= 1);
});

test('permanent Telegram failure falls back to idempotent SMS delivery', async () => {
  const http = require('node:http');
  const calls = [];
  const mock = http.createServer((req,res) => {
    let body=''; req.on('data',chunk=>{body+=chunk}); req.on('end',()=>{calls.push({url:req.url,headers:req.headers,body});res.setHeader('Content-Type','application/json');if(req.url.includes('/sendMessage')){res.statusCode=400;res.end(JSON.stringify({ok:false,error_code:400}));}else{res.statusCode=200;res.end(JSON.stringify({id:'sms-1'}));}});
  });
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const port=mock.address().port; const old={telegram:process.env.TELEGRAM_API_URL,sms:process.env.SMS_API_URL,key:process.env.SMS_API_KEY,provider:process.env.SMS_PROVIDER,token:process.env.TELEGRAM_BOT_TOKEN};
  process.env.TELEGRAM_API_URL='http://127.0.0.1:'+port+'/';process.env.SMS_API_URL='http://127.0.0.1:'+port+'/sms';process.env.SMS_API_KEY='test-key';process.env.SMS_PROVIDER='webhook';process.env.TELEGRAM_BOT_TOKEN='test-token';
  try {
    const subscription=await db.subscription.findUnique({where:{organizationId:a.org.id}});await db.plan.update({where:{id:subscription.planId},data:{features:{inventory:true,telegram:true,sms:true,advanced_reports:true,multi_branch:true,staff_commission:true,exports:true}}});
    const source=await db.order.findFirst({where:{organizationId:a.org.id}});
    await db.customer.update({where:{id:source.customerId},data:{telegramChatId:'12345'}});
    const order=await db.order.create({data:{organizationId:a.org.id,branchId:source.branchId,customerId:source.customerId,deviceId:source.deviceId,number:'NOTIFY-'+randomUUID(),complaint:'Notification test',accessories:[],condition:[],status:'READY'}});
    const event=await db.outboxEvent.create({data:{organizationId:a.org.id,type:'ORDER_READY',entityId:order.id,payload:{}}});
    const {Notifications}=require('../dist/notifications/notifications.module.js');
    await new Notifications(db).deliver(event.id);
    const notification=await db.notification.findUnique({where:{eventId:event.id}});
    assert.equal(notification.status,'SENT');assert.equal(notification.channel,'SMS');assert.equal(notification.providerId,'sms-1');
    assert.equal(calls.length,2);assert.ok(calls[0].url.includes('/sendMessage'));assert.equal(calls[1].headers['idempotency-key'],event.id);
  } finally {
    await new Promise(resolve=>mock.close(resolve));
    for(const [key,value] of Object.entries({TELEGRAM_API_URL:old.telegram,SMS_API_URL:old.sms,SMS_API_KEY:old.key,SMS_PROVIDER:old.provider,TELEGRAM_BOT_TOKEN:old.token})){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});

test('CSV export is plan-gated and protects spreadsheet cells', async()=>{const auth=await login(a.user);const response=await request('/reports/export',auth);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith('text/csv'));const bytes=new Uint8Array(await response.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[0xef,0xbb,0xbf]);const csv=new TextDecoder().decode(bytes);assert.ok(csv.includes('order'));});
let ownerSession; // shared: the per-login rate limit (15 / 15 min) is close after the earlier tests
test('parts can be released or returned and a cheaper actual part does not block finishing', async () => {
  const auth = ownerSession = await login(a.user);
  const me = await (await request('/auth/me', auth)).json();
  assert.equal(me.role, 'OWNER'); assert.deepEqual(me.roles, ['OWNER']);
  const customer = await (await request('/customers', { ...auth, method: 'POST', body: { firstName: 'Sardor', phone: '+998900000077' } })).json();
  const device = await (await request('/devices', { ...auth, method: 'POST', body: { customerId: customer.id, category: 'Phone', brand: 'Samsung', model: 'S23' } })).json();
  const part = await (await request('/inventory/parts', { ...auth, method: 'POST', body: { name: 'Battery', sku: 'bat-' + randomUUID(), purchasePrice: '100000', salePrice: '180000' } })).json();
  assert.equal((await request('/inventory/receive', { ...auth, method: 'POST', body: { partId: part.id, branchId: a.branch.id, quantity: 3, reason: 'Delivery' } })).status, 201);
  const order = await (await request('/orders', { ...auth, method: 'POST', body: { customerId: customer.id, deviceId: device.id, branchId: a.branch.id, complaint: 'Battery drains', accessories: [], condition: [] } })).json();
  assert.equal((await request('/orders/' + order.id + '/status', { ...auth, method: 'PATCH', body: { status: 'DIAGNOSING', comment: 'Start' } })).status, 200);
  // Quote expects 200 000 of parts, the real part sells for 180 000.
  assert.equal((await request('/orders/' + order.id + '/diagnosis', { ...auth, method: 'POST', body: { diagnosis: 'Worn battery', requiredWork: 'Replace battery', labor: '100000', partsTotal: '200000', estimatedTime: '2 soat' } })).status, 201);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).estimatedTime, '2 soat');
  assert.equal((await request('/orders/' + order.id + '/approve', { ...auth, method: 'POST', body: { quoteVersion: 1, approved: true, evidence: 'Phone call' } })).status, 201);
  const stockOf = () => db.stock.findUnique({ where: { organizationId_branchId_partId: { organizationId: a.org.id, branchId: a.branch.id, partId: part.id } } });
  assert.equal((await request('/orders/' + order.id + '/parts', { ...auth, method: 'POST', body: { partId: part.id, quantity: 1 } })).status, 201);
  assert.equal((await stockOf()).reserved, 1);
  // Wrong part reserved: release it, then reserve again (same order line is reused).
  assert.equal((await request('/orders/' + order.id + '/parts/' + part.id + '/release', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await stockOf()).reserved, 0);
  assert.equal((await request('/orders/' + order.id + '/parts/' + part.id + '/release', { ...auth, method: 'POST' })).status, 409);
  assert.equal((await request('/orders/' + order.id + '/parts', { ...auth, method: 'POST', body: { partId: part.id, quantity: 1 } })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/repair/start', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/parts/' + part.id + '/use', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await stockOf()).onHand, 2);
  // Installed part turned out faulty: return it to stock, then install a fresh one.
  assert.equal((await request('/orders/' + order.id + '/parts/' + part.id + '/return', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await stockOf()).onHand, 3);
  assert.equal(await db.inventoryMovement.count({ where: { orderId: order.id, type: 'RETURN' } }), 1);
  assert.equal((await request('/orders/' + order.id + '/parts', { ...auth, method: 'POST', body: { partId: part.id, quantity: 1 } })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/parts/' + part.id + '/use', { ...auth, method: 'POST' })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/repair/actions', { ...auth, method: 'POST', body: { description: 'Battery replaced', laborAmount: '100000' } })).status, 201);
  assert.equal((await request('/orders/' + order.id + '/repair/actions', { ...auth, method: 'POST', body: { description: 'Extra work', laborAmount: '50000' } })).status, 201);
  const checks = { passedChecks: ['Display','Touch','Camera','Microphone','Speaker','Charging','Wi-Fi','Bluetooth','Face ID'] };
  // Labor above the approved quote is rejected, parts below it are fine.
  assert.equal((await request('/orders/' + order.id + '/repair/finish', { ...auth, method: 'POST', body: checks })).status, 409);
  await db.repairAction.deleteMany({ where: { orderId: order.id, description: 'Extra work' } });
  assert.equal((await request('/orders/' + order.id + '/repair/finish', { ...auth, method: 'POST', body: checks })).status, 201);
  const detail = await (await request('/orders/' + order.id, auth)).json();
  assert.equal(detail.status, 'READY');
  assert.equal(detail.actorNames[a.user.id], 'Test');
  const list = await (await request('/orders', auth)).json();
  assert.ok(Array.isArray(list.find(o => o.id === order.id).assignments));
});
test('owner edits staff profile, role and branches', async () => {
  const auth = ownerSession ?? await login(a.user);
  const created = await (await request('/staff', { ...auth, method: 'POST', body: { login: 'edit-' + randomUUID().slice(0, 8), firstName: 'Aziz', temporaryPassword: password, phone: '+998901112233', role: 'TECHNICIAN', branchIds: [a.branch.id] } })).json();
  const technicianRole = await db.role.findFirst({ where: { organizationId: a.org.id, systemKey: 'TECHNICIAN' } });
  assert.ok(technicianRole);
  const updated = await request('/staff/' + created.id, { ...auth, method: 'PATCH', body: { firstName: 'Aziz', lastName: 'Karimov', phone: '+998901112244' } });
  assert.equal(updated.status, 200);
  const body = await updated.json();
  assert.equal(body.lastName, 'Karimov'); assert.equal(body.phone, '+998901112244');
  assert.equal((await request('/staff/' + a.user.id, { ...auth, method: 'PATCH', body: { role: 'TECHNICIAN' } })).status, 403);
  assert.equal((await request('/staff/' + created.id, { ...auth, method: 'PATCH', body: { branchIds: [b.branch.id] } })).status, 404);
  assert.ok(await db.auditLog.findFirst({ where: { organizationId: a.org.id, action: 'STAFF_UPDATED', entityId: created.id } }));
});
