import { PLATFORM } from '../env';
import { apiCall, expect, newOrder, newService, resetRateLimits, signIn, test, uid, uniquePhone } from './fixtures';

/** Puts a service on a plan (or an end date) the way the platform console does. */
async function setSubscription(serviceName: string, { plan, daysLeft }: { plan?: Record<string, unknown>; daysLeft: number }) {
  await resetRateLimits();
  const { accessToken: p } = await apiCall<{ accessToken: string }>(null, '/platform/auth/login', { login: PLATFORM.login, password: PLATFORM.password });
  const [org] = await apiCall<{ id: string; subscription: { planId: string } }[]>(p, '/platform/organizations?q=' + encodeURIComponent(serviceName));
  const planId = plan ? (await apiCall<{ id: string }>(p, '/platform/plans', { name: 'Kichik ' + uid(), monthlyPrice: '49000', features: {}, ...plan })).id : org!.subscription.planId;
  await apiCall(p, `/platform/organizations/${org!.id}/subscription`, { planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + daysLeft * 86400000).toISOString() }, 'PATCH');
}

test('plan limits: the owner is told plainly when staff or monthly orders run out', async ({ page }) => {
  const svc = await newService('Limit');
  await setSubscription(svc.name, { plan: { maxStaff: 1, monthlyOrders: 1 }, daysLeft: 30 });
  await newOrder(svc.token);
  await signIn(page, svc.login, svc.password);

  await page.goto('/orders/new');
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Ism').fill('Ortiqcha');
  await page.getByLabel('Brend').fill('LG');
  await page.getByLabel('Model').fill('K10');
  await page.getByPlaceholder('Masalan: ekran singan').fill('Limit');
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText('Tarifdagi oylik buyurtmalar soni tugadi.');

  await page.goto('/staff');
  await page.getByRole('button', { name: "Qo'shish" }).click();
  await page.getByLabel('Ism').fill('Ortiqcha');
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Login').fill('ortiq' + uid());
  await page.getByLabel('Vaqtinchalik parol').fill('Temporary-Staff-123');
  await page.locator('form').getByRole('button', { name: "Qo'shish" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText('Tarifdagi xodimlar soni tugadi.');
});

test('an expired subscription (past the grace days) keeps the data readable but refuses new work, with a message', async ({ page }) => {
  const svc = await newService('Muddat');
  const o = await newOrder(svc.token, { status: 'IN_REPAIR' });
  await setSubscription(svc.name, { daysLeft: -30 });
  await signIn(page, svc.login, svc.password);
  // Said up front on every screen, before anything is refused.
  await page.goto('/dashboard');
  await expect(page.getByRole('status').filter({ hasText: "faqat ko'rish mumkin" })).toBeVisible();
  await page.goto('/orders/' + o.id);
  await expect(page.getByRole('heading', { name: /Xiaomi Note/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tayyor', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Obuna muddati tugagan: ma'lumotlarni faqat ko'rish mumkin.");
  await page.goto('/account');
  await expect(page.getByText(/tugagan|Tugagan|faqat ko/).first()).toBeVisible();
});

test('a week before the end, every screen says how many days are left', async ({ page }) => {
  const svc = await newService('Hafta');
  await setSubscription(svc.name, { daysLeft: 3 });
  await signIn(page, svc.login, svc.password);
  for (const path of ['/dashboard', '/orders']) {
    await page.goto(path);
    await expect(page.getByRole('status').filter({ hasText: '3 kundan keyin tugaydi' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Tarifni tanlash' }).click();
  await expect(page).toHaveURL(/\/account/);
});
