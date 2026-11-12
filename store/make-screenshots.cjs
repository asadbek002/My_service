// Store screenshots from a running local copy with the demo service:
//   node apps/api/scripts/demo-account.cjs demo-shots Demo-Shots-12345   (against the local database)
//   start api (3001) and web (3000), then from apps/e2e: node ../../store/make-screenshots.cjs ../../store/screenshots
const { chromium } = require('playwright');
const fs = require('fs');
const API = 'http://localhost:3001/api', WEB = 'http://localhost:3000';
const OUT = process.argv[2];
const DEVICES = [
  ['play-phone', 360, 640],      // 1080×1920 (Google Play, 9:16)
  ['ios-6.7', 430, 932],          // 1290×2796 (App Store, iPhone 6.7")
  ['ios-6.5', 414, 896],          // 1242×2688 (App Store, iPhone 6.5")
];
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  // Order ids for the detail and receipt screens.
  const login = await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: WEB }, body: JSON.stringify({ login: 'demo-shots', password: 'Demo-Shots-12345' }) })).json();
  const orders = await (await fetch(API + '/orders', { headers: { Origin: WEB, Authorization: 'Bearer ' + login.accessToken } })).json();
  const repair = orders.find(o => o.status === 'IN_REPAIR' && Number(o.partsTotal) > 0) ?? orders[0];
  const done = orders.find(o => o.status === 'DELIVERED') ?? orders[0];
  const PAGES = [
    ['1-dashboard', '/dashboard'], ['2-orders', '/orders'], ['3-order', '/orders/' + repair.id],
    ['4-new-order', '/orders/new'], ['5-reports', '/reports'], ['6-receipt', '/orders/' + done.id + '/print'],
  ];
  for (const [name, w, h] of DEVICES) {
    fs.mkdirSync(`${OUT}/${name}`, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'uz-UZ', timezoneId: 'Asia/Tashkent' });
    const page = await ctx.newPage();
    const r = await page.request.post(API + '/auth/login', { data: { login: 'demo-shots', password: 'Demo-Shots-12345' }, headers: { Origin: WEB } });
    if (r.status() !== 200) throw new Error('login ' + r.status());
    for (const [file, url] of PAGES) {
      await page.goto(WEB + url);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${name}/${file}.png` });
      console.log(name, file);
    }
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
