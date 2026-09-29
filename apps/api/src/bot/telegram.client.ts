import { Injectable, Logger } from '@nestjs/common';

export type Keyboard = { keyboard?: { text: string; request_contact?: boolean }[][]; resize_keyboard?: boolean; remove_keyboard?: boolean; inline_keyboard?: { text: string; url?: string; callback_data?: string }[][] };
export type TelegramResult<T = unknown> = { ok: boolean; status: number; result?: T; description?: string };

/** Thin Telegram Bot API client. Everything is a no-op (ok: false) until TELEGRAM_BOT_TOKEN is set. */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger('Telegram');

  get enabled() { return !!process.env.TELEGRAM_BOT_TOKEN; }
  get username() { return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || null; }
  /** t.me deep link that opens the bot with a /start payload. */
  deepLink(payload: string) { return this.username ? `https://t.me/${this.username}?start=${payload}` : null; }

  private url(method: string) {
    // Tests point the client at a local mock; production always talks to Telegram.
    const base = process.env.NODE_ENV === 'test' && process.env.TELEGRAM_API_URL ? process.env.TELEGRAM_API_URL : 'https://api.telegram.org/';
    return new URL('bot' + process.env.TELEGRAM_BOT_TOKEN + '/' + method, base);
  }

  async call<T = unknown>(method: string, body: Record<string, unknown> | FormData, timeoutMs = 15000): Promise<TelegramResult<T>> {
    if (!this.enabled) return { ok: false, status: 0, description: 'BOT_NOT_CONFIGURED' };
    try {
      const form = body instanceof FormData;
      const response = await fetch(this.url(method), {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        ...(form ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
      return { ok: response.ok && !!data.ok, status: response.status, ...(data.result !== undefined ? { result: data.result } : {}), ...(data.description ? { description: data.description } : {}) };
    } catch {
      // Never log the URL: it contains the bot token.
      this.logger.warn(`Telegram ${method} unreachable`);
      return { ok: false, status: 0, description: 'UNREACHABLE' };
    }
  }

  send(chatId: string | number, text: string, keyboard?: Keyboard) {
    return this.call<{ message_id: number }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
  }

  sendPhoto(chatId: string | number, png: Buffer, caption: string) {
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
    form.set('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'chek.png');
    return this.call<{ message_id: number }>('sendPhoto', form);
  }
}

/** Escape text for Telegram's HTML parse mode. */
export const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const som = (value: { toString(): string } | number) => Math.round(Number(value.toString())).toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm";
export const STATUS_LABEL: Record<string, string> = { RECEIVED: 'Qabul qilindi', IN_REPAIR: "Ta'mirda", READY: 'Tayyor ✅', DELIVERED: 'Berildi', CANCELLED: 'Bekor qilindi' };
export const tashkentDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(d);
export const fmtDate = (d: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
