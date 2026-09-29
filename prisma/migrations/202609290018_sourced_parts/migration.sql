-- Parts taken from nearby shops on credit, paid later or returned unused.
CREATE TABLE "SourcedPart" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "orderId" TEXT,
  "name" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "cost" DECIMAL(18,2) NOT NULL CHECK ("cost" > 0),
  "status" TEXT NOT NULL DEFAULT 'TAKEN' CHECK ("status" IN ('TAKEN','PAID','RETURNED')),
  "note" TEXT,
  "actorId" TEXT NOT NULL,
  "expenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("organizationId","orderId") REFERENCES "Order"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SourcedPart_organizationId_status_createdAt_idx" ON "SourcedPart"("organizationId","status","createdAt");
CREATE INDEX "SourcedPart_organizationId_orderId_idx" ON "SourcedPart"("organizationId","orderId");
