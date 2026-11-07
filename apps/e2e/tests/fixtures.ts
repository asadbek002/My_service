import { test as base, expect, type Page } from '@playwright/test';
import Redis from 'ioredis';
import { API, REDIS_URL, WEB } from '../env';

export { expect };

const redis = new Redis(REDIS_URL, { lazyConnect: true });
/** Every test signs in; without this the login limiter (60 per IP in 15 min) trips halfway through the run. */
export async function resetRateLimits() {
  if (redis.status === 'wait') await redis.connect();
  const keys = [...await redis.keys('auth-rate:*'), ...await redis.keys('pv:*')];
  if (keys.length) await redis.del(...keys);
}

/** Calls the API directly, to prepare data a test is not about. */
export async function apiCall<T = unknown>(token: string | null, p: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const res = await fetch(API + p, {
    method,
    headers: { Origin: WEB, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
export async function tokenFor(login: string, password: string) {
  await resetRateLimits();
  return (await apiCall<{ accessToken: string }>(null, '/auth/login', { login, password })).accessToken;
}

/**
 * Signs the browser in the way the app does after a login: the refresh cookie is set and the
 * first page load trades it for an access token. Faster than typing the form in every test.
 */
export async function signIn(page: Page, login: string, password: string) {
  await resetRateLimits();
  const res = await page.request.post(API + '/auth/login', { data: { login, password }, headers: { Origin: WEB } });
  expect(res.status(), await res.text()).toBe(200);
}

/** A unique +998 number: tests share one database, and customers are unique by phone per service. */
let seq = 0;
export function uniquePhone() {
  seq += 1;
  const n = (Date.now() % 1_000_000) * 100 + (seq % 100);
  return '+99893' + String(n).padStart(7, '0').slice(-7);
}
export const uid = () => Math.random().toString(36).slice(2, 7);

type Problems = { list: string[] };

/**
 * Any page error, console error or failed API call fails the test that caused it, with the
 * message, so a bug the test did not look for is still reported.
 */
export const test = base.extend<{ problems: Problems }>({
  problems: [async ({ page }, use, info) => {
    const problems: Problems = { list: [] };
    page.on('pageerror', e => problems.list.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // The browser logs every non-2xx response; those are judged by the response listener below.
      if (/Failed to load resource/.test(text)) return;
      problems.list.push('console: ' + text);
    });
    page.on('response', r => {
      if (!r.url().startsWith(API)) return;
      if (r.status() >= 500) problems.list.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`);
    });
    await use(problems);
    const allowed = (info.annotations.find(a => a.type === 'allow')?.description ?? '').split('|').filter(Boolean);
    const left = problems.list.filter(p => !allowed.some(a => p.includes(a)));
    expect(left, 'page errors during the test').toEqual([]);
  }, { auto: true }],
});

/** The ActionBar and some buttons only show on one layout; this is the phone project. */
export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 1024;

/** No sideways scroll: the page must fit the screen width. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= w + 1) return false;
      // Inside a horizontally scrolling strip is fine.
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip') return false;
      }
      return true;
    });
    return { scroll: document.documentElement.scrollWidth - w, offenders: wide.slice(0, 5).map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 3).join('.') + ' ' + JSON.stringify((el.textContent ?? '').trim().slice(0, 40))) };
  });
  expect(overflow.scroll, 'horizontal overflow: ' + overflow.offenders.join(' | ')).toBeLessThanOrEqual(1);
}

/** A fresh self-registered service (the way /signup makes one), for tests that change a whole service. */
export async function newService(label = 'Servis') {
  await resetRateLimits();
  const phone = uniquePhone(), id = uid();
  const { devCode } = await apiCall<{ devCode: string }>(null, '/auth/verify/sms', { purpose: 'signup', phone });
  const { proof } = await apiCall<{ proof: string }>(null, '/auth/verify/check', { purpose: 'signup', phone, code: devCode });
  const login = 'svc' + id, password = 'Service-Password-123', name = `${label} ${id}`;
  const { accessToken } = await apiCall<{ accessToken: string }>(null, '/auth/signup', { proof, serviceName: name, ownerName: 'Egasi', login, password, acceptTerms: true });
  return { login, password, name, phone, token: accessToken };
}

/** Signs in to the platform console through its form (its token lives in sessionStorage). */
export async function platformSignIn(page: Page, login: string, password: string) {
  await resetRateLimits();
  await page.goto('/platform/login');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Parol').fill(password);
  await page.getByRole('button', { name: 'Kirish' }).click();
  await expect(page).toHaveURL(/\/platform$/);
}

/** An order straight through the API, moved to `status`; for tests about what happens next. */
export async function newOrder(token: string, { labor = '100000', parts = '0', status = 'RECEIVED', name = 'Mijoz ' + uid() } = {}) {
  const phone = uniquePhone();
  const customer = await apiCall<{ id: string }>(token, '/customers', { firstName: name, phone });
  const device = await apiCall<{ id: string }>(token, '/devices', { customerId: customer.id, category: 'Telefon', brand: 'Xiaomi', model: 'Note ' + uid() });
  const order = await apiCall<{ id: string; number: string }>(token, '/orders', { customerId: customer.id, deviceId: device.id, complaint: 'Tekshiruv', accessories: [], labor, partsTotal: parts });
  for (const s of ['IN_REPAIR', 'READY']) {
    if (status === 'RECEIVED' || (status === 'IN_REPAIR' && s === 'READY')) break;
    await apiCall(token, `/orders/${order.id}/status`, { status: s }, 'PATCH');
  }
  return { ...order, customerId: customer.id, name, phone };
}
export const pay = (token: string, orderId: string, amount: string) =>
  apiCall(token, `/orders/${orderId}/payments`, { amount, method: 'CASH', idempotencyKey: crypto.randomUUID() });
export const orderOf = (token: string, id: string) => apiCall<{ status: string; total: string; totalPaid: string; balance: string; payments: { id: string; kind: string; amount: string }[] }>(token, '/orders/' + id);
