ALTER TABLE "Supplier" ADD COLUMN "telegram" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "address" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "supplierId" TEXT;
CREATE UNIQUE INDEX "Supplier_organizationId_id_key" ON "Supplier"("organizationId", "id");
CREATE INDEX "InventoryMovement_organizationId_supplierId_idx" ON "InventoryMovement"("organizationId", "supplierId");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_organizationId_supplierId_fkey" FOREIGN KEY ("organizationId", "supplierId") REFERENCES "Supplier"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
