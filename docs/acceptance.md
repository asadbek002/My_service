# Acceptance checklist

This checklist maps the product specification to repository evidence. A checked item is implemented in code and covered by build or integration validation. Deployment items require the production environment.

## Application

- [x] Multi-tenant organization and branch data model.
- [x] RBAC, branch scoping, audit log and subscription write lock.
- [x] Secure login, password change, refresh rotation/reuse detection and logout.
- [x] Staff, customer, device and order intake workflows.
- [x] Assignment, diagnosis, quote approval and controlled order status transitions.
- [x] Inventory ledger, reservation race handling, use and cancellation rollback.
- [x] Repair session, final checklist, payments, refunds, delivery and warranty.
- [x] Expenses, reporting, global search and technician compensation.
- [x] Customer tracking/approval links and Telegram linking.
- [x] Notification outbox, retry processing, templates and adapter boundary.
- [x] Private S3 upload confirmation and QR-enabled PDF documents.
- [x] Organization settings and isolated platform administration.
- [x] Responsive web surfaces and PWA offline shell.

## Automated verification

- [x] Prisma schema validation and migration deployment from an empty PostgreSQL database.
- [x] API and web TypeScript checks.
- [x] Production builds for API and web.
- [x] Integration suite with PostgreSQL, Redis and MinIO.
- [x] Security regression coverage for tenant escape, cross-branch membership, stale sessions and token reuse.
- [x] Business regression coverage for concurrent numbering, stock races, duplicate writes and refund limits.

## Production gate

- [ ] Generate and commit `pnpm-lock.yaml` during the approved local release pass.
- [ ] Configure production domain, TLS, secrets, S3 and database/Redis persistence.
- [ ] Configure Telegram and select/implement the production SMS provider.
- [ ] Run the complete browser acceptance journey with real roles and mobile devices.
- [ ] Verify monitoring alerts and perform a timed database/object-storage restore drill.
- [ ] Record go-live approval and deploy.

## Release acceptance journey

1. Platform admin creates a plan and organization.
2. Owner signs in with the temporary password, changes it, creates a branch and invites staff.
3. Reception creates a customer, device and order with condition photos.
4. Technician diagnoses the device; the customer approves the current quote link.
5. Staff reserves and consumes parts, records repair actions and passes every final check.
6. Cashier records split payments and exercises refund limits.
7. Staff delivers the order, creates warranty and downloads receipt/warranty PDFs.
8. Customer opens the tracking page without seeing private personal data.
9. Owner verifies reports, expenses, inventory movements, commission and audit entries.
10. Operator validates notification delivery, backup creation and restore.
