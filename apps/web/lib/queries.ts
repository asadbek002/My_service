import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob, uploadAttachment } from './api';

// Types
export type Order = { id: string; number: string; status: string; total: string; complaint?: string; requiredWork?: string; diagnosis?: string; quoteVersion?: number; customer: { id: string; firstName: string; phone: string; telegramChatId?: string }; device: { brand: string; model: string; imei?: string }; assignments?: { userId: string; user: { firstName: string }; task?: string }[] };
export type Customer = { id: string; firstName: string; lastName?: string; phone: string; telegramUsername?: string; telegramChatId?: string; notificationPreference: string };
export type Branch = { id: string; name: string };
export type Me = { id: string; firstName: string; login: string; mustChangePassword: boolean; permissions: string[]; organizationId?: string };
export type Staff = { id: string; login: string; firstName: string; phone: string; status: string; roles: { role: { name: string; systemKey?: string } }[]; branches: { branch: { id: string; name: string } }[] };
export type Part = { id: string; name: string; sku: string; salePrice: string; stocks: { onHand: number; reserved: number; branchId: string }[] };
export type DashReport = { todayReceived: number; todayCash?: string; debt?: string; statuses: { status: string; count: number }[]; workload: { id: string; name: string; active: number }[]; lowStock: { partId: string; name: string; branch: string; free: number; minimum: number }[]; revenueByDay?: { day: string; revenue: string }[] };
export type Notification = { id: string; type: string; status: string; channel: string; createdAt: string; sentAt?: string };
export type Warranty = { id: string; startDate: string; endDate: string; status: string; terms?: string; order: { id: string; number: string; status: string; customer: { firstName: string; phone: string }; device: { brand: string; model: string } } };

// Queries
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
export const useOrders = () => useQuery({ queryKey: ['orders'], queryFn: () => api<Order[]>('/orders') });
export const useOrder = (id: string) => useQuery({ queryKey: ['orders', id], queryFn: () => api<Order>('/orders/' + id), enabled: !!id });
export const useCustomers = () => useQuery({ queryKey: ['customers'], queryFn: () => api<Customer[]>('/customers') });
export const useCustomer = (id: string) => useQuery({ queryKey: ['customers', id], queryFn: () => api<Customer>('/customers/' + id), enabled: !!id });
export const useBranches = () => useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches') });
export const useStaff = () => useQuery({ queryKey: ['staff'], queryFn: () => api<Staff[]>('/staff') });
export const useParts = () => useQuery({ queryKey: ['parts'], queryFn: () => api<Part[]>('/inventory') });
export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashReport>('/reports/dashboard') });
export const useNotifications = () => useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications') });
export const useWarranties = () => useQuery({ queryKey: ['warranties'], queryFn: () => api<Warranty[]>('/warranties') });
export const useStaffActivity = (id: string) => useQuery({ queryKey: ['staff', id, 'activity'], queryFn: () => api<{ action: string; createdAt: string; entityId?: string }[]>('/staff/' + id + '/activity'), enabled: !!id });
export const useStaffActive = (id: string, days = 5) => useQuery({ queryKey: ['staff', id, 'active', days], queryFn: () => api<{ active: boolean; auditEvents: number; orderEvents: number }>('/staff/' + id + '/active?days=' + days), enabled: !!id });

// Mutations
export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: unknown) => api<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) });
}
export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, photos }: { data: unknown; photos: File[] }) => {
      const order = await api<{ id: string }>('/orders', { method: 'POST', body: JSON.stringify(data) });
      const kinds = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'DAMAGE', 'OTHER'] as const;
      for (let i = 0; i < photos.length; i++) { const f = photos[i]; if (f) await uploadAttachment(order.id, f, kinds[Math.min(i, 5)] ?? 'OTHER'); }
      return order;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}
export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) => api(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, comment }) }), onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['orders', v.id] }); qc.invalidateQueries({ queryKey: ['orders'] }); } });
}
export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: unknown) => api<Staff>('/staff', { method: 'POST', body: JSON.stringify(data) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }) });
}
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ orderId, data }: { orderId: string; data: unknown }) => api(`/orders/${orderId}/payments`, { method: 'POST', body: JSON.stringify(data) }), onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['orders', v.orderId] }) });
}
export function useDownloadDocument() {
  return useMutation({ mutationFn: ({ orderId, type }: { orderId: string; type: string }) => apiBlob(`/orders/${orderId}/documents/${type}`, { method: 'POST' }) });
}
