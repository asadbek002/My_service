import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Database } from '../database';
import { esc, fmtDate, som, STATUS_LABEL, tashkentDay, TelegramClient, type Keyboard } from './telegram.client';

type Message = {
  text?: string; chat?: { id?: number; type?: string }; from?: { id?: number; first_name?: string };
  contact?: { phone_number?: string; user_id?: number };
};
export type Update = { update_id?: number; message?: Message };
export type AlertKind = 'newOrder' | 'ready' | 'daily';

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
/** +998901234567 → +998 90 123 45 67 */
const prettyPhone = (p: string) => p.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, '+998 $1 $2 $3 $4');
const OPEN = ['RECEIVED', 'IN_REPAIR', 'READY'];

// Reply-keyboard buttons: the text of the button is what the bot receives back.
export const BTN = {
  myOrders: '📦 Buyurtmalarim', warranty: '🛡 Kafolatlarim', contact: "☎️ Servis bilan bog'lanish", help: 'ℹ️ Yordam',
  share: '📱 Telefon raqamni yuborish',
  today: '📊 Bugungi hisobot', ready: '✅ Tayyor qurilmalar', search: '🔎 Qidirish',
  platform: '📈 Platforma',
  tg: '✈️ Telegram', ig: '📷 Instagram', addr: '📍 Manzil', call: '📞 Qo\'ng\'iroq',
};
const customerKeyboard: Keyboard = { keyboard: [[{ text: BTN.myOrders }, { text: BTN.warranty }], [{ text: BTN.tg }, { text: BTN.ig }], [{ text: BTN.addr }, { text: BTN.call }], [{ text: BTN.help }]], resize_keyboard: true };
// Before sharing a phone the contact button still works: anyone may reach the service.
const shareKeyboard: Keyboard = { keyboard: [[{ text: BTN.share, request_contact: true }], [{ text: BTN.tg }, { text: BTN.ig }], [{ text: BTN.addr }, { text: BTN.call }], [{ text: BTN.help }]], resize_keyboard: true };
const staffKeyboard = (admin: boolean): Keyboard => ({
  keyboard: [[{ text: BTN.today }, { text: BTN.ready }], [{ text: BTN.search }, { text: BTN.myOrders }], ...(admin ? [[{ text: BTN.platform }]] : [])],
  resize_keyboard: true,
});
const adminKeyboard: Keyboard = { keyboard: [[{ text: BTN.platform }], [{ text: BTN.myOrders }, { text: BTN.help }]], resize_keyboard: true };

