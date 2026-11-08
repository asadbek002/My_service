import type { Page } from '@playwright/test';
import { expect, isPhone, newService, signIn, test, uniquePhone } from './fixtures';

/** The branch chooser: in the header on phones, in the sidebar on computers. */
const switcher = (page: Page) => (isPhone(page) ? page.locator('header') : page.locator('aside')).getByLabel('Filial');

test('a second branch: opened by the owner, chosen in the header, takes its own orders and prints its own address', async ({ page }) => {
  const svc = await newService('Filialli');
  await signIn(page, svc.login, svc.password);
  await page.goto('/branches');
  await expect(page.getByText(/1 .*filial|ochiq filial/).first()).toBeVisible();
  await expect(switcher(page)).toHaveCount(0); // one branch: nothing to choose

  await page.getByRole('button', { name: "Filial qo'shish" }).click();
  await page.getByLabel('Filial nomi').fill('Chilonzor');
  await page.getByLabel(/^Manzil/).fill('Chilonzor 9-kvartal, 12-uy');
  await page.getByLabel('Telefon').fill('+998 90 765 43 21');
  await page.getByRole('button', { name: 'Filialni ochish' }).click();
  await expect(page.getByRole('status')).toContainText('Chilonzor');
  await expect(page.locator('li').filter({ hasText: 'Chilonzor 9-kvartal' })).toBeVisible();

  // Two branches: the chooser appears; work in Chilonzor.
  await switcher(page).selectOption({ label: 'Chilonzor' });
  await page.goto('/orders/new');
  await expect(page.getByRole('radio', { name: 'Chilonzor' })).toHaveAttribute('aria-checked', 'true');
  const name = 'Filial ' + Date.now() % 100000;
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Ism').fill(name);
  await page.getByLabel('Brend').fill('Honor');
  await page.getByLabel('Model').fill('X8');
  await page.getByPlaceholder('Masalan: ekran singan').fill('Zaryad');
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page).toHaveURL(/\?new=1/);
  await expect(page.getByText(/· Chilonzor/)).toBeVisible();
  const orderUrl = page.url().split('?')[0]!;
  await page.goto(orderUrl + '/print');
  await expect(page.getByText('Chilonzor filiali')).toBeVisible();
  await expect(page.getByText('Chilonzor 9-kvartal, 12-uy')).toBeVisible();

  // The other branch does not list it; "all branches" lists it with its branch.
  await page.goto('/orders');
  await expect(page.getByText(name).locator('visible=true')).toHaveCount(1);
  await switcher(page).selectOption({ label: 'Asosiy filial' });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText(name).locator('visible=true')).toHaveCount(0);
  await switcher(page).selectOption({ label: 'Barcha filiallar' });
  await expect(page.getByText(new RegExp(`${name}.*Chilonzor|Chilonzor.*${name}`)).locator('visible=true').first()).toBeVisible();

  // A branch with a device inside cannot be closed yet.
  await page.goto('/branches');
  await expect(page.locator('li').filter({ hasText: 'Chilonzor 9-kvartal' }).getByRole('button', { name: 'Filialni yopish' })).toBeDisabled();
});
