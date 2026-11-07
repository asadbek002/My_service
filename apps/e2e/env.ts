/** Where the suite runs. Defaults match CI and local development; the database must be a throwaway one. */
export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api';
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://myservice:test@localhost:5432/myservice_e2e?schema=public';
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Accounts the global setup creates. */
export const PLATFORM = { login: 'e2e-platform', password: 'E2E-Platform-Password-1' };
export const OWNER = { login: 'e2e-boss', password: 'E2E-Boss-Password-1', name: 'Bobur', service: 'E2E Servis' };
export const OTHER_OWNER = { login: 'e2e-other', password: 'E2E-Other-Password-1' };
