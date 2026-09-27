import { ApiError } from './api';

// Server messages are stable English codes; the operator sees what happened and what to do.
const TEXT: Record<string, string> = {
  SESSION_EXPIRED: 'Sessiya tugadi. Qaytadan kiring.',
  SUBSCRIPTION_READ_ONLY: "Obuna muddati tugagan: ma'lumotlarni faqat ko'rish mumkin.",
  MONTHLY_ORDER_LIMIT: 'Tarifdagi oylik buyurtmalar soni tugadi.',
  STAFF_LIMIT: 'Tarifdagi xodimlar soni tugadi.',
  PRICE_BELOW_PAID: "Narx to'langan summadan kam bo'lishi mumkin emas.",
  'Order closed': 'Buyurtma yopilgan, uni o‘zgartirib bo‘lmaydi.',
  'Invalid status transition': 'Bu holatga o‘tkazib bo‘lmaydi. Sahifani yangilang.',
  'Payment exceeds balance': 'Summa qoldiqdan ko‘p.',
  'Outstanding balance': 'Avval qoldiq to‘lanishi kerak.',
  'Order must be READY': 'Faqat tayyor buyurtmani berish mumkin.',
  'Customer phone already exists': 'Bu telefon raqamli mijoz allaqachon bor.',
  'Login unavailable': 'Bu login band. Boshqasini tanlang.',
  'Invalid refund amount': "Qaytariladigan summa to'lovdan ko'p.",
  'Warranty expired': 'Kafolat muddati tugagan.',
  'Only the owner can edit the owner account': "Boshliq ma'lumotlarini faqat boshliqning o'zi o'zgartiradi.",
  'Owner cannot be suspended': "Boshliqni to'xtatib bo'lmaydi.",
  'You cannot change your own status': "O'zingizni to'xtatib bo'lmaydi.",
  'Current password is incorrect': "Joriy parol noto'g'ri.",
  FORBIDDEN: "Bu amal uchun ruxsat yo'q.",
  NETWORK_ERROR: "Server bilan aloqa yo'q. Internetni tekshiring.",
};

export function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  if (TEXT[message]) return TEXT[message]!;
  if (e instanceof ApiError && e.status >= 500) return "Serverda xato. Birozdan keyin qayta urinib ko'ring.";
  if (e instanceof TypeError) return TEXT.NETWORK_ERROR!;
  return message || "Amal bajarilmadi. Qayta urinib ko'ring.";
}
