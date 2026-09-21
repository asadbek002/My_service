ALTER TABLE "Part"
  ADD COLUMN "barcode" TEXT,
  ADD COLUMN "brand" TEXT,
  ADD COLUMN "compatibleModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "storageLocation" TEXT;

CREATE UNIQUE INDEX "Part_organizationId_barcode_key"
  ON "Part"("organizationId", "barcode");
