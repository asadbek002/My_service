import { OWNER } from '../env';
import { expect, signIn, test } from './fixtures';

/** Russian is laid over the Uzbek interface; the choice is kept per device. */
test.describe('Russian interface', () => {
  test('switching on the landing page turns the site and the app Russian, and back', async ({ page }) => {
    await page.goto('/');
    // The switch works once the page has hydrated.
    await expect(async () => {
      await page.getByRole('button', { name: 'RU' }).first().click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru', { timeout: 2000 });
    }).toPass();
    await expect(page.getByRole('link', { name: 'Войти' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Демо-версия' }).first()).toBeVisible();

    await page.goto('/login');
    await expect(page.getByLabel('Логин или номер телефона')).toBeVisible();

    await signIn(page, OWNER.login, OWNER.password);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Заказы' })).toBeVisible();
    await expect(page.getByPlaceholder(/Номер/).first()).toBeVisible();
    await page.goto('/branches');
    await expect(page.getByRole('heading', { name: 'Филиалы' })).toBeVisible();

    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Клиенты' })).toBeVisible();

    await page.goto('/login');
    await expect(async () => {
      await page.getByRole('button', { name: 'UZ' }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'uz', { timeout: 2000 });
    }).toPass();
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Buyurtmalar' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
  });

  test('legal pages stay Uzbek', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('ms_lang', 'ru'));
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: /oferta/i }).first()).toBeVisible();
  });
});
