-- Plans become editable from the platform console: yearly price, monthly SMS, description,
-- hide from new services, display order. Platform-wide billing settings live in PlatformSetting.
ALTER TABLE "Plan" ADD COLUMN "yearlyPrice" DECIMAL(18,2);
ALTER TABLE "Plan" ADD COLUMN "smsPerMonth" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "description" TEXT;
ALTER TABLE "Plan" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "PlatformSetting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
