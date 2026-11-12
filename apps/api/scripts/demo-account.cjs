// A demo service for App Store / Google Play reviewers (and for showing the product): a ready login with
// realistic orders in every status, payments, debt and warranties. Running it again resets the demo.
// SMS is switched off for it, so nothing ever reaches the (made-up) customer numbers.
// Run on the server:
//   docker compose -f docker-compose.prod.yml exec api node apps/api/scripts/demo-account.cjs [login] [password]
// Defaults: login "demo", a new random password (printed). Give both in the store's review notes.
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const argon2 = require('argon2');
const { PrismaClient, Prisma } = require('@prisma/client');
const dist = p => require(path.join(__dirname, '..', 'dist', p));
const { createOrganization, slugFor } = dist('platform/organizations');
const { billingSettings } = dist('platform/billing');
const { purgeOrganization } = dist('management/account-deletion');
const { nextOrderNumber } = dist('orders/orders.module');

const login = (process.argv[2] || 'demo').toLowerCase();
const password = process.argv[3] || 'Demo-' + randomBytes(6).toString('base64url');
if (!/^[a-z0-9._-]{3,40}$/.test(login) || password.length < 10) { console.error('Login: 3–40 lotin harf/raqam; parol: kamida 10 belgi.'); process.exit(2); }
const db = new PrismaClient();
const DAY = 86400000;
const ago = days => new Date(Date.now() - days * DAY);

const CUSTOMERS = [
  ['Alisher', 'Karimov', 'Telefon', 'Samsung', 'Galaxy A52', 'Ekran singan, sensor ishlamaydi'],
  ['Dilnoza', 'Rahimova', 'Telefon', 'Apple', 'iPhone 12', 'Batareya tez tugaydi'],
  ['Bekzod', 'Toshmatov', 'Noutbuk', 'Lenovo', 'IdeaPad 3', 'Yoqilmaydi, zaryad olmaydi'],
  ['Madina', 'Yusupova', 'Telefon', 'Xiaomi', 'Redmi Note 11', 'Zaryad porti ishlamaydi'],
  ['Jasur', 'Ergashev', 'Planshet', 'Apple', 'iPad 9', 'Oyna yorilgan'],
  ['Nodira', 'Saidova', 'Telefon', 'Samsung', 'Galaxy S21', 'Kamera xira olayapti'],
  ['Sardor', 'Aliyev', 'Telefon', 'Apple', 'iPhone 11', 'Dinamik ovozi past'],
  ['Gulnora', 'Mirzayeva', 'Noutbuk', 'HP', 'Pavilion 15', 'Klaviatura ishlamaydi'],
];
// status, days ago, labor, parts, paid share
const ORDERS = [
  ['RECEIVED', 0, 150000, 0, 0], ['RECEIVED', 1, 0, 0, 0], ['IN_REPAIR', 2, 200000, 350000, 0.5],
  ['IN_REPAIR', 3, 120000, 0, 0], ['READY', 4, 250000, 450000, 0], ['READY', 5, 100000, 80000, 1],
  ['DELIVERED', 9, 180000, 220000, 1], ['DELIVERED', 14, 300000, 650000, 0.6], ['DELIVERED', 25, 90000, 0, 1],
];
const PATH = ['RECEIVED', 'IN_REPAIR', 'READY', 'DELIVERED'];

