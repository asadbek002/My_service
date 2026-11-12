/** The home page text (Uzbek; Russian comes from lib/i18n), also used by /llms.txt. */

// What the program changes in daily work: how it is done today, and how it is done with MyService.
export const BEFORE_AFTER: [string, string, string][] = [
  ['Qurilmani qabul qilish', "Ma'lumotlar daftarga yoziladi, qog'oz kvitansiya yo'qolib qoladi.", "Mijoz telefon raqami bo'yicha topiladi. Qabul cheki chop etiladi yoki Telegram orqali yuboriladi."],
  ['Mijozni xabardor qilish', "Mijozlar «qurilmam tayyormi?» deb qayta-qayta qo'ng'iroq qiladi.", "Qurilma tayyor bo'lgach, mijozga avtomatik SMS yoki Telegram xabar yuboriladi. Ta'mir holatini mijoz havola orqali o'zi ko'radi."],
  ['Muddat nazorati', "Olib ketilmagan qurilmalar oylab turib qoladi.", "Har bir qurilma ustaxonada necha kundan beri turgani ko'rinadi. 5 kundan oshganlari alohida belgilanadi."],
  ['Qarzlar', "Kim qancha qarzdorligini eslab qolish qiyin.", "Qarzga berilgan buyurtmalar alohida ro'yxatda. Har bir mijoz bo'yicha PDF hisobot olinadi."],
  ['Kassa va hisobot', "Kun oxirida pul qo'lda sanaladi.", "Tushum, xarajat va foyda avtomatik hisoblanadi. Kunlik hisobot har kuni Telegramga keladi."],
  ['Xodimlar', "Kim qaysi ishni qilgani noma'lum.", "Har bir xodim o'z login va paroli bilan ishlaydi. Barcha amallar tarixda saqlanadi."],
];

// An order's four stages, in the colours the app gives each status.
export const PATH: [string, string, string][] = [
  ['Qabul', 'bg-st-qabul', "Mijoz, qurilma, nosozlik va narx kiritiladi. Mijozga QR kodli chek beriladi."],
  ["Ta'mir", 'bg-st-tamir', "Usta ishni boshlaydi. Ishlatilgan ehtiyot qismlar va ularning narxi yozib boriladi."],
  ['Tayyor', 'bg-st-tayyor', "Bitta tugma bosiladi — mijozga avtomatik xabar yuboriladi."],
  ['Topshirildi', 'bg-mute', "To'lov qabul qilinadi (to'liq yoki qarzga) va kafolat muddati belgilanadi."],
];

export const FAQ: [string, string][] = [
  ["MyService qanday dastur va kimlar uchun?", "MyService — O'zbekistondagi telefon, noutbuk, planshet va maishiy texnika ta'mirlash ustaxonalari va servis markazlari uchun onlayn dastur (CRM). Qurilma qabuli va chek, ta'mir holati, mijozga SMS va Telegram xabar, to'lov, qarz, kafolat va hisobotni bitta joyda yuritadi. O'zbek va rus tilida ishlaydi."],
  ["Narxi qancha?", "Birinchi 30 kun bepul, bank kartasi kerak emas. Keyin ustaxona hajmiga qarab oylik tarif tanlanadi; narxlar shu sahifadagi «Narxlar» bo'limida. Yillik to'lovda 2 oy bepul."],
  ["Mijozga xabar qanday boradi?", "Qurilma «Tayyor» qilinganda mijozga avtomatik xabar ketadi: Telegram botga ulangan bo'lsa Telegramga, bo'lmasa SMS. Xabarda buyurtma holatini ko'rish havolasi bo'ladi."],
  ['Kompyuter shartmi?', "Yo'q. Dastur telefon, planshet va kompyuterda ishlaydi. Barcha qurilmalarda ma'lumotlar bir xil."],
  ['Chek printeri shartmi?', "Shart emas. Printer bo'lsa, chek 58 yoki 80 mm termoprinterda chop etiladi. Printer bo'lmasa, chek rasm ko'rinishida mijozning Telegramiga yuboriladi."],
  ['Xodimlarim ham foydalana oladimi?', "Ha. Har bir xodimga alohida login va parol beriladi. Kim qaysi ishni bajargani tarixda ko'rinadi."],
  ['Sinov muddati tugagach nima bo‘ladi?', "Mos tarifni tanlab, to'lovni amalga oshirasiz. To'lov qilinmasa ham ma'lumotlaringiz o'chirilmaydi: bir necha kundan so'ng dastur faqat ko'rish rejimiga o'tadi."],
  ["Ma'lumotlarim xavfsizmi?", "Har bir ustaxona faqat o'z ma'lumotlarini ko'radi. Ma'lumotlarning zaxira nusxasi har kuni olinadi."],
];


