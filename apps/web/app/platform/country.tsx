/** "UZ" → 🇺🇿 O'zbekiston. XX: the address could not be placed (local network, unknown). */
const names = (() => { try { return new Intl.DisplayNames(['uz', 'ru', 'en'], { type: 'region' }); } catch { return null; } })();
// Where customers of an Uzbek product come from most; the rest by the browser's own names.
const UZ: Record<string, string> = {
  UZ: "O'zbekiston", KZ: "Qozog'iston", KG: "Qirg'iziston", TJ: 'Tojikiston', TM: 'Turkmaniston', AF: "Afg'oniston",
  RU: 'Rossiya', KR: 'Janubiy Koreya', TR: 'Turkiya', US: 'AQSh', DE: 'Germaniya', GB: 'Buyuk Britaniya', AE: 'BAA',
  CN: 'Xitoy', UA: 'Ukraina', BY: 'Belarus', AZ: 'Ozarbayjon', PL: 'Polsha', NL: 'Niderlandiya', FR: 'Fransiya', JP: 'Yaponiya', IN: 'Hindiston',
};
export function countryName(code: string) {
  if (code === 'XX') return 'Noma’lum';
  if (UZ[code]) return UZ[code]!;
  try { const n = names?.of(code); return n && n !== code ? n : code; } catch { return code; }
}
export const flag = (code: string) => code === 'XX' ? '🌐' : String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Countries with counts and a share bar; the DB-IP attribution its licence (CC BY 4.0) asks for. */
export function CountryList({ items, unit }: { items: { key: string; n: number }[]; unit: string }) {
  const total = items.reduce((s, c) => s + c.n, 0) || 1;
  if (!items.length) return <p className="mt-1 text-sm text-mute">Hali yo&apos;q</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {items.map(c => (
        <div key={c.key} className="text-sm">
          <p className="flex justify-between gap-3"><span className="truncate">{flag(c.key)} {countryName(c.key)}</span><span className="num shrink-0 font-mono">{c.n} {unit} · {Math.round(c.n / total * 100)}%</span></p>
          <div className="mt-0.5 h-1 rounded-full bg-paper"><div className="h-1 rounded-full bg-brand" style={{ width: `${c.n / total * 100}%` }} /></div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-mute">IP → davlat: <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline">DB-IP</a> (CC BY 4.0)</p>
    </div>
  );
}
