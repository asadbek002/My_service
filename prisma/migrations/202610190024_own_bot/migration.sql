-- A customer can be connected through the service's own Telegram bot instead of the platform bot.
ALTER TABLE "Customer" ADD COLUMN "telegramBot" TEXT;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_telegramBot_check" CHECK ("telegramBot" IS NULL OR "telegramBot" = 'own');
