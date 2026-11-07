import { OWNER } from '../env';
import { apiCall, expect, newOrder, orderOf, pay, signIn, test, tokenFor, uid, uniquePhone } from './fixtures';

const num = (s: string) => new RegExp(s.replace(/ /g, '\\s'));
let token = '';
test.beforeEach(async ({ page }) => {
  token = await tokenFor(OWNER.login, OWNER.password);
  await signIn(page, OWNER.login, OWNER.password);
});

test('a double tap on "Qabul qilish" creates one order, not two', async ({ page }) => {
  const phone = uniquePhone(), name = 'Ikki ' + uid();
  await page.goto('/orders/new');
  await page.getByLabel('Telefon').fill(phone);
  await page.getByLabel('Ism').fill(name);
  await page.getByLabel('Brend').fill('Vivo');
  await page.getByLabel('Model').fill('Y20');
  await page.getByPlaceholder('Masalan: ekran singan').fill('Tugma');
  await page.getByRole('button', { name: 'Qabul qilish' }).dblclick();
  await expect(page).toHaveURL(/\?new=1/);
  const customers = await apiCall<{ id: string; phone: string }[]>(token, '/customers?q=' + phone.slice(-9));
  expect(customers.filter(c => c.phone === phone)).toHaveLength(1);
  const orders = await apiCall<{ customer: { phone: string } }[]>(token, '/orders?status=');
  expect(orders.filter(o => o.customer.phone === phone)).toHaveLength(1);
});

test('a double tap on the payment button takes the money once', async ({ page }) => {
  const o = await newOrder(token, { labor: '300000', status: 'READY' });
  await page.goto('/orders/' + o.id);
  await page.getByRole('button', { name: "To'lov", exact: true }).click();
  await page.getByLabel("Qancha to'laydi?").fill('100000');
  await page.getByRole('button', { name: num("100 000 so'm qabul qilish") }).dblclick();
  await expect(page.getByRole('status')).toContainText(num("Qoldiq: 200 000 so'm"));
  expect((await orderOf(token, o.id)).totalPaid).toMatch(/^100000(\.0+)?$/);
});

test('refund: part of a payment comes back and the balance grows by it', async ({ page }) => {
  const o = await newOrder(token, { labor: '200000', status: 'READY' });
  await pay(token, o.id, '200000');
  await page.goto('/orders/' + o.id);
  await page.getByRole('button', { name: 'Qaytarish', exact: true }).click();
  await page.getByLabel('Qaytariladigan summa').fill('50000');
  await page.getByPlaceholder('Sababi').fill('Zapchast arzonroq chiqdi');
  await page.getByRole('button', { name: 'Pulni qaytarish' }).click();
  await expect(page.getByText(num('−50 000'))).toBeVisible();
  const after = await orderOf(token, o.id);
  expect(Number(after.balance)).toBe(50000);
  // More than what is left of the payment is refused.
  const payment = after.payments.find(p => p.kind === 'PAYMENT')!;
  await expect(apiCall(token, `/payments/${payment.id}/refund`, { amount: '160000', reason: 'Ortiqcha', idempotencyKey: crypto.randomUUID() })).rejects.toThrow(/400|409|422/);
});

test('a delivery recorded as fully paid is corrected to a debt, and then shows as "Qarzga berilgan"', async ({ page }) => {
  const o = await newOrder(token, { labor: '400000', status: 'READY' });
  await pay(token, o.id, '400000');
  await apiCall(token, `/orders/${o.id}/deliver`, { warrantyDays: 0 });
  await page.goto('/orders/' + o.id);
  await page.getByRole('button', { name: 'Berishni tuzatish' }).click();
  await page.getByRole('radio', { name: /Qarzga/ }).click();
  await page.getByLabel("Aslida to'langan summa").fill('150000');
  await page.getByPlaceholder(/Sababi/).fill('Kassada adashib yozildi');
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByRole('status')).toContainText(num("Qarz: 250 000 so'm"));
  const debt = await apiCall<{ id: string }[]>(token, '/orders?status=DEBT');
  expect(debt.map(d => d.id)).toContain(o.id);
});

test('lowering the price below what was already paid does not leave a negative balance unexplained', async ({ page }) => {
  const o = await newOrder(token, { labor: '300000', status: 'IN_REPAIR' });
  await pay(token, o.id, '300000');
  await page.goto('/orders/' + o.id);
  await page.getByRole('button', { name: "Narxni o'zgartirish" }).click();
  await page.getByLabel('Usta haqi').fill('100000');
  await page.getByRole('button', { name: 'Saqlash' }).click();
  // Either the change is refused with a message, or it is accepted and the overpayment is shown.
  const refused = page.locator('p[role="alert"]');
  const accepted = page.getByRole('status').filter({ hasText: 'Narx yangilandi' });
  await expect(refused.or(accepted)).toBeVisible();
  const after = await orderOf(token, o.id);
  if (await accepted.isVisible()) {
    expect(Number(after.balance), 'balance after lowering the price under the paid sum').toBeGreaterThanOrEqual(0);
  } else {
    expect(Number(after.total)).toBe(300000);
  }
});

test('an expense is written down and shows in the list', async ({ page }) => {
  const note = 'Ijara ' + uid();
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'Ijara' }).click();
  await page.getByLabel('Summa').fill('2500000');
  await page.getByPlaceholder(/Izoh/).fill(note);
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByRole('status')).toContainText('Yozildi');
  await expect(page.getByText(new RegExp(note)).first()).toBeVisible();
});

test("the receipt shows the customer, the device and the total; the tracking page shows the status without the customer's phone", async ({ page, browser }) => {
  const o = await newOrder(token, { labor: '120000', parts: '30000', status: 'IN_REPAIR' });
  await page.goto(`/orders/${o.id}/print`);
  await expect(page.getByText(o.number).first()).toBeVisible();
  await expect(page.getByText(o.name).first()).toBeVisible();
  await expect(page.getByText(num('150 000')).first()).toBeVisible();

  const { tracking } = await apiCall<{ tracking: string }>(token, `/orders/${o.id}/links`, {});
  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto(tracking.replace(/^https?:\/\/[^/]+/, test.info().project.use.baseURL!));
  await expect(vp.getByText(/Ta.mirlanmoqda/).first()).toBeVisible();
  const text = await vp.locator('body').innerText();
  expect(text).not.toContain(o.phone.slice(-7));
  await visitor.close();
});
