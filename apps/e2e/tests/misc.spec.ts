import { apiCall, expect, newOrder, newService, pay, signIn, test, uid } from './fixtures';

const num = (s: string) => new RegExp(s.replace(/ /g, '\\s'));
let svc: Awaited<ReturnType<typeof newService>>;
test.beforeEach(async ({ page }) => {
  svc = await newService('Turli');
  await signIn(page, svc.login, svc.password);
});

test('the owner chooses a plan for the next payment (yearly shows the discount)', async ({ page }) => {
  await page.goto('/account');
  await page.getByRole('radio', { name: /Yillik/ }).click();
  await page.getByRole('button', { name: /Shu tarifda davom etish|Shu tarifni tanlash/ }).first().click();
  await expect(page.getByRole('status')).toContainText('yiliga');
  await expect(page.getByRole('button', { name: 'Tanlangan' })).toBeVisible();
});

test('settings: the service name and phone appear on the receipt', async ({ page }) => {
  const name = 'Usta Pro ' + uid();
  await page.goto('/settings');
  const block = page.locator('#service');
  await block.getByLabel('Servis nomi').fill(name);
  await block.getByLabel('Telefon').fill('+998 90 765 43 21');
  await block.getByLabel('Manzil').fill('Chilonzor 9');
  await block.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.locator('#service').getByRole('status').or(page.getByRole('status')).first()).toBeVisible();
  const o = await newOrder(svc.token);
  await page.goto(`/orders/${o.id}/print`);
  await expect(page.getByText(name.toUpperCase()).or(page.getByText(name)).first()).toBeVisible();
  await expect(page.getByText(/90 765 43 21/).first()).toBeVisible();
});

test('warranty: a delivered device comes back under warranty as a new free order', async ({ page }) => {
  const o = await newOrder(svc.token, { labor: '80000', status: 'READY' });
  await pay(svc.token, o.id, '80000');
  await apiCall(svc.token, `/orders/${o.id}/deliver`, { warrantyDays: 30 });
  await page.goto('/warranties');
  await page.getByPlaceholder('Raqam, ism yoki telefon').fill(o.name);
  await page.getByRole('button', { name: "Kafolat bo'yicha qabul" }).click();
  await page.getByPlaceholder(/Nima bo'ldi/).fill('Ekran yana miltillayapti');
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+/);
  await expect(page.getByText('Ekran yana miltillayapti')).toBeVisible();
  await expect(page.getByText(num("0 so'm")).first()).toBeVisible();
});

test('parts: a part bought from a shop for an order shows on the order and as a shop debt', async ({ page }) => {
  const shop = 'Malika ' + uid();
  await apiCall(svc.token, '/shops', { name: shop, phone: '', address: '' });
  const o = await newOrder(svc.token, { status: 'IN_REPAIR' });
  await page.goto(`/parts?order=${o.id}`);
  await page.locator('form').filter({ hasText: 'Zapchast olish' }).locator('select').first().selectOption({ label: shop });
  await page.getByPlaceholder('Masalan: iPhone 13 ekran').fill('Displey modul');
  await page.getByLabel('Narxi').fill('210000');
  const orderSelect = page.locator('form').filter({ hasText: 'Zapchast olish' }).locator('select').nth(1);
  if (await orderSelect.inputValue() !== o.id) await orderSelect.selectOption(o.id);
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.goto('/orders/' + o.id);
  await expect(page.getByText('Displey modul')).toBeVisible();
  await page.goto('/reports');
  await expect(page.getByText("Do'konlarga zapchast qarzi")).toBeVisible();
});

test('search finds an order by its number and a customer by name', async ({ page }) => {
  const o = await newOrder(svc.token);
  await page.goto('/search');
  const box = page.getByRole('searchbox').first();
  await box.fill(o.number);
  await expect(page.getByText(o.number).first()).toBeVisible();
  await box.fill(o.name.split(' ')[1]!);
  await expect(page.getByText(o.name).first()).toBeVisible();
});

test('reports export downloads a CSV', async ({ page }) => {
  await newOrder(svc.token);
  await page.goto('/reports');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel uchun CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test('an unknown address shows a page, not a crash', async ({ page }) => {
  const res = await page.goto('/bunday-sahifa-yoq');
  expect(res?.status()).toBe(404);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('reports: each part downloads as its own PDF, and the header button gives the whole report', async ({ page }) => {
  const o = await newOrder(svc.token, { labor: '70000', status: 'READY' });
  await pay(svc.token, o.id, '70000');
  await apiCall(svc.token, `/orders/${o.id}/deliver`, { warrantyDays: 0 });
  const f = await apiCall<{ deliveredItems: { number: string }[]; paymentItems: { number: string; amount: string }[] }>(svc.token, '/reports/finance');
  expect(f.deliveredItems.map(x => x.number)).toContain(o.number);
  expect(f.paymentItems.find(x => x.number === o.number)?.amount).toMatch(/^70000/);
  await page.goto('/reports');
  for (const [label, file] of [['Tushum va foyda', 'tushum'], ['Kassa', 'kassa'], ['Xarajatlar', 'xarajatlar'], ['Qarzdorlar', 'qarzdorlar'], ["To'liq hisobot", 'hisobot']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `${label} — PDF` }).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`^${file}-\\d{4}-\\d{2}-\\d{2}-\\d{4}-\\d{2}-\\d{2}\\.pdf$`));
  }
});
