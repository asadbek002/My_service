import { OWNER } from '../env';
import { expect, newOrder, signIn, test, tokenFor } from './fixtures';

test('the home page explains the product, shows the platform prices and leads to sign-up or login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Qog'oz talon o'rniga");
  // Prices come from the platform's plans (the global setup made "Pro" at 149 000).
  const prices = page.locator('#narxlar');
  await expect(prices.getByText('Pro', { exact: true })).toBeVisible();
  await expect(prices.getByText(/149\s000/).first()).toBeVisible();
  await prices.getByRole('radio', { name: /Yillik/ }).click();
  await expect(prices.getByText(/so'm \/ yil/).first()).toBeVisible();
  await page.getByRole('link', { name: /Demo versiya/ }).first().click();
  await expect(page).toHaveURL(/\/signup$/);
  // One door: the tabs switch between signing up and signing in.
  await page.getByRole('link', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('link', { name: "Ro'yxatdan o'tish" })).toBeVisible();
  await page.getByRole('link', { name: /MY SERVICE/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('someone already signed in on this device goes from the home page straight to work', async ({ page }) => {
  await signIn(page, OWNER.login, OWNER.password);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Salom/ })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('search engines see the home page but not the app or the platform console', async ({ page, request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Allow: \/\$/);
  expect(robots).toMatch(/Disallow: \/\n|Disallow: \/$/m);
  await page.goto('/platform/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('a receipt shared as a picture carries the tracking page and the bot, not a bare "Chek"', async ({ page }) => {
  const o = await newOrder(await tokenFor(OWNER.login, OWNER.password));
  await signIn(page, OWNER.login, OWNER.password);
  // Stand in for the phone's share sheet and keep what it was given.
  await page.addInitScript(() => {
    const w = window as unknown as { shared?: { text?: string; files?: File[] } };
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async (d: { text?: string; files?: File[] }) => { w.shared = d; }, configurable: true });
  });
  await page.goto(`/orders/${o.id}/print`);
  await page.getByRole('button', { name: 'Rasm sifatida ulashish' }).click();
  const shared = await page.waitForFunction(() => (window as unknown as { shared?: { text?: string; files?: File[] } }).shared).then(h => h.jsonValue() as Promise<{ text: string; files: unknown[] }>);
  expect(shared.text).toContain(o.number);
  expect(shared.text).toMatch(/Qurilmangiz holatini shu sahifada kuzatib boring:\nhttps?:\/\/\S+\/track\/\S+/);
  expect(shared.text).not.toMatch(/^Chek$/);
});
