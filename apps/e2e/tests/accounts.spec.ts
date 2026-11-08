import type { Page } from '@playwright/test';
import { OTHER_OWNER, OWNER } from '../env';
import { apiCall, expect, isPhone, newService, resetRateLimits, signIn, test, tokenFor, uid, uniquePhone } from './fixtures';

async function logout(page: Page) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await page.getByRole('dialog', { name: 'Menyu' }).getByRole('button', { name: 'Chiqish' }).click();
  } else {
    await page.getByRole('button', { name: 'Chiqish' }).click();
  }
  await expect(page).toHaveURL(/\/login/);
}

/** Confirms a phone through the SMS step; in test mode the API shows the code on the page. */
async function verifyPhone(page: Page, phone: string) {
  await page.getByLabel('Telefon raqamingiz').fill(phone);
  await page.getByRole('button', { name: 'SMS kod olish' }).click();
  const code = (await page.getByText(/Sinov rejimi/).locator('b').textContent())!.trim();
  // The sixth digit confirms by itself: no button to press.
  await page.getByPlaceholder('000000').fill(code);
  await expect(page.getByText('tasdiqlandi')).toBeVisible();
}

test('login form: wrong password is explained, the right one opens the dashboard, logout ends the session', async ({ page }) => {
  await resetRateLimits();
  await page.goto('/login');
  await page.getByLabel('Login').fill(OWNER.login);
  await page.getByLabel('Parol', { exact: true }).fill('wrong-password-123');
  await page.getByRole('button', { name: 'Kirish' }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: "Login yoki parol noto'g'ri" })).toBeVisible();
  await page.getByLabel('Parol', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Kirish' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await logout(page);
  // The session is gone: a protected page sends back to the login page.
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login/);
});

