-- Stage 2–3: platform can block a service and keep a note; the service chooses its next plan;
-- support tickets between services and the platform; platform announcements; admin 2FA.
ALTER TABLE "Organization" ADD COLUMN "blockedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "blockReason" TEXT;
ALTER TABLE "Organization" ADD COLUMN "platformNote" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "nextPlanId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "billingPeriod" TEXT NOT NULL DEFAULT 'MONTH';
ALTER TABLE "PlatformAdmin" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "PlatformAdmin" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportTicket_status_check" CHECK ("status" IN ('OPEN','ANSWERED','CLOSED'))
);
CREATE INDEX "SupportTicket_organizationId_updatedAt_idx" ON "SupportTicket"("organizationId","updatedAt");
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status","updatedAt");
CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportMessage_author_check" CHECK ("author" IN ('SERVICE','PLATFORM'))
);
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId","createdAt");
CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Announcement_level_check" CHECK ("level" IN ('INFO','WARNING'))
);
