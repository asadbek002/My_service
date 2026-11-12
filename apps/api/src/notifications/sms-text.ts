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
 * Every SMS sent through the platform's Eskiz account. Eskiz sends only texts its moderators have
 * approved, entered exactly as the subscriber sees them; codes must name the resource and the purpose.
 * Keep this the only place these words live, and resubmit a text to Eskiz whenever it changes.
 */
export const SITE = 'myserviceuz.uz';
export const SMS = {
  signupCode: (code: string) => `MyService (${SITE}) saytida ro'yxatdan o'tish uchun tasdiqlash kodi: ${code}`,
  resetCode: (code: string) => `MyService (${SITE}) saytida parolni tiklash uchun tasdiqlash kodi: ${code}`,
  test: () => `MyService (${SITE}): SMS xabarnoma sozlamasi ishlayapti.`,
};

/**
 * "Ready" for a customer, always one of two fixed shapes and one SMS:
 *   Mobile Fix: Samsung A52 tayyor. To'lov: 450 000 so'm. https://…/track/…
 *   Mobile Fix: Samsung A52 tayyor, olib ketishingiz mumkin. https://…/track/…
 * Only the names shrink when they are too long; the words never change (Eskiz moderation).
 */
export function readySms(service: string, device: string, due: string | null, link: string) {
  const build = (s: string, d: string) => gsm7(due ? `${s}: ${d} tayyor. To'lov: ${due} so'm. ${link}` : `${s}: ${d} tayyor, olib ketishingiz mumkin. ${link}`).replace(/\s+/g, ' ');
  let s = gsm7(service).trim(), d = gsm7(device).trim();
  while (smsParts(build(s, d)) > 1 && (d.length > 8 || s.length > 8)) {
    if (d.length >= s.length) d = d.slice(0, -1); else s = s.slice(0, -1);
  }
  return build(s.trim(), d.trim());
}
