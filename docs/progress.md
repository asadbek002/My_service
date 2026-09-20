# Development status

This document tracks implemented behavior, not just planned folders.

## Implemented
- Foundation: Next.js web shell, NestJS API, Docker development dependencies.
- PostgreSQL migration: organizations, branches, users, roles, permissions, sessions, audit, plans/subscriptions.
- Argon2id passwords, globally unique lowercase login, first-login password change.
- Login, refresh rotation, reuse detection, logout, me, password change.
- HttpOnly refresh cookie; access token returned in response; strict Origin check on auth mutations.
- Database-backed access validation, tenant/permission guard, expired subscription read-only behavior.
- Redis atomic rate limits on authentication.
- Owner staff creation, staff status changes and immediate session revocation.
- Composite foreign keys prohibit cross-tenant role/branch assignment.
- Development seed from environment; never resets an existing owner's credentials.
- GitHub Actions: schema validation, migration, type checking, build, PostgreSQL-backed security tests.

- Login, forced password change, staff creation/suspension web UI.
- Customer/device intake API, organization-scoped concurrent order numbering.
- Branch/assigned-order visibility, multi-technician assignment, status history.
- Diagnosis with decimal money, versioned quotes and staff-recorded customer approval.
- Transactional outbox records (delivery worker remains pending).

## Verification
Authentication milestone passed CI: https://github.com/asadbek002/My_service/actions/runs/35487990279
Order milestone has additional integration coverage; see latest Actions run.

## Remaining
- Customer Telegram/SMS approval, final test and repair sessions.
- Inventory ledger, reservations, concurrency and rollback.
- Payments/refunds, expenses, commission and reports.
- Warranty, private uploads, PDFs and customer tracking.
- Transactional outbox, Telegram/SMS workers and delivery tracking.
- Full plans/features/usage/invoice enforcement, platform admin.
- PWA, production deployment, backups/restore and monitoring.
- Full end-to-end acceptance flow.

No production deployment has been performed. Health currently checks API and PostgreSQL only.
