import { execFileSync } from 'node:child_process';
import path from 'node:path';
import Redis from 'ioredis';
import { API, DATABASE_URL, OTHER_OWNER, OWNER, PLATFORM, REDIS_URL, WEB } from './env';

const root = path.resolve(__dirname, '../..');

async function call<T>(p: string, { token, body, method = body ? 'POST' : 'GET' }: { token?: string; body?: unknown; method?: string } = {}): Promise<T> {
  const res = await fetch(API + p, {
    method,
    headers: { Origin: WEB, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Tries a login; null when the account does not exist yet. */
async function existing(login: string, password: string) {
  try { return (await call<{ accessToken: string }>('/auth/login', { body: { login, password } })).accessToken; } catch { return null; }
}

/**
 * One platform admin, a plan and two services (the second only to prove one service never sees
 * another's data). Idempotent and never wipes anything: on a reused database the accounts are
 * kept, and tests create their own data under unique names. CI starts from an empty database.
 */
export default async function globalSetup() {
  if (!/e2e|test/.test(new URL(DATABASE_URL).pathname)) throw new Error('E2E runs only against a database whose name has "e2e" or "test": ' + DATABASE_URL);
  const env = { ...process.env, DATABASE_URL };
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: root, env, stdio: 'pipe' });
  const redis = new Redis(REDIS_URL);
  for (const pattern of ['auth-rate:*', 'pv:*']) { const keys = await redis.keys(pattern); if (keys.length) await redis.del(...keys); }
  await redis.quit();
  execFileSync('node', ['apps/api/scripts/platform-seed.cjs'], { cwd: root, env: { ...env, INITIAL_PLATFORM_ADMIN_LOGIN: PLATFORM.login, INITIAL_PLATFORM_ADMIN_PASSWORD: PLATFORM.password }, stdio: 'pipe' });

  const { accessToken: platform } = await call<{ accessToken: string }>('/platform/auth/login', { body: { login: PLATFORM.login, password: PLATFORM.password } });
  const plans = await call<{ id: string; name: string }[]>('/platform/plans', { token: platform });
  const plan = plans.find(p => p.name === 'Pro') ?? await call<{ id: string }>('/platform/plans', { token: platform, body: {
    name: 'Pro', monthlyPrice: '149000', maxStaff: 10,
    features: { telegram: true, sms: true, inventory: true, advanced_reports: true, exports: true, multi_branch: true, staff_commission: true },
  } });
  for (const [o, name, slug, phone] of [[OWNER, OWNER.service, 'e2e-servis', '+998901110001'], [OTHER_OWNER, 'Boshqa Servis', 'boshqa-servis', '+998901110002']] as const) {
    if (await existing(o.login, o.password)) continue;
    const temporaryPassword = 'Temporary-Pass-123';
    await call('/platform/organizations', { token: platform, body: { name, slug, planId: plan.id, login: o.login, temporaryPassword, ownerName: 'Bobur', phone } });
    const { accessToken } = await call<{ accessToken: string }>('/auth/login', { body: { login: o.login, password: temporaryPassword } });
    await call('/auth/change-password', { token: accessToken, body: { currentPassword: temporaryPassword, newPassword: o.password } });
  }
}
