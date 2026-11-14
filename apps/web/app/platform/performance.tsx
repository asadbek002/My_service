'use client';
import { useCallback, useEffect, useState } from 'react';
import { platformApi } from './lib';
import { card } from './parts';
import { CountryList, countryName, flag } from './country';

type Perf = {
  hours: { hour: string; n: number; err: number; avg: number }[];
  total: { requests: number; errors: number; errorRate: number; avgMs: number; perMinute: number; under50: number; under200: number; under1000: number; over1000: number };
  slowest: { route: string; n: number; avg: number }[];
  busiest: { route: string; n: number; avg: number }[];
  active: { countries?: { key: string; n: number }[]; today?: { users: number; services: number }; week: { users: number; services: number }; month: { users: number; services: number }; perDay: { day: string; users: number; services: number }[] };
  client?: ClientPerf | null;
  server: { cpus: number; load: number[]; memory: { totalMb: number; freeMb: number; apiMb: number }; uptimeHours: number; databaseMb: number };
};

type Timing = { pages: { n: number; avgMs: number; ttfbMs: number; under1s: number; under3s: number }; api: { n: number; avgMs: number; under300: number; under1000: number } };
type ClientPerf = Timing & { days: number; countries: (Timing & { key: string })[] };

const sec = (ms: number) => ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms + ' ms';
/** Green when it feels quick, amber when noticeable, red when users wait. */
const tone = (ms: number, ok: number, slow: number) => ms === 0 ? 'text-mute' : ms <= ok ? 'text-emerald-700' : ms <= slow ? 'text-amber-700' : 'text-red-600';

