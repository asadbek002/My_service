import type { Browser } from '@playwright/test';
import { apiCall, expect, newOrder, newService, signIn, test, uniquePhone } from './fixtures';

/**
 * The App Store app (mobile/ios): the site as it runs inside it. The app's native side (Swift: camera,
 * printing, share sheet, push notifications) is stood in for by window.__nativeTest, which records
 * what the page asks of it. Apple's rules checked here: no prices or plan upsell, native printing and
 * sharing instead of the browser's (which do nothing in an app), push alerts that open the order.
 */
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MyServiceApp-iOS';
const DEVICE_TOKEN = 'c0ffee'.repeat(10) + 'abcd';
// A 1×1 JPEG, as the camera returns it.
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

type Call = [string, Record<string, unknown>];

async function iosApp(browser: Browser) {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const calls: Call[] = [];
  await ctx.exposeFunction('__record', (name: string, args: Record<string, unknown>) => { calls.push([name, args]); });
  await ctx.addInitScript(({ token, photo }) => {
    const w = window as unknown as Record<string, unknown> & { __record: (n: string, a: unknown) => Promise<void> };
    const listeners: Record<string, (x: unknown) => void> = {};
    w.__pushListeners = listeners;
    const short = (o: Record<string, unknown>) => ({ ...o, data: typeof o.data === 'string' ? o.data.slice(0, 30) : o.data });
    w.__nativeTest = {
      NativeTools: {
        printImage: async (o: Record<string, unknown>) => { await w.__record('printImage', short(o)); return { completed: true }; },
        shareFile: async (o: Record<string, unknown>) => { await w.__record('shareFile', short(o)); return { completed: true }; },
        shareText: async (o: Record<string, unknown>) => { await w.__record('shareText', o); return { completed: true }; },
      },
      Camera: { getPhoto: async (o: Record<string, unknown>) => { await w.__record('getPhoto', o); return { dataUrl: photo, format: 'jpeg' }; } },
      PushNotifications: {
        // Like iOS: asks once, then remembers the answer.
        checkPermissions: async () => ({ receive: sessionStorage.getItem('perm') ?? 'prompt' }),
        requestPermissions: async () => { await w.__record('requestPermissions', {}); sessionStorage.setItem('perm', 'granted'); return { receive: 'granted' }; },
        addListener: async (event: string, cb: (x: unknown) => void) => { listeners[event] = cb; return { remove() {} }; },
        register: async () => { await w.__record('register', {}); setTimeout(() => listeners.registration?.({ value: token }), 0); },
      },
    };
  }, { token: DEVICE_TOKEN, photo: PHOTO });
  const page = await ctx.newPage();
  return { ctx, page, calls };
}
const named = (calls: Call[], name: string) => calls.filter(c => c[0] === name).map(c => c[1]);

