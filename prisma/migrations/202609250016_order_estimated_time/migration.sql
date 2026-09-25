-- Diagnosis estimate shown to the customer ("1 kun", "2-3 soat").
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "estimatedTime" TEXT;
