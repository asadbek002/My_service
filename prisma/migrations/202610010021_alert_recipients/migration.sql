-- Who receives a service's order alerts in Telegram: staff can switch their own off,
-- and extra chats (a partner, a second phone) can be connected without a staff account.
ALTER TABLE "User" ADD COLUMN "telegramAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TelegramLink" ADD COLUMN "label" TEXT;
ALTER TABLE "TelegramLink" DROP CONSTRAINT IF EXISTS "TelegramLink_kind_check";
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_kind_check" CHECK ("kind" IN ('USER','ADMIN','ALERT'));
CREATE TABLE "AlertChat" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AlertChat_organizationId_chatId_key" ON "AlertChat"("organizationId","chatId");
