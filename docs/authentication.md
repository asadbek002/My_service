# Authentication and tenant boundary

## Request flow
1. POST /api/auth/login validates login/password, applies Redis limits, verifies Argon2id and ACTIVE status.
2. A server session is created; only the SHA-256 hash of the random 256-bit refresh secret is stored.
3. Response returns a 15-minute HS256 access JWT. The 30-day refresh credential is an HttpOnly cookie scoped to /api/auth; Secure is enabled in production.
4. Bearer requests verify signature, issuer, audience and expiry, then read the session and current user, branch memberships and permissions from PostgreSQL.
5. The tenant comes from that user record. Staff queries always use that organization. Composite database foreign keys enforce same-tenant role and branch membership.
6. Refresh revokes the old session and creates its successor inside a transaction. The family has an absolute 30-day lifetime.
7. Reusing a rotated credential commits family revocation before returning 401. Clients must serialize refresh requests.
8. Logout revokes the family. Password change or suspension revokes all sessions of the user.

## Credentials
INITIAL_OWNER_PASSWORD is read only by the seed; source code never contains it.
Seed requires INITIAL_OWNER_PHONE and forces a password change on first login.
Access signing requires a random JWT_ACCESS_SECRET of at least 32 characters.
Refresh tokens are opaque random values; JWT_REFRESH_SECRET is not used.
Passwords, raw tokens and hashes are excluded from audit data and API staff responses.
Login is globally unique and normalized to lowercase.

## Browser boundary
Login, refresh, logout and password change require an Origin exactly equal to WEB_URL.
Use the Authorization header for access tokens. Keep the access token in browser memory.
Never cache authenticated API responses in a PWA service worker.
The initial Redis limits are 60 auth requests/IP and 15/login in a 15-minute window.
The API fails closed if Redis is unavailable. A reverse proxy must overwrite forwarded headers before any trust-proxy setting is introduced.

## References
- [NestJS authentication](https://docs.nestjs.com/security/authentication)
- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
