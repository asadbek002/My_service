export type OrganizationId = string;
export type BranchId = string;
export type UserId = string;
export type CustomerId = string;
export type DeviceId = string;
export type OrderId = string;
export type PartId = string;

export type BusinessRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'TECHNICIAN';
export type StaffStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'ARCHIVED';
export type OrderStatus =
  | 'RECEIVED'
  | 'DIAGNOSING'
  | 'WAITING_CUSTOMER_APPROVAL'
  | 'WAITING_PART'
  | 'IN_REPAIR'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'UNREPAIRABLE';

export type PaymentMethodType = 'CASH' | 'CARD' | 'CLICK' | 'PAYME' | 'TRANSFER' | 'OTHER';
export type InventoryMovementType = 'IN' | 'OUT' | 'RESERVE' | 'RELEASE' | 'USED' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';
export type CompensationType = 'SALARY' | 'PERCENTAGE' | 'FIXED_PER_JOB' | 'SALARY_PLUS_PERCENTAGE';

export interface AuthenticatedActor {
  userId: UserId;
  organizationId: OrganizationId;
  branchIds: BranchId[];
  platformAdmin: boolean;
  role?: BusinessRole;
  permissions?: string[];
}
