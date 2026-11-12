const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gsm7, isGsm7, readySms, receivedSms, smsParts } = require('../dist/notifications/sms-text');

const link = 'https://myserviceuz.uz/track/' + 'A'.repeat(43);

test('one curly apostrophe triples the price; gsm7 keeps the text in one SMS', () => {
  const uz = 'Mobile Fix · MS-261108-120\nQurilmangiz tayyor, olib ketishingiz mumkin.\nSamsung A52\nTo‘lov: 450 000 so‘m\n' + link;
  assert.equal(isGsm7(uz), false);
  assert.equal(smsParts(uz), 3);
  assert.equal(isGsm7(gsm7(uz)), true);
});

test('the default "ready" SMS is one part, even for long names', () => {
  for (const [service, device, due] of [
    ['Mobile Fix servis', 'Samsung Galaxy A52', '450 000'],
    ['E2E Servis', 'Apple iPhone 12', null],
    ["Juda uzun nomli ta‘mirlash servis markazi Chilonzor filiali", 'Lenovo IdeaPad Gaming 3 15ACH6 82K2027QRK UltraSlim', '1 250 000'],
  ]) {
    const text = readySms(service, device, due, link);
    assert.equal(smsParts(text), 1, text);
    assert.ok(text.endsWith(link), 'the tracking link is always whole');
    if (due) assert.match(text, new RegExp("To'lov: " + due + " so'm"));
  }
});

test('codes name the resource and the purpose, as Eskiz moderation requires', () => {
  const { SMS } = require('../dist/notifications/sms-text');
  for (const [text, purpose] of [[SMS.signupCode('123456'), "ro'yxatdan o'tish uchun"], [SMS.resetCode('123456'), 'parolni tiklash uchun']]) {
    assert.match(text, /MyService \(myserviceuz\.uz\) saytida/);
    assert.ok(text.includes(purpose), text);
    assert.equal(smsParts(text), 1);
    assert.equal(isGsm7(text), true);
  }
});

test('"received" with the bot link is always one SMS and keeps its fixed words', () => {
  const link = 'https://t.me/a_rather_long_service_name_bot?start=' + 'A'.repeat(43);
  for (const [service, device] of [['Mobile Fix', 'Samsung A60'], ["Chilonzor ta‘mirlash servis markazi Mobile Fix", 'Lenovo IdeaPad Gaming 3 15ACH6 82K2027QRK']]) {
    const text = receivedSms(service, device, link);
    assert.equal(smsParts(text), 1, text); assert.ok(isGsm7(text));
    assert.match(text, / qabul qilindi\. Telegramda kuzating: https:\/\/t\.me\/\S+$/);
  }
});
