CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE','SUSPENDED','INVITED','ARCHIVED');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE','REVOKED','EXPIRED');

CREATE TABLE "Organization" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);

CREATE TABLE "Branch" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("organizationId","id"), UNIQUE ("organizationId","name"));

CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "login" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT, "phone" TEXT NOT NULL, "email" TEXT, "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE', "mustChangePassword" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("organizationId","id"));

CREATE TABLE "UserBranch" ("organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "branchId" TEXT NOT NULL, PRIMARY KEY ("organizationId","userId","branchId"), FOREIGN KEY ("organizationId","userId") REFERENCES "User"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY ("organizationId","branchId") REFERENCES "Branch"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE);

CREATE TABLE "Role" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "name" TEXT NOT NULL, "systemKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("organizationId","id"), UNIQUE ("organizationId","name"), UNIQUE ("organizationId","systemKey"));

CREATE TABLE "Permission" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "description" TEXT);

CREATE TABLE "UserRole" ("organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "roleId" TEXT NOT NULL, PRIMARY KEY ("organizationId","userId","roleId"), FOREIGN KEY ("organizationId","userId") REFERENCES "User"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY ("organizationId","roleId") REFERENCES "Role"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE);

CREATE TABLE "RolePermission" ("roleId" TEXT NOT NULL REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE, "permissionId" TEXT NOT NULL REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("roleId","permissionId"));

CREATE TABLE "Session" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "tokenFamilyId" TEXT NOT NULL, "refreshTokenHash" TEXT NOT NULL, "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE', "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "replacedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3));

CREATE TABLE "AuditLog" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL, "entityId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "Plan" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "maxBranches" INTEGER, "maxStaff" INTEGER, "monthlyOrders" INTEGER, "features" JSONB NOT NULL);

CREATE TABLE "Subscription" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL UNIQUE REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "planId" TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "status" TEXT NOT NULL DEFAULT 'TRIAL', "expiresAt" TIMESTAMP(3) NOT NULL, "graceUntil" TIMESTAMP(3));

CREATE INDEX "Branch_organizationId_idx" ON "Branch" ("organizationId");

CREATE INDEX "User_organizationId_status_idx" ON "User" ("organizationId", "status");

CREATE INDEX "UserBranch_organizationId_branchId_idx" ON "UserBranch" ("organizationId", "branchId");

CREATE INDEX "UserRole_organizationId_roleId_idx" ON "UserRole" ("organizationId", "roleId");

CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission" ("permissionId");

CREATE INDEX "Session_userId_status_idx" ON "Session" ("userId", "status");

CREATE INDEX "Session_tokenFamilyId_idx" ON "Session" ("tokenFamilyId");

CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog" ("organizationId", "createdAt");