/** What users feel in their browser (network included), next to the server's own times above. */
function ClientCard({ c, serverMs }: { c: ClientPerf; serverMs: number }) {
  const network = c.api.n ? Math.max(0, c.api.avgMs - serverMs) : 0;
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Foydalanuvchida tezlik</h2>
        <p className="text-sm text-mute">brauzerda o&apos;lchangan, internet bilan · {c.days} kun</p></div>
      {!c.pages.n && !c.api.n ? <p className="mt-2 text-sm text-mute">Hali ma&apos;lumot yo&apos;q: foydalanuvchilar sahifani ochganda yig&apos;iladi.</p> : (<>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-paper p-3">
            <p className="text-xs text-mute">Sahifa ochilishi</p>
            <p className={`num font-mono text-xl font-semibold ${tone(c.pages.avgMs, 2000, 4000)}`}>{sec(c.pages.avgMs)}</p>
            <p className="text-xs text-mute">1 s gacha {c.pages.under1s}% · 3 s gacha {c.pages.under3s}% · {c.pages.n} marta</p>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <p className="text-xs text-mute">Har bir amal (so&apos;rov)</p>
            <p className={`num font-mono text-xl font-semibold ${tone(c.api.avgMs, 300, 800)}`}>{sec(c.api.avgMs)}</p>
            <p className="text-xs text-mute">serverda {serverMs} ms + yo&apos;lda ~{network} ms · {c.api.n} ta</p>
          </div>
        </div>
        <p className="eyebrow mt-4">Davlatlar bo&apos;yicha</p>
        <div className="mt-1 divide-y text-sm">
          {c.countries.map(x => (
            <div key={x.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-1.5">
              <span className="min-w-0 truncate">{flag(x.key)} {countryName(x.key)}</span>
              <span className={`num font-mono text-xs ${tone(x.pages.avgMs, 2000, 4000)}`} title="Sahifa ochilishi">{x.pages.n ? sec(x.pages.avgMs) : '—'}</span>
              <span className={`num w-16 text-right font-mono text-xs ${tone(x.api.avgMs, 300, 800)}`} title="So'rov">{x.api.n ? sec(x.api.avgMs) : '—'}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-mute">Ustunlar: sahifa ochilishi · bitta so&apos;rov. Yashil — tez, sariq — sezilarli, qizil — kutishga to&apos;g&apos;ri keladi.</p>
      </>)}
    </section>
  );
}

function Bars({ values, title, tone = 'bg-ink/80' }: { values: { label: string; v: number; hint: string }[]; title: string; tone?: string }) {
  const max = Math.max(1, ...values.map(x => x.v));
  return (
    <div className="mt-3 flex h-24 items-end gap-[3px]" role="img" aria-label={title}>
      {values.map(x => <div key={x.label} title={x.hint} className={`flex-1 rounded-t ${tone}`} style={{ height: `${Math.max(2, x.v / max * 100)}%` }} />)}
    </div>
  );
}
const Stat = ({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) => (
  <div className={card}><p className="eyebrow">{label}</p><p className={`num mt-1 font-mono text-xl font-semibold ${warn ? 'text-red-600' : ''}`}>{value}</p></div>
);
const shortRoute = (r: string) => r.replace(/^(\w+) \/api/, '$1 ');

/** Platform → Yuklama: requests and speed of the API, errors, the slowest routes, who uses the app, the server. */
export function PerformanceTab({ onError }: { onError: (e: unknown) => void }) {
  const [hours, setHours] = useState(24);
  const [d, setD] = useState<Perf | null>(null);
  const load = useCallback(async () => { try { setD(await platformApi<Perf>('/performance?hours=' + hours)); } catch (e) { onError(e); } }, [hours, onError]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, [load]);
  if (!d) return <p className="text-sm text-mute">Yuklanmoqda…</p>;
  const memUsed = d.server.memory.totalMb - d.server.memory.freeMb;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{[24, 72, 168].map(h => <button key={h} className="chip" aria-pressed={hours === h} onClick={() => setHours(h)}>{h === 24 ? '24 soat' : h === 72 ? '3 kun' : '7 kun'}</button>)}</div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="So'rovlar" value={d.total.requests.toLocaleString('ru-RU')} />
        <Stat label="Daqiqasiga (o'rtacha)" value={d.total.perMinute} />
        <Stat label="O'rtacha javob" value={d.total.avgMs + ' ms'} warn={d.total.avgMs > 500} />
        <Stat label="Xatolar (5xx)" value={`${d.total.errors} · ${d.total.errorRate}%`} warn={d.total.errorRate > 1} />
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Soatlik so&apos;rovlar</h2>
          <p className="text-sm text-mute">200 ms dan tez: {d.total.under200}% · 1 s dan sekin: {d.total.over1000}%</p></div>
        <Bars title="Soatlik so'rovlar" values={d.hours.map(h => ({ label: h.hour, v: h.n, hint: `${h.hour}: ${h.n} ta, o'rtacha ${h.avg} ms${h.err ? `, ${h.err} xato` : ''}` }))} />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-mute"><span>{d.hours[0]?.hour}</span><span>{d.hours.at(-1)?.hour}</span></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Eng sekin so&apos;rovlar</h2>
          {d.slowest.length ? d.slowest.map(r => <p key={r.route} className="mt-1.5 flex justify-between gap-3 text-sm"><span className="truncate font-mono text-xs">{shortRoute(r.route)}</span><span className={`num shrink-0 font-mono ${r.avg > 500 ? 'text-red-600' : ''}`}>{r.avg} ms · {r.n}</span></p>) : <p className="mt-1 text-sm text-mute">Hali yo&apos;q</p>}
        </section>
        <section className={card}>
          <h2 className="font-semibold">Eng ko&apos;p chaqirilgan</h2>
          {d.busiest.map(r => <p key={r.route} className="mt-1.5 flex justify-between gap-3 text-sm"><span className="truncate font-mono text-xs">{shortRoute(r.route)}</span><span className="num shrink-0 font-mono">{r.n} · {r.avg} ms</span></p>)}
        </section>
      </div>

      {d.client && <ClientCard c={d.client} serverMs={d.total.avgMs} />}

      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Ilovadan faol foydalanish</h2>
          <p className="text-sm text-mute">bugun {d.active.today?.users ?? 0} kishi / {d.active.today?.services ?? 0} servis · 7 kun {d.active.week.users} / {d.active.week.services} · 30 kun {d.active.month.users} / {d.active.month.services}</p></div>
        <Bars title="Kunlik faol foydalanuvchilar" tone="bg-brand" values={d.active.perDay.map(x => ({ label: x.day, v: x.users, hint: `${x.day}: ${x.users} kishi, ${x.services} servis` }))} />
        <p className="eyebrow mt-4">Qaysi davlatdan ishlashyapti (30 kun)</p>
        <CountryList items={d.active.countries ?? []} unit="kishi" />
      </section>

      <section className={card}>
        <h2 className="font-semibold">Server</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <p><span className="block text-xs text-mute">CPU yuklamasi · {d.server.cpus} yadro</span><span className={`num font-mono ${d.server.load[0]! > d.server.cpus ? 'text-red-600' : ''}`}>{d.server.load[0]!.toFixed(2)}</span><span className="block text-[11px] text-mute">5 daq {d.server.load[1]!.toFixed(2)} · 15 daq {d.server.load[2]!.toFixed(2)}</span></p>
          <p><span className="block text-xs text-mute">Xotira</span><span className={`num whitespace-nowrap font-mono ${d.server.memory.freeMb < 500 ? 'text-red-600' : ''}`}>{(memUsed / 1024).toFixed(1)} / {(d.server.memory.totalMb / 1024).toFixed(1)} GB</span></p>
          <p><span className="block text-xs text-mute">API jarayoni</span><span className="num whitespace-nowrap font-mono">{d.server.memory.apiMb} MB</span><span className="block text-[11px] text-mute">{d.server.uptimeHours < 1 ? 'hozirgina qayta ishga tushgan' : `${d.server.uptimeHours} soatdan beri ishlaydi`}</span></p>
          <p><span className="block text-xs text-mute">Ma&apos;lumotlar bazasi</span><span className="num font-mono">{d.server.databaseMb} MB</span></p>
        </div>
      </section>
    </div>
  );
}
