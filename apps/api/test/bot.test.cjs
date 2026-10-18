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
const OWN_TOKEN = '987654321:AAOwnBotTokenForTheServiceTestsXyz12';

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
      // /bot<token>/<method> for Telegram; /eskiz/... for the Eskiz mock.
      const token = /^\/bot([^/]+)\//.exec(req.url)?.[1] ?? null;
      let body = raw; try { body = JSON.parse(raw); } catch { if (String(req.headers['content-type']).includes('urlencoded')) body = Object.fromEntries(new URLSearchParams(raw)); }
      calls.push({ method, body, token, url: req.url, contentType: req.headers['content-type'] });
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/eskiz/')) {
        if (method === 'login') { if (body.password === 'bad') { res.statusCode = 401; return res.end('{}'); } return res.end(JSON.stringify({ data: { token: 'eskiz-' + body.email } })); }
        if (method === 'get-limit') return res.end(JSON.stringify({ data: { balance: 54321, sms_count: 9 } }));
        if (method === 'send') return res.end(JSON.stringify({ id: 'sms-' + calls.length, status: 'waiting' }));
        return res.end('{}');
      }
      if (method === 'getMe') return res.end(JSON.stringify(token === OWN_TOKEN ? { ok: true, result: { id: 777000111, is_bot: true, username: 'shop_test_bot' } } : { ok: false, error_code: 401, description: 'Unauthorized' }));
      res.end(JSON.stringify(method === 'getWebhookInfo' ? { ok: true, result: { url: 'https://x', pending_update_count: 0 } } : { ok: true, result: { message_id: calls.length } }));
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const mockUrl = 'http://127.0.0.1:' + mock.address().port + '/';
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: '123456789:AAHtestTokenWithTheSameShapeAsReal_1', TELEGRAM_BOT_USERNAME: 'myservice_test_bot', TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_URL: mockUrl,
    ESKIZ_API_URL: mockUrl + 'eskiz', SMS_PROVIDER: 'eskiz', SMS_API_KEY: 'platform@myservice.uz', SMS_API_SECRET: 'platform-pass' });
  server = spawn(process.execPath, [path.resolve(__dirname, '..', 'dist', 'main.js')], { cwd: path.resolve(__dirname, '..'), env: process.env });
  server.stdout.on('data', d => { output += d; }); server.stderr.on('data', d => { output += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); }
  throw new Error('API did not start: ' + output);
});
after(async () => {
  if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
  await new Promise(r => mock.close(r));
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_API_URL', 'ESKIZ_API_URL', 'SMS_PROVIDER', 'SMS_API_KEY', 'SMS_API_SECRET']) delete process.env[k];
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
  const { SmsAccounts } = require('../dist/notifications/sms-accounts.js');
  const worker = new Notifications(db, undefined, new SmsAccounts(db), new BotService(db, new TelegramClient()));
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

  // A stranger without a link sees no service's contacts (no leak between services)…
  const nosy = 4000000 + Math.floor(Math.random() * 1e6);
  await tg(nosy, { text: '/start' });
  await tg(nosy, { text: '📍 Manzil' });
  assert.ok(lastTo(nosy).text.includes('telefon raqamingizni'), lastTo(nosy).text);
  // …but someone who came through the service's public bot link reaches that service from the first screen.
  const tgInfo = await ok(await request('/settings/telegram', { token: bosses[0] }));
  assert.match(tgInfo.botLink, /\?start=s_[a-z0-9]+$/);
  const stranger = 5000000 + Math.floor(Math.random() * 1e6);
  await tg(stranger, { text: '/start ' + tgInfo.botLink.split('start=')[1] });
  assert.ok(lastTo(stranger).text.includes('Mobile Fix') || lastTo(stranger).text.includes('Servis a'), lastTo(stranger).text);
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

test('phone confirmed through the bot: open the link, share the contact, sign up with the proof', async () => {
  const chat = 700000000 + Math.floor(Math.random() * 1e6);
  const phoneDigits = '99895' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const link = await ok(await request('/auth/verify/telegram', { method: 'POST', body: { purpose: 'signup' } }));
  assert.match(link.url, /^https:\/\/t\.me\/myservice_test_bot\?start=v_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await ok(await request('/auth/verify/telegram/status', { method: 'POST', body: { token: link.token } })), { verified: false });
  assert.equal(await tg(chat, { text: '/start v_' + link.token }), 200);
  assert.ok(lastTo(chat).reply_markup.keyboard[0][0].request_contact, 'asks for the contact');
  // Someone else's forwarded contact does not count.
  await tg(chat, { contact: { phone_number: phoneDigits, user_id: chat + 1 } });
  assert.deepEqual(await ok(await request('/auth/verify/telegram/status', { method: 'POST', body: { token: link.token } })), { verified: false });
  await tg(chat, { contact: { phone_number: phoneDigits, user_id: chat } });
  assert.ok(lastTo(chat).text.includes('Raqam tasdiqlandi'));
  const status = await ok(await request('/auth/verify/telegram/status', { method: 'POST', body: { token: link.token } }));
  assert.equal(status.verified, true); assert.equal(status.phone, '+' + phoneDigits);
  assert.equal((await request('/auth/verify/telegram/status', { method: 'POST', body: { token: link.token } })).status, 400, 'the link gives one proof');
  const login = 'tg-' + randomUUID().slice(0, 8);
  const created = await ok(await request('/auth/signup', { method: 'POST', body: { proof: status.proof, serviceName: 'Telegram Usta', ownerName: 'Bekzod', login, password: 'Telegram-Pass-1234', acceptTerms: true } }), 201);
  assert.ok(created.accessToken);
  assert.equal((await db.user.findUnique({ where: { login } })).phone, '+' + phoneDigits);
  // An expired or unknown link is answered, not ignored.
  await tg(chat, { text: '/start v_' + 'A'.repeat(43) });
  assert.ok(lastTo(chat).text.includes('eskirgan'));
});

/** A fresh service on a plan with the given features; returns its owner token and org id. */
async function serviceOn(features, extra = {}) {
  const id = randomUUID().slice(0, 8);
  await db.platformAdmin.create({ data: { login: 'own-admin-' + id, passwordHash: await argon2.hash('Platform-Pass-123') } });
  const platform = (await ok(await request('/platform/auth/login', { method: 'POST', body: { login: 'own-admin-' + id, password: 'Platform-Pass-123' } }), 201)).accessToken;
  const plan = await ok(await request('/platform/plans', { token: platform, method: 'POST', body: { name: 'OWN-' + id, monthlyPrice: '349000', features, ...extra } }), 201);
  const org = await ok(await request('/platform/organizations', { token: platform, method: 'POST', body: { name: 'Usta ' + id, slug: 'own-' + id, planId: plan.id, login: 'own' + id, temporaryPassword: 'Temporary-Pass-123', ownerName: 'Boss', phone: '+998901119900' } }), 201);
  return { token: await signIn('own' + id, 'Temporary-Pass-123', 'Boss-Password-123'), orgId: org.id, planId: plan.id, platform };
}
async function orderFor(token, phone) {
  const customer = await ok(await request('/customers', { token, method: 'POST', body: { firstName: 'Dilshod', phone } }), 201);
  const device = await ok(await request('/devices', { token, method: 'POST', body: { customerId: customer.id, category: 'Telefon', brand: 'Samsung', model: 'A54' } }), 201);
  const order = await ok(await request('/orders', { token, method: 'POST', body: { customerId: customer.id, deviceId: device.id, complaint: 'Ekran', accessories: [], labor: '100000', partsTotal: '0' } }), 201);
  return { customer, order };
}
async function deliverReady(orderId, orgId) {
  await db.order.update({ where: { id: orderId }, data: { status: 'READY' } });
  const event = await db.outboxEvent.create({ data: { organizationId: orgId, type: 'ORDER_READY', entityId: orderId, payload: {} } });
  const { Notifications } = require('../dist/notifications/notifications.module.js');
  const { SmsAccounts } = require('../dist/notifications/sms-accounts.js');
  const { BotService } = require('../dist/bot/bot.service.js');
  const { OwnBots } = require('../dist/bot/own-bot.js');
  const { EskizClient } = require('../dist/notifications/eskiz.client.js');
  const { TelegramClient } = require('../dist/bot/telegram.client.js');
  await new Notifications(db, new EskizClient(), new SmsAccounts(db), new BotService(db, new TelegramClient()), new OwnBots(db)).deliver(event.id);
  return db.notification.findUnique({ where: { eventId: event.id } });
}

test("a service's own bot: connect with a token, its customers link and hear from it, then disconnect", async () => {
  const basic = await serviceOn({ telegram: true });
  assert.equal((await request('/bot/own', { token: basic.token, method: 'PUT', body: { token: OWN_TOKEN } })).status, 403, 'not in the plan');
  const pro = await serviceOn({ telegram: true, own_bot: true });
  assert.equal((await ok(await request('/bot/own', { token: pro.token }))).allowed, true);
  assert.equal((await request('/bot/own', { token: pro.token, method: 'PUT', body: { token: '123:short' } })).status, 400);
  assert.equal((await request('/bot/own', { token: pro.token, method: 'PUT', body: { token: '111111111:AAWrongTokenWrongTokenWrongTokenXyz' } })).status, 400, 'Telegram refuses the token');
  const before = calls.length;
  assert.equal((await ok(await request('/bot/own', { token: pro.token, method: 'PUT', body: { token: OWN_TOKEN } }))).username, 'shop_test_bot');
  const hook = calls.slice(before).find(c => c.method === 'setWebhook' && c.token === OWN_TOKEN);
  assert.ok(hook.body.url.endsWith('/api/telegram/own/' + pro.orgId)); assert.ok(hook.body.secret_token.length >= 20);
  // The token is stored encrypted, never in plain text.
  const stored = await db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: pro.orgId, key: 'own_bot' } } });
  assert.ok(!JSON.stringify(stored.value).includes(OWN_TOKEN));
  // Another service cannot take the same bot.
  const other = await serviceOn({ telegram: true, own_bot: true });
  assert.equal((await request('/bot/own', { token: other.token, method: 'PUT', body: { token: OWN_TOKEN } })).status, 409);

  const own = (chat, message, secret = hook.body.secret_token) => fetch(base + '/telegram/own/' + pro.orgId, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify({ update_id: updateId++, message: { chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Dilshod' }, ...message } }) });
  const ownTo = chat => calls.filter(c => c.method === 'sendMessage' && c.token === OWN_TOKEN && String(c.body.chat_id) === String(chat)).at(-1)?.body;
  assert.equal((await own(1, { text: '/start' }, 'wrong')).status, 403);
  const phone = '+99894' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const { customer, order } = await orderFor(pro.token, phone);
  // The order link opens the service's bot, not the platform one.
  const links = await ok(await request('/orders/' + order.id + '/links', { token: pro.token, method: 'POST' }), 201);
  assert.match(links.telegram, /^https:\/\/t\.me\/shop_test_bot\?start=/);
  const chat = 600000000 + Math.floor(Math.random() * 1e6);
  assert.equal((await own(chat, { text: '/start' })).status, 200);
  assert.ok(ownTo(chat).text.includes('Usta '), ownTo(chat).text);
  await own(chat, { contact: { phone_number: phone.slice(1), user_id: chat } });
  assert.ok(ownTo(chat).text.includes('Raqamingiz tasdiqlandi'));
  const linked = await db.customer.findUnique({ where: { id: customer.id } });
  assert.equal(linked.telegramChatId, String(chat)); assert.equal(linked.telegramBot, 'own');
  await own(chat, { text: '📦 Buyurtmalarim' });
  assert.ok(ownTo(chat).text.includes(order.number));
  // "Ready" goes through the service's bot.
  const sentBefore = calls.length;
  const n = await deliverReady(order.id, pro.orgId);
  assert.equal(n.status, 'SENT'); assert.equal(n.channel, 'TELEGRAM');
  assert.ok(calls.slice(sentBefore).some(c => c.method === 'sendMessage' && c.token === OWN_TOKEN && String(c.body.chat_id) === String(chat)));
  // The platform bot's sharing of the same phone does not steal the customer from the own bot.
  await tg(chat, { contact: { phone_number: phone.slice(1), user_id: chat } });
  assert.equal((await db.customer.findUnique({ where: { id: customer.id } })).telegramBot, 'own');
  // Disconnect: the webhook is removed and its customers are unlinked.
  assert.equal((await request('/bot/own', { token: pro.token, method: 'DELETE' })).status, 200);
  assert.equal((await db.customer.findUnique({ where: { id: customer.id } })).telegramChatId, null);
  assert.equal((await own(chat, { text: '/start' })).status, 403);
});

test('SMS: platform allowance then extra; own Eskiz account; test SMS only to your own phone', async () => {
  const svc = await serviceOn({ telegram: true, sms: true }, { smsPerMonth: 1 });
  assert.equal((await request('/notifications/test-sms', { token: svc.token, method: 'POST', body: { phone: '+998900000001' } })).status, 404, 'arbitrary-number test SMS is gone');
  let info = await ok(await request('/notifications/sms', { token: svc.token }));
  assert.equal(info.mode, 'platform'); assert.equal(info.platform.available, true); assert.equal(info.platform.limit, 1); assert.equal(info.platform.sent, 0);
  // Two "ready" SMS on a 1-SMS plan: the second is counted as extra.
  for (const p of ['+99891' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0'), '+99891' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')]) {
    const { order } = await orderFor(svc.token, p);
    const n = await deliverReady(order.id, svc.orgId);
    assert.equal(n.status, 'SENT', n.errorCode); assert.equal(n.channel, 'SMS');
    assert.ok(calls.some(c => c.url.startsWith('/eskiz/') && c.method === 'send' && c.body.mobile_phone === p.slice(1)));
  }
  info = await ok(await request('/notifications/sms', { token: svc.token }));
  assert.equal(info.platform.sent, 2); assert.equal(info.platform.extra, 1);
  const acc = await ok(await request('/account', { token: svc.token }));
  assert.equal(acc.usage.sms, 2); assert.equal(acc.usage.smsExtra, 1); assert.equal(acc.usage.smsExtraCost, '150.00');
  // Test SMS goes to the signed-in owner's phone.
  const t = await ok(await request('/notifications/sms/test', { token: svc.token, method: 'POST' }));
  assert.equal(t.phone, '+998901119900');
  assert.ok(calls.some(c => c.url.startsWith('/eskiz/') && c.method === 'send' && c.body.mobile_phone === '998901119900'));
  // Own Eskiz: a wrong password is refused, the right one is stored encrypted and used without limit.
  assert.equal((await request('/notifications/sms', { token: svc.token, method: 'PUT', body: { mode: 'own', email: 'shop@mail.uz', password: 'bad' } })).status, 400);
  assert.equal((await ok(await request('/notifications/sms', { token: svc.token, method: 'PUT', body: { mode: 'own', email: 'shop@mail.uz', password: 'shop-secret', from: 'UstaFix' } }))).mode, 'own');
  const stored = await db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: svc.orgId, key: 'sms' } } });
  assert.ok(!JSON.stringify(stored.value).includes('shop-secret'));
  info = await ok(await request('/notifications/sms', { token: svc.token }));
  assert.equal(info.mode, 'own'); assert.equal(info.balance, 54321); assert.equal(info.from, 'UstaFix');
  const p3 = '+99891' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const { order } = await orderFor(svc.token, p3);
  const before = calls.length;
  assert.equal((await deliverReady(order.id, svc.orgId)).status, 'SENT');
  const sent = calls.slice(before).filter(c => c.url.startsWith('/eskiz/'));
  assert.ok(sent.some(c => c.method === 'login' && c.body.email === 'shop@mail.uz'));
  assert.ok(sent.some(c => c.method === 'send' && c.body.from === 'UstaFix' && c.body.mobile_phone === p3.slice(1)));
  assert.equal((await ok(await request('/notifications/sms', { token: svc.token }))).platform.sent, 3, 'own-account SMS do not count against the plan');
  // Back to the platform.
  assert.equal((await ok(await request('/notifications/sms', { token: svc.token, method: 'PUT', body: { mode: 'platform' } }))).mode, 'platform');
});
