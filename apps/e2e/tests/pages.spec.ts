import { OWNER } from '../env';
import { apiCall, expect, expectNoHorizontalScroll, signIn, test, tokenFor, uniquePhone } from './fixtures';

/**
 * Every screen of the workshop app opens without an error, shows its content (not an error box)
 * and fits the phone screen. Catches broken pages the flow tests do not walk through.
 */
const PAGES = [
  '/dashboard', '/orders', '/orders/new', '/customers', '/payments', '/reports', '/parts', '/expenses',
  '/warranties', '/notifications', '/staff', '/settings', '/account', '/help', '/setup', '/search?q=a',
];

let orderId = '', customerId = '';
test.beforeAll(async () => {
  const token = await tokenFor(OWNER.login, OWNER.password);
  const customer = await apiCall<{ id: string }>(token, '/customers', { firstName: 'Sahifa', phone: uniquePhone() });
  const device = await apiCall<{ id: string }>(token, '/devices', { customerId: customer.id, category: 'Telefon', brand: 'Samsung', model: 'A52' });
  const order = await apiCall<{ id: string }>(token, '/orders', { customerId: customer.id, deviceId: device.id, complaint: 'Ekran', accessories: [], labor: '100000', partsTotal: '0' });
  orderId = order.id; customerId = customer.id;
});

for (const path of [...PAGES, 'ORDER', 'ORDER/print', 'CUSTOMER']) {
  test(`opens ${path}`, async ({ page }) => {
    await signIn(page, OWNER.login, OWNER.password);
    const url = path.replace('ORDER', '/orders/' + orderId).replace('CUSTOMER', '/customers/' + customerId);
    await page.goto(url);
    // Loaded: skeletons gone, no redirect to the login page.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
}

for (const path of ['/login', '/signup', '/reset', '/terms', '/privacy', '/platform/login']) {
  test(`public page ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
