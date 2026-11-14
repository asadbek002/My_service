// iPhone app push notifications against a fake APNs (HTTP/2): device registration, order alerts to
// colleagues' phones, a signed provider token, dead tokens forgotten, nothing after signing out.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http2 = require('node:http2');
const path = require('node:path');
const { randomUUID, generateKeyPairSync, verify } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const db = new PrismaClient();
const base = 'http://localhost:3001/api';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const GOOD = 'a'.repeat(64), DEAD = 'b'.repeat(64);
let server, apns, push, output = '';
const pushes = [];

function request(p, { token, body, method = 'GET' } = {}) {
  return fetch(base + p, { method, headers: { Origin: 'http://localhost:3000', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function ok(response, status = 200) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return text ? JSON.parse(text) : undefined;
}

before(async () => {
  apns = http2.createServer();
  apns.on('stream', (stream, headers) => {
    let raw = ''; stream.setEncoding('utf8'); stream.on('data', c => { raw += c; });
    stream.on('end', () => {
      const token = headers[':path'].split('/').pop();
      pushes.push({ token, headers, body: JSON.parse(raw) });
      if (token === DEAD) { stream.respond({ ':status': 410, 'content-type': 'application/json' }); stream.end(JSON.stringify({ reason: 'Unregistered' })); }
      else { stream.respond({ ':status': 200 }); stream.end(); }
    });
  });
  await new Promise(r => apns.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    APNS_KEY_ID: 'KEYID12345', APNS_TEAM_ID: 'TEAMID6789', APNS_TOPIC: 'uz.myserviceuz.app',
    APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'),
    APNS_HOST: 'http://127.0.0.1:' + apns.address().port,
  });
  server = spawn(process.execPath, [path.resolve(__dirname, '..', 'dist', 'main.js')], { cwd: path.resolve(__dirname, '..'), env: process.env });
  server.stdout.on('data', d => { output += d; }); server.stderr.on('data', d => { output += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); }
  throw new Error('API did not start: ' + output);
});
after(async () => {
  if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
  push?.onModuleDestroy();
  await new Promise(r => apns.close(r));
  for (const k of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_TOPIC', 'APNS_KEY', 'APNS_HOST']) delete process.env[k];
  await db.$disconnect();
});

test('push: devices, order alerts, provider token, dead tokens, sign-out', async () => {
  const id = randomUUID().slice(0, 8);
  await db.platformAdmin.create({ data: { login: 'push-admin-' + id, passwordHash: await argon2.hash('Platform-Pass-123') } });
  const platform = (await ok(await request('/platform/auth/login', { method: 'POST', body: { login: 'push-admin-' + id, password: 'Platform-Pass-123' } }), 201)).accessToken;
  const plan = await ok(await request('/platform/plans', { token: platform, method: 'POST', body: { name: 'PUSH-' + id, maxStaff: 5, monthlyPrice: '0', features: { telegram: true, sms: false } } }), 201);
  await ok(await request('/platform/organizations', { token: platform, method: 'POST', body: { name: 'Push ' + id, slug: 'push-' + id, planId: plan.id, login: 'push' + id, temporaryPassword: 'Temporary-Pass-123', ownerName: 'Boss', phone: '+998901110000' } }), 201);
  const first = (await ok(await request('/auth/login', { method: 'POST', body: { login: 'push' + id, password: 'Temporary-Pass-123' } }))).accessToken;
  let boss = (await ok(await request('/auth/change-password', { token: first, method: 'POST', body: { currentPassword: 'Temporary-Pass-123', newPassword: 'Boss-Password-123' } }))).accessToken;

  // The app asks the server first, then registers its token; junk is refused, and only signed-in users can.
  assert.deepEqual(await ok(await request('/push/status', { token: boss })), { enabled: true });
  assert.equal((await request('/push/devices', { method: 'POST', body: { token: GOOD } })).status, 401);
  assert.equal((await request('/push/devices', { token: boss, method: 'POST', body: { token: 'not-a-token' } })).status, 400);
  await ok(await request('/push/devices', { token: boss, method: 'POST', body: { token: GOOD.toUpperCase() } }), 204);
  await ok(await request('/push/devices', { token: boss, method: 'POST', body: { token: GOOD } }), 204);
  assert.equal(await db.pushDevice.count({ where: { token: GOOD } }), 1);

  const customer = await ok(await request('/customers', { token: boss, method: 'POST', body: { firstName: 'Alisher', phone: '+99893' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0') } }), 201);
  const device = await ok(await request('/devices', { token: boss, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Apple', model: 'iPhone 13' } }), 201);
  const order = await ok(await request('/orders', { token: boss, method: 'POST', body: { customerId: customer.id, deviceId: device.id, complaint: 'Ekran singan', accessories: [], labor: '100000', partsTotal: '0' } }), 201);
  const orgId = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).organizationId;

  const { Notifications } = require('../dist/notifications/notifications.module.js');
  const { SmsAccounts } = require('../dist/notifications/sms-accounts.js');
  const { PushService } = require('../dist/push/push.module.js');
  push = new PushService(db);
  const worker = new Notifications(db, undefined, new SmsAccounts(db), undefined, undefined, push);
  const deliver = async (type = 'ORDER_RECEIVED', actorId = 'someone-else') => {
    const from = pushes.length;
    const event = await db.outboxEvent.create({ data: { organizationId: orgId, type, entityId: order.id, payload: { actorId } } });
    await worker.deliverStaff(event.id);
    return pushes.slice(from);
  };

  // Whoever took the device in is not told; a colleague's intake reaches the phone.
  const own = await db.outboxEvent.findFirstOrThrow({ where: { entityId: order.id, type: 'ORDER_RECEIVED' } });
  let from = pushes.length; await worker.deliverStaff(own.id);
  assert.equal(pushes.length, from);
  let got = await deliver();
  assert.equal(got.length, 1);
  const [p] = got;
  assert.equal(p.token, GOOD);
  assert.equal(p.headers['apns-topic'], 'uz.myserviceuz.app');
  assert.equal(p.headers['apns-push-type'], 'alert');
  assert.equal(p.body.aps.alert.title, 'Yangi qabul ' + order.number);
  assert.match(p.body.aps.alert.body, /Apple iPhone 13 · Alisher · Ekran singan/);
  assert.equal(p.body.url, '/orders/' + order.id);
  assert.equal(p.body.aps['thread-id'], orgId);
  // The provider token: ES256 over header.claims, signed by our key, for our key id and team.
  const [h, c, s] = p.headers.authorization.replace(/^bearer /, '').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEYID12345' });
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).iss, 'TEAMID6789');
  assert.ok(verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  // "Ready" too.
  got = await deliver('ORDER_READY');
  assert.equal(got.length, 1); assert.equal(got[0].body.aps.alert.title, '✅ Tayyor ' + order.number);

  // A token Apple has retired is forgotten after the first try.
  await ok(await request('/push/devices', { token: boss, method: 'POST', body: { token: DEAD } }), 204);
  got = await deliver();
  assert.deepEqual(got.map(x => x.token).sort(), [GOOD, DEAD]);
  assert.equal(await db.pushDevice.count({ where: { token: DEAD } }), 0);

  // Order alerts switched off in Settings: no pushes either.
  await db.organizationSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key: 'bot_alerts' } }, create: { organizationId: orgId, key: 'bot_alerts', value: { newOrder: false, ready: true, daily: true } }, update: { value: { newOrder: false, ready: true, daily: true } } });
  assert.equal((await deliver()).length, 0);
  assert.equal((await deliver('ORDER_READY')).length, 1);
  await db.organizationSetting.delete({ where: { organizationId_key: { organizationId: orgId, key: 'bot_alerts' } } });

  // Signed out on the phone: nothing more arrives, even if the app could not unregister.
  await ok(await request('/auth/logout', { token: boss, method: 'POST' }), 204);
  assert.equal((await deliver()).length, 0);
  // Signing in again re-registers the phone; unregistering removes it.
  boss = (await ok(await request('/auth/login', { method: 'POST', body: { login: 'push' + id, password: 'Boss-Password-123' } }))).accessToken;
  await ok(await request('/push/devices', { token: boss, method: 'POST', body: { token: GOOD } }), 204);
  assert.equal((await deliver()).length, 1);
  await ok(await request('/push/devices/' + GOOD, { token: boss, method: 'DELETE' }), 204);
  assert.equal(await db.pushDevice.count({ where: { token: GOOD } }), 0);
  assert.equal((await deliver()).length, 0);
});

test('push: APNs settings and payload helpers', () => {
  const { apnsConfig, apnsPayload, deadToken } = require('../dist/push/apns.js');
  assert.equal(apnsConfig({}), null);
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const fromBase64 = apnsConfig({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_KEY: Buffer.from(pem).toString('base64') });
  assert.equal(fromBase64.host, 'https://api.push.apple.com'); assert.equal(fromBase64.topic, 'uz.myserviceuz.app');
  assert.throws(() => apnsConfig({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_KEY: pem, APNS_HOST: 'http://evil.example' }), /https/);
  assert.deepEqual(apnsPayload({ title: 'A', body: 'B' }), { aps: { alert: { title: 'A', body: 'B' }, sound: 'default' } });
  assert.ok(deadToken({ status: 410 })); assert.ok(deadToken({ status: 400, reason: 'BadDeviceToken' }));
  assert.ok(!deadToken({ status: 429, reason: 'TooManyRequests' })); assert.ok(!deadToken({ status: 0, reason: 'TIMEOUT' }));
});
