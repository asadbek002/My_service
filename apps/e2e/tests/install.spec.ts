import { devices } from '@playwright/test';
import { OWNER } from '../env';
import { expect, signIn, test } from './fixtures';

const IPHONE = devices['iPhone 14'].userAgent;
const ANDROID = devices['Pixel 7'].userAgent;
const INSTAGRAM = ANDROID + ' Instagram 300.0.0.0';

test.describe('install page', () => {
  test.skip(({ isMobile }) => isMobile, 'each case sets its own phone');

  for (const [name, userAgent, check] of [
    ['iPhone Safari: three steps through Ulashish', IPHONE, /Ekranga qo'shish/],
    ['Android Chrome without the offer: steps through the menu', ANDROID, /Ilovani o'rnatish/],
    ['Instagram in-app browser: open it in Chrome first', INSTAGRAM, /Chrome'da ochish/],
  ] as const) {
    test(name, async ({ browser }) => {
      const ctx = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto('/install');
      await expect(page.getByRole('heading', { name: "Telefonga o'rnatish" })).toBeVisible();
      await expect(page.getByText(check).first()).toBeVisible();
      await ctx.close();
    });
  }

  test('a computer shows a QR code to scan with the phone', async ({ page }) => {
    await page.goto('/install');
    const qr = page.getByRole('img', { name: "O'rnatish sahifasining QR kodi" });
    await expect(qr).toBeVisible();
    await expect.poll(() => qr.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });

  test('on a phone the dashboard offers installing until it is closed', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: ANDROID, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await signIn(page, OWNER.login, OWNER.password);
    await page.goto('/dashboard');
    const card = page.getByRole('link', { name: /Ilovani telefonga o'rnating/ });
    await expect(card).toBeVisible();
    await card.locator('..').getByRole('button', { name: 'Yopish' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Salom/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ilovani telefonga o'rnating/ })).toHaveCount(0);
    await ctx.close();
  });
});
