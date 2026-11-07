import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Send } from 'lucide-react';
import { Mark } from '../components/layout/mark';
import { HeroTalon } from '../components/landing/hero-talon';
import { Pricing } from '../components/landing/pricing';
import { supportUrl } from '../lib/support';

export const metadata: Metadata = {
  title: "MyService — ta'mir ustaxonasi uchun dastur",
  description: "Telefon, noutbuk va texnika ta'miri ustaxonalari uchun: qabul va chek, ta'mir holati, mijozga Telegram/SMS xabar, to'lov, qarz va hisobot. 2 oy tekin.",
};

// Someone already signed in on this device goes straight to work, before the page paints.
// The flag is set and cleared with the session (lib/api.ts); an expired session lands on /login from there.
const SIGNED_IN = "try{if(localStorage.getItem('ms_signed_in'))location.replace('/dashboard')}catch(e){}";

// What changes at the counter: each row is the paper way and the MyService way, side by side.
const BEFORE_AFTER: [string, string, string][] = [
  ['Qabul', "Daftarga yozasiz, qog'oz talon yo'qoladi.", "Telefon raqamini yozasiz: eski mijoz o'zi topiladi, chek chiqadi yoki Telegramga ketadi."],
  ["«Tayyormi?»", "Mijoz kuniga necha marta qo'ng'iroq qiladi.", "Tayyor bo'lganda mijozga Telegram yoki SMS o'zi boradi, holatini havoladan ko'radi."],
  ['Javondagi qurilmalar', 'Olib ketilmagan telefonlar oylab yotadi.', "Lineyka har qurilma necha kundan beri turganini ko'rsatadi, 5 kundan oshsa sariq yonadi."],
  ['Qarz', 'Kim qancha qarzligi xotirada qoladi.', "«Qarzga berilgan» alohida ro'yxatda, mijoz bo'yicha PDF bilan."],
  ['Kassa', 'Kun oxirida pulni sanab, daftarni solishtirasiz.', "Tushum, xarajat va foyda hisobotda; har kuni 20:00 da Telegramingizga keladi."],
  ['Xodimlar', "Kim nima qilgani noma'lum.", "Har bir usta o'z loginida ishlaydi, har bir amal tarixda yoziladi."],
];

// A device's real path through the shop, in the colours the app gives each status.
const PATH: [string, string, string][] = [
  ['Qabul', 'bg-st-qabul', "Mijoz, qurilma, nosozlik va narx. Chek QR kodi bilan."],
  ["Ta'mir", 'bg-st-tamir', "Zapchast qaysi do'kondan, qanchaga olingani buyurtmaga yoziladi."],
  ['Tayyor', 'bg-st-tayyor', "Bir tugma: mijozga xabar ketadi."],
  ['Berildi', 'bg-mute', "To'lov (to'liq yoki qarzga) va kafolat muddati."],
];

