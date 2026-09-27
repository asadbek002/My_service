-- Simplified product: two roles (OWNER, STAFF) with the same business permissions.
-- ADMIN / MANAGER / TECHNICIAN members move to STAFF; removed features lose their permissions.

-- 1. Permission catalogue for the simplified product.
INSERT INTO "Permission" ("id", "key")
SELECT gen_random_uuid()::text, k FROM unnest(ARRAY[
  'orders.view','orders.create','orders.edit','orders.change_status',
  'customers.view','customers.edit',
  'payments.view','payments.create','payments.refund','payments.deliver_with_debt',
  'reports.view','reports.finance','expenses.manage',
  'staff.view','staff.manage','settings.manage'
]) AS k
ON CONFLICT ("key") DO NOTHING;

-- 2. A STAFF role in every organization.
INSERT INTO "Role" ("id", "organizationId", "name", "systemKey", "createdAt")
SELECT gen_random_uuid()::text, o."id", 'STAFF', 'STAFF', now()
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."organizationId" = o."id" AND r."systemKey" = 'STAFF');

-- 3. Move members of the old staff roles to STAFF.
INSERT INTO "UserRole" ("organizationId", "userId", "roleId")
SELECT ur."organizationId", ur."userId", s."id"
FROM "UserRole" ur
JOIN "Role" old ON old."id" = ur."roleId" AND old."systemKey" IN ('ADMIN','MANAGER','TECHNICIAN')
JOIN "Role" s ON s."organizationId" = ur."organizationId" AND s."systemKey" = 'STAFF'
ON CONFLICT DO NOTHING;
DELETE FROM "Role" WHERE "systemKey" IN ('ADMIN','MANAGER','TECHNICIAN');

-- 4. OWNER and STAFF get exactly the simplified permission set.
DELETE FROM "RolePermission" rp USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id" AND r."systemKey" IN ('OWNER','STAFF')
  AND p."key" NOT IN ('orders.view','orders.create','orders.edit','orders.change_status','customers.view','customers.edit',
    'payments.view','payments.create','payments.refund','payments.deliver_with_debt','reports.view','reports.finance',
    'expenses.manage','staff.view','staff.manage','settings.manage');
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."systemKey" IN ('OWNER','STAFF')
  AND p."key" IN ('orders.view','orders.create','orders.edit','orders.change_status','customers.view','customers.edit',
    'payments.view','payments.create','payments.refund','payments.deliver_with_debt','reports.view','reports.finance',
    'expenses.manage','staff.view','staff.manage','settings.manage')
ON CONFLICT DO NOTHING;

-- 5. Every member belongs to every branch of their organization (branch choice is gone from the UI).
INSERT INTO "UserBranch" ("organizationId", "userId", "branchId")
SELECT u."organizationId", u."id", b."id" FROM "User" u JOIN "Branch" b ON b."organizationId" = u."organizationId"
ON CONFLICT DO NOTHING;

-- 6. Orders in removed intermediate states continue in the simplified flow.
UPDATE "Order" SET "status" = 'RECEIVED' WHERE "status" IN ('DIAGNOSING','WAITING_CUSTOMER_APPROVAL');
UPDATE "Order" SET "status" = 'IN_REPAIR' WHERE "status" = 'WAITING_PART';
UPDATE "Order" SET "status" = 'CANCELLED' WHERE "status" = 'UNREPAIRABLE';