test('iPhone app: push alerts, native camera, printing, sharing, no prices; sign-out forgets the phone', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'one run is enough: the app has its own phone context');
  const svc = await newService('iPhone');
  const order = await newOrder(svc.token);
  const { ctx, page, calls } = await iosApp(browser);

  // Signed in: iOS is asked for permission once and the phone's token reaches the server.
  const registered = page.waitForResponse(r => r.url().endsWith('/api/push/devices') && r.request().method() === 'POST');
  await signIn(page, svc.login, svc.password);
  await page.goto('/dashboard');
  expect((await registered).status()).toBe(204);
  expect(named(calls, 'requestPermissions')).toHaveLength(1);
  expect(JSON.parse((await registered).request().postData() ?? '{}')).toEqual({ token: DEVICE_TOKEN, platform: 'ios' });
  // Opening the app again does not ask again.
  await page.goto('/orders');
  await expect.poll(() => named(calls, 'register').length).toBe(2);
  expect(named(calls, 'requestPermissions')).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __pushListeners: Record<string, unknown> }).__pushListeners.pushNotificationActionPerformed)).toBe('function');

  // Tapping an alert opens its order.
  await page.evaluate(url => (window as unknown as { __pushListeners: Record<string, (x: unknown) => void> }).__pushListeners.pushNotificationActionPerformed({ notification: { data: { url } } }), '/orders/' + order.id);
  await expect(page).toHaveURL(new RegExp('/orders/' + order.id + '$'));
  // A link from elsewhere in an alert is ignored.
  await page.evaluate(() => (window as unknown as { __pushListeners: Record<string, (x: unknown) => void> }).__pushListeners.pushNotificationActionPerformed({ notification: { data: { url: '//evil.example/x' } } }));
  await expect(page).toHaveURL(new RegExp('/orders/' + order.id + '$'));

  // Device photos come from iOS's camera sheet.
  await page.goto('/settings#photos');
  await page.getByRole('switch', { name: 'Qabulda qurilma rasmi' }).click();
  await expect(page.getByRole('switch', { name: 'Qabulda qurilma rasmi' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/orders/new');
  await page.getByLabel('Telefon').fill(uniquePhone());
  await page.getByLabel('Ism').fill('Rasm');
  await page.getByLabel('Brend').fill('Samsung');
  await page.getByLabel('Model').fill('A52');
  await page.getByPlaceholder('Masalan: ekran singan').fill('Orqa qopqoq yorilgan');
  await page.getByRole('button', { name: 'Rasmga olish' }).click();
  await expect(page.getByRole('img', { name: 'Rasm 1' })).toBeVisible();
  expect(named(calls, 'getPhoto')[0]).toMatchObject({ source: 'PROMPT', resultType: 'dataUrl' });

  // The receipt: iOS's printer dialog gets it as a picture; "share" opens the share sheet with the caption.
  await page.goto(`/orders/${order.id}/print`);
  await page.getByRole('button', { name: 'Chop etish' }).click();
  await expect.poll(() => named(calls, 'printImage').length).toBe(1);
  expect(named(calls, 'printImage')[0]).toMatchObject({ name: order.number });
  expect(String(named(calls, 'printImage')[0].data)).toMatch(/^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Rasm sifatida ulashish' }).click();
  await expect.poll(() => named(calls, 'shareFile').length).toBe(1);
  expect(named(calls, 'shareFile')[0]).toMatchObject({ name: order.number + '.png', mime: 'image/png' });
  expect(String(named(calls, 'shareFile')[0].text)).toContain(order.number);

  // The order's link for the customer goes through the share sheet too.
  await page.goto('/orders/' + order.id);
  await page.getByRole('button', { name: 'Mijozga havola' }).click();
  await expect.poll(() => named(calls, 'shareText').length).toBe(1);
  expect(String(named(calls, 'shareText')[0].text)).toContain('Qurilmangiz holati:');

  // Reports: the PDF is handed to the share sheet (an app cannot download files).
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Kassa — PDF' }).click();
  await expect.poll(() => named(calls, 'shareFile').length, { timeout: 20_000 }).toBe(2);
  expect(named(calls, 'shareFile')[1]).toMatchObject({ mime: 'application/pdf' });
  expect(String(named(calls, 'shareFile')[1].name)).toMatch(/\.pdf$/);

  // No prices, plans or "pay elsewhere" anywhere the owner looks (App Store 3.1.1).
  for (const path of ['/account', '/settings', '/branches']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText(/Shu tarifni tanlash|Tariflarni ko.rish|Tarifni o.zgartirish|kattaroq tarifni tanlang|so.m\s*\/\s*oy/)).toHaveCount(0);
  }

  // Signing out: the phone stops getting this user's alerts.
  await page.goto('/dashboard');
  const forgotten = page.waitForRequest(r => r.url().endsWith('/api/push/devices/' + DEVICE_TOKEN) && r.method() === 'DELETE');
  await page.getByRole('button', { name: 'Menyu' }).click();
  await page.getByRole('dialog', { name: 'Menyu' }).getByRole('button', { name: 'Chiqish' }).click();
  await forgotten;
  await expect(page).toHaveURL(/\/login$/);
  await ctx.close();
});

test('iPhone app: sign-up says nothing about prices or the free month', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'one run is enough');
  const { ctx, page } = await iosApp(browser);
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Yangi ustaxona' })).toBeVisible();
  await expect(page.getByText(/tekin|Karta kerak emas|tarif/i)).toHaveCount(0);
  await ctx.close();
});

test('a browser (not the app) keeps the web behaviour: plan chooser visible, no native calls', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'one run is enough');
  const svc = await newService('Brauzer');
  await signIn(page, svc.login, svc.password);
  await page.goto('/account');
  await expect(page.getByRole('button', { name: /tarifni tanlash|tarifda davom etish/i }).first()).toBeVisible();
  expect(await apiCall<{ enabled: boolean }>(svc.token, '/push/status')).toEqual({ enabled: true });
});

