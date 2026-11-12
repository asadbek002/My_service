import { apiCall, expect, newService, signIn, test, uid } from './fixtures';

/** What Google Play and the App Store ask for: account deletion in the app and on the web, asset links. */
test('a staff member deletes their own account from the app; the web page explains it when signed out', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  // Signed out: the public deletion page (the address given to the stores) tells how.
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: "Hisobni o'chirish" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kirish' })).toHaveAttribute('href', '/login?next=/delete-account');

  const svc = await newService('Ochiriladigan');
  const login = 'xodim' + uid();
  await apiCall(svc.token, '/staff', { login, firstName: 'Aziz', temporaryPassword: 'Staff-Temp-12345', phone: '+998901234002' });
  const { accessToken } = await apiCall<{ accessToken: string }>(null, '/auth/login', { login, password: 'Staff-Temp-12345' });
  await apiCall(accessToken, '/auth/change-password', { currentPassword: 'Staff-Temp-12345', newPassword: 'Staff-Password-123' });

  await signIn(page, login, 'Staff-Password-123');
  await page.goto('/dashboard');
  await page.getByRole('link', { name: "Hisobni o'chirish" }).first().click();
  await expect(page).toHaveURL(/\/delete-account$/);
  await page.getByLabel('Parolingiz').fill('Staff-Password-123');
  await page.getByRole('button', { name: "Hisobimni o'chirish" }).click();
  await expect(page.getByRole('heading', { name: "Hisob o'chirildi" })).toBeVisible();
  await expect(apiCall(null, '/auth/login', { login, password: 'Staff-Password-123' })).rejects.toThrow(/401/);
});

test('asset links for the Google Play app are served (empty until the app is set up)', async ({ request }) => {
  const r = await request.get('/.well-known/assetlinks.json');
  expect(r.status()).toBe(200);
  expect(Array.isArray(await r.json())).toBe(true);
});
