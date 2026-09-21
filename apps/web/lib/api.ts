const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 401) throw new ApiError('SESSION_EXPIRED', 401);
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new ApiError(body.message ?? 'FORBIDDEN', 403);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new ApiError(body.message ?? 'REQUEST_FAILED', res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

export async function apiBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(API_BASE + path, {
    ...init,
    credentials: 'include',
    headers: { ...init?.headers },
  });
  if (!res.ok) throw new ApiError('REQUEST_FAILED', res.status);
  return res.blob();
}

export async function login(loginId: string, password: string): Promise<void> {
  await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: loginId, password }),
  });
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  clearAccess();
}

export function clearAccess(): void {
  // Cookie HttpOnly bo'lgani uchun server tomonidan o'chiriladi
  // Bu yerda lokal state tozalanadi
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('session-cleared'));
  }
}

export async function uploadAttachment(
  orderId: string,
  file: File,
  kind: string,
): Promise<void> {
  const sha256 = await computeSha256(file);

  const { uploadId, url, headers } = await api<{
    uploadId: string;
    url: string;
    headers: Record<string, string>;
  }>('/orders/' + orderId + '/attachments/presign', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      contentType: file.type,
      size: file.size,
      sha256,
    }),
  });

  await fetch(url, {
    method: 'PUT',
    headers: { ...headers },
    body: file,
  });

  await api('/orders/' + orderId + '/attachments/confirm', {
    method: 'POST',
    body: JSON.stringify({ uploadId }),
  });
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
