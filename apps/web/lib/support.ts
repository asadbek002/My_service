/** Where a service asks the platform for help (Telegram username without @). */
export const SUPPORT_TELEGRAM = (process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM || 'myserviceuzz').replace(/^@/, '');
export const supportUrl = (text?: string) => `https://t.me/${SUPPORT_TELEGRAM}${text ? '?text=' + encodeURIComponent(text) : ''}`;
