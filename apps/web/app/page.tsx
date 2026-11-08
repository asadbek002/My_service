import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, Send } from 'lucide-react';
import { Mark } from '../components/layout/mark';
import { HeroTalon } from '../components/landing/hero-talon';
import { Pricing } from '../components/landing/pricing';
import { supportUrl } from '../lib/support';

export const metadata: Metadata = {
  title: "MyService — ta'mir ustaxonasi uchun dastur",
  description: "Telefon, noutbuk va texnika ta'miri ustaxonalari uchun: qabul va chek, ta'mir holati, mijozga Telegram/SMS xabar, to'lov, qarz va hisobot. Bepul demo versiya.",
};

// Someone already signed in on this device goes straight to work, before the page paints.
// The flag is set and cleared with the session (lib/api.ts); an expired session lands on /login from there.
const SIGNED_IN = "try{if(localStorage.getItem('ms_signed_in'))location.replace('/dashboard')}catch(e){}";

// What the program changes in daily work: how it is done today, and how it is done with MyService.
const BEFORE_AFTER: [string, string, string][] = [
  ['Qurilmani qabul qilish', "Ma'lumotlar daftarga yoziladi, qog'oz kvitansiya yo'qolib qoladi.", "Mijoz telefon raqami bo'yicha topiladi. Qabul cheki chop etiladi yoki Telegram orqali yuboriladi."],
  ['Mijozni xabardor qilish', "Mijozlar «qurilmam tayyormi?» deb qayta-qayta qo'ng'iroq qiladi.", "Qurilma tayyor bo'lgach, mijozga avtomatik SMS yoki Telegram xabar yuboriladi. Ta'mir holatini mijoz havola orqali o'zi ko'radi."],
  ['Muddat nazorati', "Olib ketilmagan qurilmalar oylab turib qoladi.", "Har bir qurilma ustaxonada necha kundan beri turgani ko'rinadi. 5 kundan oshganlari alohida belgilanadi."],
  ['Qarzlar', "Kim qancha qarzdorligini eslab qolish qiyin.", "Qarzga berilgan buyurtmalar alohida ro'yxatda. Har bir mijoz bo'yicha PDF hisobot olinadi."],
  ['Kassa va hisobot', "Kun oxirida pul qo'lda sanaladi.", "Tushum, xarajat va foyda avtomatik hisoblanadi. Kunlik hisobot har kuni Telegramga keladi."],
  ['Xodimlar', "Kim qaysi ishni qilgani noma'lum.", "Har bir xodim o'z login va paroli bilan ishlaydi. Barcha amallar tarixda saqlanadi."],
];

// An order's four stages, in the colours the app gives each status.
const PATH: [string, string, string][] = [
  ['Qabul', 'bg-st-qabul', "Mijoz, qurilma, nosozlik va narx kiritiladi. Mijozga QR kodli chek beriladi."],
  ["Ta'mir", 'bg-st-tamir', "Usta ishni boshlaydi. Ishlatilgan ehtiyot qismlar va ularning narxi yozib boriladi."],
  ['Tayyor', 'bg-st-tayyor', "Bitta tugma bosiladi — mijozga avtomatik xabar yuboriladi."],
  ['Topshirildi', 'bg-mute', "To'lov qabul qilinadi (to'liq yoki qarzga) va kafolat muddati belgilanadi."],
];

const FAQ: [string, string][] = [
  ['Kompyuter shartmi?', "Yo'q. Dastur telefon, planshet va kompyuterda ishlaydi. Barcha qurilmalarda ma'lumotlar bir xil."],
  ['Chek printeri shartmi?', "Shart emas. Printer bo'lsa, chek 58 yoki 80 mm termoprinterda chop etiladi. Printer bo'lmasa, chek rasm ko'rinishida mijozning Telegramiga yuboriladi."],
  ['Xodimlarim ham foydalana oladimi?', "Ha. Har bir xodimga alohida login va parol beriladi. Kim qaysi ishni bajargani tarixda ko'rinadi."],
  ['Sinov muddati tugagach nima bo‘ladi?', "Mos tarifni tanlab, to'lovni amalga oshirasiz. To'lov qilinmasa ham ma'lumotlaringiz o'chirilmaydi: bir necha kundan so'ng dastur faqat ko'rish rejimiga o'tadi."],
  ["Ma'lumotlarim xavfsizmi?", "Har bir ustaxona faqat o'z ma'lumotlarini ko'radi. Ma'lumotlarning zaxira nusxasi har kuni olinadi."],
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
            <Link href="/signup" className="hidden h-10 items-center rounded-md bg-brand px-4 font-semibold text-ink hover:bg-brand-strong sm:flex">Demo versiya</Link>
          </nav>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-14">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">Telefon, noutbuk va maishiy texnika ta&apos;miri uchun</p>
            <h1 className="mt-4 text-[2.4rem] font-bold leading-[1.02] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              Ta&apos;mirlash ustaxonasi uchun <span className="text-brand">qulay dastur</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 lg:text-lg">
              Qurilmalarni qabul qiling, ta&apos;mir jarayonini kuzating, to&apos;lov va qarzlarni hisobga oling. Qurilma tayyor bo&apos;lganda mijozga avtomatik SMS yoki Telegram xabar yuboriladi.
            </p>
            <ul className="mt-6 grid gap-2 text-[15px] text-white/85 sm:grid-cols-3 sm:gap-4">
              {["O'zbek tilida", 'Telefon va kompyuterda', 'Bepul sinab ko‘ring'].map(t => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-brand" strokeWidth={3} />{t}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-base font-semibold text-ink hover:bg-brand-strong">Demo versiya <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="flex h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-base font-semibold hover:bg-white/10">Kirish</Link>
            </div>
            <p className="mt-4 text-[13px] text-white/55">Bank kartasi talab qilinmaydi. Ro&apos;yxatdan o&apos;tish bir daqiqa davom etadi.</p>
          </div>
          <div className="pb-6 lg:pb-0"><HeroTalon /></div>
        </section>
      </div>

      <main className="bg-paper text-ink">
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight lg:text-4xl">Dastur nima beradi</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
            <div className="hidden grid-cols-[13rem_1fr_1fr] border-b bg-paper/60 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-mute md:grid">
              <span /><span>Hozir</span><span className="text-ink">MyService bilan</span>
            </div>
            <ul className="divide-y">
              {BEFORE_AFTER.map(([topic, before, after]) => (
                <li key={topic} className="grid gap-1.5 px-5 py-4 md:grid-cols-[13rem_1fr_1fr] md:gap-6">
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
            <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">Qanday ishlaydi</h2>
            <p className="mt-2 max-w-xl text-mute">Har bir buyurtma to&apos;rt bosqichdan o&apos;tadi. Dasturda har bir bosqich o&apos;z rangi bilan belgilanadi.</p>
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
          <h2 className="text-2xl font-bold tracking-tight">Ko&apos;p beriladigan savollar</h2>
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
            <p className="max-w-xl text-2xl font-bold leading-tight tracking-tight lg:text-3xl">Bugunoq bepul sinab ko&apos;ring.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="flex h-12 items-center justify-center rounded-lg bg-brand px-6 font-semibold text-ink hover:bg-brand-strong">Demo versiya</Link>
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
