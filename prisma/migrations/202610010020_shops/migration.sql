-- Shops the service takes parts from; parts pick a shop from this list.
CREATE TABLE "Shop" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "note" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Shop_organizationId_id_key" ON "Shop"("organizationId","id");
CREATE UNIQUE INDEX "Shop_organizationId_name_key" ON "Shop"("organizationId","name");

ALTER TABLE "SourcedPart" ADD COLUMN "shopId" TEXT;
ALTER TABLE "SourcedPart" ADD CONSTRAINT "SourcedPart_organizationId_shopId_fkey"
  FOREIGN KEY ("organizationId","shopId") REFERENCES "Shop"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SourcedPart_organizationId_shopId_idx" ON "SourcedPart"("organizationId","shopId");

-- Existing parts: one shop per distinct name, then link each part to it.
INSERT INTO "Shop" ("id","organizationId","name")
SELECT 'shop_' || md5("organizationId" || ':' || "shop"), "organizationId", "shop"
FROM (SELECT DISTINCT "organizationId", "shop" FROM "SourcedPart") s;
UPDATE "SourcedPart" p SET "shopId" = 'shop_' || md5(p."organizationId" || ':' || p."shop");
