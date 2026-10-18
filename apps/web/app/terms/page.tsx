'use client';

import Link from 'next/link';
import { LegalPage, useLegal } from '../../components/legal-page';

/** Public offer for the MyService subscription. Company details come from the platform console. */
export default function Terms() {
  const v = useLegal();
  return (
    <LegalPage title="Ommaviy oferta" updated="19.10.2026">
      <p>Ushbu hujjat {v('company', 'KOMPANIYA NOMI')} (keyingi o&apos;rinlarda — «Ijrochi») tomonidan MyService dasturidan foydalanish bo&apos;yicha har qanday shaxsga (keyingi o&apos;rinlarda — «Foydalanuvchi») qilingan ommaviy taklifdir. Ro&apos;yxatdan o&apos;tish va «Ustaxonani ochish» tugmasini bosish ushbu shartlarni to&apos;liq qabul qilish (aksept) hisoblanadi.</p>

      <h2>1. Xizmat</h2>
      <p>Ijrochi Foydalanuvchiga internet orqali ta&apos;mirlash ustaxonasini yuritish dasturiga kirish huquqini beradi: buyurtmalarni qabul qilish, to&apos;lov va qarzlarni hisobga olish, chek va hisobotlar, mijozlarga Telegram va SMS orqali xabar yuborish va boshqa imkoniyatlar. Imkoniyatlar va cheklovlar tanlangan tarifga bog&apos;liq.</p>

      <h2>2. Ro&apos;yxatdan o&apos;tish va akkaunt</h2>
      <ul>
        <li>Foydalanuvchi o&apos;z telefon raqamini tasdiqlab ro&apos;yxatdan o&apos;tadi. Bitta telefon raqamiga bitta ustaxona ochiladi.</li>
        <li>Login va parolni sir saqlash, xodimlarga beriladigan ruxsatlar uchun Foydalanuvchi javobgar.</li>
        <li>Kiritilgan ma&apos;lumotlar (ustaxona nomi, telefon, manzil) to&apos;g&apos;ri bo&apos;lishi kerak.</li>
      </ul>

      <h2>3. Sinov muddati, tariflar va to&apos;lov</h2>
      <ul>
        <li>Yangi ustaxonaga tekin sinov muddati beriladi; uning davomiyligi ro&apos;yxatdan o&apos;tish sahifasida ko&apos;rsatiladi.</li>
        <li>Sinov tugagach, xizmat Foydalanuvchi tanlagan tarif bo&apos;yicha oldindan to&apos;lanadi (oylik yoki yillik). Amaldagi narxlar ilovaning «Hisobim» bo&apos;limida ko&apos;rsatiladi.</li>
        <li>Tarifdagi SMS limitidan ortiq yuborilgan SMS lar «Hisobim»da ko&apos;rsatilgan narxda keyingi to&apos;lovga qo&apos;shiladi. O&apos;z Eskiz akkaunti ulangan bo&apos;lsa, SMS puli to&apos;g&apos;ridan-to&apos;g&apos;ri u yerdan yechiladi.</li>
        <li>To&apos;lov muddati o&apos;tsa, ma&apos;lumotlar o&apos;chirilmaydi: imtiyozli kunlardan so&apos;ng dastur faqat ko&apos;rish rejimida ishlaydi.</li>
        <li>Ijrochi narxlarni o&apos;zgartirishi mumkin; yangi narx keyingi to&apos;lov davridan boshlab qo&apos;llanadi.</li>
      </ul>

      <h2>4. Foydalanuvchi majburiyatlari</h2>
      <ul>
        <li>Dasturdan qonunga zid maqsadda, reklama spami yoki boshqalarning huquqlarini buzish uchun foydalanmaslik.</li>
        <li>Mijozlarining shaxsiy ma&apos;lumotlarini kiritish va ularga xabar yuborish uchun zarur roziliklarni olish.</li>
        <li>Dasturni buzishga, boshqa ustaxonalar ma&apos;lumotiga kirishga urinmaslik.</li>
      </ul>

      <h2>5. Ma&apos;lumotlar</h2>
      <p>Foydalanuvchi kiritgan ma&apos;lumotlar Foydalanuvchiga tegishli. Ijrochi ularni faqat xizmat ko&apos;rsatish uchun ishlatadi va <Link href="/privacy" className="underline">Maxfiylik siyosati</Link>ga muvofiq himoya qiladi. Ma&apos;lumotlar har kuni zaxiralanadi.</p>

      <h2>6. Javobgarlik</h2>
      <ul>
        <li>Ijrochi xizmatning uzluksiz ishlashi uchun oqilona choralar ko&apos;radi, ammo internet, Telegram, SMS provayderi va boshqa uchinchi tomonlardagi uzilishlar uchun javob bermaydi.</li>
        <li>Ijrochining javobgarligi Foydalanuvchi oxirgi oy uchun to&apos;lagan summadan oshmaydi.</li>
      </ul>

      <h2>7. Xizmatni to&apos;xtatish</h2>
      <p>Ushbu shartlar buzilganda Ijrochi akkauntni vaqtincha to&apos;xtatishi mumkin; bunda Foydalanuvchi sababni ko&apos;radi va yordam bo&apos;limiga murojaat qila oladi. Foydalanuvchi xohlagan vaqtda xizmatdan foydalanishni to&apos;xtatishi va o&apos;z ma&apos;lumotlarini o&apos;chirishni so&apos;rashi mumkin.</p>

      <h2>8. Shartlarning o&apos;zgarishi</h2>
      <p>Ijrochi ushbu shartlarni o&apos;zgartirishi mumkin. Muhim o&apos;zgarishlar haqida ilova ichida oldindan e&apos;lon qilinadi.</p>

      <h2>9. Ijrochi rekvizitlari</h2>
      <ul>
        <li>{v('company', 'KOMPANIYA NOMI')}</li>
        <li>STIR: {v('inn', 'STIR')}</li>
        <li>Manzil: {v('address', 'YURIDIK MANZIL')}</li>
        <li>Telefon: {v('phone', 'TELEFON')} · Email: {v('email', 'EMAIL')}</li>
      </ul>
    </LegalPage>
  );
}
