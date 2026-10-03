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
  CUSTOMER_NOT_ON_TELEGRAM: 'Mijoz botga ulanmagan.',
  BOT_NOT_CONFIGURED: "Telegram bot hali sozlanmagan (platforma egasi token qo'shishi kerak).",
  CUSTOMER_BLOCKED_BOT: "Mijoz botni to'xtatib qo'ygan.",
  TELEGRAM_FAILED: "Telegram javob bermadi. Birozdan keyin qayta urinib ko'ring.",
  'PNG image required': "Chek rasmini tayyorlab bo'lmadi.",
  'Shop exists': "Bu nomli do'kon allaqachon bor.",
  'Shop required': "Do'konni tanlang.",
  'Shop not found': "Do'kon topilmadi. Sahifani yangilang.",
  'Invalid date': "Sana noto'g'ri.",
  'Logo too large': "Rasm juda katta. Kichikroq rasm tanlang.",
  'PNG, JPEG or WebP image required': 'PNG, JPG yoki WebP rasm tanlang.',
  'Only the owner can change role permissions': "Ruxsatlarni faqat boshliq o'zgartiradi.",
  'Order must be DELIVERED': 'Bu buyurtma hali berilmagan. Sahifani yangilang.',
  WARRANTY_CLAIMED: "Bu buyurtma bo'yicha kafolat arizasi ochilgan, berishni bekor qilib bo'lmaydi.",
  'Reason required': 'Sababini yozing.',
  OWNER_ONLY: "Buni faqat boshliq o'zgartira oladi.",
  'Complaint required': 'Nosozlikni yozing.',
  'Positive amount required': "Summa noldan katta bo'lishi kerak.",
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
