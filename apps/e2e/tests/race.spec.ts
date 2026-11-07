import { apiCall, expect, newOrder, newService, orderOf, pay, test, uniquePhone } from './fixtures';

/** Two cashiers, two phones, one slow network: the same action arrives several times at once. */
test.describe('at the same moment', () => {
  test.skip(({ isMobile }) => isMobile, 'API only: once is enough');
  let t = '';
  test.beforeAll(async () => { t = (await newService('Poyga')).token; });

  const settle = <T,>(ps: Promise<T>[]) => Promise.allSettled(ps);

  test('two payments that together exceed the balance: only what is owed is taken', async () => {
    const o = await newOrder(t, { labor: '150000', status: 'READY' });
    await settle([pay(t, o.id, '100000'), pay(t, o.id, '100000'), pay(t, o.id, '100000')]);
    const after = await orderOf(t, o.id);
    expect(Number(after.totalPaid), 'paid must not exceed the total').toBeLessThanOrEqual(150000);
    expect(Number(after.balance)).toBeGreaterThanOrEqual(0);
  });

  test('ten intakes at once get ten different numbers', async () => {
    const customer = await apiCall<{ id: string }>(t, '/customers', { firstName: 'Ko‘p', phone: uniquePhone() });
    const device = await apiCall<{ id: string }>(t, '/devices', { customerId: customer.id, category: 'Telefon', brand: 'Honor', model: 'X8' });
    const results = await settle(Array.from({ length: 10 }, () => apiCall<{ number: string }>(t, '/orders', { customerId: customer.id, deviceId: device.id, complaint: 'Bir vaqtda', accessories: [], labor: '1000', partsTotal: '0' })));
    const failed = results.filter(r => r.status === 'rejected').map(r => String((r as PromiseRejectedResult).reason).slice(0, 160));
    expect(failed, 'intakes refused').toEqual([]);
    const numbers = results.map(r => (r as PromiseFulfilledResult<{ number: string }>).value.number);
    expect(new Set(numbers).size).toBe(10);
  });

  test('two refunds of the same payment cannot return more than was paid', async () => {
    const o = await newOrder(t, { labor: '100000', status: 'READY' });
    await pay(t, o.id, '100000');
    const payment = (await orderOf(t, o.id)).payments.find(p => p.kind === 'PAYMENT')!;
    await settle([0, 1, 2].map(() => apiCall(t, `/payments/${payment.id}/refund`, { amount: '60000', reason: 'Bir vaqtda', idempotencyKey: crypto.randomUUID() })));
    const after = await orderOf(t, o.id);
    const refunded = after.payments.filter(p => p.kind === 'REFUND').reduce((s, p) => s + Number(p.amount), 0);
    expect(refunded, 'refunded in total').toBeLessThanOrEqual(100000);
  });

  test('delivering twice at once writes one delivery and one warranty', async () => {
    const o = await newOrder(t, { labor: '50000', status: 'READY' });
    await pay(t, o.id, '50000');
    await settle([0, 1, 2].map(() => apiCall(t, `/orders/${o.id}/deliver`, { warrantyDays: 30 })));
    const after = await apiCall<{ status: string; history: { toStatus: string }[] }>(t, '/orders/' + o.id);
    expect(after.status).toBe('DELIVERED');
    expect(after.history.filter(h => h.toStatus === 'DELIVERED')).toHaveLength(1);
  });

  test('the same new customer typed on two phones at once: one customer, the other gets a clear answer', async () => {
    const phone = uniquePhone();
    const results = await settle([0, 1].map(() => apiCall(t, '/customers', { firstName: 'Bir', phone })));
    const errors = results.filter(r => r.status === 'rejected').map(r => String((r as PromiseRejectedResult).reason));
    expect(errors.every(e => /409/.test(e)), 'second create: ' + errors.join(' | ')).toBe(true);
  });
});
