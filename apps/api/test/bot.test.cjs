// Telegram bot against a fake Bot API: customers by phone, staff and admin deep links,
// staff alerts, courtesy messages without SMS, receipt photo and webhook setup.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const db = new PrismaClient();
const base = 'http://localhost:3001/api';
const SECRET = 'webhook-secret-for-tests';
let server, mock, output = '';
const calls = [];

function request(p, { token, body, method = 'GET', headers = {} } = {}) {
  return fetch(base + p, { method, headers: { Origin: 'http://localhost:3000', ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function ok(response, status = 200) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return text ? JSON.parse(text) : undefined;
}
async function signIn(login, password, newPassword) {
  const { accessToken } = await ok(await request('/auth/login', { method: 'POST', body: { login, password } }));
  return (await ok(await request('/auth/change-password', { token: accessToken, method: 'POST', body: { currentPassword: password, newPassword } }))).accessToken;
}
let updateId = 1;
/** Simulate Telegram delivering a private message from `chat` to the webhook. */
async function tg(chat, message, secret = SECRET) {
  const res = await fetch(base + '/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify({ update_id: updateId++, message: { chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Test' }, ...message } }) });
  return res.status;
}
/** Text of the last message the bot sent to `chat`. */
function lastTo(chat) {
  const sent = calls.filter(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(chat));
  return sent.at(-1)?.body;
}

before(async () => {
  mock = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      const method = req.url.split('/').pop();
      let body = raw; try { body = JSON.parse(raw); } catch { /* multipart */ }
      calls.push({ method, body, contentType: req.headers['content-type'] });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(method === 'getWebhookInfo' ? { ok: true, result: { url: '', pending_update_count: 0 } } : { ok: true, result: { message_id: calls.length } }));
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: '123456789:AAHtestTokenWithTheSameShapeAsReal_1', TELEGRAM_BOT_USERNAME: 'myservice_test_bot', TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_URL: 'http://127.0.0.1:' + mock.address().port + '/' });
  server = spawn(process.execPath, [path.resolve(__dirname, '..', 'dist', 'main.js')], { cwd: path.resolve(__dirname, '..'), env: process.env });
  server.stdout.on('data', d => { output += d; }); server.stderr.on('data', d => { output += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); }
  throw new Error('API did not start: ' + output);
});
after(async () => {
  if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
  await new Promise(r => mock.close(r));
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_API_URL']) delete process.env[k];
  await db.$disconnect();
});

