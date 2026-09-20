export type OrganizationId = string;
export type BranchId = string;
export type UserId = string;

export type BusinessRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'TECHNICIAN';
export type StaffStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'ARCHIVED';

export interface AuthenticatedActor {
  userId: UserId;
  organizationId: OrganizationId;
  branchIds: BranchId[];
  platformAdmin: boolean;
}
