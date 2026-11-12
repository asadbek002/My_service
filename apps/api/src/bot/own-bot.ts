import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { seal, unseal } from '../common/secret-box';
import { esc, fmtDate, som, STATUS_LABEL, TelegramClient, type Keyboard } from './telegram.client';
import { serviceCards, type Update } from './bot.service';

type OwnBotSetting = { token: string; secret: string; username: string; botId: number; connectedAt: string };
const KEY = 'own_bot';
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
const OPEN = ['RECEIVED', 'IN_REPAIR', 'READY'];
const BTN = { orders: '📦 Buyurtmalarim', warranty: '🛡 Kafolatlarim', contact: "☎️ Bog'lanish", help: 'ℹ️ Yordam', share: '📱 Telefon raqamni yuborish' };
const customerKeyboard: Keyboard = { keyboard: [[{ text: BTN.orders }, { text: BTN.warranty }], [{ text: BTN.contact }, { text: BTN.help }]], resize_keyboard: true };
const shareKeyboard: Keyboard = { keyboard: [[{ text: BTN.share, request_contact: true }], [{ text: BTN.contact }, { text: BTN.help }]], resize_keyboard: true };

/**
 * A service's own Telegram bot (plan feature "own_bot"): its customers talk to @its_bot instead of the
 * platform bot. It only ever sees and answers about that one service. Staff alerts stay on the
 * platform bot.
 */
@Injectable()
export class OwnBots {
  private readonly logger = new Logger('OwnBot');
  private readonly cache = new Map<string, { client: TelegramClient | null; at: number }>();
  constructor(private readonly db: Database) {}

