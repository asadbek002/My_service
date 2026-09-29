-- Telegram bot: staff and platform admins can connect their chats; customers are found by chat.
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "PlatformAdmin" ADD COLUMN "telegramChatId" TEXT;
CREATE INDEX "User_telegramChatId_idx" ON "User"("telegramChatId");
CREATE INDEX "Customer_telegramChatId_idx" ON "Customer"("telegramChatId");
CREATE TABLE "TelegramLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('USER','ADMIN')),
  "targetId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TelegramLink_tokenHash_key" ON "TelegramLink"("tokenHash");
