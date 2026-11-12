'use client';

import { LANG_KEY as KEY } from './early';
import { translate } from './translate';

export { translate };

/**
 * The interface language. Uzbek is what the code is written in; Russian is laid over the page:
 * every text the user sees is looked up by its Uzbek wording and replaced, and whatever has no
 * translation yet stays Uzbek. Legal texts, the platform console, PDFs and messages to customers
 * stay Uzbek on purpose.
 */
export type Lang = 'uz' | 'ru';

/** /ru is the Russian home page (for search engines too); elsewhere the device's choice. */
export const RU_PATH = /^\/ru(\/|$)/;
export function getLang(): Lang {
  if (RU_PATH.test(location.pathname)) return 'ru';
  try { return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'uz'; } catch { return 'uz'; }
}
export function setLang(lang: Lang) {
  try { if (lang === 'ru') localStorage.setItem(KEY, 'ru'); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  // The home page has an address per language; other pages switch in place.
  if (location.pathname === '/' && lang === 'ru') location.href = '/ru';
  else if (RU_PATH.test(location.pathname) && lang === 'uz') location.href = '/';
  else location.reload();
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
