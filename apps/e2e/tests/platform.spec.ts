import { PLATFORM } from '../env';
import { apiCall, expect, expectNoHorizontalScroll, newService, platformSignIn, signIn, test, uid } from './fixtures';

test('every platform screen opens', async ({ page }) => {
  await platformSignIn(page, PLATFORM.login, PLATFORM.password);
  for (const path of ['/platform', '/platform/organizations', '/platform/subscriptions', '/platform/plans', '/platform/tickets', '/platform/announcements', '/platform/system']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(page.getByText('Yuklanmoqda…')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
});

test('a question from a service reaches the platform, and the answer comes back', async ({ page, browser }) => {
  const svc = await newService('Savol');
  const subject = 'Printer ' + uid();
  await signIn(page, svc.login, svc.password);
  await page.goto('/help');
  await page.getByLabel('Mavzu').fill(subject);
  await page.getByLabel('Batafsil').fill('Chek chiqmayapti');
  await page.getByRole('button', { name: 'Yuborish' }).click();
  await expect(page.getByText(subject).first()).toBeVisible();

  const admin = await browser.newContext({ ...test.info().project.use });
  const ap = await admin.newPage();
  await platformSignIn(ap, PLATFORM.login, PLATFORM.password);
  await ap.goto('/platform/tickets');
  await ap.getByRole('button', { name: new RegExp(subject) }).click();
  await ap.getByPlaceholder(/Javob \(servisga/).fill('Printer drayverini qayta o‘rnating');
  await ap.getByRole('button', { name: 'Javob yuborish' }).click();
  await expect(ap.getByText('Printer drayverini qayta o‘rnating')).toBeVisible();
  await admin.close();

  await page.reload();
  await page.getByText(subject).first().click();
  await expect(page.getByText('Printer drayverini qayta o‘rnating')).toBeVisible();
});

test('a blocked service sees only Hisobim and Yordam until it is unblocked', async ({ page, browser }) => {
  const svc = await newService('Blok');
  const admin = await browser.newContext({ ...test.info().project.use });
  const ap = await admin.newPage();
  await platformSignIn(ap, PLATFORM.login, PLATFORM.password);
  await ap.goto('/platform/organizations');
  await ap.getByLabel('Servislardan qidirish').fill(svc.name);
  await ap.getByText(svc.name).first().click();
  await expect(ap).toHaveURL(/\/platform\/organizations\//);
  ap.once('dialog', d => void d.accept());
  await ap.getByPlaceholder("Sabab (servisga ko'rinadi)").fill("To'lov qilinmagan");
  await ap.getByRole('button', { name: 'Bloklash' }).click();
  await expect(ap.getByRole('button', { name: 'Blokdan chiqarish' })).toBeVisible();

  await signIn(page, svc.login, svc.password);
  await page.goto('/orders');
  await expect(page.getByText("Ustaxona vaqtincha to'xtatilgan")).toBeVisible();
  await expect(page.getByText("Sabab: To'lov qilinmagan")).toBeVisible();
  await page.getByRole('link', { name: 'Hisobim' }).last().click();
  await expect(page.getByText("Ustaxona vaqtincha to'xtatilgan")).toHaveCount(0);
  // The API refuses work too, not only the screen.
  await expect(apiCall(svc.token, '/customers', { firstName: 'X', phone: '+998931234567' })).rejects.toThrow(/403/);

  await ap.getByRole('button', { name: 'Blokdan chiqarish' }).click();
  await expect(ap.getByRole('button', { name: 'Bloklash' })).toBeVisible();
  await admin.close();
  await page.goto('/orders');
  await expect(page.getByText("Ustaxona vaqtincha to'xtatilgan")).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ochiq/ })).toBeVisible();
});

test('an announcement shows in every service and can be hidden', async ({ page, browser }) => {
  const title = 'Yangilik ' + uid();
  const admin = await browser.newContext({ ...test.info().project.use });
  const ap = await admin.newPage();
  await platformSignIn(ap, PLATFORM.login, PLATFORM.password);
  await ap.goto('/platform/announcements');
  await ap.getByPlaceholder('Sarlavha').fill(title);
  await ap.getByPlaceholder('Matn').fill('Yangi funksiya qo‘shildi');
  await ap.getByRole('button', { name: "E'lon qilish" }).click();
  await expect(ap.getByText(title)).toBeVisible();

  const svc = await newService('Elon');
  await signIn(page, svc.login, svc.password);
  await page.goto('/dashboard');
  const banner = page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Yopish' }) }).last();
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Yopish' }).click();
  await expect(page.getByText(title)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText(title)).toHaveCount(0);

  // Switched off so later tests do not see it.
  await ap.locator('div').filter({ hasText: title }).getByRole('button', { name: 'O‘chirish' }).last().click();
  await admin.close();
});

test('SMS page: a new service starts with SMS off; the platform and the owner switch the same thing', async ({ page, browser }) => {
  const svc = await newService('SMSli');
  await platformSignIn(page, PLATFORM.login, PLATFORM.password);
  await page.goto('/platform/sms');
  await page.getByLabel("Servis bo'yicha qidirish").fill(svc.name);
  const row = page.locator('tr').filter({ has: page.getByRole('link', { name: svc.name }) });
  await row.getByLabel('Oylik SMS limiti').fill('50');
  await row.getByLabel('Oylik SMS limiti').press('Enter');
  await expect(row.getByLabel('Oylik SMS limiti')).toHaveValue('50');
  // New services start with customer SMS off; the platform turns them on.
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await row.getByRole('switch').click();
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

  // The owner sees the same switch in Settings and turns it off again.
  const owner = await browser.newContext({ ...test.info().project.use });
  const op = await owner.newPage();
  await signIn(op, svc.login, svc.password);
  await op.goto('/settings#sms');
  const own = op.getByRole('switch', { name: 'Mijozlarga SMS yuborish' });
  await expect(own).toHaveAttribute('aria-checked', 'true');
  await own.click();
  await expect(own).toHaveAttribute('aria-checked', 'false');
  await expect(op.getByText("O'chiq: mijozlarga faqat Telegram xabarlari boradi")).toBeVisible();
  await owner.close();

  await page.reload();
  await page.getByLabel("Servis bo'yicha qidirish").fill(svc.name);
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('Yuklama page: requests, speed, active users and the server are shown', async ({ page }) => {
  await platformSignIn(page, PLATFORM.login, PLATFORM.password);
  await page.goto('/platform/performance');
  await expect(page.getByRole('heading', { name: "Soatlik so'rovlar" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ilovadan faol foydalanish' })).toBeVisible();
  await expect(page.getByText('Ma\'lumotlar bazasi')).toBeVisible();
  await page.getByRole('button', { name: '7 kun' }).click();
  await expect(page.getByRole('button', { name: '7 kun' })).toHaveAttribute('aria-pressed', 'true');
});
