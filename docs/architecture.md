# MyService architecture

## First milestone

The first usable vertical slice is:

1. create two organizations and their default branches;
2. seed an owner from environment variables;
3. authenticate the owner;
4. create a staff account with branch and permissions;
5. prove with automated tests that one tenant cannot read another tenant's records.

## Trust boundary

The API derives the current organization from the authenticated session. Route bodies, query strings, and headers never select a tenant. Every repository method requires a trusted tenant context and scopes all business reads and writes by `organizationId`.

References between records are also tenant checked. For example, an order can only use a customer and device belonging to the same organization. Each service works as one shop: the API files new work under the organization's single branch, so the UI never asks for one.

## Authentication model

- Passwords are hashed with Argon2id.
- Access tokens are short-lived and carry a session identifier.
- Refresh tokens use rotation.
- Only a refresh-token hash is stored in the database.
- Reuse of an already rotated token revokes the token family.
- Suspending or archiving a user revokes all active sessions.
- Browser refresh tokens are sent in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Login and refresh endpoints are rate limited.
- Audit records contain metadata and never contain credentials or raw tokens.

## Authorization

Platform access and organization access are separate. `PLATFORM_ADMIN` is not a business role. There are two organization roles, OWNER (Boshliq) and STAFF (Xodim), both with every business permission; the API still checks a permission on each operation. Only the owner account itself is protected from staff. Platform support logins are short-lived organization sessions marked `support:` and audited in the organization's log.

## Data integrity

- Order numbers have a database uniqueness constraint scoped by organization.
- Status transitions use an explicit transition map.
- Payments and refunds are append-only financial records.
- Price change, payment/refund, delivery, and related audit changes run in database transactions.
- Background notifications use a transactional outbox so a committed business event is not lost before queue publication.
- Idempotency keys protect retryable critical writes.

## Delivery sequence

Security is implemented with each module. Tables of features removed in the simplification (inventory, suppliers, diagnostics, repair sessions, photos, commission) are kept in the schema so existing data is not lost; no code writes to them.
