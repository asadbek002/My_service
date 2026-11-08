-- Branches get their own address and phone (for receipts) and can be closed without losing history.
ALTER TABLE "Branch" ADD COLUMN "address" TEXT;
ALTER TABLE "Branch" ADD COLUMN "phone" TEXT;
ALTER TABLE "Branch" ADD COLUMN "archivedAt" TIMESTAMP(3);