  private async setting(orgId: string) {
    const row = await this.db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: KEY } } });
    return row ? row.value as unknown as OwnBotSetting : null;
  }
  /** Whether the service's plan includes its own bot. */
  async allowed(orgId: string) {
    const sub = await this.db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } });
    return !!(sub?.plan.features as Record<string, unknown> | undefined)?.own_bot;
  }
  /** Client for sending through the service's bot; null when none is connected or the plan lost it. */
  async client(orgId: string): Promise<TelegramClient | null> {
    const hit = this.cache.get(orgId);
    if (hit && Date.now() - hit.at < 60_000) return hit.client;
    const s = await this.setting(orgId);
    const token = s ? unseal(s.token) : null;
    const client = token && await this.allowed(orgId) ? TelegramClient.forBot(token, s!.username) : null;
    this.cache.set(orgId, { client, at: Date.now() });
    return client;
  }
  /** t.me link for a /start payload: the service's bot when it has one, else null (use the platform bot). */
  async deepLink(orgId: string, payload: string) {
    return (await this.client(orgId))?.deepLink(payload) ?? null;
  }

  async status(orgId: string) {
    const [allowed, s] = await Promise.all([this.allowed(orgId), this.setting(orgId)]);
    if (!s) return { allowed, connected: false, username: null, webhook: null, customers: 0 };
    const token = unseal(s.token);
    const info = token ? await TelegramClient.forBot(token, s.username).call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo', {}) : null;
    const customers = await this.db.customer.count({ where: { organizationId: orgId, telegramBot: 'own', telegramChatId: { not: null } } });
    return {
      allowed, connected: true, username: s.username, connectedAt: s.connectedAt, customers,
      webhook: info?.ok ? { ok: !info.result?.last_error_message && !!info.result?.url, error: info.result?.last_error_message ?? null, pending: info.result?.pending_update_count ?? 0 } : { ok: false, error: info?.description ?? 'TOKEN_UNREADABLE', pending: 0 },
    };
  }

  /** Check the token with Telegram, point the bot's webhook at us, set its menu, store it encrypted. */
  async connect(orgId: string, rawToken: string, actorId: string) {
    if (!await this.allowed(orgId)) throw new ForbiddenException('OWN_BOT_NOT_IN_PLAN');
    const token = rawToken.trim();
    if (!/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/.test(token)) throw new BadRequestException('BOT_TOKEN_INVALID');
    if (token === (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()) throw new BadRequestException('BOT_TOKEN_INVALID');
    if (!process.env.WEB_URL) throw new ServiceUnavailableException('WEB_URL is not set');
    const probe = TelegramClient.forBot(token, null);
    const me = await probe.call<{ id: number; username?: string; is_bot?: boolean }>('getMe', {});
    if (me.status === 0) throw new ServiceUnavailableException('TELEGRAM_UNAVAILABLE');
    if (!me.ok || !me.result?.is_bot || !me.result.username) throw new BadRequestException('BOT_TOKEN_INVALID');
    const botId = me.result.id, username = me.result.username;
    const taken = await this.db.organizationSetting.findFirst({ where: { key: KEY, organizationId: { not: orgId }, value: { path: ['botId'], equals: botId } } });
    if (taken) throw new ConflictException('BOT_IN_USE');
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const secret = randomBytes(24).toString('base64url');
    const url = process.env.WEB_URL.replace(/\/$/, '') + '/api/telegram/own/' + orgId;
    const client = TelegramClient.forBot(token, username);
    const hook = await client.call('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
    if (!hook.ok) throw new BadRequestException('WEBHOOK_FAILED: ' + (hook.description ?? hook.status));
    await client.call('setMyCommands', { commands: [
      { command: 'start', description: 'Boshlash' }, { command: 'orders', description: 'Buyurtmalarim' },
      { command: 'warranty', description: 'Kafolatlarim' }, { command: 'stop', description: "Xabarlarni o'chirish" },
    ] });
    await client.call('setMyDescription', { description: `${org.name}: qurilmangiz ta'mirini kuzating — holat, narx, kafolat. Telefon raqamingizni yuboring.`.slice(0, 512) });
    const value = { token: seal(token), secret: seal(secret), username, botId, connectedAt: new Date().toISOString() } as unknown as Prisma.InputJsonObject;
    await this.db.organizationSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key: KEY } }, create: { organizationId: orgId, key: KEY, value }, update: { value } });
    await this.db.auditLog.create({ data: { organizationId: orgId, actorId, action: 'OWN_BOT_CONNECTED', entityId: String(botId), newValue: { username } } });
    this.cache.delete(orgId);
    return { username };
  }

  /** Stop using the service's bot. Its customers go back to SMS until they connect to the platform bot. */
  async disconnect(orgId: string, actorId: string) {
    const s = await this.setting(orgId);
    if (!s) return { ok: true };
    const token = unseal(s.token);
    if (token) await TelegramClient.forBot(token, s.username).call('deleteWebhook', { drop_pending_updates: true });
    await this.db.$transaction([
      this.db.organizationSetting.delete({ where: { organizationId_key: { organizationId: orgId, key: KEY } } }),
      this.db.customer.updateMany({ where: { organizationId: orgId, telegramBot: 'own' }, data: { telegramChatId: null, telegramBot: null } }),
      this.db.auditLog.create({ data: { organizationId: orgId, actorId, action: 'OWN_BOT_DISCONNECTED', entityId: String(s.botId) } }),
    ]);
    this.cache.delete(orgId);
    return { ok: true };
  }

  /** The webhook's secret header must match the one set for this service's bot. */
  async verify(orgId: string, provided: string | undefined) {
    const s = await this.setting(orgId);
    const secret = s ? unseal(s.secret) : null;
    return !!secret && !!provided && Buffer.byteLength(provided) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  }

  // ---------- Updates from the service's bot ----------

  async handle(orgId: string, update: Update) {
    const m = update.message;
    if (!m || m.chat?.type !== 'private' || typeof m.chat.id !== 'number' || m.chat.id !== m.from?.id) return;
    const client = await this.client(orgId);
    if (!client) return;
    const chatId = String(m.chat.id);
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
    try {
      if (m.contact) return await this.onContact(client, orgId, chatId, m.contact, m.from?.id);
      const text = (m.text ?? '').trim();
      const start = /^\/start(?:\s+(\S+))?$/.exec(text);
      if (start) return await this.onStart(client, orgId, org.name, chatId, start[1], m.from?.first_name);
      if (text === '/stop') {
        await this.db.customer.updateMany({ where: { organizationId: orgId, telegramChatId: chatId }, data: { telegramChatId: null, telegramBot: null } });
        return client.send(chatId, 'Xabarlar o‘chirildi. Qayta ulash uchun /start bosing.', { remove_keyboard: true });
      }
      const linked = await this.linked(orgId, chatId);
      const keyboard = linked.length ? customerKeyboard : shareKeyboard;
      if (text === BTN.orders || text === '/orders') return client.send(chatId, await this.orders(orgId, linked), keyboard);
      if (text === BTN.warranty || text === '/warranty') return client.send(chatId, await this.warranties(orgId, linked), keyboard);
      if (text === BTN.contact) {
        for (const card of await serviceCards(this.db, [orgId])) {
          await client.send(chatId, card.text, card.buttons.length ? { inline_keyboard: [card.buttons] } : keyboard);
          if (card.phone) await client.sendContact(chatId, card.phone, card.name, keyboard);
        }
        return;
      }
      if (text === BTN.help || text === '/help') return client.send(chatId, `<b>${esc(org.name)}</b> boti\n\n${BTN.orders} — ta’mirdagi qurilmalaringiz\n${BTN.warranty} — kafolat muddati\n${BTN.contact} — telefon, manzil\n/stop — xabarlarni o‘chirish`, keyboard);
      return client.send(chatId, linked.length ? 'Quyidagi tugmalardan birini tanlang.' : 'Buyurtmalaringizni ko‘rish uchun telefon raqamingizni yuboring.', keyboard);
    } catch (error) {
      this.logger.error('Own bot update failed: ' + (error instanceof Error ? error.message : 'unknown'));
      await client.send(chatId, 'Xatolik yuz berdi. Birozdan keyin qayta urinib ko‘ring.');
    }
  }

  private linked(orgId: string, chatId: string) {
    return this.db.customer.findMany({ where: { organizationId: orgId, telegramChatId: chatId, telegramBot: 'own' }, select: { id: true } });
  }

  private async onStart(client: TelegramClient, orgId: string, orgName: string, chatId: string, payload: string | undefined, name?: string) {
    if (payload && /^[A-Za-z0-9_-]{43}$/.test(payload)) {
      // Order link from the receipt: connects this chat to that customer of this service only.
      const customerId = await this.db.$transaction(async tx => {
        const link = await tx.customerLink.findUnique({ where: { tokenHash: hash(payload) } });
        if (!link || link.purpose !== 'TELEGRAM' || link.organizationId !== orgId || link.expiresAt <= new Date()) return null;
        const used = await tx.customerLink.updateMany({ where: { id: link.id, consumedAt: null }, data: { consumedAt: new Date() } });
        if (!used.count) return null;
        const order = await tx.order.findFirst({ where: { id: link.orderId, organizationId: orgId } });
        if (!order) return null;
        await tx.customer.update({ where: { organizationId_id: { organizationId: orgId, id: order.customerId } }, data: { telegramChatId: chatId, telegramBot: 'own' } });
        await tx.auditLog.create({ data: { organizationId: orgId, action: 'TELEGRAM_LINKED', entityId: order.customerId, newValue: { bot: 'own' } } });
        return order.customerId;
      });
      if (customerId) return client.send(chatId, `✅ <b>${esc(orgName)}</b> ga ulandingiz. Qurilmangiz tayyor bo‘lganda shu yerga xabar keladi.\n\n` + await this.orders(orgId, [{ id: customerId }]), customerKeyboard);
      return client.send(chatId, 'Havola eskirgan yoki ishlatilgan. Telefon raqamingizni yuborib ulaning.', shareKeyboard);
    }
    const linked = await this.linked(orgId, chatId);
    if (linked.length) return client.send(chatId, `Assalomu alaykum${name ? ', ' + esc(name) : ''}! Quyidagi tugmalardan foydalaning.`, customerKeyboard);
    return client.send(chatId, `Assalomu alaykum${name ? ', ' + esc(name) : ''}! 👋\n\n<b>${esc(orgName)}</b> boti: qurilmangiz ta’mirini kuzatish, kafolat va biz bilan aloqa.\n\nPastdagi tugma orqali telefon raqamingizni yuboring — buyurtmalaringizni topaman.`, shareKeyboard);
  }

  private async onContact(client: TelegramClient, orgId: string, chatId: string, contact: { phone_number?: string; user_id?: number }, fromId?: number) {
    if (!contact.phone_number || contact.user_id !== fromId) return client.send(chatId, 'Iltimos, o‘zingizning raqamingizni pastdagi tugma orqali yuboring.', shareKeyboard);
    const phone = '+' + contact.phone_number.replace(/\D/g, '');
    const found = await this.db.customer.updateMany({ where: { organizationId: orgId, phone }, data: { telegramChatId: chatId, telegramBot: 'own' } });
    if (!found.count) return client.send(chatId, `Bu raqam (${esc(phone)}) bo‘yicha buyurtma topilmadi. Qurilma topshirganingizda shu raqamni ayting — keyin bu yerda ko‘rinadi.`, shareKeyboard);
    await this.db.auditLog.create({ data: { organizationId: orgId, action: 'TELEGRAM_LINKED', entityId: phone, newValue: { bot: 'own' } } });
    return client.send(chatId, '✅ Raqamingiz tasdiqlandi.\n\n' + await this.orders(orgId, await this.linked(orgId, chatId)), customerKeyboard);
  }

  private async orders(orgId: string, customers: { id: string }[]) {
    if (!customers.length) return 'Buyurtmalaringizni ko‘rish uchun telefon raqamingizni yuboring.';
    const orders = await this.db.order.findMany({
      where: { organizationId: orgId, customerId: { in: customers.map(c => c.id) }, status: { not: 'CANCELLED' } },
      include: { device: true, payments: { select: { kind: true, amount: true } } }, orderBy: { createdAt: 'desc' }, take: 10,
    });
    if (!orders.length) return 'Hozircha buyurtma yo‘q.';
    orders.sort((x, y) => Number(OPEN.includes(y.status)) - Number(OPEN.includes(x.status)));
    return '<b>Buyurtmalaringiz</b>\n\n' + orders.map(o => {
      const paid = o.payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
      const due = o.total.minus(paid);
      return `<b>${esc(o.number)}</b>\n${esc(o.device.brand + ' ' + o.device.model)} — <b>${STATUS_LABEL[o.status] ?? o.status}</b>\nNarx: ${som(o.total)}${due.greaterThan(0) ? ' · To‘lash kerak: ' + som(due) : ''}`;
    }).join('\n\n');
  }
  private async warranties(orgId: string, customers: { id: string }[]) {
    if (!customers.length) return 'Avval telefon raqamingizni yuboring.';
    const list = await this.db.warranty.findMany({
      where: { endDate: { gt: new Date() }, order: { organizationId: orgId, customerId: { in: customers.map(c => c.id) } } },
      include: { order: { include: { device: true } } }, orderBy: { endDate: 'asc' },
    });
    if (!list.length) return 'Amaldagi kafolat yo‘q.';
    return '<b>Kafolatlaringiz</b>\n\n' + list.map(w => `🛡 ${esc(w.order.device.brand + ' ' + w.order.device.model)}\n<b>${fmtDate(w.endDate)}</b> gacha (${esc(w.order.number)})`).join('\n\n');
  }
}
