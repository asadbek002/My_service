import { Injectable, Logger } from '@nestjs/common';

export type Keyboard = { keyboard?: { text: string; request_contact?: boolean }[][]; resize_keyboard?: boolean; remove_keyboard?: boolean; inline_keyboard?: { text: string; url?: string; callback_data?: string }[][] };
export type TelegramResult<T = unknown> = { ok: boolean; status: number; result?: T; description?: string };

/** Thin Telegram Bot API client. Everything is a no-op (ok: false) until TELEGRAM_BOT_TOKEN is set. */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger('Telegram');

  // Values pasted into .env often carry quotes, spaces or a Windows line ending.
  private static clean(value: string | undefined) { return (value ?? '').trim().replace(/^['"]|['"]$/g, '').trim(); }
  private get token() { return TelegramClient.clean(process.env.TELEGRAM_BOT_TOKEN); }
  get enabled() { return !!this.token; }
  get username() { return TelegramClient.clean(process.env.TELEGRAM_BOT_USERNAME).replace(/^@/, '') || null; }
  /** t.me deep link that opens the bot with a /start payload. */
  deepLink(payload: string) { return this.username ? `https://t.me/${this.username}?start=${payload}` : null; }

  private url(method: string) {
    // Tests point the client at a local mock. TELEGRAM_API_BASE lets a server that cannot reach
    // api.telegram.org directly use a Bot API mirror/proxy it trusts.
    const custom = TelegramClient.clean(process.env.TELEGRAM_API_BASE);
    const base = process.env.NODE_ENV === 'test' && process.env.TELEGRAM_API_URL ? process.env.TELEGRAM_API_URL
      : /^https?:\/\/[^\s]+$/.test(custom) ? custom.replace(/\/?$/, '/') : 'https://api.telegram.org/';
    // Concatenate, never resolve: a real token has a colon ("123456:ABC..."), so "bot123456:..."
    // would be parsed as a URL scheme.
    return new URL(base.replace(/\/?$/, '/') + 'bot' + this.token + '/' + method);
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
    } catch (error) {
      // Say why (DNS, timeout, refused, TLS) so the operator can fix the network; never the URL, it holds the token.
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
      const token = this.token;
      const raw = error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT'
        : cause?.code || cause?.message || (error instanceof Error ? `${error.name}: ${error.message}` : 'ERROR');
      const reason = (token ? raw.split(token).join('***') : raw).slice(0, 200);
      this.logger.warn(`Telegram ${method} unreachable: ${reason}`);
      return { ok: false, status: 0, description: 'UNREACHABLE: ' + reason };
    }
  }

  send(chatId: string | number, text: string, keyboard?: Keyboard) {
    return this.call<{ message_id: number }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
  }

  /** A contact card: one tap on it calls the number. */
  sendContact(chatId: string | number, phone: string, firstName: string, keyboard?: Keyboard) {
    return this.call('sendContact', { chat_id: chatId, phone_number: phone, first_name: firstName.slice(0, 64), ...(keyboard ? { reply_markup: keyboard } : {}) });
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
