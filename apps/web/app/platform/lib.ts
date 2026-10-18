'use client';
import { API_BASE } from '../../lib/api';

/** Thrown when the password is right and the authenticator code is still needed (or wrong). */
export class CodeRequired extends Error {}
export async function platformLogin(login: string, password: string, code?: string) {
  const r = await fetch(API_BASE + '/platform/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: window.location.origin }, body: JSON.stringify({ login, password, ...(code ? { code } : {}) }), cache: 'no-store' });
  if (r.status === 429) throw new Error("Juda ko'p urinish. Keyinroq qayta urinib ko'ring.");
  if (!r.ok) {
    const message = (await r.json().catch(() => ({})) as { message?: string }).message;
    if (message === 'TOTP_REQUIRED') throw new CodeRequired('Ilovadagi 6 xonali kodni yozing');
    if (message === 'TOTP_INVALID') throw new CodeRequired("Kod noto'g'ri yoki eskirgan");
    throw new Error("Login yoki parol noto'g'ri");
  }
  const data = await r.json();
  sessionStorage.setItem('platform_token', data.accessToken);
}
export async function platformApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('platform_token');
  if (!token) throw new Error('SESSION_EXPIRED');
  const r = await fetch(API_BASE + '/platform' + path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: 'Bearer ' + token } });
  if (r.status === 401) { sessionStorage.removeItem('platform_token'); throw new Error('SESSION_EXPIRED'); }
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message ?? 'So‘rov bajarilmadi'); }
  return r.status === 204 ? (undefined as T) : r.json();
}
