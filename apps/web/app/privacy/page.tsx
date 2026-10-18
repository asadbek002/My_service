'use client';

import { LegalPage, useLegal } from '../../components/legal-page';

/** Privacy policy: what MyService keeps, why, where, and for how long. */
export default function Privacy() {
  const v = useLegal();
  return (
    <LegalPage title="Maxfiylik siyosati" updated="19.10.2026">
      <p>Ushbu siyosat {v('company', 'KOMPANIYA NOMI')} MyService dasturida qaysi shaxsiy ma&apos;lumotlarni qanday maqsadda qayta ishlashini tushuntiradi. U O&apos;zbekiston Respublikasining «Shaxsga doir ma&apos;lumotlar to&apos;g&apos;risida»gi qonuniga muvofiq tuzilgan.</p>

      <h2>1. Qanday ma&apos;lumotlar</h2>
      <ul>
        <li><b>Ustaxona va xodimlar:</b> ism, telefon raqami, login, parol (faqat shifrlangan ko&apos;rinishda), ish faoliyati (qabul, to&apos;lovlar) jurnali.</li>
        <li><b>Ustaxona mijozlari:</b> ism, telefon raqami, qurilma, nosozlik, narx va to&apos;lovlar, kafolat; Telegram orqali ulanganda — Telegram chat identifikatori.</li>
        <li><b>Texnik ma&apos;lumotlar:</b> kirish vaqti va IP manzil (xavfsizlik uchun).</li>
      </ul>
      <p>Mijoz ma&apos;lumotlarini ustaxona kiritadi va ular uchun ustaxona javobgar; MyService ularni ustaxona nomidan, faqat xizmat ko&apos;rsatish uchun saqlaydi.</p>

      <h2>2. Maqsad</h2>
      <ul>
        <li>Dastur ishlashi: buyurtmalar, cheklar, hisobotlar.</li>
        <li>Mijozga qurilma holati haqida xabar (Telegram yoki SMS).</li>
        <li>Akkauntni himoya qilish, telefonni tasdiqlash, parolni tiklash.</li>
        <li>Yordam bo&apos;limi murojaatlariga javob berish.</li>
      </ul>
      <p>Ma&apos;lumotlar reklama uchun sotilmaydi va uchinchi shaxslarga berilmaydi, quyidagi xizmatlardan tashqari.</p>

      <h2>3. Uchinchi tomon xizmatlari</h2>
      <ul>
        <li><b>Telegram</b> — mijoz va xodimlarga bot orqali xabar yuborish.</li>
        <li><b>Eskiz.uz</b> — SMS yuborish (telefon raqami va xabar matni).</li>
        <li><b>Click, Payme</b> — obuna to&apos;lovlari (karta ma&apos;lumotlari MyService&apos;da saqlanmaydi).</li>
      </ul>

      <h2>4. Saqlash joyi va muddati</h2>
      <p>Ma&apos;lumotlar quyidagi serverlarda saqlanadi: {v('dataLocation', 'SERVER JOYLASHUVI')}. Ular har kuni zaxiralanadi. Ustaxona akkaunti faol bo&apos;lgan davrda va yopilgandan keyin qonun talab qilgan muddat davomida saqlanadi, so&apos;ng o&apos;chiriladi.</p>

      <h2>5. Himoya</h2>
      <p>Ulanish shifrlangan (HTTPS). Parollar qaytarib bo&apos;lmaydigan ko&apos;rinishda saqlanadi; bot tokenlari va SMS akkaunt parollari shifrlab saqlanadi. Har bir ustaxona faqat o&apos;z ma&apos;lumotlarini ko&apos;radi. Platforma xodimlari ustaxonaga faqat yordam so&apos;ralganda kiradi va bu jurnalga yoziladi.</p>

      <h2>6. Sizning huquqlaringiz</h2>
      <p>Siz o&apos;zingiz haqidagi ma&apos;lumotni ko&apos;rish, tuzatish yoki o&apos;chirishni so&apos;rashingiz mumkin. Mijoz bo&apos;lsangiz, avval ma&apos;lumotni kiritgan ustaxonaga murojaat qiling; Telegram xabarlarini /stop buyrug&apos;i bilan o&apos;chirasiz.</p>

      <h2>7. Aloqa</h2>
      <ul>
        <li>{v('company', 'KOMPANIYA NOMI')}, {v('address', 'YURIDIK MANZIL')}</li>
        <li>Telefon: {v('phone', 'TELEFON')} · Email: {v('email', 'EMAIL')}</li>
      </ul>
    </LegalPage>
  );
}
