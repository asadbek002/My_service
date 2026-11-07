import { PLATFORM, OWNER } from '../env';
import { apiCall, expect, platformSignIn, resetRateLimits, test, uid, uniquePhone } from './fixtures';

/** The steps of /signup straight through the API, as the page makes them. */
const sendCode = (phone: string) => apiCall<{ devCode: string }>(null, '/auth/verify/sms', { purpose: 'signup', phone });
const check = (phone: string, code: string) => apiCall<{ proof: string }>(null, '/auth/verify/check', { purpose: 'signup', phone, code });

test('the platform sees every sign-up: where each one stopped and the error that stopped it', async ({ page }) => {
  await resetRateLimits();
  // 1. Asked for a code and never came back.
  const quiet = uniquePhone();
  await sendCode(quiet);
  // 2. Typed a wrong code, then confirmed, then picked a login that is taken.
  const stuck = uniquePhone(), name = 'Tiqilgan ' + uid();
  const { devCode } = await sendCode(stuck);
  await expect(check(stuck, devCode === '000000' ? '111111' : '000000')).rejects.toThrow(/400/);
  const { proof } = await check(stuck, devCode);
  await expect(apiCall(null, '/auth/signup', { proof, serviceName: name, ownerName: 'Ali', login: OWNER.login, password: 'Signup-Password-123', acceptTerms: true })).rejects.toThrow(/409/);
  // 3. Went all the way.
  const done = uniquePhone(), opened = 'Ochilgan ' + uid();
  const c = await sendCode(done);
  const p = await check(done, c.devCode);
  await apiCall(null, '/auth/signup', { proof: p.proof, serviceName: opened, ownerName: 'Vali', login: 'ok' + uid(), password: 'Signup-Password-123', acceptTerms: true });

  await platformSignIn(page, PLATFORM.login, PLATFORM.password);
  await page.goto('/platform/signups');
  // "Tugatmagan" is the default view: the two who did not finish, not the one who did.
  await expect(page.getByRole('link', { name: quiet })).toBeVisible();
  const stuckRow = page.locator('li').filter({ has: page.getByRole('link', { name: stuck }) });
  await expect(stuckRow).toContainText('Tasdiqladi');
  await expect(stuckRow).toContainText('Tanlagan logini band');
  await expect(stuckRow).toContainText(name);
  await expect(stuckRow).toContainText('1 marta xato kod');
  await expect(page.getByRole('link', { name: done })).toHaveCount(0);

  await page.getByRole('button', { name: 'Xato bilan' }).click();
  await expect(page.getByRole('link', { name: stuck })).toBeVisible();
  await expect(page.getByRole('link', { name: quiet })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ochilgan', exact: true }).click();
  const doneRow = page.locator('li').filter({ has: page.getByRole('link', { name: done }) });
  await expect(doneRow.getByRole('link', { name: opened })).toBeVisible();
  await doneRow.getByRole('link', { name: opened }).click();
  await expect(page).toHaveURL(/\/platform\/organizations\//);
});
