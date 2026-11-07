import { OWNER } from '../env';
import { apiCall, expect, expectNoHorizontalScroll, isPhone, newOrder, newService, pay, signIn, test, tokenFor, uid, uniquePhone } from './fixtures';

const num = (s: string) => new RegExp(s.replace(/ /g, '\\s'));

test('reports, dashboard and payments agree with what happened in a fresh service', async ({ page }) => {
  const svc = await newService('Hisob');
  const t = svc.token;
  // A: 100 000 labour + 50 000 parts, paid in full, delivered.
  const a = await newOrder(t, { labor: '100000', parts: '50000', status: 'READY' });
  await pay(t, a.id, '150000');
  await apiCall(t, `/orders/${a.id}/deliver`, { warrantyDays: 0 });
  // B: 200 000 labour, 120 000 paid, delivered with 80 000 on debt.
  const b = await newOrder(t, { labor: '200000', status: 'READY' });
  await pay(t, b.id, '120000');
  await apiCall(t, `/orders/${b.id}/deliver`, { warrantyDays: 0, allowDebt: true });
  // C: still in the shop, 30 000 paid in advance.
  const c = await newOrder(t, { labor: '90000', status: 'IN_REPAIR' });
  await pay(t, c.id, '30000');
  await apiCall(t, '/expenses', { category: 'RENT', amount: '40000', note: 'Ijara oktyabr' });

  const f = await apiCall<Record<string, string | number>>(t, '/reports/finance?period=today');
  expect.soft(Number(f.revenue), 'revenue = delivered totals').toBe(350000);
  expect.soft(Number(f.labor)).toBe(300000);
  expect.soft(Number(f.parts)).toBe(50000);
  expect.soft(Number(f.cashIn), 'cash in = every payment today').toBe(300000);
  expect.soft(Number(f.operatingExpenses)).toBe(40000);
  expect.soft(Number(f.profit), 'profit = labour − expenses').toBe(260000);
  expect.soft(Number(f.delivered)).toBe(2);
  expect.soft(Number(f.received)).toBe(3);

  await signIn(page, svc.login, svc.password);
  await page.goto('/reports');
  await expect(page.getByText(num('350 000')).first()).toBeVisible();
  await expect(page.getByText(num('260 000')).first()).toBeVisible();
  // Debtors: only B is a real debt (C is still in the shop).
  await expect(page.locator('#debtors').getByText(num('80 000')).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/payments');
  await expect(page.getByText(num('300 000')).first()).toBeVisible();

  await page.goto('/orders');
  await expect(page.getByRole('button', { name: /Ochiq/ })).toContainText('1');
  await expect(page.getByRole('button', { name: /Qarzga berilgan/ })).toContainText('1');
});

test('the access token runs out in two tabs at once: both stay signed in', async ({ page, context }) => {
  await signIn(page, OWNER.login, OWNER.password);
  await page.goto('/orders');
  await expect(page.getByRole('button', { name: /Ochiq/ })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/customers');
  await expect(second.locator('[aria-busy="true"]')).toHaveCount(0);
  // Drop both access tokens: the next requests must refresh with the shared cookie, one tab after the other.
  for (const p of [page, second]) await p.evaluate(() => sessionStorage.clear());
  await Promise.all([page.reload(), second.reload()]);
  await expect(page.getByRole('button', { name: /Ochiq/ })).toBeVisible();
  await expect(second.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/orders/);
  await expect(second).toHaveURL(/\/customers/);
  // And a third load later still works: the refresh family was not revoked.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page).toHaveURL(/\/orders/);
});

test('very long names and models do not break the phone layout', async ({ page }) => {
  const token = await tokenFor(OWNER.login, OWNER.password);
  // One unbroken word is the hardest case: nothing to wrap at.
  const long = 'Muhammadaminov'.repeat(5) + uid();
  const customer = await apiCall<{ id: string }>(token, '/customers', { firstName: long, lastName: 'Qodirxo‘jayevich'.repeat(3), phone: uniquePhone() });
  const device = await apiCall<{ id: string }>(token, '/devices', { customerId: customer.id, category: 'Noutbuk', brand: 'Lenovo', model: 'IdeaPad Gaming 3 15ACH6 82K2027QRK UltraSlimEdition' });
  const order = await apiCall<{ id: string }>(token, '/orders', { customerId: customer.id, deviceId: device.id, complaint: 'Juda uzun nosozlik tavsifi: '.repeat(20), accessories: ['Quvvatlagich', 'Juda uzun komplekt nomi bilan sumka va boshqa narsalar'], labor: '123456789', partsTotal: '987654321' });
  await signIn(page, OWNER.login, OWNER.password);
  for (const url of ['/orders/' + order.id, '/customers/' + customer.id, '/orders/' + order.id + '/print', '/orders', '/customers']) {
    await page.goto(url);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
});

test('a phone typed without +998, with spaces or dashes, finds the same customer', async ({ page }) => {
  const token = await tokenFor(OWNER.login, OWNER.password);
  const phone = uniquePhone(), name = 'Format ' + uid();
  await apiCall(token, '/customers', { firstName: name, phone });
  await signIn(page, OWNER.login, OWNER.password);
  const local = phone.slice(4); // 93xxxxxxx
  for (const typed of [`${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`, `8-${local.slice(0, 2)}-${local.slice(2)}`, `998${local}`]) {
    await page.goto('/orders/new');
    await page.getByLabel('Telefon').fill(typed);
    await expect(page.getByText(name).first(), `typed "${typed}"`).toBeVisible();
  }
});

test('customer edit: a typo in the name is fixed; a phone taken by another customer is refused with a message', async ({ page }) => {
  const token = await tokenFor(OWNER.login, OWNER.password);
  const taken = uniquePhone();
  await apiCall(token, '/customers', { firstName: 'Band', phone: taken });
  const o = await newOrder(token, { name: 'Alishr ' + uid() });
  await signIn(page, OWNER.login, OWNER.password);
  await page.goto('/customers/' + o.customerId);
  await page.getByRole('button', { name: 'Mijozni tahrirlash' }).click();
  await page.getByLabel('Ism').fill('Alisher');
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByRole('heading', { name: /^Alisher/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mijozni tahrirlash' }).click();
  await page.getByLabel('Telefon').fill(taken);
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page.locator('p[role="alert"]')).not.toHaveText(/REQUEST_FAILED|Xato yuz berdi/);
});

// Finding: an employee opens Hisobim and can change the plan. Waiting on the owner's decision whether billing is owner-only.
test.fixme('staff of a self-registered service: what an employee can and cannot reach', async ({ page }) => {
  const svc = await newService('Huquq');
  const login = 'xodim' + uid();
  await apiCall(svc.token, '/staff', { firstName: 'Xodim', phone: uniquePhone(), login, temporaryPassword: 'Temporary-Staff-123' });
  const temp = await tokenFor(login, 'Temporary-Staff-123');
  await apiCall(temp, '/auth/change-password', { currentPassword: 'Temporary-Staff-123', newPassword: 'Staff-Password-123' });
  await signIn(page, login, 'Staff-Password-123');
  await page.goto('/dashboard');
  if (isPhone(page)) await page.getByRole('button', { name: 'Menyu' }).click();
  const nav = isPhone(page) ? page.getByRole('dialog', { name: 'Menyu' }) : page.locator('aside');
  // Billing belongs to the owner: an employee should not choose the plan or see the invoices.
  await expect(nav.getByRole('link', { name: 'Hisobim' })).toHaveCount(0);
  const account = await fetch(test.info().project.use.baseURL!.replace(':3000', ':3001') + '/api/account', { headers: { Authorization: 'Bearer ' + await tokenFor(login, 'Staff-Password-123') } });
  expect(account.status, 'GET /account as an employee').toBe(403);
});
