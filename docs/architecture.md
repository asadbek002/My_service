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

References between records are also tenant checked. For example, an order can only use a customer, device, branch, technician, and part belonging to the same organization.

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

Platform access and organization access are separate. `PLATFORM_ADMIN` is not a business role. Organization roles provide defaults; granular permissions are checked by the API on every protected operation. Branch restrictions are evaluated after tenant membership and permission checks.

## Data integrity

- Order numbers have a database uniqueness constraint scoped by organization.
- Status transitions use an explicit transition map.
- Inventory changes are represented by immutable movements.
- Payments and refunds are append-only financial records.
- Stock use, payment/refund, delivery, and related audit changes run in database transactions.
- Background notifications use a transactional outbox so a committed business event is not lost before queue publication.
- Idempotency keys protect retryable critical writes.

## Delivery sequence

Security is implemented with each module. The build order is foundation, data model, tenancy, authentication, authorization, staff, customers/devices, orders, diagnostics, inventory, repair, finance, warranty, notifications, documents, reports, subscription, platform admin, PWA, and deployment.
