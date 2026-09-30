// Delete everything that was recorded while working (orders, customers, payments, expenses,
// parts, notifications, history…) and keep the setup: services, users and their passwords,
// roles, plans and subscriptions, platform admins, settings, templates, payment methods and shops.
//
//   node apps/api/scripts/clear-business-data.cjs              → shows what would be deleted
//   CONFIRM=DELETE node apps/api/scripts/clear-business-data.cjs → deletes it
//   CLEAR_SHOPS=1 also deletes the saved shops.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

// Business records (and legacy tables of removed features). Order numbers restart from 001.
const TABLES = [
  'Customer', 'Device', 'Order', 'OrderCounter', 'OrderAssignment', 'OrderHistory', 'OutboxEvent',
  'Payment', 'Warranty', 'WarrantyClaim', 'CustomerLink', 'Notification', 'Expense', 'SourcedPart',
  'AuditLog', 'TelegramLink', 'UsageRecord',
  'Part', 'Stock', 'InventoryMovement', 'OrderPart', 'Supplier', 'RepairSession', 'RepairAction',
  'CommissionEntry', 'TechnicianCompensation', 'Attachment', 'PendingUpload', 'Document',
];

async function main() {
  const tables = [...TABLES, ...(process.env.CLEAR_SHOPS === '1' ? ['Shop'] : [])];
  const counts = [];
  for (const t of tables) {
    const [{ n }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
    counts.push([t, n]);
  }
  const total = counts.reduce((s, [, n]) => s + n, 0);
  console.log(counts.filter(([, n]) => n > 0).map(([t, n]) => `  ${t}: ${n}`).join('\n') || '  (nothing recorded)');
  console.log(`Total rows to delete: ${total}. Kept: services, users, roles, plans, subscriptions, platform admins, settings${process.env.CLEAR_SHOPS === '1' ? '' : ', shops'}.`);
  if (process.env.CONFIRM !== 'DELETE') { console.log('Dry run. To delete, run again with CONFIRM=DELETE'); return; }
  // One statement: all or nothing. CASCADE only reaches tables that point at these (all listed above).
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  console.log('Deleted. Order numbering starts again from 001.');
}
main().catch(e => { console.error('Failed: ' + (e instanceof Error ? e.message.split('\n').pop() : e)); process.exitCode = 1; }).finally(() => db.$disconnect());
