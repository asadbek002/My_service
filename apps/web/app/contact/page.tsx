'use client';

import Link from 'next/link';
import { Mail, Phone, Send } from 'lucide-react';
import { LegalPage, useLegal } from '../../components/legal-page';
import { supportUrl, SUPPORT_TELEGRAM } from '../../lib/support';
import { FAQ } from '../../lib/faq';

/** Public support page: the "Support URL" the App Store and Google Play ask for. Open without signing in. */
export default function Contact() {
  const v = useLegal();
  const phone = v('phone', ''), email = v('email', '');
  const known = (x: string) => x && !x.startsWith('[');
  return (
    <LegalPage title="Yordam va aloqa" updated="13.11.2026">
      <p>MyService — ta&apos;mirlash ustaxonalari uchun dastur. Savol, taklif yoki muammo bo&apos;lsa, bizga yozing — ish kunlari bir necha soat ichida javob beramiz.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <a href={supportUrl()} className="flex items-center gap-2 rounded-xl border p-3 font-semibold no-underline"><Send className="h-4 w-4 text-[#229ED9]" /> @{SUPPORT_TELEGRAM}</a>
        {known(phone) && <a href={'tel:' + phone.replace(/[^\d+]/g, '')} className="flex items-center gap-2 rounded-xl border p-3 font-semibold no-underline"><Phone className="h-4 w-4" /> {phone}</a>}
        {known(email) && <a href={'mailto:' + email} className="flex items-center gap-2 rounded-xl border p-3 font-semibold no-underline"><Mail className="h-4 w-4" /> {email}</a>}
      </div>
      <p>Dasturdan foydalanayotgan bo&apos;lsangiz, ilovadagi <b>Yordam</b> bo&apos;limidan ham murojaat yuborishingiz mumkin.</p>

      <h2>Ko&apos;p beriladigan savollar</h2>
      {FAQ.map(([q, a]) => (
        <details key={q} className="mt-2 rounded-xl border p-3">
          <summary className="cursor-pointer font-semibold">{q}</summary>
          <p className="!mt-2 text-mute">{a}</p>
        </details>
      ))}

      <h2>Hisob va ma&apos;lumotlar</h2>
      <ul>
        <li><Link href="/delete-account">Hisobni o&apos;chirish</Link></li>
        <li><Link href="/privacy">Maxfiylik siyosati</Link></li>
        <li><Link href="/terms">Ommaviy oferta</Link></li>
      </ul>
    </LegalPage>
  );
}
