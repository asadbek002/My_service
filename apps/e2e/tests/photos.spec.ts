import { apiCall, expect, newOrder, newService, signIn, test, uid, uniquePhone } from './fixtures';

// A 64×48 PNG (a small orange picture) standing in for a phone photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAZElEQVR4nO3PwQkAIBDAsJvHzdz/Lw7hIwiFDpDO2evrhgsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS147AIjh80Pj5cC4gAAAABJRU5ErkJggg==', 'base64');

/** Intake photos: off until the owner turns them on; then taken at intake, seen and removed on the order. */
test('a service turns intake photos on, takes them at intake and removes one on the order', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough; the camera input is the same on phones');
  const svc = await newService('Rasmli');
  // Off by default: the API refuses and the intake screen has no photo section.
  const off = await newOrder(svc.token);
  await expect(apiCall(svc.token, `/orders/${off.id}/photos`, { image: 'data:image/png;base64,' + PNG.toString('base64') })).rejects.toThrow(/403.*PHOTOS_DISABLED/);
  await signIn(page, svc.login, svc.password);
  await page.goto('/orders/new');
  await expect(page.getByLabel('Brend')).toBeVisible();
  await expect(page.getByText('Qurilma holati')).toHaveCount(0);

  // The owner turns it on in Settings.
  await page.goto('/settings#photos');
  const toggle = page.getByRole('switch', { name: 'Qabulda qurilma rasmi' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // Intake with two photos.
  await page.goto('/orders/new');
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Ism').fill('Rasm ' + uid());
  await page.getByLabel('Brend').fill('Samsung');
  await page.getByLabel('Model').fill('A52');
  await page.getByPlaceholder('Masalan: ekran singan').fill('Orqa qopqoq yorilgan');
  await expect(page.getByText('Qurilma holati')).toBeVisible();
  await page.getByLabel('Rasmga olish').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByRole('img', { name: /^Rasm \d/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+\?new=1$/);

  // The order shows them; one is opened and removed.
  const section = page.locator('section').filter({ hasText: 'Qabul paytidagi holati' });
  await expect(section.getByText('2 / 10 ta rasm')).toBeVisible();
  const first = section.getByRole('img', { name: /Qabul rasmi/ }).first();
  await expect.poll(() => first.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await first.click();
  page.once('dialog', d => void d.accept());
  await page.getByRole('dialog').getByRole('button', { name: "O'chirish" }).click();
  await expect(section.getByText('1 / 10 ta rasm')).toBeVisible();

  // Turned off again: old photos stay, new ones are refused.
  await page.goto('/settings#photos');
  await page.getByRole('switch', { name: 'Qabulda qurilma rasmi' }).click();
  await expect(page.getByRole('switch', { name: 'Qabulda qurilma rasmi' })).toHaveAttribute('aria-checked', 'false');
});

/** One link: a customer not in Telegram is flagged on the order, the QR is shown, the tracking page shows the photos. */
test('the order offers the Telegram QR and the tracking page shows the intake photos', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  const svc = await newService('Bitta havola');
  await apiCall(svc.token, '/settings/general/photos', { value: { enabled: true } }, 'PUT');
  const order = await newOrder(svc.token);
  await apiCall(svc.token, `/orders/${order.id}/photos`, { image: 'data:image/png;base64,' + PNG.toString('base64') });
  await signIn(page, svc.login, svc.password);
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByText('Mijoz Telegramga ulanmagan')).toBeVisible();
  await page.getByRole('button', { name: 'QR ko‘rsatish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Telegram QR' });
  await expect(dialog.getByRole('img', { name: 'Telegram bot QR kodi' }).locator('svg')).toBeVisible();
  await expect(dialog.getByText('Mijoz ulanishi kutilmoqda')).toBeVisible();
  await dialog.getByRole('button', { name: 'Yopish' }).click();
  await expect(dialog).toHaveCount(0);

  // The tracking page: the photo loads, and the bot is offered.
  const { tracking } = await apiCall<{ tracking: string }>(svc.token, `/orders/${order.id}/links`, {});
  await page.goto(new URL(tracking).pathname);
  const photo = page.getByRole('img', { name: 'Qabul rasmi 1' });
  await expect.poll(() => photo.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: /Telegramda kuzatish/ })).toHaveAttribute('href', /^https:\/\/t\.me\/myservice_e2e_bot\?start=/);
});
