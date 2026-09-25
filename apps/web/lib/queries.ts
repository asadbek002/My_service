import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob, uploadAttachment } from './api';
import { clean } from './utils';

// Types
export type Order = {
  id: string;
  number: string;
  status: string;
  total: string;
  complaint?: string;
  requiredWork?: string;
  diagnosis?: string;
  quoteVersion?: number;
  accessories?: string[];
  customer: { id: string; firstName: string; lastName?: string | null; phone: string; telegramChatId?: string; telegramUsername?: string };
  device: { brand: string; model: string; imei?: string; serial?: string; passcode?: string; appearance?: string };
  assignments?: { userId: string; user?: { firstName: string; lastName?: string }; task?: string }[];
  costs?: any[];
  checklist?: Record<string, boolean>;
  attachments?: any[];
  history?: any[];
  worklogs?: any[];
  payments?: any[];
  [key: string]: any;
};
export type Customer = { id: string; firstName: string; lastName?: string; phone: string; telegramUsername?: string; telegramChatId?: string; notificationPreference: string };
export type Branch = { id: string; name: string };
export type Me = { id: string; firstName: string; lastName?: string | null; login: string; mustChangePassword: boolean; permissions: string[]; organizationId?: string; role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | null; roles: string[]; branchIds?: string[] };
export type Staff = { id: string; login: string; firstName: string; lastName?: string | null; phone: string; status: string; roles: { role: { name: string; systemKey?: string } }[]; branches: { branch: { id: string; name: string } }[] };
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
export const useDashboard = (enabled = true) => useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashReport>('/reports/dashboard'), enabled });
export const useNotifications = () => useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications') });
export const useWarranties = () => useQuery({ queryKey: ['warranties'], queryFn: () => api<Warranty[]>('/warranties') });
export const useStaffActivity = (id: string) => useQuery({ queryKey: ['staff', id, 'activity'], queryFn: () => api<{ action: string; createdAt: string; entityId?: string }[]>('/staff/' + id + '/activity'), enabled: !!id });
export const useStaffActive = (id: string, days = 5) => useQuery({ queryKey: ['staff', id, 'active', days], queryFn: () => api<{ active: boolean; auditEvents: number; orderEvents: number }>('/staff/' + id + '/active?days=' + days), enabled: !!id });

// Mutations
export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: Record<string, unknown>) => api<Customer>('/customers', { method: 'POST', body: JSON.stringify(clean(data, ['firstName', 'lastName', 'phone', 'telegramUsername', 'notificationPreference', 'notes'])) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) });
}
export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, photos }: { data: unknown; photos: File[] }) => {
      const order = await api<{ id: string }>('/orders', { method: 'POST', body: JSON.stringify(data) });
      // The order already exists at this point: a failed photo must not look like a failed order,
      // otherwise the operator submits again and creates a duplicate.
      const kinds = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'DAMAGE', 'OTHER'] as const;
      let failedPhotos = 0;
      for (let i = 0; i < photos.length; i++) {
        const f = photos[i];
        if (!f) continue;
        try { await uploadAttachment(order.id, f, kinds[Math.min(i, 5)] ?? 'OTHER'); } catch { failedPhotos++; }
      }
      return { ...order, failedPhotos };
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
