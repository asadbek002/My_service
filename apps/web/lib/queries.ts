import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type Payment = { id: string; kind: 'PAYMENT' | 'REFUND'; amount: string; method: string; reason?: string | null; originalPaymentId?: string | null; actorId?: string | null; createdAt: string };
export type Device = { id: string; category: string; brand: string; model: string };
export type Customer = { id: string; firstName: string; lastName?: string | null; phone: string; telegramUsername?: string | null; telegramChatId?: string | null; notificationPreference?: string; devices?: Device[] };
export type Order = {
  id: string; number: string; status: string; createdAt: string;
  complaint: string; accessories: string[];
  labor: string; partsTotal: string; total: string;
  customer: Customer; device: Device;
  payments: Pick<Payment, 'kind' | 'amount'>[];
  parentOrderId?: string | null;
};
export type OrderDetail = Omit<Order, 'payments'> & {
  payments: Payment[];
  history: { id: string; fromStatus?: string | null; toStatus: string; actorId?: string | null; comment?: string | null; createdAt: string }[];
  warranty?: { id: string; startDate: string; endDate: string; terms?: string | null } | null;
  actorNames: Record<string, string>;
  totalPaid: string; balance: string;
};
export type Me = { id: string; firstName: string; lastName?: string | null; login: string; organizationId: string; mustChangePassword: boolean; permissions: string[]; role: 'OWNER' | 'STAFF' | null; roles: string[]; support?: boolean };
export type Staff = { id: string; login: string; firstName: string; lastName?: string | null; phone: string; email?: string | null; status: string; mustChangePassword: boolean; createdAt: string; roles: { role: { name: string; systemKey?: string | null } }[] };
export type Dashboard = {
  statuses: { status: string; count: number }[]; todayReceived: number;
  recent: (Pick<Order, 'id' | 'number' | 'status' | 'total' | 'createdAt'> & { customer: { firstName: string; phone: string }; device: { brand: string; model: string } })[];
  todayCash: string; monthCash: string; debt: string; revenueByDay: { day: string; revenue: string }[];
};
export type Defaults = { warrantyTerms: string; expenseCategories: string[]; receiptWidth: 58 | 80 };

/** What was paid on an order: payments minus refunds. */
export function paidOf(payments: Pick<Payment, 'kind' | 'amount'>[]) {
  return payments.reduce((s, p) => s + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount), 0);
}
export const can = (me: Me | undefined, permission: string) => !!me?.permissions.includes(permission);

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
export const useOrders = (status = '', enabled = true) => useQuery({ queryKey: ['orders', 'list', status], queryFn: () => api<Order[]>('/orders' + (status ? '?status=' + status : '')), enabled });
export const useOrder = (id: string) => useQuery({ queryKey: ['orders', id], queryFn: () => api<OrderDetail>('/orders/' + id), enabled: !!id });
export const useDashboard = (enabled = true) => useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/reports/dashboard'), enabled });
export const useDefaults = () => useQuery({ queryKey: ['defaults'], queryFn: () => api<Defaults>('/settings/defaults'), staleTime: 300_000 });
export const useStaff = () => useQuery({ queryKey: ['staff'], queryFn: () => api<Staff[]>('/staff') });
export const usePaymentMethods = () => useQuery({ queryKey: ['payment-methods'], queryFn: () => api<{ key: string; label: string }[]>('/settings/payment-methods'), staleTime: 300_000 });

/** Mutation that refreshes every order view afterwards (list, detail, dashboard). */
export function useOrderMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['orders'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['customers'] })]),
  });
}
export const post = (path: string, body: unknown, method = 'POST') => api(path, { method, body: JSON.stringify(body) });