(async () => {
  const old = await db.user.findUnique({ where: { login } });
  if (old) {
    const owner = await db.userRole.findFirst({ where: { userId: old.id, role: { systemKey: 'OWNER' } } });
    if (!owner) { console.error(`"${login}" logini boshqa servisda xodim sifatida band. Boshqa login bering.`); process.exit(2); }
    await purgeOrganization(db, old.organizationId);
    console.log('Eski demo servis o\'chirildi, yangisi yaratilmoqda…');
  }
  const plan = await db.plan.findFirst({ where: { active: true }, orderBy: { monthlyPrice: 'desc' } });
  if (!plan) { console.error('Faol tarif yo\'q: avval platformada tarif yarating.'); process.exit(2); }
  const billing = await billingSettings(db);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const orgId = await db.$transaction(async tx => {
    const { org, user } = await createOrganization(tx, { name: 'Demo Servis', slug: slugFor('demo servis'), planId: plan.id, login, passwordHash, ownerName: 'Demo', phone: '+998900000000', mustChangePassword: false, actorId: null, action: 'PLATFORM_ORGANIZATION_CREATED' }, billing);
    // Never expires, never sends SMS (the customers below are made up).
    await tx.subscription.update({ where: { organizationId: org.id }, data: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 3650 * DAY), graceUntil: new Date(Date.now() + 3660 * DAY) } });
    await tx.organization.update({ where: { id: org.id }, data: { smsEnabled: false, platformNote: 'Do\'kon ko\'rib chiquvchilari uchun demo (scripts/demo-account.cjs)' } });
    await tx.organizationSetting.create({ data: { organizationId: org.id, key: 'general', value: { name: 'Demo Servis', phone: '+998 90 000 00 00', address: 'Toshkent, Chilonzor 1' } } });
    const branch = await tx.branch.findFirstOrThrow({ where: { organizationId: org.id } });
    for (let i = 0; i < ORDERS.length; i++) {
      const [status, days, labor, parts, share] = ORDERS[i];
      const [firstName, lastName, category, brand, model, complaint] = CUSTOMERS[i % CUSTOMERS.length];
      const created = ago(days);
      const customer = await tx.customer.create({ data: { organizationId: org.id, firstName, lastName, phone: '+99890000' + String(1001 + i), createdAt: created } });
      const device = await tx.device.create({ data: { organizationId: org.id, customerId: customer.id, category, brand, model } });
      const { number } = await nextOrderNumber(tx, org.id);
      const total = labor + parts;
      const order = await tx.order.create({ data: {
        organizationId: org.id, branchId: branch.id, customerId: customer.id, deviceId: device.id, number, status, complaint,
        accessories: i % 2 ? ['Quvvatlagich'] : [], condition: [], labor, partsTotal: parts, total, createdAt: created, updatedAt: created,
      } });
      const steps = PATH.slice(0, PATH.indexOf(status) + 1);
      for (let s = 0; s < steps.length; s++) {
        await tx.orderHistory.create({ data: { organizationId: org.id, orderId: order.id, fromStatus: s ? steps[s - 1] : null, toStatus: steps[s], actorId: user.id, createdAt: new Date(created.getTime() + s * DAY / 2) } });
      }
      const paid = Math.round(total * share / 1000) * 1000;
      if (paid > 0) await tx.payment.create({ data: { organizationId: org.id, orderId: order.id, kind: 'PAYMENT', amount: new Prisma.Decimal(paid), method: i % 2 ? 'CARD' : 'CASH', idempotencyKey: randomUUID(), actorId: user.id, createdAt: new Date(created.getTime() + DAY / 2) } });
      if (status === 'DELIVERED') await tx.warranty.create({ data: { organizationId: org.id, orderId: order.id, startDate: created, endDate: new Date(created.getTime() + 90 * DAY), terms: '3 oy kafolat: almashtirilgan qism uchun' } });
    }
    return org.id;
  }, { timeout: 60000 });

  const web = (process.env.WEB_URL || 'https://myserviceuz.uz').replace(/\/$/, '');
  console.log(`\nDemo servis tayyor (${ORDERS.length} ta buyurtma, SMS o'chirilgan, obuna 10 yil).`);
  console.log(`  Sayt:  ${web}/login`);
  console.log(`  Login: ${login}`);
  console.log(`  Parol: ${password}`);
  console.log(`\nBularni App Store Connect → App Review Information va Google Play → App access bo'limiga yozing.`);
  console.log(`Org id: ${orgId}`);
  await db.$disconnect();
})().catch(async e => { console.error('Xato:', e.message || e); await db.$disconnect(); process.exit(1); });
