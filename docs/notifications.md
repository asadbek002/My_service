# Notifications

Enable NOTIFICATIONS_ENABLED only after configuring production providers. With it false the worker does not send messages; outbox records remain pending.

BullMQ dispatches committed outbox events. Jobs retry five times with exponential backoff. Persist Redis (AOF) and monitor failed jobs. Delivery is at least once: a process crash between a provider accepting a message and the database update can duplicate Telegram messages. SMS adapters must honor the Idempotency-Key header.

Telegram bot (one for the whole platform):
- Create the bot with @BotFather; set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME (without @) and TELEGRAM_WEBHOOK_SECRET; set NOTIFICATIONS_ENABLED=true.
- Platform console → Tizim → "Webhookni o'rnatish" registers WEB_URL/api/telegram/webhook with the secret, the command menu and the description. The same card shows what is missing and connects the admin's own chat.
- Only private chats where the sender is the chat are handled; every request must carry the secret header.
- Customers: /start → "share phone" button. Only the sender's own contact (contact.user_id = from.id) links; the chat is attached to that phone in every service. An order's one-time link (/start <token>) also works. Menu: my orders, warranties, service contacts, help; /stop disconnects.
- Staff: Settings → "Telegramni ulash" opens a one-time link (/start u_<token>, 1 day). They get "new order" (not their own) and "ready" alerts, a daily report at 20:00 Tashkent, ready devices, and search by number/phone/name inside their own service.
- Platform admins: console → "Telegramimni ulash" (/start a_<token>). New services, a 09:00 digest (expiring subscriptions, failed messages) and "📈 Platforma" on demand.
- Customer messages: "received" and "delivered" are Telegram-only (never SMS); "ready" falls back to SMS. Stale events after an outage are skipped.
- Receipt as a photo: the receipt page renders the receipt to PNG in the browser and POSTs it to /api/orders/:id/receipt/telegram, which sends it with sendPhoto. If the customer has no chat, the page offers the order's bot link or sharing the image to any app.
- Daily reports use a Redis key per day, so several API instances send each once.
- SENT means Telegram accepted the message, not that the customer read it.

SMS:
- The initial adapter is a configurable HTTPS webhook contract, not an assumed Click/Payme/SMS provider API.
- Set SMS_PROVIDER=webhook, SMS_API_URL and SMS_API_KEY.
- Request: POST, Bearer token, Idempotency-Key, JSON {to,message,reference}.
- Response: 2xx JSON {id}. Adapt this interface to your chosen provider before enabling.
- Missing credentials produce FAILED/SMS_NOT_CONFIGURED, never false success.

Tracking tokens are separate from Telegram-link tokens, are stored only as hashes, expire after 90 days and expose no phone number or customer name. The only customer message is ORDER_READY (Telegram first, SMS fallback).

References: [Telegram Bot API](https://core.telegram.org/bots/api), [BullMQ connections](https://docs.bullmq.io/guide/connections).
