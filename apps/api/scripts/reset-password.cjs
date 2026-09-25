// Reset a staff member's password from the server shell.
//   docker compose -f docker-compose.prod.yml run --rm api node apps/api/scripts/reset-password.cjs <login>
// The new password is read without echo (or from NEW_PASSWORD for automation). It becomes a
// temporary password: the user must change it on next login. All sessions are revoked and the
// login rate-limit counter for this login is cleared.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const argon2 = require('argon2');
const Redis = require('ioredis');

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('No terminal: run with -it or set NEW_PASSWORD'));
    process.stdout.write(question);
    const stdin = process.stdin; let value = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = ch => {
      if (ch === '\u0003') { stdin.setRawMode(false); process.exit(130); }
      if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(value); }
      if (ch === '\u007f') { value = value.slice(0, -1); return; }
      value += ch;
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const login = (process.argv[2] || '').trim().toLowerCase();
  if (!login) throw new Error('Usage: node apps/api/scripts/reset-password.cjs <login>');
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { login } });
    if (!user) {
      const known = await db.user.findMany({ select: { login: true, status: true }, orderBy: { createdAt: 'asc' }, take: 20 });
      throw new Error(`Login "${login}" not found. Existing logins: ${known.map(u => u.login + (u.status === 'ACTIVE' ? '' : ' (' + u.status + ')')).join(', ') || 'none'}`);
    }
    let password = process.env.NEW_PASSWORD;
    if (!password) {
      password = await askHidden('New temporary password (12+ chars): ');
      if (password !== await askHidden('Repeat: ')) throw new Error('Passwords do not match');
    }
    if (password.length < 12 || password.length > 128) throw new Error('Password must be 12..128 characters');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true } }),
      db.session.updateMany({ where: { userId: user.id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } }),
      db.auditLog.create({ data: { organizationId: user.organizationId, action: 'AUTH_PASSWORD_RESET_CLI', entityId: user.id } }),
    ]);
    if (process.env.REDIS_URL) {
      // Same key scheme as LoginRateGuard: sha256 of "login:<login>".
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
      try { await redis.del('auth-rate:' + createHash('sha256').update('login:' + login).digest('hex')); } catch { /* limiter resets itself in 15 minutes */ }
      await redis.quit().catch(() => {});
    }
    console.log(`Password reset for "${login}" (status ${user.status}). It must be changed on next login.`);
    if (user.status !== 'ACTIVE') console.log(`Note: the account is ${user.status}; the owner must set it ACTIVE before it can log in.`);
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
