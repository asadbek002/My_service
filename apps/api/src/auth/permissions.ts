// Simplified product: OWNER and STAFF share every business permission.
// Keep in sync with prisma/migrations/202609270017_simple_roles and scripts/seed.cjs.
export const ALL_PERMISSIONS = [
  'orders.view', 'orders.create', 'orders.edit', 'orders.change_status',
  'customers.view', 'customers.edit',
  'payments.view', 'payments.create', 'payments.refund', 'payments.deliver_with_debt',
  'reports.view', 'reports.finance', 'expenses.manage',
  'staff.view', 'staff.manage', 'settings.manage',
] as const;
export const ROLE_KEYS = ['OWNER', 'STAFF'] as const;
