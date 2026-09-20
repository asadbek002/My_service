# Development status

This file records implemented behavior in the repository.

## Implemented

### Foundation and operations

- pnpm/Turborepo monorepo with Next.js web and NestJS API.
- PostgreSQL/Prisma migrations, Redis/BullMQ and S3-compatible storage.
- Development and production Docker Compose, nginx baseline, health endpoint, backup/restore runbook.
- GitHub Actions validates schema and migrations, then runs typecheck, production builds and integration tests against PostgreSQL, Redis and MinIO.
- PWA manifest, service worker and offline shell. Authenticated API responses are not cached.

### Identity, access and tenancy

- Argon2id password hashing, globally unique normalized login and forced first password change.
- Fifteen-minute HS256 access JWTs and opaque rotating refresh credentials in HttpOnly cookies.
- Refresh reuse detection, session-family revocation, logout, password-change and suspension revocation.
- PostgreSQL-backed authorization on every request, RBAC permissions, branch scope and owner scope.
- Tenant is derived from the authenticated user. Composite foreign keys reject cross-tenant branch and role memberships.
- Redis rate limits and strict browser Origin validation for auth mutations.
- Expired subscriptions remain readable and block business writes.

### Service workflow

- Staff and branch management, customers, devices and concurrent organization-scoped order numbering.
- Assignment, guarded status transitions, history, diagnosis, immutable quote versions and approval evidence.
- Customer tracking and version-bound single-use approval links.
- Repair sessions/actions, mandatory final checks, delivery and warranty creation/claims.
- Inventory catalog, stock ledger, receive/adjust, reservations, idempotent use and cancellation release.
- Split payments, idempotency keys, refunds, custom payment methods and expenses.
- Effective-dated technician compensation rules with immutable delivery commission snapshots.

### Communication and documents

- Transactional outbox with BullMQ delivery, retry state and Telegram/SMS adapter boundary.
- Telegram account linking and webhook flow.
- Organization notification templates and editable delivery settings.
- Private presigned S3 uploads with size, content-type and SHA-256 metadata confirmation.
- Receipt, repair, payment and warranty PDF documents with QR tracking links.

### Product surfaces

- Login and password change, role-aware dashboard and global search.
- Order intake/list/detail, repair and inventory screens.
- Expenses, reports, branches, roles, templates, payment methods, subscription and audit settings.
- Public tracking/approval pages.
- Platform-admin login, plans, organization onboarding, subscriptions and system statistics.

## Verified acceptance coverage

Integration tests cover auth rejection and rotation, refresh-token reuse, immediate revocation, tenant/branch isolation, subscription write lock, concurrent numbering, diagnosis approval versions, inventory reservation races, cancellation release, idempotent part usage, repair final checks, split payment/refund rules, delivery warranty, customer-link privacy, platform separation, signed S3 uploads, PDF output and compensation snapshots.

## External production inputs

- Production domain, DNS and TLS termination.
- Random production secrets and a secret manager.
- Telegram bot credentials and a real SMS provider implementation/configuration.
- Production S3 credentials, monitoring/error reporting and an encrypted off-host backup destination.
- A restore drill and full browser/device acceptance run after deployment.
- A committed dependency lockfile should be generated during the later local setup before release pinning.

No production deployment has been performed because current work is intentionally limited to GitHub.
