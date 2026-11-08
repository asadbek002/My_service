'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, Copy, EllipsisVertical, PlusSquare, Share, Smartphone } from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { detectPlatform, install, useInstallOffer, type Platform } from '../../lib/install';
import { AuthFrame } from '../../components/layout/auth-frame';
import { Button } from '../../components/ui/button';
import { Loading, Notice } from '../../components/ui/feedback';

/**
 * "Telefonga o'rnatish": MyService on the home screen without an app store. It says what to do on the
 * device it is opened on: one button on Android, three steps on iPhone, "open in the browser" inside
 * Telegram or Instagram, and a QR code to scan on a computer.
 */
export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const offer = useInstallOffer();
  const [done, setDone] = useState(false);
  useEffect(() => setPlatform(detectPlatform()), []);

  return (
    <AuthFrame eyebrow="Ilova" title="Telefonga o'rnatish">
      {!platform ? <Loading rows={2} /> : (
        <div className="grid gap-5">
          {platform !== 'installed' && !done && (
            <ul className="grid gap-1.5 text-sm text-mute">
              {['Bosh ekrandan bir bosishda ochiladi', 'Manzil yozish shart emas', "To'liq ekranda, oddiy ilova kabi ishlaydi"].map(t => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-st-tayyor" strokeWidth={3} />{t}</li>
              ))}
            </ul>
          )}
          {done || platform === 'installed' ? <Installed /> : platform === 'android' ? <Android offer={!!offer} onDone={() => setDone(true)} />
            : platform === 'ios' ? <Ios /> : platform === 'ios-other' ? <IosOther /> : platform === 'in-app' ? <InApp />
            : <Desktop offer={!!offer} onDone={() => setDone(true)} />}
        </div>
      )}
      <p className="mt-6 text-center text-sm text-mute"><Link href="/login" className="font-semibold text-ink underline">Kirish sahifasiga</Link></p>
    </AuthFrame>
  );
}

function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="grid gap-3">
      {children.map((c, i) => (
        <li key={i} className="flex gap-3 rounded-xl bg-paper p-3.5 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-semibold text-white">{i + 1}</span>
          <span className="min-w-0 pt-0.5">{c}</span>
        </li>
      ))}
    </ol>
  );
}
const Key = ({ children }: { children: ReactNode }) => <b className="inline-flex items-center gap-1 rounded-md border bg-white px-1.5 py-0.5 align-middle text-[13px] font-semibold text-ink">{children}</b>;

function Installed() {
  return (
    <div className="grid gap-3">
      <Notice>MyService o&apos;rnatilgan. Uni bosh ekrandagi ikonkadan oching.</Notice>
      <Button asChild variant="brand" size="lg" className="w-full"><Link href="/dashboard">Ilovani ochish</Link></Button>
    </div>
  );
}

function Android({ offer, onDone }: { offer: boolean; onDone: () => void }) {
  if (offer) {
    return (
      <div className="grid gap-2">
        <Button variant="brand" size="lg" className="w-full" onClick={async () => { if (await install()) onDone(); }}><Smartphone className="h-5 w-5" /> O&apos;rnatish</Button>
        <p className="text-center text-xs text-mute">Chiqqan oynada yana «O&apos;rnatish» ni bosing.</p>
      </div>
    );
  }
  return (
    <Steps>{[
      <>Brauzerning o&apos;ng tepasidagi <Key><EllipsisVertical className="h-3.5 w-3.5" /> menyu</Key> tugmasini bosing.</>,
      <>Ro&apos;yxatdan <Key>Ilovani o&apos;rnatish</Key> yoki <Key>Bosh ekranga qo&apos;shish</Key> ni tanlang.</>,
      <><Key>O&apos;rnatish</Key> ni bosing. MyService ikonkasi bosh ekranda paydo bo&apos;ladi.</>,
    ]}</Steps>
  );
}

function Ios() {
  return (
    <Steps>{[
      <>Ekran pastidagi <Key><Share className="h-3.5 w-3.5" /> Ulashish</Key> tugmasini bosing (iPad&apos;da u tepada).</>,
      <>Ro&apos;yxatni pastga suring va <Key><PlusSquare className="h-3.5 w-3.5" /> Ekranga qo&apos;shish</Key> ni tanlang. Rus tilida: «На экран Домой», ingliz tilida: «Add to Home Screen».</>,
      <>O&apos;ng tepadagi <Key>Qo&apos;shish</Key> ni bosing. MyService ikonkasi bosh ekranda paydo bo&apos;ladi.</>,
    ]}</Steps>
  );
}

function IosOther() {
  return (
    <div className="grid gap-3">
      <Steps>{[
        <>Manzil satri yonidagi <Key><Share className="h-3.5 w-3.5" /> Ulashish</Key> tugmasini bosing.</>,
        <><Key><PlusSquare className="h-3.5 w-3.5" /> Ekranga qo&apos;shish</Key> ni tanlang, keyin <Key>Qo&apos;shish</Key>.</>,
      ]}</Steps>
      <p className="text-xs text-mute">Bu tugma ko&apos;rinmasa, sahifani <b>Safari</b>&apos;da oching: u yerda albatta bor.</p>
      <CopyLink />
    </div>
  );
}

function InApp() {
  const android = /Android/.test(navigator.userAgent);
  const host = location.host;
  return (
    <div className="grid gap-3">
      <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-950">Sahifa Telegram yoki Instagram ichida ochilgan. Bu yerdan o&apos;rnatib bo&apos;lmaydi: uni {android ? 'Chrome' : 'Safari'} brauzerida oching.</p>
      {android
        ? <Button asChild variant="brand" size="lg" className="w-full"><a href={`intent://${host}/install#Intent;scheme=https;package=com.android.chrome;end`}>Chrome&apos;da ochish</a></Button>
        : <Steps>{[<>O&apos;ng tepadagi <Key>⋯</Key> yoki kompas belgisini bosing.</>, <><Key>Safari&apos;da ochish</Key> ni tanlang.</>]}</Steps>}
      <CopyLink />
    </div>
  );
}

function Desktop({ offer, onDone }: { offer: boolean; onDone: () => void }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-col items-center gap-2 rounded-xl bg-paper p-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={API_BASE + '/public/install-qr'} alt="O'rnatish sahifasining QR kodi" width={180} height={180} className="rounded-lg bg-white p-2" />
        <p className="text-sm">Telefoningiz kamerasi bilan skanerlang: sahifa telefonda ochiladi va qanday o&apos;rnatishni ko&apos;rsatadi.</p>
      </div>
      {offer && <Button variant="secondary" className="w-full" onClick={async () => { if (await install()) onDone(); }}>Kompyuterga ham o&apos;rnatish</Button>}
      <CopyLink />
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  const url = location.origin + '/install';
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)); }}
      className="flex items-center justify-center gap-2 text-sm font-medium text-mute underline">
      {copied ? <><Check className="h-4 w-4" /> Nusxalandi</> : <><Copy className="h-4 w-4" /> Havolani nusxalash</>}
    </button>
  );
}
