-- The platform turns SMS through its Eskiz account on or off per service and can cap it per month.
ALTER TABLE "Organization" ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "smsMonthlyCap" INTEGER;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_smsMonthlyCap_check" CHECK ("smsMonthlyCap" IS NULL OR "smsMonthlyCap" >= 0);
