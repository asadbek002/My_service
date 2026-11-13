import { expect, newOrder, newService, signIn, test, uid, uniquePhone } from './fixtures';

/** A device sent by courier, marked urgent at intake: red and first in the list, details on the order. */
test('an urgent order that came by courier stands out and is first among open orders', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  const svc = await newService('Pochta');
  await newOrder(svc.token);   // an older, ordinary order
  await signIn(page, svc.login, svc.password);
  await page.goto('/orders/new');
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Ism').fill('Pochta ' + uid());
  await page.getByLabel('Brend').fill('Xiaomi');
  await page.getByLabel('Model').fill('Redmi 12');
  await page.getByPlaceholder('Masalan: ekran singan').fill('Zaryad olmaydi');
  await page.getByRole('button', { name: 'Pochta orqali' }).click();
  await page.getByRole('button', { name: 'Fargo' }).click();
  await page.getByLabel('Trek raqami').fill('FG-778899');
  await page.getByLabel('Qaytarish manzili').fill('Andijon, Fargo filiali');
  const urgent = page.getByRole('switch', { name: /Shoshilinch buyurtma/ });
  await urgent.click();
  await expect(urgent).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+\?new=1$/);

  await expect(page.getByText('Pochta orqali keldi · Fargo')).toBeVisible();
  await expect(page.getByText('FG-778899')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Shoshilinch buyurtma/ })).toHaveAttribute('aria-checked', 'true');

  await page.goto('/orders');
  const first = page.locator('a[href^="/orders/"]').filter({ hasText: 'Redmi 12' }).first();
  await expect(first).toContainText('Shoshilinch');
  await expect(first).toContainText('Pochta · Fargo');
  await expect(page.locator('a[href^="/orders/c"]').first()).toContainText('Redmi 12');

  // Filters: only urgent open work; only devices that came by courier.
  await page.getByRole('button', { name: /^Shoshilinch/ }).click();
  await expect(page).toHaveURL(/status=URGENT/);
  await expect(page.locator('a[href^="/orders/c"]').filter({ visible: true })).toHaveCount(1);
  await page.getByRole('button', { name: /^Pochta/ }).click();
  await expect(page).toHaveURL(/status=POST/);
  await expect(page.locator('a[href^="/orders/c"]').filter({ visible: true })).toHaveCount(1);

  // The courier details are corrected on the order.
  await page.locator('a[href^="/orders/c"]').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: "Qabul turini o'zgartirish" }).click();
  await page.getByRole('button', { name: 'BTS' }).click();
  await page.getByLabel('Trek raqami').fill('BTS-1122');
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByText('Pochta orqali keldi · BTS')).toBeVisible();
  await expect(page.getByText('BTS-1122')).toBeVisible();
});
