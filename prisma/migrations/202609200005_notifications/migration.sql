ALTER TABLE "Customer" ADD COLUMN "telegramChatId" TEXT;
CREATE TABLE "CustomerLink" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "purpose" TEXT NOT NULL, "quoteVersion" INTEGER, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3));
CREATE INDEX "CustomerLink_organizationId_orderId_purpose_idx" ON "CustomerLink"("organizationId","orderId","purpose");
CREATE TABLE "Notification" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "eventId" TEXT NOT NULL UNIQUE, "type" TEXT NOT NULL, "channel" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "providerId" TEXT, "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3));
CREATE INDEX "Notification_organizationId_orderId_createdAt_idx" ON "Notification"("organizationId","orderId","createdAt");
