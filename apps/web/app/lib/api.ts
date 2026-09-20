'use client';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export async function login(login: string, password: string) {
  const response = await fetch(base + '/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }), cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 429 ? 'Urinishlar juda ko‘p. Keyinroq urinib ko‘ring.' : 'Login yoki parol noto‘g‘ri.');
  accessToken = (await response.json()).accessToken;
}
async function refresh() {
  if (!refreshing) refreshing = (async () => {
    try {
      const response = await fetch(base + '/auth/refresh', { method: 'POST', credentials: 'include', cache: 'no-store' });
      if (!response.ok) { accessToken = null; return false; }
      accessToken = (await response.json()).accessToken;
      return true;
    } catch { accessToken = null; return false; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!accessToken && !await refresh()) throw new Error('SESSION_EXPIRED');
  const send = () => fetch(base + path, { ...options, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: 'Bearer ' + accessToken } });
  let response = await send();
  if (response.status === 401 && await refresh()) response = await send();
  if (response.status === 401) { accessToken = null; throw new Error('SESSION_EXPIRED'); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'So‘rov bajarilmadi');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } finally { accessToken = null; }
}
export function clearAccess() { accessToken = null; }