const FAQ: [string, string][] = [
  ['Kompyuter kerakmi?', "Yo'q, telefonning o'zi yetadi. Kompyuter yoki planshetda ham ishlaydi, hammasi bir xil ma'lumot bilan."],
  ['Chek printeri kerakmi?', "Bo'lsa, 58 yoki 80 mm termoprinterga chiqaradi. Bo'lmasa, chekni rasm qilib mijozning Telegramiga yuborasiz."],
  ['Sinov muddati tugagach nima bo‘ladi?', "Tarifni o'zingiz tanlaysiz. Tanlamasangiz, ma'lumotlar o'chmaydi: bir necha kundan keyin faqat ko'rish rejimiga o'tadi."],
  ["Ma'lumotlarim xavfsizmi?", "Har bir ustaxona faqat o'z ma'lumotini ko'radi. Har kuni zaxira nusxa olinadi."],
];

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN }} />
      <div className="mat on-ink text-white">
        <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:h-20 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5"><Mark /><span className="text-sm font-bold tracking-[0.14em]">MY SERVICE</span></Link>
          <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <a href="#narxlar" className="hidden rounded-md px-3 py-2 text-white/70 hover:text-white sm:block">Narxlar</a>
            <Link href="/login" className="rounded-md px-3 py-2 font-semibold hover:bg-white/10">Kirish</Link>
            <Link href="/signup" className="hidden h-10 items-center rounded-md bg-brand px-4 font-semibold text-ink hover:bg-brand-strong sm:flex">Tekin boshlash</Link>
          </nav>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-14">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">Telefon, noutbuk va texnika ta&apos;miri ustaxonalari uchun</p>
            <h1 className="mt-4 text-[2.4rem] font-bold leading-[1.02] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              Qog&apos;oz talon o&apos;rniga — <span className="text-brand">butun ustaxona</span> telefoningizda.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 lg:text-lg">
              Qurilmani bir daqiqada qabul qiling, chek bering, ta&apos;mir qayerdaligini bir qarashda ko&apos;ring. Tayyor bo&apos;lganda mijozga xabar o&apos;zi boradi.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-base font-semibold text-ink hover:bg-brand-strong">Tekin boshlash <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="flex h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-base font-semibold hover:bg-white/10">Akkauntim bor — kirish</Link>
            </div>
            <p className="mt-4 text-[13px] text-white/55">Karta kerak emas. Telefon raqamingiz bilan bir daqiqada ochiladi.</p>
          </div>
          <div className="pb-6 lg:pb-0"><HeroTalon /></div>
        </section>
      </div>

      <main className="bg-paper text-ink">
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight lg:text-4xl">Peshtaxtada nima o&apos;zgaradi</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
            <div className="hidden grid-cols-[11rem_1fr_1fr] border-b bg-paper/60 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-mute md:grid">
              <span /><span>Daftar bilan</span><span className="text-ink">MyService bilan</span>
            </div>
            <ul className="divide-y">
              {BEFORE_AFTER.map(([topic, before, after]) => (
                <li key={topic} className="grid gap-1.5 px-5 py-4 md:grid-cols-[11rem_1fr_1fr] md:gap-6">
                  <p className="font-bold">{topic}</p>
                  <p className="text-sm text-mute line-through decoration-mute/40">{before}</p>
                  <p className="text-sm font-medium">{after}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
            <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">Bitta qurilmaning yo&apos;li</h2>
            <p className="mt-2 max-w-xl text-mute">Har bir holatning o&apos;z rangi bor — ilovada ham, lineykada ham shu ranglar.</p>
            <ol className="mt-10 grid gap-8 md:grid-cols-4 md:gap-5">
              {PATH.map(([title, color, text], i) => (
                <li key={title}>
                  <span className={`block h-1.5 rounded-full ${color}`} />
                  <p className="mt-4 font-mono text-[11px] text-mute">{i + 1}-qadam</p>
                  <p className="mt-1 text-xl font-bold">{title}</p>
                  <p className="mt-1.5 text-sm text-mute">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="narxlar" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 lg:px-8 lg:py-24">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">Narxlar</h2>
          <div className="mt-6"><Pricing /></div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight">Ko&apos;p so&apos;raladi</h2>
          <div className="mt-5 divide-y overflow-hidden rounded-2xl border bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{q}<span className="text-mute transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm text-mute">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mat on-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <p className="max-w-xl text-2xl font-bold leading-tight tracking-tight lg:text-3xl">Birinchi qurilmani bugunoq qabul qiling.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="flex h-12 items-center justify-center rounded-lg bg-brand px-6 font-semibold text-ink hover:bg-brand-strong">Tekin boshlash</Link>
              <a href={supportUrl("Salom! MyService haqida savolim bor.")} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-lg border border-white/25 px-6 font-semibold hover:bg-white/10"><Send className="h-4 w-4" /> Savol berish</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[13px] text-mute sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} MyService</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/terms" className="hover:text-ink hover:underline">Ommaviy oferta</Link>
            <Link href="/privacy" className="hover:text-ink hover:underline">Maxfiylik siyosati</Link>
            <a href={supportUrl()} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline">Telegram: @{supportUrl().split('/').pop()}</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
