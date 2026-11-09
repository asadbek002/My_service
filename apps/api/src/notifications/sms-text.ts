/**
 * SMS are paid per part: 160 Latin characters, but only 70 once a single character falls outside
 * the GSM alphabet (‘ ’ ʻ · « » — …), and then a long message splits into parts of 67. One curly
 * apostrophe in "so‘m" made the "ready" message three paid SMS instead of one.
 */
const REPLACE: [RegExp, string][] = [
  [/[‘’ʻʼ`´]/g, "'"], [/[«»“”„]/g, '"'], [/[—–]/g, '-'], [/·/g, '-'], [/…/g, '...'], [/[  ]/g, ' '], [/№/g, 'N'],
];
const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

/** The text in the GSM alphabet where it can be (Uzbek Latin always can). */
export function gsm7(text: string) {
  let t = text;
  for (const [re, to] of REPLACE) t = t.replace(re, to);
  return t;
}
export const isGsm7 = (text: string) => GSM.test(text);

/** How many paid SMS a text costs. */
export function smsParts(text: string) {
  const gsm = isGsm7(text);
  // ^ { } \ [ ~ ] | € take two places in GSM.
  const len = gsm ? [...text].reduce((n, c) => n + ('^{}\\[~]|€'.includes(c) ? 2 : 1), 0) : [...text].length;
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return len <= single ? 1 : Math.ceil(len / multi);
}

/**
 * "Ready" for a customer, in one SMS: "Mobile Fix: Samsung A52 tayyor, olib ketishingiz mumkin.
 * To'lov: 450 000 so'm. https://…/track/…". The polite tail, then the device, give way to fit.
 */
export function readySms(service: string, device: string, due: string | null, link: string) {
  const pay = due ? ` To'lov: ${due} so'm.` : '';
  const build = (s: string, d: string, tail: string) => gsm7(`${s}: ${d} tayyor${tail}.${pay} ${link}`).replace(/\s+/g, ' ');
  for (const tail of [', olib ketishingiz mumkin', '']) {
    const t = build(service, device, tail);
    if (smsParts(t) === 1) return t;
  }
  // Very long names: shorten the device, then the service name.
  let s = service, d = device;
  while (smsParts(build(s, d, '')) > 1 && (d.length > 12 || s.length > 12)) {
    if (d.length >= s.length) d = d.slice(0, -1); else s = s.slice(0, -1);
  }
  return build(s.trim(), d.trim(), '');
}