test('bot: customers, staff, admins, alerts and receipt photo', async () => {
  const id = randomUUID().slice(0, 8);
  const phone = '+99893' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  // Platform admin opens two services; the same person is a customer of both.
  await db.platformAdmin.create({ data: { login: 'bot-admin-' + id, passwordHash: await argon2.hash('Platform-Pass-123') } });
  const platform = (await ok(await request('/platform/auth/login', { method: 'POST', body: { login: 'bot-admin-' + id, password: 'Platform-Pass-123' } }), 201)).accessToken;
  const plan = await ok(await request('/platform/plans', { token: platform, method: 'POST', body: { name: 'BOT-' + id, maxStaff: 5, monthlyPrice: '0', features: { telegram: true, sms: false } } }), 201);
  const bosses = [];
  for (const n of ['a', 'b']) {
    await ok(await request('/platform/organizations', { token: platform, method: 'POST', body: { name: 'Servis ' + n + id, slug: 'bot-' + n + id, planId: plan.id, login: 'bot' + n + id, temporaryPassword: 'Temporary-Pass-123', ownerName: 'Boss', phone: '+998901110000' } }), 201);
    bosses.push(await signIn('bot' + n + id, 'Temporary-Pass-123', 'Boss-Password-123'));
  }
  const orders = [];
  for (const boss of bosses) {
    const customer = await ok(await request('/customers', { token: boss, method: 'POST', body: { firstName: 'Alisher', phone } }), 201);
    const device = await ok(await request('/devices', { token: boss, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Apple', model: 'iPhone 13' } }), 201);
    orders.push(await ok(await request('/orders', { token: boss, method: 'POST', body: { customerId: customer.id, deviceId: device.id, complaint: 'Ekran', accessories: [], labor: '100000', partsTotal: '200000' } }), 201));
  }

  // Webhook refuses anything without Telegram's secret.
  assert.equal(await tg(1, { text: '/start' }, 'wrong-secret'), 403);

  // Customer: /start asks for the phone; a forwarded contact is not proof; the own contact links both services.
  const customerChat = 7000000 + Math.floor(Math.random() * 1e6);
  assert.equal(await tg(customerChat, { text: '/start' }), 200);
  assert.ok(lastTo(customerChat).reply_markup.keyboard[0][0].request_contact);
  await tg(customerChat, { contact: { phone_number: phone.slice(1), user_id: 42 } });
  assert.equal(await db.customer.count({ where: { telegramChatId: String(customerChat) } }), 0);
  await tg(customerChat, { contact: { phone_number: phone.slice(1), user_id: customerChat } });
  assert.equal(await db.customer.count({ where: { telegramChatId: String(customerChat) } }), 2);
  await tg(customerChat, { text: '📦 Buyurtmalarim' });
  const list = lastTo(customerChat).text;
  for (const o of orders) assert.ok(list.includes(o.number), list);
  assert.ok(list.includes('Servis a' + id) && list.includes('Servis b' + id));

  // Receipt photo goes to the linked customer as an image.
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex').toString('base64');
  await ok(await request('/orders/' + orders[0].id + '/receipt/telegram', { token: bosses[0], method: 'POST', body: { image: png } }), 201);
  const photo = calls.filter(c => c.method === 'sendPhoto').at(-1);
  assert.ok(photo.contentType.startsWith('multipart/form-data')); assert.ok(photo.body.includes(String(customerChat)));
  assert.equal((await request('/orders/' + orders[0].id + '/receipt/telegram', { token: bosses[0], method: 'POST', body: { image: 'data:image/png;base64,AAAA' } })).status, 400);

  // Staff: one-time deep link from the web app; second use is refused.
  const staffChat = 8000000 + Math.floor(Math.random() * 1e6);
  const { url } = await ok(await request('/bot/link', { token: bosses[0], method: 'POST' }), 201);
  assert.match(url, /^https:\/\/t\.me\/myservice_test_bot\?start=u_[A-Za-z0-9_-]{43}$/);
  const payload = url.split('start=')[1];
  await tg(staffChat, { text: '/start ' + payload });
  assert.ok(lastTo(staffChat).text.includes('Servis a' + id));
  assert.equal((await ok(await request('/bot/me', { token: bosses[0] }))).linked, true);
  await tg(staffChat + 1, { text: '/start ' + payload });
  assert.ok(lastTo(staffChat + 1).text.includes('eskirgan'));
  // Staff search stays inside their own service.
  await tg(staffChat, { text: orders[0].number.slice(3) });
  assert.ok(lastTo(staffChat).text.includes(orders[0].number));
  // Both services number orders the same way; only this service's one comes back.
  assert.equal(lastTo(staffChat).text.split('\n\n').length, 1);
  await tg(staffChat, { text: '📊 Bugungi hisobot' });
  assert.ok(lastTo(staffChat).text.includes('Qabul qilindi: <b>1</b>'), lastTo(staffChat).text);

  // Worker: staff hear about a new order; the customer gets "received" by Telegram only, never SMS.
  const { Notifications } = require('../dist/notifications/notifications.module.js');
  const { BotService } = require('../dist/bot/bot.service.js');
  const { TelegramClient } = require('../dist/bot/telegram.client.js');
  const worker = new Notifications(db, undefined, new BotService(db, new TelegramClient()));
  const orgA = await db.order.findUniqueOrThrow({ where: { id: orders[0].id } });
  const event = await db.outboxEvent.findFirstOrThrow({ where: { entityId: orders[0].id, type: 'ORDER_RECEIVED' } });
  const before = calls.length;
  // Whoever took the device in is not told about it; a colleague's intake is.
  await worker.deliverStaff(event.id);
  assert.ok(!calls.slice(before).some(c => String(c.body.chat_id) === String(staffChat)));
  const colleague = await db.outboxEvent.create({ data: { organizationId: orgA.organizationId, type: 'ORDER_RECEIVED', entityId: orders[0].id, payload: { actorId: 'someone-else' } } });
  await worker.deliverStaff(colleague.id);
  assert.ok(calls.slice(before).some(c => String(c.body.chat_id) === String(staffChat) && c.body.text.includes('Yangi qabul')));
  await worker.deliver(event.id);
  assert.equal((await db.notification.findUnique({ where: { eventId: event.id } })).channel, 'TELEGRAM');
  assert.ok(lastTo(customerChat).text.includes('qabul qilindi'));
  const other = await db.customer.create({ data: { organizationId: orgA.organizationId, firstName: 'NoTg', phone: '+998970000' + id.replace(/\D/g, '0').slice(0, 3) } });
  const dev = await db.device.create({ data: { organizationId: orgA.organizationId, customerId: other.id, category: 'Telefon', brand: 'X', model: 'Y' } });
  const plain = await db.order.create({ data: { organizationId: orgA.organizationId, branchId: orgA.branchId, customerId: other.id, deviceId: dev.id, number: 'T-' + id, complaint: 'x', accessories: [], condition: [] } });
  const quiet = await db.outboxEvent.create({ data: { organizationId: orgA.organizationId, type: 'ORDER_RECEIVED', entityId: plain.id, payload: {} } });
  await worker.deliver(quiet.id);
  const skipped = await db.notification.findUnique({ where: { eventId: quiet.id } });
  assert.equal(skipped.status, 'SKIPPED'); assert.equal(skipped.errorCode, 'NO_TELEGRAM');
  assert.equal((await request('/orders/' + plain.id + '/receipt/telegram', { token: bosses[0], method: 'POST', body: { image: png } })).status, 409);

  // Settings → order alerts: an extra chat joins by one-time link; people and events can be switched off.
  const extraChat = 9500000 + Math.floor(Math.random() * 1e5);
  const { url: alertUrl } = await ok(await request('/bot/alerts/chats', { token: bosses[0], method: 'POST', body: { label: 'Sherigim' } }), 201);
  assert.match(alertUrl, /start=g_[A-Za-z0-9_-]{43}$/);
  await tg(extraChat, { text: '/start ' + alertUrl.split('start=')[1] });
  assert.ok(lastTo(extraChat).text.includes('buyurtma xabarlariga ulandingiz'));
  let alertSetup = await ok(await request('/bot/alerts', { token: bosses[0] }));
  assert.deepEqual(alertSetup.events, { newOrder: true, ready: true, daily: true });
  assert.equal(alertSetup.chats.length, 1); assert.equal(alertSetup.chats[0].label, 'Sherigim');
  const owner = alertSetup.users.find(u => u.linked); assert.ok(owner && owner.enabled);
  const alertEvent = async () => db.outboxEvent.create({ data: { organizationId: orgA.organizationId, type: 'ORDER_RECEIVED', entityId: orders[0].id, payload: { actorId: 'someone-else' } } });
  const recipients = async () => { const from = calls.length; await worker.deliverStaff((await alertEvent()).id); return calls.slice(from).filter(c => c.method === 'sendMessage').map(c => String(c.body.chat_id)); };
  let got = await recipients();
  assert.ok(got.includes(String(staffChat)) && got.includes(String(extraChat)), got.join());
  await ok(await request('/bot/alerts/users/' + owner.id, { token: bosses[0], method: 'PATCH', body: { enabled: false } }));
  got = await recipients();
  assert.ok(!got.includes(String(staffChat)) && got.includes(String(extraChat)));
  await ok(await request('/bot/alerts', { token: bosses[0], method: 'PUT', body: { newOrder: false, ready: true, daily: true } }));
  assert.equal((await recipients()).length, 0);
  // Other services cannot touch these settings.
  assert.equal((await request('/bot/alerts/chats/' + alertSetup.chats[0].id, { token: bosses[1], method: 'DELETE' })).status, 404);
  await ok(await request('/bot/alerts/chats/' + alertSetup.chats[0].id, { token: bosses[0], method: 'DELETE' }));
  alertSetup = await ok(await request('/bot/alerts', { token: bosses[0] }));
  assert.equal(alertSetup.chats.length, 0);
  await ok(await request('/bot/alerts', { token: bosses[0], method: 'PUT', body: { newOrder: true, ready: true, daily: true } }));
  await ok(await request('/bot/alerts/users/' + owner.id, { token: bosses[0], method: 'PATCH', body: { enabled: true } }));

  // Platform: register the webhook, connect the admin, read platform numbers.
  const setup = await ok(await request('/platform/bot/setup', { token: platform, method: 'POST' }), 201);
  const hook = calls.filter(c => c.method === 'setWebhook').at(-1);
  assert.equal(hook.body.url, setup.url); assert.equal(hook.body.secret_token, SECRET);
  const admin = await ok(await request('/platform/bot/link', { token: platform, method: 'POST' }), 201);
  const adminChat = 9000000 + Math.floor(Math.random() * 1e6);
  await tg(adminChat, { text: '/start ' + admin.url.split('start=')[1] });
  await tg(adminChat, { text: '📈 Platforma' });
  assert.ok(lastTo(adminChat).text.includes('MyService platforma'));
  assert.equal((await ok(await request('/platform/bot', { token: platform }))).adminLinked, true);
  // A customer cannot read platform numbers.
  await tg(customerChat, { text: '/stats' });
  assert.ok(!lastTo(customerChat).text.includes('MyService platforma'));

  // "Contact the service": name, phone (owner's when Settings has none), socials, and a call card per service.
  const beforeContact = calls.length;
  await tg(customerChat, { text: "☎️ Servis bilan bog'lanish" });
  const info = calls.slice(beforeContact).filter(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(customerChat)).map(c => c.body.text).join('\n');
  assert.ok(info.includes('Servis a' + id) && info.includes('Servis b' + id), info);
  assert.ok(info.includes('+998 90 111 00 00'), info); assert.ok(info.includes('@myserviceuzz'), info);
  const cards = calls.slice(beforeContact).filter(c => c.method === 'sendContact');
  assert.equal(cards.length, 2); assert.equal(cards[0].body.phone_number, '+998901110000');

  // Settings → bot contact overrides the receipt details for the bot; empty fields are hidden.
  await ok(await request('/settings/general/bot_contact', { token: bosses[0], method: 'PUT', body: { value: { name: 'Mobile Fix', phone: '+998971112233', phone2: '', address: 'Chilonzor 9', landmark: 'Korzinka yonida', hours: '9:00–19:00', telegram: '', instagram: 'mobilefix.uz', mapUrl: 'https://yandex.uz/maps/-/abc', note: '' } } }));
  const beforeBot = calls.length;
  await tg(customerChat, { text: "☎️ Servis bilan bog'lanish" });
  const sent = calls.slice(beforeBot).filter(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(customerChat));
  const fix = sent.find(c => c.body.text.includes('Mobile Fix'));
  assert.ok(fix, sent.map(c => c.body.text).join('\n'));
  for (const piece of ['+998 97 111 22 33', 'Chilonzor 9', "Mo'ljal: Korzinka yonida", 'Ish vaqti: 9:00–19:00', 'Instagram: mobilefix.uz']) assert.ok(fix.body.text.includes(piece), piece);
  assert.ok(!fix.body.text.includes('Telegram:'));
  assert.deepEqual(fix.body.reply_markup.inline_keyboard[0].map(b => b.url), ['https://instagram.com/mobilefix.uz', 'https://yandex.uz/maps/-/abc']);
  // The other service has not saved it yet and keeps the defaults.
  assert.ok(sent.some(c => c.body.text.includes('Servis b' + id) && c.body.text.includes('@myserviceuzz')));
  assert.ok(calls.slice(beforeBot).some(c => c.method === 'sendContact' && c.body.phone_number === '+998971112233' && c.body.first_name === 'Mobile Fix'));

  // Someone who never brought a device can still reach the service from the first screen.
  const stranger = 5000000 + Math.floor(Math.random() * 1e6);
  await tg(stranger, { text: '/start' });
  const firstScreen = lastTo(stranger).reply_markup.keyboard.flat().map(b => b.text);
  for (const button of ['✈️ Telegram', '📷 Instagram', '📍 Manzil', "📞 Qo'ng'iroq"]) assert.ok(firstScreen.includes(button), button);
  const beforeStranger = calls.length;
  await tg(stranger, { text: '📍 Manzil' });
  const where = calls.slice(beforeStranger).find(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(stranger) && c.body.text.includes('Mobile Fix'));
  assert.ok(where); assert.equal(where.body.reply_markup.inline_keyboard[0][0].url, 'https://yandex.uz/maps/-/abc');
  const beforeCall = calls.length;
  await tg(stranger, { text: "📞 Qo'ng'iroq" });
  assert.ok(calls.slice(beforeCall).some(c => c.method === 'sendContact' && c.body.phone_number === '+998971112233'));

  // /stop disconnects the chat everywhere.
  await tg(customerChat, { text: '/stop' });
  assert.equal(await db.customer.count({ where: { telegramChatId: String(customerChat) } }), 0);
});
