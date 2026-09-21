const API_BASE = (typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')) + '/api';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// AccessToken in-memory (sessionStorage fallback)
let _accessToken: string | null = null;
let _expiresAt = 0;

export function setAccessToken(token: string, expiresIn: number) {
  _accessToken = token;
  _expiresAt = Date.now() + expiresIn * 1000 - 30000; // 30s buffer
  try { sessionStorage.setItem('ms_at', JSON.stringify({ token, exp: _expiresAt })); } catch {}
}

function getAccessToken(): string | null {
  if (_accessToken && Date.now() < _expiresAt) return _accessToken;
  try {
    const raw = sessionStorage.getItem('ms_at');
    if (raw) { const d = JSON.parse(raw); if (Date.now() < d.exp) { _accessToken = d.token; _expiresAt = d.exp; return _accessToken; } }
  } catch {}
  return null;
}

export function clearAccess() {
  _accessToken = null; _expiresAt = 0;
  try { sessionStorage.removeItem('ms_at'); } catch {}
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
    });
    if (!res.ok) return null;
    const d = await res.json() as { accessToken: string; expiresIn: number };
    setAccessToken(d.accessToken, d.expiresIn);
    return d.accessToken;
  } catch { return null; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let token = getAccessToken();
  if (!token) token = await refreshToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'), ...init?.headers as Record<string, string> };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...init, credentials: 'include', headers });

  if (res.status === 401) {
    // Token muddati tugagan — refresh sinab ko'ramiz
    const newToken = await refreshToken();
    if (newToken) {
      headers['Authorization'] = 'Bearer ' + newToken;
      const retry = await fetch(API_BASE + path, { ...init, credentials: 'include', headers });
      if (retry.status === 401) { clearAccess(); throw new ApiError('SESSION_EXPIRED', 401); }
      if (!retry.ok) { const b = await retry.json().catch(() => ({})) as { message?: string }; throw new ApiError(b.message ?? 'REQUEST_FAILED', retry.status); }
      if (retry.status === 204) return undefined as T;
      return retry.json() as Promise<T>;
    }
    clearAccess(); throw new ApiError('SESSION_EXPIRED', 401);
  }
  if (res.status === 403) { const b = await res.json().catch(() => ({})) as { message?: string }; throw new ApiError(b.message ?? 'FORBIDDEN', 403); }
  if (!res.ok) { const b = await res.json().catch(() => ({})) as { message?: string }; throw new ApiError(b.message ?? 'REQUEST_FAILED', res.status); }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function api<T = unknown>(path: string, init?: RequestInit): Promise<T> { return request<T>(path, init); }

export async function apiBlob(path: string, init?: RequestInit): Promise<Blob> {
  let token = getAccessToken();
  if (!token) token = await refreshToken();
  const headers: Record<string, string> = { Origin: typeof window !== 'undefined' ? window.location.origin : '' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, { ...init, credentials: 'include', headers });
  if (!res.ok) throw new ApiError('REQUEST_FAILED', res.status);
  return res.blob();
}

export async function login(loginId: string, password: string): Promise<void> {
  const res = await fetch(API_BASE + '/auth/login', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
    body: JSON.stringify({ login: loginId, password }),
  });
  if (res.status === 401) throw new ApiError('LOGIN_FAILED', 401);
  if (!res.ok) { const b = await res.json().catch(() => ({})) as { message?: string }; throw new ApiError(b.message ?? 'LOGIN_FAILED', res.status); }
  const d = await res.json() as { accessToken: string; expiresIn: number };
  setAccessToken(d.accessToken, d.expiresIn);
}

export async function logout(): Promise<void> {
  try { await api('/auth/logout', { method: 'POST' }); } finally { clearAccess(); }
}

export async function uploadAttachment(orderId: string, file: File, kind: string): Promise<void> {
  const sha256 = await computeSha256(file);
  const { uploadId, url, headers } = await api<{ uploadId: string; url: string; headers: Record<string, string> }>('/orders/' + orderId + '/attachments/presign', { method: 'POST', body: JSON.stringify({ kind, contentType: file.type, size: file.size, sha256 }) });
  await fetch(url, { method: 'PUT', headers: { ...headers }, body: file });
  await api('/orders/' + orderId + '/attachments/confirm', { method: 'POST', body: JSON.stringify({ uploadId }) });
}

async function computeSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