/**
 * One platform bot for everyone:
 * - customers connect by sharing their phone (or an order link) and see their orders and warranties in every service;
 * - staff connect from Settings and get alerts, the daily report, ready devices and order search;
 * - platform admins connect from the platform console and get platform numbers.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger('Bot');
  constructor(private readonly db: Database, readonly telegram: TelegramClient) {}

  // ---------- Linking ----------

  /** One-time deep link for a staff member (kind USER) or platform admin (kind ADMIN); valid 1 day. */
  async connectLink(kind: 'USER' | 'ADMIN' | 'ALERT', targetId: string, label?: string) {
    const raw = randomBytes(32).toString('base64url');
    await this.db.telegramLink.create({ data: { kind, targetId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 86400000), ...(label ? { label } : {}) } });
    return this.telegram.deepLink({ USER: 'u_', ADMIN: 'a_', ALERT: 'g_' }[kind] + raw);
  }

  private async who(chatId: string) {
    const [users, admin, customers] = await Promise.all([
      this.db.user.findMany({ where: { telegramChatId: chatId, status: 'ACTIVE' }, include: { organization: true } }),
      this.db.platformAdmin.findFirst({ where: { telegramChatId: chatId, active: true } }),
      this.db.customer.count({ where: { telegramChatId: chatId } }),
    ]);
    return { users, admin, customers };
  }
  private async menu(chatId: string): Promise<Keyboard> {
    const w = await this.who(chatId);
    if (w.users.length) return staffKeyboard(!!w.admin);
    if (w.admin) return adminKeyboard;
    return w.customers ? customerKeyboard : shareKeyboard;
  }

  // ---------- Updates ----------

  async handle(update: Update) {
    const m = update.message;
    // Private chats only, and only messages the sender wrote themselves.
    if (!m || m.chat?.type !== 'private' || typeof m.chat.id !== 'number' || m.chat.id !== m.from?.id) return;
    const chatId = String(m.chat.id);
    try {
      if (m.contact) return await this.onContact(chatId, m);
      const text = (m.text ?? '').trim();
      if (!text) return;
      const start = /^\/start(?:\s+(\S+))?$/.exec(text);
      if (start) return await this.onStart(chatId, start[1], m.from?.first_name);
      if (text === '/stop') return await this.onStop(chatId);
      if (text === BTN.myOrders || text === '/orders') return await this.send(chatId, await this.customerOrders(chatId));
      if (text === BTN.warranty || text === '/warranty') return await this.send(chatId, await this.customerWarranties(chatId));
      if (text === BTN.contact) return await this.sendServices(chatId);
      if (text === BTN.tg) return await this.sendContactItem(chatId, 'tg');
      if (text === BTN.ig) return await this.sendContactItem(chatId, 'ig');
      if (text === BTN.addr) return await this.sendContactItem(chatId, 'addr');
      if (text === BTN.call) return await this.sendContactItem(chatId, 'call');
      if (text === BTN.help || text === '/help') return await this.send(chatId, await this.help(chatId));
      const w = await this.who(chatId);
      if (text === BTN.platform || text === '/stats') return await this.send(chatId, w.admin ? await this.platformSummary() : 'Bu bo‘lim faqat platforma egasi uchun.');
      if (w.users.length) {
        const user = w.users[0]!;
        if (text === BTN.today || text === '/today') return await this.send(chatId, await this.dailyReport(user.organizationId));
        if (text === BTN.ready) return await this.send(chatId, await this.readyList(user.organizationId));
        if (text === BTN.search) return await this.send(chatId, 'Buyurtma raqami, mijoz telefoni yoki ismini yozing. Masalan: <code>260929-001</code> yoki <code>901234567</code>');
        return await this.send(chatId, await this.search(user.organizationId, text));
      }
      return await this.send(chatId, w.customers ? 'Quyidagi tugmalardan birini tanlang.' : 'Buyurtmalaringizni ko‘rish uchun telefon raqamingizni yuboring.');
    } catch (error) {
      this.logger.error('Update failed: ' + (error instanceof Error ? error.message : 'unknown'));
      await this.telegram.send(chatId, 'Xatolik yuz berdi. Birozdan keyin qayta urinib ko‘ring.');
    }
  }

  private async send(chatId: string, text: string) {
    await this.telegram.send(chatId, text, await this.menu(chatId));
  }

  private async onStart(chatId: string, payload: string | undefined, name?: string) {
    if (payload && /^[uag]_[A-Za-z0-9_-]{43}$/.test(payload)) {
      const kind = ({ u: 'USER', a: 'ADMIN', g: 'ALERT' } as const)[payload[0] as 'u' | 'a' | 'g'];
      const link = await this.db.telegramLink.findUnique({ where: { tokenHash: hash(payload.slice(2)) } });
      const used = link && link.kind === kind && link.expiresAt > new Date()
        ? await this.db.telegramLink.updateMany({ where: { id: link.id, consumedAt: null }, data: { consumedAt: new Date() } }) : { count: 0 };
      if (!link || !used.count) return this.send(chatId, 'Havola eskirgan yoki ishlatilgan. Yangisini oling.');
      if (kind === 'USER') {
        const user = await this.db.user.update({ where: { id: link.targetId }, data: { telegramChatId: chatId }, include: { organization: true } });
        await this.db.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: 'TELEGRAM_LINKED', entityId: user.id } });
        return this.send(chatId, `✅ <b>${esc(user.organization.name)}</b> servisiga ulandingiz, ${esc(user.firstName)}.\n\nYangi buyurtma va tayyor qurilmalar haqida xabar olasiz, har kuni 20:00 da kunlik hisobot keladi. Buyurtma raqami yoki mijoz telefonini yozsangiz — topib beraman.`);
      }
      if (kind === 'ALERT') {
        // An extra chat for this service's order alerts (no staff account behind it).
        const org = await this.db.organization.findUniqueOrThrow({ where: { id: link.targetId } });
        const label = link.label || 'Telegram';
        await this.db.alertChat.upsert({ where: { organizationId_chatId: { organizationId: org.id, chatId } }, create: { organizationId: org.id, chatId, label }, update: { label } });
        await this.db.auditLog.create({ data: { organizationId: org.id, action: 'ALERT_CHAT_LINKED', entityId: chatId } });
        return this.telegram.send(chatId, `✅ <b>${esc(org.name)}</b> buyurtma xabarlariga ulandingiz (${esc(label)}).\n\nYangi qabul, tayyor qurilmalar va kunlik hisobot shu yerga keladi. O‘chirish: /stop`);
      }
      await this.db.platformAdmin.update({ where: { id: link.targetId }, data: { telegramChatId: chatId } });
      return this.send(chatId, '✅ Platforma boshqaruviga ulandingiz. Yangi servislar va obunalar haqida xabar olasiz.');
    }
    if (payload && /^[A-Za-z0-9_-]{43}$/.test(payload)) {
      // Order link printed/shared by the service: connects this chat to that customer.
      const linked = await this.db.$transaction(async tx => {
        const link = await tx.customerLink.findUnique({ where: { tokenHash: hash(payload) } });
        if (!link || link.purpose !== 'TELEGRAM' || link.expiresAt <= new Date()) return null;
        const used = await tx.customerLink.updateMany({ where: { id: link.id, consumedAt: null }, data: { consumedAt: new Date() } });
        if (!used.count) return null;
        const order = await tx.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId }, include: { organization: true } });
        if (!order) return null;
        await tx.customer.update({ where: { organizationId_id: { organizationId: link.organizationId, id: order.customerId } }, data: { telegramChatId: chatId } });
        await tx.auditLog.create({ data: { organizationId: link.organizationId, action: 'TELEGRAM_LINKED', entityId: order.customerId } });
        return order;
      });
      if (linked) return this.send(chatId, `✅ <b>${esc(linked.organization.name)}</b> ga ulandingiz. Qurilmangiz tayyor bo‘lganda shu yerga xabar keladi.\n\n` + await this.customerOrders(chatId));
      return this.send(chatId, 'Havola eskirgan yoki ishlatilgan. Telefon raqamingizni yuborib ulaning.');
    }
    const w = await this.who(chatId);
    if (w.users.length || w.admin || w.customers) return this.send(chatId, `Assalomu alaykum${name ? ', ' + esc(name) : ''}! Quyidagi tugmalardan foydalaning.`);
    return this.telegram.send(chatId,
      `Assalomu alaykum${name ? ', ' + esc(name) : ''}! 👋\n\nBu <b>MyService</b> boti: qurilmangiz ta'mirini kuzatish, kafolat va servis bilan aloqa uchun.\n\nBoshlash uchun pastdagi tugma orqali telefon raqamingizni yuboring — servisda ro'yxatdan o'tgan raqam bo'yicha buyurtmalaringizni topaman.`,
      shareKeyboard);
  }

  private async onContact(chatId: string, m: Message) {
    // Only the sender's own contact proves the number; a forwarded card does not.
    if (!m.contact?.phone_number || m.contact.user_id !== m.from?.id) return this.telegram.send(chatId, 'Iltimos, o‘zingizning raqamingizni pastdagi tugma orqali yuboring.', shareKeyboard);
    const phone = '+' + m.contact.phone_number.replace(/\D/g, '');
    const found = await this.db.customer.updateMany({ where: { phone }, data: { telegramChatId: chatId } });
    if (!found.count) {
      return this.telegram.send(chatId, `Bu raqam (${esc(phone)}) bo'yicha buyurtma topilmadi. Servisga qurilma topshirganingizda shu raqamni ayting — keyin bu yerda ko'rinadi.`, customerKeyboard);
    }
    const customers = await this.db.customer.findMany({ where: { phone }, select: { organizationId: true, id: true } });
    await this.db.auditLog.createMany({ data: customers.map(c => ({ organizationId: c.organizationId, action: 'TELEGRAM_LINKED', entityId: c.id })) });
    return this.send(chatId, '✅ Raqamingiz tasdiqlandi.\n\n' + await this.customerOrders(chatId));
  }

  private async onStop(chatId: string) {
    await Promise.all([
      this.db.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } }),
      this.db.customer.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } }),
      this.db.platformAdmin.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } }),
      this.db.alertChat.deleteMany({ where: { chatId } }),
    ]);
    return this.telegram.send(chatId, 'Bot o‘chirildi: endi xabar kelmaydi. Qayta ulash uchun /start bosing.', { remove_keyboard: true });
  }

  // ---------- Customer views ----------

  async customerOrders(chatId: string) {
    const customers = await this.db.customer.findMany({ where: { telegramChatId: chatId }, select: { id: true } });
    if (!customers.length) return 'Buyurtmalaringizni ko‘rish uchun telefon raqamingizni yuboring.';
    const orders = await this.db.order.findMany({
      where: { customerId: { in: customers.map(c => c.id) }, status: { not: 'CANCELLED' } },
      include: { device: true, organization: true, payments: { select: { kind: true, amount: true } } },
      orderBy: { createdAt: 'desc' }, take: 10,
    });
    if (!orders.length) return 'Hozircha buyurtma yo‘q.';
    orders.sort((x, y) => Number(OPEN.includes(y.status)) - Number(OPEN.includes(x.status)));
    return '<b>Buyurtmalaringiz</b>\n\n' + orders.map(o => {
      const paid = o.payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
      const due = o.total.minus(paid);
      return `<b>${esc(o.number)}</b> · ${esc(o.organization.name)}\n${esc(o.device.brand + ' ' + o.device.model)} — <b>${STATUS_LABEL[o.status] ?? o.status}</b>\nNarx: ${som(o.total)}${due.greaterThan(0) ? ' · To‘lash kerak: ' + som(due) : ''}`;
    }).join('\n\n');
  }

  async customerWarranties(chatId: string) {
    const customers = await this.db.customer.findMany({ where: { telegramChatId: chatId }, select: { id: true } });
    if (!customers.length) return 'Avval telefon raqamingizni yuboring.';
    const list = await this.db.warranty.findMany({
      where: { endDate: { gt: new Date() }, order: { customerId: { in: customers.map(c => c.id) } } },
      include: { order: { include: { device: true, organization: true } } }, orderBy: { endDate: 'asc' },
    });
    if (!list.length) return 'Amaldagi kafolat yo‘q.';
    return '<b>Kafolatlaringiz</b>\n\n' + list.map(w => `🛡 ${esc(w.order.device.brand + ' ' + w.order.device.model)} · ${esc(w.order.organization.name)}\n<b>${fmtDate(w.endDate)}</b> gacha (${esc(w.order.number)})`).join('\n\n');
  }

  /**
   * "Servis bilan bog'lanish": every service this customer has, with what the service entered in
   * Settings (name, phone, address, Telegram, Instagram). Without a saved phone the owner's number
   * is used, so the customer can always call. Each service also gets a tappable contact card.
   */
  /**
   * Which services to show under "contact": the customer's own; for staff, their service; for anyone
   * else (new visitors) the services that published bot contacts, or every active service.
   */
  private async contactServices(chatId: string): Promise<string[]> {
    const own = await this.db.customer.findMany({ where: { telegramChatId: chatId }, select: { organizationId: true } });
    if (own.length) return [...new Set(own.map(c => c.organizationId))];
    const staff = await this.db.user.findMany({ where: { telegramChatId: chatId, status: 'ACTIVE' }, select: { organizationId: true } });
    if (staff.length) return [...new Set(staff.map(u => u.organizationId))];
    const now = new Date();
    const active = { subscription: { is: { status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: now } } } };
    const orgs = (await this.db.organization.findMany({ where: active, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 50 })).map(o => o.id);
    const published = new Set((await this.db.organizationSetting.findMany({ where: { key: 'bot_contact', organizationId: { in: orgs } }, select: { organizationId: true } })).map(x => x.organizationId));
    return (published.size ? orgs.filter(id => published.has(id)) : orgs).slice(0, 10);
  }

  private async sendContactItem(chatId: string, item: 'tg' | 'ig' | 'addr' | 'call') {
    const orgIds = await this.contactServices(chatId);
    if (!orgIds.length) return this.send(chatId, 'Servis ma\'lumotlari topilmadi.');
    const [orgs, settings, owners] = await Promise.all([
      this.db.organization.findMany({ where: { id: { in: orgIds } } }),
      this.db.organizationSetting.findMany({ where: { key: { in: ['general', 'receipt', 'bot_contact'] }, organizationId: { in: orgIds } } }),
      this.db.user.findMany({ where: { organizationId: { in: orgIds }, status: 'ACTIVE', roles: { some: { role: { systemKey: 'OWNER' } } } }, select: { organizationId: true, phone: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const handle = (v: string) => v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(t\.me|instagram\.com)\//, '').replace(/\/.*$/, '');
    const menu = await this.menu(chatId);
    for (const orgId of orgIds) {
      const org = orgs.find(o => o.id === orgId)!;
      const value = (key: string) => (settings.find(x => x.organizationId === orgId && x.key === key)?.value ?? {}) as Record<string, unknown>;
      const g = value('general'), r = value('receipt');
      const b = settings.some(x => x.organizationId === orgId && x.key === 'bot_contact') ? value('bot_contact') : null;
      const pick = (field: string, fallback: string) => b && typeof b[field] === 'string' ? text(b[field]) : fallback;
      const name = pick('name', text(g.name)) || org.name;
      const phone = pick('phone', text(g.phone) || owners.find(o => o.organizationId === orgId)?.phone || '');
      const address = pick('address', text(g.address));
      const mapUrl = pick('mapUrl', '');
      const telegram = handle(pick('telegram', typeof r.telegram === 'string' ? r.telegram.trim() : '@myserviceuzz'));
      const instagram = handle(pick('instagram', typeof r.instagram === 'string' ? r.instagram.trim() : 'myserviceuz'));
      const map = /^https?:\/\/\S+$/.test(mapUrl) ? mapUrl : address ? 'https://yandex.uz/maps/?text=' + encodeURIComponent(address) : '';
      if (item === 'tg') {
        if (!telegram) { await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>\nTelegram kiritilmagan.`, menu); continue; }
        await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>`, { inline_keyboard: [[{ text: '✈️ Telegram kanalga o\'tish', url: `https://t.me/${telegram}` }]] });
      } else if (item === 'ig') {
        if (!instagram) { await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>\nInstagram kiritilmagan.`, menu); continue; }
        await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>`, { inline_keyboard: [[{ text: '📷 Instagramga o\'tish', url: `https://instagram.com/${instagram}` }]] });
      } else if (item === 'addr') {
        if (!map) { await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>\n📍 ${esc(address) || 'Manzil kiritilmagan.'}`, menu); continue; }
        await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>\n📍 ${esc(address)}`, { inline_keyboard: [[{ text: '🗺 Xaritada ochish', url: map }]] });
      } else if (item === 'call') {
        if (!phone) { await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>\nTelefon kiritilmagan.`, menu); continue; }
        // Telegram rejects tel: links in buttons; the contact card is the one-tap call.
        await this.telegram.send(chatId, `🛠 <b>${esc(name)}</b>\n📞 ${esc(prettyPhone(phone))}`);
        await this.telegram.sendContact(chatId, phone, name);
      }
    }
    if (orgIds.length) await this.telegram.send(chatId, '↩️', menu);
  }

  private async sendServices(chatId: string) {
    const orgIds = await this.contactServices(chatId);
    if (!orgIds.length) return this.send(chatId, 'Servis ma’lumotlari hali kiritilmagan.');
    const organizations = await this.db.organization.findMany({ where: { id: { in: orgIds } } });
    const [settings, owners] = await Promise.all([
      this.db.organizationSetting.findMany({ where: { key: { in: ['general', 'receipt', 'bot_contact'] }, organizationId: { in: orgIds } } }),
      this.db.user.findMany({ where: { organizationId: { in: orgIds }, status: 'ACTIVE', roles: { some: { role: { systemKey: 'OWNER' } } } }, select: { organizationId: true, phone: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const handle = (v: string) => v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(t\.me|instagram\.com)\//, '').replace(/\/.*$/, '');
    for (const orgId of orgIds) {
      const org = organizations.find(o => o.id === orgId)!;
      const value = (key: string) => (settings.find(x => x.organizationId === orgId && x.key === key)?.value ?? {}) as Record<string, unknown>;
      const g = value('general'), r = value('receipt');
      // Settings → "Telegram bot: bog'lanish" wins field by field once saved (an empty field hides
      // that line); before it is saved, the receipt details and the owner's phone are used.
      const b = settings.some(x => x.organizationId === orgId && x.key === 'bot_contact') ? value('bot_contact') : null;
      const pick = (field: string, fallback: string) => b && typeof b[field] === 'string' ? text(b[field]) : fallback;
      const name = pick('name', text(g.name)) || text(g.name) || org.name;
      const phone = pick('phone', text(g.phone) || owners.find(o => o.organizationId === orgId)?.phone || '');
      const phone2 = pick('phone2', '');
      const address = pick('address', text(g.address));
      const landmark = pick('landmark', '');
      const hours = pick('hours', '');
      const note = pick('note', '');
      const mapUrl = pick('mapUrl', '');
      // Same handles as on the printed receipt unless set here (unset → MyService's own, empty → hidden).
      const telegram = handle(pick('telegram', typeof r.telegram === 'string' ? r.telegram.trim() : '@myserviceuzz'));
      const instagram = handle(pick('instagram', typeof r.instagram === 'string' ? r.instagram.trim() : 'myserviceuz'));
      const lines = [`🛠 <b>${esc(name)}</b>`];
      if (phone) lines.push(`📞 ${esc(prettyPhone(phone))}`);
      if (phone2) lines.push(`📞 ${esc(prettyPhone(phone2))}`);
      if (address) lines.push(`📍 ${esc(address)}`);
      if (landmark) lines.push(`🧭 Mo'ljal: ${esc(landmark)}`);
      if (hours) lines.push(`🕘 Ish vaqti: ${esc(hours)}`);
      if (telegram) lines.push(`✈️ Telegram: @${esc(telegram)}`);
      if (instagram) lines.push(`📷 Instagram: ${esc(instagram)}`);
      if (note) lines.push('', esc(note));
      if (!phone && !address) lines.push('Aloqa ma’lumotlari hali kiritilmagan.');
      const map = /^https?:\/\/\S+$/.test(mapUrl) ? mapUrl : address ? 'https://yandex.uz/maps/?text=' + encodeURIComponent(address) : '';
      // Only http(s) links are valid in inline buttons; calling is the contact card sent below.
      const buttons = [
        ...(telegram ? [{ text: '✈️ Telegram', url: `https://t.me/${telegram}` }] : []),
        ...(instagram ? [{ text: '📷 Instagram', url: `https://instagram.com/${instagram}` }] : []),
        ...(map ? [{ text: '📍 Manzil', url: map }] : []),
      ];
      await this.telegram.send(chatId, lines.join('\n'), buttons.length ? { inline_keyboard: [buttons] } : await this.menu(chatId));
      if (phone) await this.telegram.sendContact(chatId, phone, name);
    }
    if (orgIds.length) await this.telegram.send(chatId, 'Bosh menyu:', await this.menu(chatId));
  }


  private async help(chatId: string) {
    const w = await this.who(chatId);
    if (w.users.length) return `<b>Xodim uchun</b>\n${BTN.today} — bugungi kassa va buyurtmalar\n${BTN.ready} — olib ketilmagan qurilmalar\nRaqam, telefon yoki ism yozing — buyurtmani topaman\n/stop — botni o‘chirish`;
    return `${BTN.myOrders} — ta’mirdagi va oldingi qurilmalaringiz\n${BTN.warranty} — kafolat muddati\n${BTN.tg} / ${BTN.ig} — servis ijtimoiy tarmoqlari\n${BTN.addr} — manzil va xarita\n${BTN.call} — qo’ng’iroq qilish\n/stop — xabarlarni o’chirish`;
  }

  // ---------- Staff views ----------

  async dailyReport(organizationId: string, title = 'Bugungi hisobot') {
    const day = tashkentDay(), start = new Date(day + 'T00:00:00+05:00');
    const [org, received, delivered, payments, expenses, open, debtRows, shopDebt] = await Promise.all([
      this.db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.db.order.count({ where: { organizationId, createdAt: { gte: start } } }),
      // Orders still delivered: an undone delivery (or one redone after undo) is counted once at most.
      this.db.order.count({ where: { organizationId, status: 'DELIVERED', history: { some: { toStatus: 'DELIVERED', createdAt: { gte: start } } } } }),
      this.db.payment.findMany({ where: { organizationId, createdAt: { gte: start } }, select: { kind: true, amount: true } }),
      this.db.expense.aggregate({ where: { organizationId, createdAt: { gte: start }, category: { not: 'PURCHASE' } }, _sum: { amount: true } }),
      this.db.order.groupBy({ by: ['status'], where: { organizationId, status: { in: OPEN } }, _count: true }),
      this.db.order.findMany({ where: { organizationId, status: 'DELIVERED' }, select: { total: true, payments: { select: { kind: true, amount: true } } } }),
      this.db.sourcedPart.aggregate({ where: { organizationId, status: 'TAKEN' }, _sum: { cost: true } }),
    ]);
    const cash = payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
    const debt = debtRows.reduce((s, o) => {
      const left = o.total.minus(o.payments.reduce((x, p) => p.kind === 'REFUND' ? x.minus(p.amount) : x.plus(p.amount), new Prisma.Decimal(0)));
      return left.greaterThan(0) ? s.plus(left) : s;
    }, new Prisma.Decimal(0));
    const count = (s: string) => open.find(g => g.status === s)?._count ?? 0;
    return `<b>${esc(org.name)} · ${title}</b> (${fmtDate(start)})\n\n`
      + `📥 Qabul qilindi: <b>${received}</b>\n📤 Berildi: <b>${delivered}</b>\n💰 Kassa: <b>${som(cash)}</b>\n💸 Xarajat: ${som(expenses._sum.amount ?? 0)}\n\n`
      + `Hozir: navbatda ${count('RECEIVED')} · ta'mirda ${count('IN_REPAIR')} · tayyor ${count('READY')}\n`
      + (debt.greaterThan(0) ? `🧾 Mijozlar qarzi: ${som(debt)}\n` : '')
      + (shopDebt._sum.cost && shopDebt._sum.cost.greaterThan(0) ? `🔧 Do‘konlarga zapchast qarzi: ${som(shopDebt._sum.cost)}\n` : '');
  }

  private async readyList(organizationId: string) {
    const orders = await this.db.order.findMany({ where: { organizationId, status: 'READY' }, include: { customer: true, device: true }, orderBy: { updatedAt: 'asc' }, take: 20 });
    if (!orders.length) return 'Tayyor turgan qurilma yo‘q.';
    return `<b>Olib ketilmagan (${orders.length})</b>\n\n` + orders.map(o => `${esc(o.number)} · ${esc(o.device.brand + ' ' + o.device.model)}\n${esc(o.customer.firstName)} ${esc(o.customer.phone)}`).join('\n\n');
  }

  private async search(organizationId: string, text: string) {
    const q = text.slice(0, 100);
    if (q.length < 3) return 'Kamida 3 belgi yozing.';
    const digits = q.replace(/\D/g, '');
    const orders = await this.db.order.findMany({
      where: { organizationId, OR: [
        { number: { contains: q, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits.slice(-9) } } }] : []),
        { customer: { firstName: { contains: q, mode: 'insensitive' } } },
        { device: { model: { contains: q, mode: 'insensitive' } } },
      ] },
      include: { customer: true, device: true, payments: { select: { kind: true, amount: true } } }, orderBy: { createdAt: 'desc' }, take: 8,
    });
    if (!orders.length) return `"${esc(q)}" bo‘yicha hech narsa topilmadi.`;
    const web = process.env.WEB_URL;
    return orders.map(o => {
      const paid = o.payments.reduce((s, p) => p.kind === 'REFUND' ? s.minus(p.amount) : s.plus(p.amount), new Prisma.Decimal(0));
      return `<b>${esc(o.number)}</b> — ${STATUS_LABEL[o.status] ?? o.status}\n${esc(o.device.brand + ' ' + o.device.model)} · ${esc(o.customer.firstName)} ${esc(o.customer.phone)}\n${som(o.total)} · to‘langan ${som(paid)}` + (web ? `\n${web}/orders/${o.id}` : '');
    }).join('\n\n');
  }

  // ---------- Platform ----------

  async platformSummary() {
    const now = new Date(), day = new Date(tashkentDay() + 'T00:00:00+05:00'), soon = new Date(Date.now() + 7 * 86400000);
    const [orgs, active, trials, ordersToday, failed, expiring] = await Promise.all([
      this.db.organization.count(),
      this.db.subscription.count({ where: { status: 'ACTIVE', expiresAt: { gt: now } } }),
      this.db.subscription.count({ where: { status: 'TRIAL', expiresAt: { gt: now } } }),
      this.db.order.count({ where: { createdAt: { gte: day } } }),
      this.db.notification.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      this.db.subscription.findMany({ where: { expiresAt: { gt: now, lte: soon }, status: { in: ['ACTIVE', 'TRIAL'] } }, include: { organization: true }, orderBy: { expiresAt: 'asc' } }),
    ]);
    return `<b>MyService platforma</b>\n\nServislar: <b>${orgs}</b> (faol ${active}, sinov ${trials})\nBugungi buyurtmalar: <b>${ordersToday}</b>\nYuborilmagan xabarlar (24 soat): ${failed}\n`
      + (expiring.length ? `\n⏳ <b>Obunasi 7 kunda tugaydi:</b>\n` + expiring.map(s => `${esc(s.organization.name)} — ${fmtDate(s.expiresAt)}`).join('\n') : '');
  }

  // ---------- Outgoing alerts ----------

  /** Tell a service's connected staff (except whoever did it). Best effort. */
  /**
   * Order alerts for one service: staff whose alerts are on (except whoever did it) plus the extra
   * chats connected in Settings. Each kind can be switched off in Settings → "Buyurtma xabarlari".
   */
  async notifyStaff(organizationId: string, text: string, exceptUserId?: string, kind: AlertKind = 'newOrder') {
    const setting = await this.db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId, key: 'bot_alerts' } } });
    if ((setting?.value as Record<string, unknown> | undefined)?.[kind] === false) return 0;
    const [users, chats] = await Promise.all([
      this.db.user.findMany({ where: { organizationId, status: 'ACTIVE', telegramAlerts: true, telegramChatId: { not: null }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { telegramChatId: true } }),
      this.db.alertChat.findMany({ where: { organizationId }, select: { chatId: true } }),
    ]);
    const targets = [...new Set([...users.map(u => u.telegramChatId!), ...chats.map(c => c.chatId)])];
    for (const chat of targets) await this.telegram.send(chat, text);
    return targets.length;
  }

  async notifyAdmins(text: string) {
    const admins = await this.db.platformAdmin.findMany({ where: { active: true, telegramChatId: { not: null } }, select: { telegramChatId: true } });
    for (const a of admins) await this.telegram.send(a.telegramChatId!, text);
  }
}
