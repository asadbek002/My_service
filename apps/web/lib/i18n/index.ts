'use client';

import { exact, patterns } from './ru';
import { LANG_KEY as KEY } from './early';

/**
 * The interface language. Uzbek is what the code is written in; Russian is laid over the page:
 * every text the user sees is looked up by its Uzbek wording and replaced, and whatever has no
 * translation yet stays Uzbek. Legal texts, the platform console, PDFs and messages to customers
 * stay Uzbek on purpose.
 */
export type Lang = 'uz' | 'ru';

export function getLang(): Lang {
  try { return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'uz'; } catch { return 'uz'; }
}
export function setLang(lang: Lang) {
  try { if (lang === 'ru') localStorage.setItem(KEY, 'ru'); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  location.reload();
}


const norm = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

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

/** Keeps the spaces around a text node, so words next to buttons and links don't stick together. */
function withSpaces(original: string, ru: string) {
  const lead = /^\s*/.exec(original)![0];
  const trail = /\s*$/.exec(original)![0];
  return (/^[.,:;)]/.test(ru) ? '' : lead) + ru + trail;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'NOSCRIPT']);
// What is typed into fields is never touched; only their placeholder and label are.
const FIELDS = new Set(['TEXTAREA', 'INPUT', 'SELECT']);
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
// What each node said in Uzbek and what we wrote into it, so React's own updates are noticed.
const mine = new WeakMap<Node, { uz: string; ru: string }>();

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e.getAttribute('translate') === 'no' || e.hasAttribute('data-no-i18n')) return true;
  }
  return false;
}

function source(node: Text) {
  const m = mine.get(node);
  return m && node.nodeValue === m.ru ? m.uz : node.nodeValue ?? '';
}
function put(node: Text, uz: string, ru: string) {
  mine.set(node, { uz, ru });
  if (node.nodeValue !== ru) node.nodeValue = ru;
}

/** Translates the text children of one element: a run of text nodes (React splits "a {x} b") is tried as a whole first. */
function element(el: Element) {
  if (skipped(el)) return;
  const kids = FIELDS.has(el.tagName) ? [] : Array.from(el.childNodes);
  for (let i = 0; i < kids.length;) {
    if (kids[i]!.nodeType !== Node.TEXT_NODE) { i++; continue; }
    let j = i;
    while (j < kids.length && kids[j]!.nodeType === Node.TEXT_NODE) j++;
    const run = kids.slice(i, j) as Text[];
    const uz: string[] = run.map(source);
    const whole = run.length > 1 ? translate(uz.join('')) : null;
    if (whole !== null) {
      put(run[0]!, uz[0] ?? '', withSpaces(uz.join(''), whole));
      for (let k = 1; k < run.length; k++) put(run[k]!, uz[k] ?? '', '');
    } else {
      run.forEach((n, k) => { const u = uz[k] ?? ''; const ru = translate(u); put(n, u, ru === null ? u : withSpaces(u, ru)); });
    }
    i = j;
  }
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const key = 'data-uz-' + a;
    const prev = el.getAttribute(key);
    const uz = prev !== null && el.getAttribute('data-ru-' + a) === v ? prev : v;
    const ru = translate(uz);
    if (ru === null) continue;
    el.setAttribute(key, uz);
    el.setAttribute('data-ru-' + a, ru);
    if (v !== ru) el.setAttribute(a, ru);
  }
}

function tree(root: Element) {
  element(root);
  root.querySelectorAll('*').forEach(element);
}

// Pages that stay Uzbek: legal texts and the platform owner's console.
// The tracking page is the customer's: it stays Uzbek (so does the receipt itself, marked translate="no").
const UZBEK_ONLY = /^\/(platform|terms|privacy|track)(\/|$)/;

let started = false;
/** Starts translating the page into Russian when that is the chosen language. Call after hydration. */
export function startTranslating() {
  if (started || getLang() !== 'ru') { document.documentElement.removeAttribute('data-i18n'); return; }
  started = true;
  document.documentElement.lang = 'ru';
  let title = '';
  const fixTitle = () => {
    if (document.title === title) return;
    const ru = translate(document.title);
    title = ru ?? document.title;
    if (ru) document.title = ru;
  };
  const deep = new Set<Element>(), shallow = new Set<Element>();
  let queued = false;
  const flush = () => {
    queued = false;
    if (UZBEK_ONLY.test(location.pathname)) { deep.clear(); shallow.clear(); return; }
    observer.disconnect();
    deep.forEach(e => { if (e.isConnected) tree(e); });
    shallow.forEach(e => { if (e.isConnected && !deep.has(e)) element(e); });
    deep.clear(); shallow.clear();
    fixTitle();
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  const observer = new MutationObserver(list => {
    for (const m of list) {
      const t = m.target.nodeType === Node.ELEMENT_NODE ? m.target as Element : m.target.parentElement;
      if (t) shallow.add(t);
      m.addedNodes.forEach(n => { if (n.nodeType === Node.ELEMENT_NODE) deep.add(n as Element); });
    }
    if (!queued) { queued = true; queueMicrotask(flush); }
  });
  deep.add(document.body);
  flush();
  document.documentElement.removeAttribute('data-i18n');
}
