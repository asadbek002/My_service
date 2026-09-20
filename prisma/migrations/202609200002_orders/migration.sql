CREATE TABLE "Customer" (
"id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
"firstName" TEXT NOT NULL, "phone" TEXT NOT NULL, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
UNIQUE ("organizationId","id"), UNIQUE ("organizationId","phone"));
CREATE TABLE "Device" (
"id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
"category" TEXT NOT NULL, "brand" TEXT NOT NULL, "model" TEXT NOT NULL, "imei" TEXT, "serialNumber" TEXT, "color" TEXT,
UNIQUE ("organizationId","customerId","id"),
FOREIGN KEY ("organizationId","customerId") REFERENCES "Customer"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "Device_organizationId_imei_idx" ON "Device"("organizationId","imei");
CREATE TABLE "OrderCounter" ("organizationId" TEXT NOT NULL, "day" TEXT NOT NULL, "value" INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ("organizationId","day"));
CREATE TABLE "Order" (
"id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
"branchId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "number" TEXT NOT NULL,
"status" TEXT NOT NULL DEFAULT 'RECEIVED', "complaint" TEXT NOT NULL, "accessories" TEXT[] NOT NULL, "condition" TEXT[] NOT NULL,
"diagnosis" TEXT, "requiredWork" TEXT, "quoteVersion" INTEGER NOT NULL DEFAULT 0, "approvedVersion" INTEGER,
"approvalStatus" TEXT NOT NULL DEFAULT 'PENDING', "approvalChannel" TEXT, "approvedAt" TIMESTAMP(3),
"labor" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("labor" >= 0), "partsTotal" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("partsTotal" >= 0),
"total" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("total" >= 0), "finalTest" JSONB,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
UNIQUE ("organizationId","id"), UNIQUE ("organizationId","number"),
FOREIGN KEY ("organizationId","branchId") REFERENCES "Branch"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
FOREIGN KEY ("organizationId","customerId") REFERENCES "Customer"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
FOREIGN KEY ("organizationId","customerId","deviceId") REFERENCES "Device"("organizationId","customerId","id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "Order_organizationId_branchId_status_idx" ON "Order"("organizationId","branchId","status");
CREATE TABLE "OrderAssignment" (
"organizationId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "userId" TEXT NOT NULL, "task" TEXT NOT NULL,
PRIMARY KEY ("organizationId","orderId","userId"),
FOREIGN KEY ("organizationId","orderId") REFERENCES "Order"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
FOREIGN KEY ("organizationId","userId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE "OrderHistory" (
"id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL,
"actorId" TEXT NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY ("organizationId","orderId") REFERENCES "Order"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "OrderHistory_organizationId_orderId_createdAt_idx" ON "OrderHistory"("organizationId","orderId","createdAt");
CREATE TABLE "OutboxEvent" (
"id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "type" TEXT NOT NULL, "entityId" TEXT NOT NULL, "payload" JSONB NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "publishedAt" TIMESTAMP(3));
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt","createdAt");