test('self sign-up: phone by SMS code, the workshop opens on its 1-month trial, then the password is reset by phone', async ({ page }) => {
  await resetRateLimits();
  const phone = uniquePhone(), id = uid(), login = 'servis' + id;
  await page.goto('/signup');
  await expect(page.getByText('1 oy tekin')).toBeVisible();
  await verifyPhone(page, phone);
  await page.getByLabel('Ustaxona nomi').fill('Servis ' + id);
  await page.getByLabel('Ismingiz').fill('Sardor');
  await page.getByLabel('Login').fill(login);
  await expect(page.getByText('✓ Login bo‘sh')).toBeVisible();
  await page.getByLabel(/^Parol\s*Kamida/).fill('Signup-Password-123');
  // The consent box is required.
  await page.getByRole('button', { name: 'Ustaxonani ochish' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('rozilik');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Ustaxonani ochish' }).click();
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByText('Xush kelibsiz, Sardor!')).toBeVisible();

  // The trial shows on the account page.
  await page.goto('/account');
  await expect(page.getByText(/sinov|Sinov/).first()).toBeVisible();

  // Forgot the password: the phone proves the account, and the new password signs in.
  await logout(page);
  await resetRateLimits();
  await page.goto('/reset');
  await verifyPhone(page, phone);
  await page.getByLabel(/^Yangi parol\s*Kamida/).fill('Reset-Password-12345');
  await page.getByLabel('Parolni takrorlang').fill('Reset-Password-12345');
  await page.getByRole('button', { name: 'Parolni saqlash va kirish' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await resetRateLimits();
  expect(await tokenFor(login, 'Reset-Password-12345')).toBeTruthy();
});

test('staff: added with a temporary password, sets their own at first login, cannot log in once suspended', async ({ page }) => {
  const id = uid(), login = 'usta' + id, temp = 'Temporary-Staff-123', own = 'Own-Staff-Password-1';
  await signIn(page, OWNER.login, OWNER.password);
  await page.goto('/staff');
  await page.getByRole('button', { name: "Qo'shish" }).click();
  await page.getByLabel('Ism').fill('Usta ' + id);
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Vaqtinchalik parol').fill(temp);
  await page.locator('form').getByRole('button', { name: "Qo'shish" }).click();
  await expect(page.getByRole('status')).toContainText(login);
  await expect(page.getByText('Usta ' + id)).toBeVisible();

  // First login: only the password change is offered.
  const staff = await page.context().browser()!.newContext({ ...test.info().project.use, baseURL: test.info().project.use.baseURL });
  const sp = await staff.newPage();
  await signIn(sp, login, temp);
  await sp.goto('/orders');
  await expect(sp).toHaveURL(/\/dashboard/);
  await sp.getByLabel('Vaqtinchalik parol').fill(temp);
  await sp.getByLabel(/^Yangi parol\s*Kamida/).fill(own);
  await sp.getByLabel('Yangi parolni takrorlang').fill(own);
  await sp.getByRole('button', { name: 'Parolni saqlash' }).click();
  await expect(sp.getByText('Parolni saqlash')).toHaveCount(0);
  await sp.goto('/orders');
  await expect(sp).toHaveURL(/\/orders/);
  await staff.close();

  // Suspended: the login is refused.
  await page.getByText('Usta ' + id).click();
  await page.getByRole('button', { name: "To'xtatish" }).click();
  await expect(page.getByRole('status')).toContainText("To'xtatildi");
  await resetRateLimits();
  await expect(tokenFor(login, own)).rejects.toThrow(/401|403/);
});

test("one service never sees another's orders or customers", async ({ page }) => {
  const token = await tokenFor(OWNER.login, OWNER.password);
  const customer = await apiCall<{ id: string }>(token, '/customers', { firstName: 'Maxfiy', phone: uniquePhone() });
  const device = await apiCall<{ id: string }>(token, '/devices', { customerId: customer.id, category: 'Telefon', brand: 'Nokia', model: '3310' });
  const order = await apiCall<{ id: string }>(token, '/orders', { customerId: customer.id, deviceId: device.id, complaint: 'Maxfiy', accessories: [], labor: '1000', partsTotal: '0' });
  await signIn(page, OTHER_OWNER.login, OTHER_OWNER.password);
  for (const url of ['/orders/' + order.id, '/customers/' + customer.id]) {
    await page.goto(url);
    await expect(page.locator('p[role="alert"]').first()).toBeVisible();
    await expect(page.getByText('Maxfiy')).toHaveCount(0);
  }
});

test('sign-up form: the phone formats itself, a taken login is flagged with a free one to take, the password can be shown', async ({ page }) => {
  await resetRateLimits();
  await page.goto('/signup');
  await page.getByLabel('Telefon raqamingiz').fill('998901234567');
  await expect(page.getByLabel('Telefon raqamingiz')).toHaveValue('+998 90 123 45 67');
  const phone = uniquePhone();
  await page.getByLabel('Telefon raqamingiz').fill(phone);
  await page.getByRole('button', { name: 'SMS kod olish' }).click();
  // Wrong number typed: go back without waiting for the code.
  await page.getByRole('button', { name: "Raqamni o'zgartirish" }).click();
  await expect(page.getByRole('button', { name: 'SMS kod olish' })).toBeVisible();
  await resetRateLimits();
  await page.getByRole('button', { name: 'SMS kod olish' }).click();
  const code = (await page.getByText(/Sinov rejimi/).locator('b').textContent())!.trim();
  await page.getByPlaceholder('000000').fill(code);
  await expect(page.getByText('tasdiqlandi')).toBeVisible();
  await page.getByLabel('Login').fill(OWNER.login);
  await expect(page.getByText('Bu login band.')).toBeVisible();
  await page.getByRole('button', { name: new RegExp('^' + OWNER.login + '\\d+$') }).click();
  await expect(page.getByText('✓ Login bo‘sh')).toBeVisible();
  const password = page.getByLabel(/^Parol\s*Kamida/);
  await password.fill('abc');
  await expect(page.getByText('yana 9 ta')).toBeVisible();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: "Parolni ko'rsatish" }).click();
  await expect(password).toHaveAttribute('type', 'text');
});

test('login with the phone number instead of the login', async ({ page }) => {
  const svc = await newService('Telefonli');
  await resetRateLimits();
  await page.goto('/login');
  const local = svc.phone.slice(4);
  await page.getByLabel('Login yoki telefon raqam').fill(`${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`);
  await page.getByLabel('Parol', { exact: true }).fill(svc.password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
