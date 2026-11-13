import Link from 'next/link';
import { ArrowRight, Check, Send } from 'lucide-react';
import { Mark } from '../layout/mark';
import { HeroTalon } from './hero-talon';
import { Pricing } from './pricing';
import { LangSwitch } from '../lang-switch';
import { supportUrl } from '../../lib/support';
import { translate } from '../../lib/i18n/translate';
import type { Offer } from '../../lib/site';
import { StructuredData } from './structured-data';
import { BEFORE_AFTER, FAQ, PATH } from '../../lib/landing';

// Someone already signed in on this device goes straight to work, before the page paints.
// The flag is set and cleared with the session (lib/api.ts); an expired session lands on /login from there.
const SIGNED_IN = "try{if(localStorage.getItem('ms_signed_in'))location.replace('/dashboard')}catch(e){}";

/**
 * The home page in either language, rendered on the server so search engines and AI crawlers read
 * the whole text (and the prices, when the API answers). Russian comes from the same dictionary as
 * the app's Russian interface.
 */
export function HomePage({ lang, offer }: { lang: 'uz' | 'ru'; offer: Offer | null }) {
  const t = (s: string) => (lang === 'ru' ? translate(s) ?? s : s);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN }} />
      <StructuredData lang={lang} offer={offer} faq={FAQ.map(([q, a]) => [t(q), t(a)])} />
      <div className="mat on-ink text-white">
        <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:h-20 lg:px-8">
          <Link href={lang === 'ru' ? '/ru' : '/'} className="flex items-center gap-2.5"><Mark /><span className="text-sm font-bold tracking-[0.14em]">MY SERVICE</span></Link>
          <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <LangSwitch dark />
            <a href="#narxlar" className="hidden rounded-md px-3 py-2 text-white/70 hover:text-white sm:block">{t("Narxlar")}</a>
            <Link href="/login" className="rounded-md px-3 py-2 font-semibold hover:bg-white/10">{t("Kirish")}</Link>
            <Link href="/signup" className="hidden h-10 items-center rounded-md bg-brand px-4 font-semibold text-white hover:bg-brand-strong sm:flex">{t("Demo versiya")}</Link>
          </nav>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-14">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">{t("Telefon, noutbuk va maishiy texnika ta'miri uchun")}</p>
            <h1 className="mt-4 text-[2.4rem] font-bold leading-[1.02] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              {lang === 'ru' ? <>Удобная программа <span className="text-brand-light">для ремонтной мастерской</span></> : <>Ta&apos;mirlash ustaxonasi uchun <span className="text-brand-light">qulay dastur</span></>}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 lg:text-lg">
              {t("Qurilmalarni qabul qiling, ta'mir jarayonini kuzating, to'lov va qarzlarni hisobga oling. Qurilma tayyor bo'lganda mijozga avtomatik SMS yoki Telegram xabar yuboriladi.")}
            </p>
            <ul className="mt-6 grid gap-2 text-[15px] text-white/85 sm:grid-cols-3 sm:gap-4">
              {["O'zbek tilida", 'Telefon va kompyuterda', 'Bepul sinab ko‘ring'].map(x => (
                <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-brand-light" strokeWidth={3} />{t(x)}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-base font-semibold text-white hover:bg-brand-strong">{t("Demo versiya")} <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="flex h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-base font-semibold hover:bg-white/10">{t("Kirish")}</Link>
            </div>
            <p className="mt-4 text-[13px] text-white/55">{t("Bank kartasi talab qilinmaydi. Ro'yxatdan o'tish bir daqiqa davom etadi.")}</p>
          </div>
          <div className="pb-6 lg:pb-0"><HeroTalon /></div>
        </section>
      </div>

      <main className="bg-paper text-ink">
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight lg:text-4xl">{t("Dastur nima beradi")}</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
            <div className="hidden grid-cols-[13rem_1fr_1fr] border-b bg-paper/60 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-mute md:grid">
              <span /><span>{t("Hozir")}</span><span className="text-ink">{t("MyService bilan")}</span>
            </div>
            <ul className="divide-y">
              {BEFORE_AFTER.map(([topic, before, after]) => (
                <li key={topic} className="grid gap-1.5 px-5 py-4 md:grid-cols-[13rem_1fr_1fr] md:gap-6">
                  <p className="font-bold">{t(topic)}</p>
                  <p className="text-sm text-mute line-through decoration-mute/40">{t(before)}</p>
                  <p className="text-sm font-medium">{t(after)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
            <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">{t("Qanday ishlaydi")}</h2>
            <p className="mt-2 max-w-xl text-mute">{t("Har bir buyurtma to'rt bosqichdan o'tadi. Dasturda har bir bosqich o'z rangi bilan belgilanadi.")}</p>
            <ol className="mt-10 grid gap-8 md:grid-cols-4 md:gap-5">
              {PATH.map(([title, color, text], i) => (
                <li key={title}>
                  <span className={`block h-1.5 rounded-full ${color}`} />
                  <p className="mt-4 font-mono text-[11px] text-mute">{lang === 'ru' ? `Шаг ${i + 1}` : `${i + 1}-qadam`}</p>
                  <p className="mt-1 text-xl font-bold">{t(title)}</p>
                  <p className="mt-1.5 text-sm text-mute">{t(text)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="narxlar" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 lg:px-8 lg:py-24">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">{t("Narxlar")}</h2>
          <div className="mt-6"><Pricing initial={offer} /></div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight">{t("Ko'p beriladigan savollar")}</h2>
          <div className="mt-5 divide-y overflow-hidden rounded-2xl border bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{t(q)}<span className="text-mute transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm text-mute">{t(a)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mat on-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <p className="max-w-xl text-2xl font-bold leading-tight tracking-tight lg:text-3xl">{t("Bugunoq bepul sinab ko'ring.")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="flex h-12 items-center justify-center rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong">{t("Demo versiya")}</Link>
              <a href={supportUrl("Salom! MyService haqida savolim bor.")} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-lg border border-white/25 px-6 font-semibold hover:bg-white/10"><Send className="h-4 w-4" /> {t("Savol berish")}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[13px] text-mute sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} MyService</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/install" className="hover:text-ink hover:underline">{t("Telefonga o'rnatish")}</Link>
            <Link href="/terms" className="hover:text-ink hover:underline">{t("Ommaviy oferta")}</Link>
            <Link href="/privacy" className="hover:text-ink hover:underline">{t("Maxfiylik siyosati")}</Link>
            <a href={supportUrl()} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline">Telegram: @{supportUrl().split('/').pop()}</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
