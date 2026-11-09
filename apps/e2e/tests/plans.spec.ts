import { PLATFORM } from '../env';
import { apiCall, expect, platformSignIn, test, uid } from './fixtures';

/** A plan limit can be made unlimited in one click, or by typing the word, not only by emptying the field. */
test('the platform makes a plan\'s orders unlimited, and back to a number', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough for the console form');
  const { accessToken: p } = await apiCall<{ accessToken: string }>(null, '/platform/auth/login', { login: PLATFORM.login, password: PLATFORM.password });
  const name = 'Cheklov ' + uid();
  const plan = await apiCall<{ id: string }>(p, '/platform/plans', { name, monthlyPrice: '49000', monthlyOrders: 150, features: {} });
  const stored = async () => (await apiCall<{ id: string; monthlyOrders: number | null }[]>(p, '/platform/plans')).find(x => x.id === plan.id)!.monthlyOrders;

  await platformSignIn(page, PLATFORM.login, PLATFORM.password);
  await page.goto('/platform/plans');
  const card = page.locator('div.rounded-lg.border').filter({ hasText: name });
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /Bekor/ }) });
  const save = () => form.getByRole('button', { name: /Saqlash/ }).click();

  await card.getByRole('button', { name: 'Tahrirlash' }).click();
  await form.locator('input[name=monthlyOrdersUnlimited]').check();
  await expect(form.getByLabel('Buyurtma / oy')).toBeDisabled();
  await save();
  await expect.poll(stored).toBeNull();
  await expect(card.getByText(/Buyurtma\/oy: cheksiz/)).toBeVisible();

  await card.getByRole('button', { name: 'Tahrirlash' }).click();
  await form.locator('input[name=monthlyOrdersUnlimited]').uncheck();
  await form.getByLabel('Buyurtma / oy').fill('2000');
  await save();
  await expect.poll(stored).toBe(2000);
  await expect(card.getByText(/Buyurtma\/oy: 2000/)).toBeVisible();

  await card.getByRole('button', { name: 'Tahrirlash' }).click();
  await form.getByLabel('Buyurtma / oy').fill('cheksiz');
  await save();
  await expect.poll(stored).toBeNull();
});
