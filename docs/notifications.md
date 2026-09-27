# Notifications

Enable NOTIFICATIONS_ENABLED only after configuring production providers. With it false the worker does not send messages; outbox records remain pending.

BullMQ dispatches committed outbox events. Jobs retry five times with exponential backoff. Persist Redis (AOF) and monitor failed jobs. Delivery is at least once: a process crash between a provider accepting a message and the database update can duplicate Telegram messages. SMS adapters must honor the Idempotency-Key header.

Telegram:
- Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET in deployment secrets.
- Register /api/telegram/webhook with Telegram setWebhook using secret_token equal to TELEGRAM_WEBHOOK_SECRET.
- Staff generate one-time Telegram connection links from an order.
- Only a private chat with matching sender/chat IDs can redeem the link.
- Permanent Telegram rejection uses SMS fallback; temporary errors retry.
- SENT means provider accepted, not that the customer read the message.

SMS:
- The initial adapter is a configurable HTTPS webhook contract, not an assumed Click/Payme/SMS provider API.
- Set SMS_PROVIDER=webhook, SMS_API_URL and SMS_API_KEY.
- Request: POST, Bearer token, Idempotency-Key, JSON {to,message,reference}.
- Response: 2xx JSON {id}. Adapt this interface to your chosen provider before enabling.
- Missing credentials produce FAILED/SMS_NOT_CONFIGURED, never false success.

Tracking tokens are separate from Telegram-link tokens, are stored only as hashes, expire after 90 days and expose no phone number or customer name. The only customer message is ORDER_READY (Telegram first, SMS fallback).

References: [Telegram Bot API](https://core.telegram.org/bots/api), [BullMQ connections](https://docs.bullmq.io/guide/connections).
