# Acceptance checklist

A checked item is implemented in code and covered by the API integration suite (`apps/api/test`) or the browser run-through.

## Application

- [x] Multi-tenant organizations, two roles (Boshliq, Xodim), audit log and subscription write lock.
- [x] Secure login, forced change of temporary passwords, refresh rotation with reuse detection, logout.
- [x] One-screen intake: customer by phone, device, accessories, complaint, labor + parts price.
- [x] Status flow RECEIVED → IN_REPAIR → READY → DELIVERED / CANCELLED; audited price changes.
- [x] Split payments, idempotency, refunds, delivery with warranty days, debt delivery with consent.
- [x] One customer notification when READY: Telegram with SMS fallback.
- [x] Thermal receipt (58/80 mm) showing only the total price, social handles and a QR tracking link; public tracking page without personal data.
- [x] Parts taken from nearby shops on credit: supplier, cost, optional order; paid (booked as a parts purchase) or returned, once; debt per shop.
- [x] Reports: revenue split into labor and parts, expenses, profit, debtors, CSV export.
- [x] Staff management by staff, owner account protected; password reset by colleagues and platform.
- [x] Platform: services, plans, subscriptions, password reset, audited support login.
- [x] Phone-first web UI (no horizontal scroll from 320 px), PWA offline shell.

## Release journey

1. Platform admin creates a plan and a service; the owner signs in and replaces the temporary password.
2. Owner fills in service details and receipt paper width, adds a staff member.
3. Staff takes a device in, prints the receipt, moves it to repair and to ready (customer is notified).
4. Price is corrected, part payment taken, device handed over with a warranty; delivery receipt printed.
5. Customer opens the tracking link; later returns under warranty and a free follow-up order is created.
6. Owner checks the dashboard, report (labor/parts/profit/debtors), expenses and staff activity.
7. Platform admin enters the service in support mode and resets a forgotten password.
