-- Newest orders first (order lists, dashboard) and today's / this month's cash, without scanning a service's whole history.
CREATE INDEX "Order_organizationId_createdAt_idx" ON "Order"("organizationId", "createdAt");
CREATE INDEX "Payment_organizationId_createdAt_idx" ON "Payment"("organizationId", "createdAt");
