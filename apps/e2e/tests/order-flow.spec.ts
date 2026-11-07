import { OWNER } from '../env';
import { expect, signIn, test, uid, uniquePhone } from './fixtures';

const num = (s: string) => new RegExp(s.replace(/ /g, '\\s'));

/**
 * The counter's day: a device comes in, is repaired, partly paid, handed over on debt,
 * shows up as "Qarzga berilgan" in the orders and on the customer's page (with its PDF),
 * and the debt is then paid off.
 */
test('intake → repair → ready → part payment → delivered on debt → debt paid', async ({ page }) => {
  const phone = uniquePhone(), name = 'Alisher ' + uid();
  await signIn(page, OWNER.login, OWNER.password);
  await page.goto('/orders/new');

  // 1. Intake
  await page.getByLabel('Telefon').fill(phone);
  await page.getByLabel('Ism').fill(name);
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  await page.getByLabel('Brend').fill('Samsung');
  await page.getByLabel('Model').fill('A52');
  await page.getByRole('button', { name: 'Quvvatlagich' }).click();
  await page.getByPlaceholder('Masalan: ekran singan').fill('Ekran singan');
  await page.getByLabel('Usta haqi').fill('150000');
  await page.getByLabel('Zapchast').fill('350000');
  await expect(page.locator('form').getByText(num('500 000 so\'m')).first()).toBeVisible();
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\?new=1/);
  await expect(page.getByText('Qurilma qabul qilindi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Samsung A52' })).toBeVisible();
  const orderUrl = page.url().split('?')[0]!;

  // 2. Repair, ready
  await page.getByRole('button', { name: "Ta'mirga olish" }).click();
  await expect(page.getByRole('status')).toContainText("Ta'mirda");
  await page.getByRole('button', { name: 'Tayyor', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Tayyor. Mijozga xabar yuborildi.');

  // 3. Part payment
  await page.getByRole('button', { name: "To'lov", exact: true }).click();
  await page.getByLabel('Qancha to\'laydi?').fill('200000');
  await page.getByRole('button', { name: num("200 000 so'm qabul qilish") }).click();
  await expect(page.getByRole('status')).toContainText(num("Qoldiq: 300 000 so'm"));

  // 4. Delivered with 30 days of warranty, 100 000 now and 200 000 on debt
  await page.getByRole('button', { name: 'Mijozga berish' }).click();
  await page.getByRole('button', { name: '30 kun' }).click();
  await page.getByLabel("Hozir to'laydigan summa").fill('100000');
  await page.getByRole('button', { name: num("Berildi · 200 000 so'm qarz") }).click();
  await expect(page.getByRole('status')).toContainText(num("Qarz: 200 000 so'm"));
  await expect(page.getByText(/Kafolat .* gacha/)).toBeVisible();

  // 5. The orders page lists it under "Qarzga berilgan"
  await page.goto('/orders');
  await page.getByRole('button', { name: /Qarzga berilgan/ }).click();
  await expect(page).toHaveURL(/status=DEBT/);
  await expect(page.getByText(name).locator('visible=true').first()).toBeVisible();

  // 6. The customer's page filters it, and the PDF follows the filter
  await page.goto(orderUrl);
  await page.getByRole('link', { name }).click();
  await expect(page).toHaveURL(/\/customers\//);
  const filters = page.getByRole('group', { name: 'Buyurtmalar filtri' });
  await filters.getByRole('button', { name: /Qarzga berilgan/ }).click();
  await expect(filters.getByRole('button', { name: /Qarzga berilgan/ })).toHaveAttribute('aria-pressed', 'true');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF yuklash' }).click();
  expect((await download).suggestedFilename()).toMatch(/-debt-[\d-]+\.pdf$/);

  // 7. The debt is paid off: nothing owed, and it leaves the debt list
  await page.goto(orderUrl);
  await page.getByRole('button', { name: "Qarzni to'lash" }).click();
  await page.getByRole('button', { name: num("200 000 so'm qabul qilish") }).click();
  await expect(page.getByRole('status')).toContainText("Buyurtma to'liq to'landi");
  await page.goto('/orders?status=DEBT');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText(name)).toHaveCount(0);
});

test('a returning customer is found by phone and the order can be cancelled', async ({ page }) => {
  const phone = uniquePhone(), name = 'Dilshod ' + uid();
  await signIn(page, OWNER.login, OWNER.password);
  for (const model of ['iPhone 11', 'iPhone 12']) {
    await page.goto('/orders/new');
    await page.getByLabel('Telefon').fill(phone);
    if (model === 'iPhone 11') {
      await page.getByLabel('Ism').fill(name);
    } else {
      // Known number: the name fills in by itself and the old device is offered.
      await expect(page.getByText(name)).toBeVisible();
      await page.getByRole('button', { name: 'Boshqa qurilma' }).click();
    }
    await page.getByLabel('Brend').fill('Apple');
    await page.getByLabel('Model').fill(model);
    await page.getByPlaceholder('Masalan: ekran singan').fill('Zaryad olmaydi');
    await page.getByRole('button', { name: 'Qabul qilish' }).click();
    await expect(page).toHaveURL(/\?new=1/);
  }
  await page.getByRole('button', { name: 'Bekor qilish' }).click();
  await page.getByPlaceholder(/Sababi/).fill('Mijoz rozi bo\'lmadi');
  await page.locator('section').filter({ hasText: 'Buyurtmani bekor qilasizmi?' }).getByRole('button', { name: 'Bekor qilish' }).click();
  await expect(page.getByRole('status')).toContainText('Bekor');
  await page.goto('/customers');
  await page.getByRole('searchbox').or(page.getByPlaceholder(/qidir|Ism|telefon/i)).first().fill(name.split(' ')[1]!);
  await expect(page.getByText(name).first()).toBeVisible();
});
