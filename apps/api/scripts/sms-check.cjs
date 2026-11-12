// Sends every SMS the platform can send to ONE phone (yours), through the real Eskiz account,
// and reports for each: the text, parts, Eskiz status and the money it took from the balance.
// Costs real money: about 6 SMS. Run on the server:
//   docker compose -f docker-compose.prod.yml exec api node apps/api/scripts/sms-check.cjs +998901234567
//   ... add --dry to only print the texts without sending.
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const dist = p => require(path.join(__dirname, '..', 'dist', 'notifications', p));
const { EskizClient } = dist('eskiz.client');
const { SMS, SITE, readySms, smsParts, isGsm7 } = dist('sms-text');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const phone = args.find(a => /^\+?998\d{9}$/.test(a.replace(/\s/g, '')))?.replace(/\s/g, '');
if (!phone) { console.error('Telefon raqamingizni yozing: node apps/api/scripts/sms-check.cjs +998901234567 [--dry]'); process.exit(2); }
if (!dry && (process.env.SMS_PROVIDER !== 'eskiz' || !process.env.SMS_API_KEY)) { console.error('Eskiz sozlanmagan (.env: SMS_PROVIDER=eskiz, SMS_API_KEY, SMS_API_SECRET).'); process.exit(2); }
if (process.env.ESKIZ_TEST_MODE === 'true') console.warn('Diqqat: ESKIZ_TEST_MODE=true — har bir matn oldiga «Bu Eskiz dan test:» qo\'shiladi.\n');

// A link of the real length; it opens nothing (this order does not exist).
const link = `https://${SITE}/track/${randomBytes(32).toString('base64url')}`;
const CASES = [
  ['Ro\'yxatdan o\'tish kodi', SMS.signupCode('123456')],
  ['Parolni tiklash kodi', SMS.resetCode('123456')],
  ['Sozlamalardagi test SMS', SMS.test()],
  ['Tayyor, to\'lov qolgan', readySms('Mobile Fix servis', 'Samsung Galaxy A52', '450 000', link)],
  ['Tayyor, to\'langan', readySms('Mobile Fix servis', 'Samsung Galaxy A52', null, link)],
  ['Tayyor, juda uzun nomlar', readySms("Chilonzor ta'mirlash servis markazi Mobile Fix", 'Lenovo IdeaPad Gaming 3 15ACH6 82K2027QRK', '1 250 000', link)],
];

const wait = ms => new Promise(r => setTimeout(r, ms));
const DONE = /DELIV|REJECT|EXPIR|UNDELIV|FAIL|ERROR/i;

(async () => {
  const eskiz = new EskizClient();
  let balance = dry ? null : (await eskiz.getUserLimit()).balance;
  if (!dry) console.log(`Balans: ${balance} so'm\n`);
  const rows = [];
  for (const [name, text] of CASES) {
    const parts = smsParts(text);
    console.log(`— ${name}\n  ${text}\n  ${text.length} belgi · ${isGsm7(text) ? 'lotin (GSM)' : 'UNICODE'} · ${parts} qism`);
    if (dry) { rows.push({ name, parts, status: '—', cost: '—' }); continue; }
    let id = '', status = 'SEND_FAILED';
    try { id = (await eskiz.send(phone, text)).id; status = 'SENT'; } catch (e) { status = String(e.message || e); }
    // Wait for the operator's answer (up to a minute), then for the balance to move.
    for (let i = 0; id && i < 12 && !DONE.test(status); i++) { await wait(5000); status = await eskiz.getStatus(id).catch(() => status); }
    let after = balance;
    for (let i = 0; i < 6 && after === balance; i++) { await wait(3000); after = (await eskiz.getUserLimit()).balance; }
    const cost = balance - after;
    balance = after;
    console.log(`  Eskiz: ${status} · yechildi: ${cost} so'm\n`);
    rows.push({ name, parts, status, cost });
  }
  console.log('Natija:');
  console.table(rows.map(r => ({ 'Xabar': r.name, 'Qism': r.parts, 'Holat': r.status, "Yechildi (so'm)": r.cost })));
  const bad = rows.filter(r => r.parts !== 1 || (!dry && !/DELIV|SENT|WAIT|ACCEPT|TRANSMT/i.test(r.status)));
  if (bad.length) { console.log('\nMuammo: ' + bad.map(r => r.name).join(', ')); process.exit(1); }
  console.log(dry ? '\nHamma matn 1 qism. Yuborish uchun --dry siz ishga tushiring.' : `\nHammasi 1 qism va yuborildi. Qolgan balans: ${balance} so'm. Telefoningizga ${rows.length} ta SMS kelganini tekshiring.`);
})().catch(e => { console.error('Xato:', e.message || e); process.exit(1); });
