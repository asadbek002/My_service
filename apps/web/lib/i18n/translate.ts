import { exact, patterns } from './ru';

/* Pure lookup, shared by the browser layer (lib/i18n) and the server-rendered /ru home page. */

export const norm = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

const dict = new Map<string, string>();
for (const [k, v] of Object.entries(exact)) dict.set(norm(k), v);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rules = patterns.map(([uz, ru]) => ({
  re: new RegExp('^' + escape(norm(uz)).replace(/\\\{(\d)\\\}/g, '(.+?)') + '$'),
  ru,
}));
const DELIMS = ['. ', ' — ', ' · ', ': ', ', '];

/** Russian for one piece of Uzbek text, or null when there is none. */
export function translate(text: string, depth = 0): string | null {
  const t = norm(text).trim();
  if (!t || !/[a-zA-Z]/.test(t)) return null;
  const hit = dict.get(t);
  if (hit !== undefined) return hit;
  for (const r of rules) {
    const m = r.re.exec(t);
    if (m) return r.ru.replace(/\{(\d)\}/g, (_, i: string) => { const v = m[Number(i) + 1] ?? ''; return (depth < 2 && translate(v, depth + 1)) || v; });
  }
  // Composite labels ("Qabul · 3 ta"): translate the parts that are known.
  if (depth < 2) for (const d of DELIMS) {
    if (!t.includes(d)) continue;
    const parts = t.split(d);
    // "Keyingi qadam: …" — the label is in the dictionary with its colon.
    const done = parts.map((p, i) => translate(p, depth + 1) ?? (i < parts.length - 1 && d.trim() ? translate(p + d.trim(), depth + 1)?.replace(/[:.,]$/, '') ?? null : null));
    if (done.some(Boolean)) return parts.map((p, i) => done[i] ?? p).join(d);
  }
  return null;
}

